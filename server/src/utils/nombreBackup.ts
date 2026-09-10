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

export type Slot = "A" | "B";

const B = (s: string): number => Buffer.byteLength(s, "utf8");

/** Corta a `max` bytes sin partir un carácter multibyte. */
export function truncarBytes(texto: string, max: number): string {
  const buf = Buffer.from(texto, "utf8");
  if (buf.length <= max) return texto;
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
export function backupDbName(baseOrigen: string, slot: Slot, maxDbBytes: number = MAX_DB_BYTES): string {
  const sufijo = `_bkp${slot}`;
  const lugar = maxDbBytes - B(sufijo);
  if (B(baseOrigen) <= lugar) return baseOrigen + sufijo;

  const hash = crypto.createHash("sha1").update(baseOrigen).digest("hex").slice(0, 4);
  return `${truncarBytes(baseOrigen, lugar - 5)}_${hash}${sufijo}`;
}

/**
 * `2026_09_10_04:34` — el sello de fecha y hora que va EN el nombre de la base.
 *
 * Los dos puntos separan la hora de los minutos porque es como se lee una hora, y el driver y el
 * servidor los aceptan (probado: `client.db("weprodu_2026_09_10_04:34")` no tira). MongoDB solo prohíbe
 * `/\. "$` en Linux; el `:` figura en la lista de WINDOWS.
 *
 * La consecuencia, para tenerla anotada: si alguna vez hay que restaurar esta copia desde una máquina
 * Windows, `mongorestore` no va a poder con ese nombre. Desde Linux, macOS o Atlas no cambia nada.
 */
export function selloFecha(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}_${p(d.getMonth() + 1)}_${p(d.getDate())}_${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * El nombre de la base de copia CON la fecha adentro.
 *
 * Es lo que permite ver de cuándo es cada copia desde el listado de Atlas, sin abrirla. Lo que no entra
 * en 38 bytes es el nombre completo de la base de origen MÁS la fecha (46), así que el prefijo se
 * recorta hasta donde haga falta:
 *
 *   weprodu                 →  weprodu_2026_09_10_04:34                  24 bytes
 *   weprodu_production_...  →  weprodu_production_in_2026_09_10_04:34    38 bytes
 *
 * Con `MONGO_DB_NAME_BACKUP` se elige un prefijo corto y el nombre queda legible.
 */
export function backupDbNameConFecha(prefijo: string, sello: string, maxDbBytes: number = MAX_DB_BYTES): string {
  const lugar = maxDbBytes - B(`_${sello}`);
  return `${truncarBytes(prefijo, lugar)}_${sello}`;
}

/**
 * ¿Este nombre es una copia con fecha de este prefijo? Se usa antes de cualquier `dropDatabase`.
 *
 * El patrón acepta las TRES formas que existieron —`2026-09-10_1612`, `2026_09_10_1612` y
 * `2026_09_10_04:34`— para que las copias creadas con versiones anteriores también se limpien. Si solo
 * reconociera la actual, las viejas quedarían ocupando lugar en el cluster para siempre.
 */
export function esBaseDeCopiaConFecha(nombre: string, prefijo: string, maxDbBytes: number = MAX_DB_BYTES): boolean {
  const lugarMinimo = maxDbBytes - B("_2026_09_10_04:34");
  const raiz = truncarBytes(prefijo, lugarMinimo);
  return nombre.startsWith(`${raiz}`) && /_\d{4}[-_]\d{2}[-_]\d{2}[-_]\d{2}:?\d{2}$/.test(nombre);
}

/** El slot que toca escribir: el que NO es la copia buena de ahora. */
export const siguienteSlot = (ultimoSlotOk?: Slot | null): Slot => (ultimoSlotOk === "A" ? "B" : "A");

export interface Limites {
  maxDbBytes?: number;
  maxNsBytes?: number;
  maxColecciones?: number;
}

export interface ResultadoPreflight {
  dbName: string;
  problemas: string[];
}

/**
 * Chequeos ANTES de copiar nada.
 *
 * La gracia es abortar temprano: hasta ahora el límite aparecía a mitad de la copia, como un error del
 * driver que nadie puede accionar («Max database name length is 38 bytes» no dice qué hacer). Estos
 * mensajes sí: dicen qué nombre, cuántos bytes y qué colección es la que no entra.
 */
export function preflight(opts: { baseOrigen: string; slot: Slot; colecciones: string[]; coleccionesEnCluster?: number; nombreForzado?: string }, limites: Limites = {}): ResultadoPreflight {
  const maxDb = limites.maxDbBytes ?? MAX_DB_BYTES;
  const maxNs = limites.maxNsBytes ?? MAX_NS_BYTES;
  const maxCol = limites.maxColecciones ?? MAX_COLECCIONES;

  // `nombreForzado` para chequear el nombre que de verdad se va a usar (el de la estrategia elegida).
  const dbName = opts.nombreForzado ?? backupDbName(opts.baseOrigen, opts.slot, maxDb);
  const problemas: string[] = [];

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
export function backupMeta(opts: { baseOrigen: string; slot: Slot; colecciones: string[]; documentos: number }) {
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
export function esBaseDeCopia(nombre: string, baseOrigen: string, maxDbBytes: number = MAX_DB_BYTES): boolean {
  return nombre === backupDbName(baseOrigen, "A", maxDbBytes) || nombre === backupDbName(baseOrigen, "B", maxDbBytes);
}
