/**
 * BACKUP DE LA BASE, CADA 12 HORAS, A DROPBOX.
 *
 * FORMATO: una CARPETA por backup, y adentro un archivo por colección:
 *
 *   weprodu_production_integration_2026-09-09_0300/
 *     _backup.json          ← manifiesto: qué colecciones, cuántos documentos, cuándo
 *     users.json.gz
 *     userprojects.json.gz
 *     ...
 *
 * Cada `.json.gz` es JSON extendido (EJSON), un documento por línea, comprimido. Ese es EXACTAMENTE
 * el formato que come `mongoimport`, así que cada colección entra en Atlas sin pasos intermedios:
 *
 *   mongoimport --uri "<atlas>" --collection users --gzip --file users.json.gz
 *
 * Antes esto era un solo archivo con todas las colecciones concatenadas y líneas marcadoras entre
 * medio. Se podía restaurar con un script propio, pero NO era importable: `mongoimport` importa a una
 * colección por vez y se atraganta con cualquier línea que no sea un documento.
 *
 * EJSON y no JSON pelado porque conserva los tipos: un `ObjectId` vuelve a ser `ObjectId` y una fecha
 * vuelve a ser `Date`. Con JSON común, las referencias entre colecciones se restauran como strings, que
 * es lo mismo que no tener backup.
 *
 * POR QUÉ NO `mongodump`: necesita `mongodb-database-tools` instalado en el servidor, y en el VPS no
 * está garantizado. Si falta, el job fallaría cada doce horas sin que nadie se entere. Esto usa la
 * conexión que el server ya tiene abierta y no depende de nada instalado. Para IMPORTAR sí hace falta
 * `mongoimport`, pero eso se corre desde la máquina de quien restaura, no desde el VPS.
 */
/** Carpeta en Dropbox. Es la que muestra el tab «DDBB» de Documentos. */
export declare const CARPETA_BACKUPS = "/WEPRODU/DDBB";
/** ¿Hay un backup en curso? Lo usa el endpoint para no arrancar uno encima. */
export declare const backupEnCurso: () => boolean;
export declare function nombreDeCarpeta(baseDatos: string, fecha?: Date): string;
export interface ArchivoBackup {
    nombre: string;
    contenido: Buffer;
    documentos: number;
}
/** Todas las colecciones de la base, cada una en su archivo, más el manifiesto. */
export declare function generarArchivos(): Promise<{
    archivos: ArchivoBackup[];
    documentos: number;
}>;
/**
 * Qué carpetas de backup sobran.
 *
 * Se ordena por el NOMBRE, no por la fecha que reporta Dropbox: el nombre lleva el sello de cuándo se
 * generó el dump, mientras que la fecha de Dropbox es cuándo terminó de subirse. Con una subida lenta o
 * un reintento, las dos no coinciden.
 *
 * Solo mira CARPETAS que empiezan con el nombre de la base: si alguien deja otra cosa acá, la retención
 * no se la lleva puesta.
 */
export declare function elegirParaBorrar<T extends {
    tag?: string;
    name: string;
}>(entries: T[], baseDatos: string, retener?: number): T[];
export interface ResultadoBackup {
    carpeta: string;
    colecciones: number;
    documentos: number;
    bytes: number;
    borrados: number;
}
/**
 * Una corrida completa: dump, subida y limpieza.
 *
 * El backup es de la BASE, que es una sola, así que se sube a UN tenant: el primero que tenga Dropbox
 * conectado. Subirlo a todos sería el mismo archivo repetido en varias cuentas.
 *
 * `disparador` solo va al log, para poder distinguir la corrida automática de una forzada a mano.
 */
export declare function correrBackup(disparador?: "cron" | "manual"): Promise<ResultadoBackup | null>;
/**
 * Arranca el scheduler. Cada 12 horas, y una primera corrida a los 5 minutos de levantar.
 *
 * No arranca al instante a propósito: el server recién levantado está atendiendo el primer tráfico, y
 * un recorrido completo de la base compite justo ahí.
 */
export declare const initBackupScheduler: () => void;
