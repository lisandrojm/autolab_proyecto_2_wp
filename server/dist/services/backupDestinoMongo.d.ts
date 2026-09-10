import { Slot } from "../utils/nombreBackup.js";
/**
 * SEGUNDO DESTINO DE LOS BACKUPS: OTRA BASE DEL MISMO CLUSTER, UNA POR COPIA.
 *
 * La copia se sube a Dropbox (destino principal) y además se clona acá, en una base aparte.
 *
 * MISMO CLUSTER, Y ESO TIENE UN LÍMITE QUE HAY QUE TENER PRESENTE: si el cluster se cae, se pierde o
 * alguien entra con las credenciales, la copia se va con el original. No es un backup contra desastre;
 * es un «deshacer» para el caso mucho más común —alguien borró una colección, un script escribió mal—
 * donde tener la base de hace unas horas al lado, consultable, resuelve el problema en minutos. El
 * respaldo fuera del cluster es Dropbox, y por eso sigue siendo el destino principal.
 *
 * Lo que sí se garantiza es que la copia va a una BASE DISTINTA de la que se respalda. Con el mismo
 * nombre, el próximo dump se respaldaría a sí mismo: `generarArchivos()` recorre las colecciones de la
 * base de la aplicación, y una copia adentro entraría en la siguiente, y esa en la próxima, en potencia.
 * El sello de fecha en el nombre lo hace imposible por construcción.
 *
 * LA BASE NO LLEVA LA FECHA: LLEVA UN SLOT QUE ROTA.
 *
 *   weprodu_production_integration_bkpA    35 bytes
 *   weprodu_production_integration_bkpB    35 bytes
 *
 * La fecha en el nombre era lo natural, y no entra: los clusters Atlas **Free y Flex** cortan los
 * nombres de base en **38 bytes** —MongoDB permite 64, esto es un límite del tier— y
 * `weprodu_production_integration_backup_2026-09-10_1048` da 53. Con una base de 30 bytes quedan 8 para
 * el sufijo: no entra ninguna fecha, ni recortada. Así que el timestamp vive en un documento adentro de
 * la copia (`_backup_meta`), donde además se puede leer sin mirar el nombre.
 *
 * Dos slots y no uno solo: con un nombre fijo habría que borrar la copia buena antes de escribir la
 * nueva, y en esa ventana no existiría ninguna copia válida. Rotando, mientras se escribe un slot el
 * otro sigue completo. Ver `utils/nombreBackup.ts`.
 *
 * Y NO SE GUARDAN ARCHIVOS: SE ESCRIBEN LAS COLECCIONES.
 *
 * La primera versión guardaba los `.json` en GridFS. Andaba, pero para usarlos había que bajarlos y
 * pasarles `mongoimport` — o sea, un backup dentro de Mongo que no se podía consultar desde Mongo. Ahora
 * los documentos se escriben como documentos: la copia es una base normal, se abre en Atlas, se navega,
 * se consulta y se compara con producción sin importar nada. Ya ESTÁ en Atlas.
 *
 * RETENCIÓN: se conserva SOLO LA ÚLTIMA. Las bases anteriores se borran DESPUÉS de que la nueva quedó
 * completa, nunca antes. El histórico largo vive en Dropbox, que guarda las que diga la pantalla.
 */
/** Dónde queda el timestamp, ahora que no entra en el nombre de la base. */
export declare const COLECCION_MANIFIESTO = "_backup_meta";
export interface ResultadoDestinoMongo {
    /** `false` cuando no hay `MONGO_URI_BACKUP`: no es un error, es que no está configurado. */
    configurado: boolean;
    /** La base donde quedó. Es lo que se muestra en la pantalla. */
    base?: string;
    /** El slot escrito. Se persiste para saber cuál escribir la próxima vez. */
    slot?: Slot;
    colecciones: number;
    documentos: number;
    /** Bases viejas borradas. */
    borrados: number;
}
/**
 * La URI donde se clona.
 *
 * Por defecto, el MISMO cluster de la aplicación: la copia es otra base al lado, sin pagar un segundo
 * cluster. `MONGO_URI_BACKUP` existe para apuntar a otro cluster el día que se quiera —ahí sí sería un
 * backup contra desastre—, pero no hace falta configurarla.
 */
export declare function uriDeBackup(): string | null;
/** ¿La copia va a otro cluster, o al mismo? Solo para poder decirlo en la pantalla. */
export declare const esClusterAparte: () => boolean;
/**
 * El prefijo de las bases de copia.
 *
 * `MONGO_DB_NAME_BACKUP` sigue existiendo para poder cambiarlo, pero con el límite de 38 bytes casi
 * nunca conviene tocarlo: cualquier prefijo más largo que el nombre de la base obliga a recortar y a
 * meter un hash, y el nombre deja de ser legible.
 */
export declare function prefijoDeBase(baseOrigen: string): string;
/** El nombre de la base de copia para un slot. */
export declare function nombreDeBaseCopia(baseOrigen: string, slot: Slot): string;
/** Cuál se va a escribir la próxima vez. Lo muestra la pantalla, con su tamaño. */
export declare function proximaBaseCopia(baseOrigen: string, ultimoSlotOk?: Slot | null): {
    base: string;
    bytes: number;
    maximo: number;
};
/**
 * Clona la base en una base nueva del cluster de backup y borra las copias anteriores.
 *
 * Lee de la conexión de la aplicación (la que ya está abierta) y escribe en una conexión efímera al
 * destino: esto corre dos veces por día y no justifica sostener un segundo pool abierto todo el tiempo.
 */
export declare function clonarEnMongo(baseOrigen: string, colecciones: string[], ultimoSlotOk?: Slot | null): Promise<ResultadoDestinoMongo>;
