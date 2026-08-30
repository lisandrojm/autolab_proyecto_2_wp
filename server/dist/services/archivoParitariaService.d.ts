export interface ArchivoPublicacion {
    /** Relativa a `storage/`, para que mover la raíz no invalide lo guardado. */
    ruta: string;
    /** Cómo se llamaba en el sitio del gremio. Es lo que se le devuelve a quien lo descarga. */
    nombreOriginal: string;
    contentType: string;
    bytes: number;
    descargadoEl: Date;
}
export declare const rutaAbsoluta: (ruta: string) => string;
/**
 * El nombre con el que colgaba en la página.
 *
 * Se preserva porque es el que la persona reconoce —«acuerdo-salarial-2026.pdf»— y porque a veces es
 * el único lugar donde figura de qué acuerdo se trata.
 *
 * SOLO ES UNA ETIQUETA: el archivo en disco se llama por su hash, así que un nombre malicioso no
 * puede escribir en ningún lado. Se sanea igual porque viaja en un encabezado HTTP y termina como
 * nombre de archivo en la máquina de quien descarga.
 */
export declare const nombreDesdeUrl: (url: string) => string;
/**
 * Guarda los bytes y devuelve los metadatos. Si el archivo ya está, NO lo reescribe.
 *
 * No reescribir no es una optimización: el archivo es la evidencia de lo que se bajó, y volver a
 * escribirlo sobre sí mismo es la única forma de perderlo si la segunda descarga vino cortada.
 */
export declare const guardarPdf: (fuenteId: string, hash: string, bytes: Buffer, url: string, contentType?: string | null) => Promise<ArchivoPublicacion>;
/** `true` si el archivo sigue estando donde dice el registro. */
export declare const existeArchivo: (ruta?: string) => Promise<boolean>;
/**
 * Borra el archivo de una publicación.
 *
 * NO se llama para una publicación que derivó en una escala aplicada: ese archivo es el respaldo del
 * importe que se declaró ante ARCA y no se borra nunca. Hoy todavía no existe la capa de aplicación,
 * así que la regla vive en quien llama; cuando exista, el guard va acá.
 */
export declare const borrarArchivo: (ruta?: string) => Promise<boolean>;
