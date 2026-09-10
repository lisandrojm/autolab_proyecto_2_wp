import crypto from "crypto";
/**
 * NOMBRES DE LAS BASES DE COPIA, CON EL LÍMITE DE ATLAS FREE/FLEX ADENTRO.
 *
 * MongoDB permite nombres de base de hasta 64 bytes, pero los clusters Atlas **Free y Flex** cortan en
 * **38**. El esquema anterior metía la fecha en el nombre y no entraba ni de casualidad:
 *
 *   weprodu_production_integration            30 bytes
 *   _backup_2026-09-10_1048                  +23 bytes
 *                                             53 bytes  →  53 > 38  ✗
 *
 * Con 30 bytes de base quedan 8 para el sufijo: no entra ninguna fecha, ni recortada. Así que el
 * timestamp SALE del nombre y pasa a un documento adentro de la copia (`backupMeta`).
 *
 * DOS SLOTS QUE ROTAN, Y NO UN NOMBRE FIJO:
 *
 *   weprodu_production_integration_bkpA       35 bytes ✓
 *   weprodu_production_integration_bkpB       35 bytes ✓
 *
 * Con un solo nombre habría que borrar la copia buena antes de escribir la nueva, y en esa ventana
 * —que con esta base son minutos— no existiría ninguna copia válida. Rotando, mientras se escribe un
 * slot el otro sigue siendo una copia completa.
 *
 * Los límites son PARÁMETROS y no constantes: en un cluster M10 dejan de aplicar, y eso tiene que
 * poder cambiarse sin tocar código (ver `MONGO_BACKUP_MAX_*` en `config/env.ts`).
 */
export const MAX_DB_BYTES = 38;
export const MAX_NS_BYTES = 95;
export const MAX_COLECCIONES = 500;
const B = (s) => Buffer.byteLength(s, "utf8");
/** Corta a `max` bytes sin partir un carácter multibyte. */
export function truncarBytes(texto, max) {
    const buf = Buffer.from(texto, "utf8");
    if (buf.length <= max)
        return texto;
    // El `replace` saca el carácter de reemplazo que queda si el corte cayó en el medio de uno multibyte.
    return buf.subarray(0, max).toString("utf8").replace(/�$/, "");
}
/**
 * El nombre de la base de copia para un slot.
 *
 * Si la base de origen no entra, se recorta y se le pega un hash corto del nombre COMPLETO. Sin ese
 * hash, dos bases con el mismo prefijo largo —`weprodu_production_integration` y
 * `weprodu_production_integracion_vieja`— terminarían escribiendo las dos en la misma copia, y la
 * segunda pisaría a la primera sin que nada avisara.
 */
export function backupDbName(baseOrigen, slot, maxDbBytes = MAX_DB_BYTES) {
    const sufijo = `_bkp${slot}`;
    const lugar = maxDbBytes - B(sufijo);
    if (B(baseOrigen) <= lugar)
        return baseOrigen + sufijo;
    const hash = crypto.createHash("sha1").update(baseOrigen).digest("hex").slice(0, 4);
    return `${truncarBytes(baseOrigen, lugar - 5)}_${hash}${sufijo}`;
}
/** El slot que toca escribir: el que NO es la copia buena de ahora. */
export const siguienteSlot = (ultimoSlotOk) => (ultimoSlotOk === "A" ? "B" : "A");
/**
 * Chequeos ANTES de copiar nada.
 *
 * La gracia es abortar temprano: hasta ahora el límite aparecía a mitad de la copia, como un error del
 * driver que nadie puede accionar («Max database name length is 38 bytes» no dice qué hacer). Estos
 * mensajes sí: dicen qué nombre, cuántos bytes y qué colección es la que no entra.
 */
export function preflight(opts, limites = {}) {
    const maxDb = limites.maxDbBytes ?? MAX_DB_BYTES;
    const maxNs = limites.maxNsBytes ?? MAX_NS_BYTES;
    const maxCol = limites.maxColecciones ?? MAX_COLECCIONES;
    const dbName = backupDbName(opts.baseOrigen, opts.slot, maxDb);
    const problemas = [];
    if (B(dbName) > maxDb) {
        problemas.push(`El nombre "${dbName}" ocupa ${B(dbName)} bytes y el máximo es ${maxDb}.`);
    }
    const largos = opts.colecciones.filter((c) => B(`${dbName}.${c}`) > maxNs);
    if (largos.length > 0) {
        problemas.push(`Estas colecciones pasan el límite de ${maxNs} bytes de namespace al copiarse a "${dbName}": ${largos.map((c) => `${c} (${B(`${dbName}.${c}`)} b)`).join(", ")}.`);
    }
    if (opts.coleccionesEnCluster !== undefined) {
        const proyectado = opts.coleccionesEnCluster + opts.colecciones.length;
        if (proyectado > maxCol) {
            problemas.push(`La copia dejaría ${proyectado} colecciones en el cluster y el límite es ${maxCol}. Hoy hay ${opts.coleccionesEnCluster} y "${opts.baseOrigen}" tiene ${opts.colecciones.length}.`);
        }
    }
    return { dbName, problemas };
}
/** El documento con el timestamp real, que ya no entra en el nombre de la base. */
export function backupMeta(opts) {
    return {
        _id: "meta",
        baseOrigen: opts.baseOrigen,
        slot: opts.slot,
        createdAt: new Date(),
        colecciones: opts.colecciones.length,
        nombresColecciones: opts.colecciones,
        documentos: opts.documentos,
    };
}
/**
 * ¿Este nombre es una base de copia de ESTA base de origen?
 *
 * Se usa antes de cualquier `dropDatabase`. Es la última barrera contra borrar algo que no es una
 * copia: en este cluster conviven veinte bases de otros proyectos.
 */
export function esBaseDeCopia(nombre, baseOrigen, maxDbBytes = MAX_DB_BYTES) {
    return nombre === backupDbName(baseOrigen, "A", maxDbBytes) || nombre === backupDbName(baseOrigen, "B", maxDbBytes);
}
