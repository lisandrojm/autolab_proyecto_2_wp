import type { ArchivoBackup } from "./backupService.js";
export interface ResultadoDestinoMongo {
    /** `false` cuando no hay `MONGO_URI_BACKUP`: no es un error, es que no está configurado. */
    configurado: boolean;
    archivos: number;
    bytes: number;
    borrados: number;
    /** Base y cluster donde quedó, para poder mostrarlo sin exponer la URI entera. */
    destino?: string;
}
/** La URI del destino, o `null` si no está configurado. Lanza si apunta a la base de la aplicación. */
export declare function uriDeBackup(): string | null;
/** El nombre de la base destino, si la URI lo trae. Solo para mostrarlo; nunca se loguea la URI. */
export declare function nombreDeBaseDestino(uri: string): string;
/**
 * Guarda una copia en el Mongo de backup y borra la anterior.
 *
 * `carpeta` es el mismo nombre que la carpeta de Dropbox, así que las dos copias son reconocibles como
 * la misma corrida.
 */
export declare function guardarEnMongo(carpeta: string, archivos: ArchivoBackup[]): Promise<ResultadoDestinoMongo>;
