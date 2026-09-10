/**
 * BACKUP DE LA BASE, CADA 12 HORAS, A DROPBOX.
 *
 * FORMATO: una CARPETA por backup, y adentro un archivo por colección:
 *
 *   weprodu_production_integration_2026-09-09_0300/
 *     _backup.json          ← manifiesto: qué colecciones, cuántos documentos, cuándo
 *     users.json
 *     userprojects.json
 *     ...
 *
 * Cada `.json` es JSON extendido (EJSON), un documento por línea, SIN comprimir. Ese es EXACTAMENTE
 * el formato que come `mongoimport`, así que cada colección entra en Atlas sin pasos intermedios:
 *
 *   mongoimport --uri "<atlas>" --collection users --file users.json
 *
 * SIN COMPRIMIR A PROPÓSITO: un `.json` se abre, se busca y se lee tal cual desde Dropbox o desde
 * cualquier editor, sin descomprimir nada primero. Se paga en tamaño —texto plano es varias veces un
 * `.gz`— y en que es más probable cruzar el tope de 150 MB del endpoint simple de Dropbox; de eso se
 * encarga `uploadFileSession`, que sube por partes.
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
/** Valores por defecto, para un tenant que nunca tocó la pantalla de configuración. */
export declare const INTERVALO_HORAS_DEFAULT = 12;
export declare const RETENER_DEFAULT = 14;
/** Opciones que ofrece la pantalla. Se validan también en el server: el front no es la única puerta. */
export declare const INTERVALOS_VALIDOS: readonly [6, 12, 24, 48];
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
    /** Copias viejas borradas en Dropbox. */
    borrados: number;
    /** Cómo le fue a cada destino. Uno puede fallar sin llevarse al otro puesto. */
    dropbox: {
        ok: boolean;
        error?: string;
    };
    mongo: {
        ok: boolean;
        configurado: boolean;
        borrados?: number;
        destino?: string;
        error?: string;
    };
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
