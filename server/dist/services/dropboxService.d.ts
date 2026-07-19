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
/** Valida las credenciales y devuelve el email de la cuenta conectada. */
export declare function verifyAccount(tenantId: string, cfg: TenantDropboxConfig): Promise<{
    email?: string;
    name?: string;
}>;
/** Lista el contenido de una carpeta (no recursivo). path vacío → rootPath del tenant. */
export declare function listFolder(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<{
    entries: DropboxEntry[];
    path: string;
}>;
/** Link temporal (4h) para descargar/previsualizar un archivo directamente desde Dropbox. */
export declare function getTemporaryLink(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<string>;
export declare function uploadFile(tenantId: string, cfg: TenantDropboxConfig, path: string, buffer: Buffer): Promise<DropboxEntry>;
export declare function deleteEntry(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<void>;
export declare function moveEntry(tenantId: string, cfg: TenantDropboxConfig, fromPath: string, toPath: string): Promise<DropboxEntry>;
export declare function createFolder(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<DropboxEntry>;
/** Verifica que un path esté dentro del rootPath del tenant (evita salir de /HelloSign). */
export declare function isWithinRoot(cfg: TenantDropboxConfig, path: string): boolean;
export {};
