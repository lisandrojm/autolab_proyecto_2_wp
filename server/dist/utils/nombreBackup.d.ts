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
export declare const MAX_DB_BYTES = 38;
export declare const MAX_NS_BYTES = 95;
export declare const MAX_COLECCIONES = 500;
export type Slot = "A" | "B";
/** Corta a `max` bytes sin partir un carácter multibyte. */
export declare function truncarBytes(texto: string, max: number): string;
/**
 * El nombre de la base de copia para un slot.
 *
 * Si la base de origen no entra, se recorta y se le pega un hash corto del nombre COMPLETO. Sin ese
 * hash, dos bases con el mismo prefijo largo —`weprodu_production_integration` y
 * `weprodu_production_integracion_vieja`— terminarían escribiendo las dos en la misma copia, y la
 * segunda pisaría a la primera sin que nada avisara.
 */
export declare function backupDbName(baseOrigen: string, slot: Slot, maxDbBytes?: number): string;
/**
 * `2026_09_10_04-34` — el sello de fecha y hora. UN solo formato para los dos destinos.
 *
 * La hora va con guion y no con dos puntos, y no es un capricho: el MISMO nombre se usa para la base de
 * Mongo y para la carpeta de Dropbox, y cada uno prohíbe cosas distintas.
 *
 *   `:`  Mongo lo acepta en Linux (probado con el driver), pero DROPBOX no lo admite en un path.
 *   `.`  Dropbox lo acepta, pero Mongo prohíbe el punto en un nombre de base.
 *   `-`  lo aceptan los dos.
 *
 * Con dos puntos habría que usar nombres distintos en cada lado, y entonces una copia no se podría
 * reconocer como la misma en Dropbox y en Atlas — que es justamente para lo que sirve el sello.
 */
export declare function selloFecha(d?: Date): string;
/**
 * El nombre de la base de copia CON la fecha adentro.
 *
 * Es lo que permite ver de cuándo es cada copia desde el listado de Atlas, sin abrirla. Lo que no entra
 * en 38 bytes es el nombre completo de la base de origen MÁS la fecha (46), así que el prefijo se
 * recorta hasta donde haga falta:
 *
 *   weprodu                 →  weprodu_2026_09_10_04-34                  24 bytes
 *   weprodu_production_...  →  weprodu_production_in_2026_09_10_04-34    38 bytes
 *
 * Con `MONGO_DB_NAME_BACKUP` se elige un prefijo corto y el nombre queda legible.
 */
export declare function backupDbNameConFecha(prefijo: string, sello: string, maxDbBytes?: number): string;
/**
 * ¿Este nombre es una copia con fecha de este prefijo? Se usa antes de cualquier `dropDatabase`.
 *
 * El patrón acepta las TRES formas que existieron —`2026-09-10_1612`, `2026_09_10_1612` y
 * `2026_09_10_04:34`— para que las copias creadas con versiones anteriores también se limpien. Si solo
 * reconociera la actual, las viejas quedarían ocupando lugar en el cluster para siempre.
 */
export declare function esBaseDeCopiaConFecha(nombre: string, prefijo: string, maxDbBytes?: number): boolean;
/** El slot que toca escribir: el que NO es la copia buena de ahora. */
export declare const siguienteSlot: (ultimoSlotOk?: Slot | null) => Slot;
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
export declare function preflight(opts: {
    baseOrigen: string;
    slot: Slot;
    colecciones: string[];
    coleccionesEnCluster?: number;
    nombreForzado?: string;
}, limites?: Limites): ResultadoPreflight;
/** El documento con el timestamp real, que ya no entra en el nombre de la base. */
export declare function backupMeta(opts: {
    baseOrigen: string;
    slot: Slot;
    colecciones: string[];
    documentos: number;
}): {
    _id: string;
    baseOrigen: string;
    slot: Slot;
    createdAt: Date;
    colecciones: number;
    nombresColecciones: string[];
    documentos: number;
};
/**
 * ¿Este nombre es una base de copia de ESTA base de origen?
 *
 * Se usa antes de cualquier `dropDatabase`. Es la última barrera contra borrar algo que no es una
 * copia: en este cluster conviven veinte bases de otros proyectos.
 */
export declare function esBaseDeCopia(nombre: string, baseOrigen: string, maxDbBytes?: number): boolean;
