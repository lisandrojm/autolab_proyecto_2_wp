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
 * LA BASE LLEVA LA FECHA EN EL NOMBRE:
 *
 *   weprodu_production_integration_2026-09-10_1010
 *
 * Es lo que hace que la copia se pueda reconocer desde el Data Explorer de Atlas sin abrir nada. Con un
 * nombre fijo, dos backups distintos se veían igual y no había forma de saber cuál se estaba mirando.
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
/** Lo que se escribe en `_backup` de la base copiada: de dónde salió y cuándo. */
export declare const COLECCION_MANIFIESTO = "_backup";
export interface ResultadoDestinoMongo {
    /** `false` cuando no hay `MONGO_URI_BACKUP`: no es un error, es que no está configurado. */
    configurado: boolean;
    /** La base donde quedó, con su fecha. Es lo que se muestra en la pantalla. */
    base?: string;
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
 * `MONGO_DB_NAME_BACKUP` es un PREFIJO, no el nombre final: a cada copia se le pega su fecha. Si no se
 * declara, se usa el nombre de la base de origen, que es lo que uno espera ver en Atlas.
 */
export declare function prefijoDeBase(baseOrigen: string): string;
/** `weprodu_production_integration_2026-09-10_1010` — el mismo sello que la carpeta de Dropbox. */
export declare function nombreDeBaseCopia(baseOrigen: string, carpeta: string): string;
/**
 * Clona la base en una base nueva del cluster de backup y borra las copias anteriores.
 *
 * Lee de la conexión de la aplicación (la que ya está abierta) y escribe en una conexión efímera al
 * destino: esto corre dos veces por día y no justifica sostener un segundo pool abierto todo el tiempo.
 */
export declare function clonarEnMongo(baseOrigen: string, carpeta: string, colecciones: string[], baseAnterior?: string | null): Promise<ResultadoDestinoMongo>;
