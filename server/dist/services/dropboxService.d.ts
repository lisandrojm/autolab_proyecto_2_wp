export interface DropboxEntry {
    tag: "file" | "folder";
    name: string;
    path: string;
    id?: string;
    size?: number;
    serverModified?: string;
    isDownloadable?: boolean;
}
interface TenantDropboxConfig {
    appKey: string;
    appSecret: string;
    refreshToken: string;
    rootPath: string;
}
/** Lee y descifra la config de Dropbox del tenant. Devuelve null si no está conectado. */
export declare function getTenantDropboxConfig(tenant: any): TenantDropboxConfig | null;
export declare function isTenantDropboxConnected(tenant: any): boolean;
/** Invalida el token cacheado del tenant (al desconectar o cambiar credenciales). */
export declare function clearTenantToken(tenantId: string): void;
/**
 * Valida las credenciales. La conexión es válida si el refresh token funciona (obtener
 * el access token ya valida appKey/appSecret/refreshToken). El email de la cuenta es
 * best-effort: requiere el scope account_info.read; si no está, NO rompe la conexión.
 */
export declare function verifyAccount(tenantId: string, cfg: TenantDropboxConfig): Promise<{
    email?: string;
    name?: string;
}>;
/**
 * El argumento de las llamadas de CONTENIDO viaja en una cabecera HTTP, y una cabecera es ASCII.
 *
 * `/files/download` y `/files/upload` no mandan el path en el body sino en el header
 * `Dropbox-API-Arg`. Con un nombre acentuado —«Antunes Fernández», «Der atamian»— ese JSON deja de
 * ser ASCII, los bytes llegan mal del otro lado y Dropbox contesta **409 path/not_found**: no es que
 * el archivo no exista, es que el path que recibió no es el que se mandó.
 *
 * Era invisible porque depende del nombre: una carpeta de altas con nombres sin acentos baja
 * perfecto y la de al lado falla entera, sin ningún patrón aparente. Y como la respuesta de error
 * llega como arraybuffer, el motivo real quedaba adentro de un Buffer sin leer (ver `dropboxError`).
 *
 * La solución es la del SDK oficial: escapar todo lo que pase de \u007f como `\uXXXX`, que JSON
 * entiende igual y una cabecera sí puede transportar.
 *
 * ESTABA ESCRITO Y NO LO LLAMABA NADIE. Las dos llamadas de contenido —`downloadFileContent` y
 * `uploadFile`— serializaban con `JSON.stringify` pelado, así que el defecto que este comentario
 * describe seguía pasando: al subir, el nombre llega con U+FFFD en lugar del acento y el archivo
 * queda guardado con el nombre roto; al bajar, el path no matchea y Dropbox contesta 409
 * `path/not_found`. Toda ruta con acento, «ñ» o «·» pasa por acá: si alguna vez se vuelve a
 * serializar a mano, `argHeader.test.ts` falla.
 */
export declare const argHeader: (obj: unknown) => string;
/**
 * Lista el contenido de una carpeta (no recursivo). path vacío → rootPath del tenant, salvo que
 * `full` sea true: ahí path vacío es la raíz REAL del Dropbox conectado (para poder elegir carpetas
 * fuera del subárbol de rootPath, como una carpeta "AFIP" separada de "HelloSign"). Ojo: "" es la
 * única forma válida de pedirle a la API la raíz — un path literal como "/FZERO S.R.L" no existe
 * como tal ahí adentro (ese nombre es cómo lo muestra la interfaz web, no un path real) y tira
 * `path/not_found`.
 */
export declare function listFolder(tenantId: string, cfg: TenantDropboxConfig, path: string, full?: boolean): Promise<{
    entries: DropboxEntry[];
    path: string;
}>;
/** Link temporal (4h) para descargar/previsualizar un archivo directamente desde Dropbox. */
export declare function getTemporaryLink(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<string>;
/** Descarga el contenido de un archivo como Buffer (para armar ZIPs, etc.). */
export declare function downloadFileContent(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<Buffer>;
export declare function uploadFile(tenantId: string, cfg: TenantDropboxConfig, path: string, buffer: Buffer): Promise<DropboxEntry>;
export declare function deleteEntry(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<void>;
export declare function moveEntry(tenantId: string, cfg: TenantDropboxConfig, fromPath: string, toPath: string): Promise<DropboxEntry>;
export declare function createFolder(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<DropboxEntry>;
/** Verifica que un path esté dentro del rootPath del tenant (evita salir de /HelloSign). */
export declare function isWithinRoot(cfg: TenantDropboxConfig, path: string): boolean;
export {};
