import { getTenantDropboxConfig } from "../dropboxService.js";
/**
 * EL OUTBOX Y EL FIRMANTE: lo que comparten la corrida (`corridaEnvio.ts`) y la detección de la
 * colocación (`colocacion.ts`). Separado para que ninguno importe al otro.
 */
export type ConfigDropbox = NonNullable<ReturnType<typeof getTenantDropboxConfig>>;
/** El Outbox del tenant: la carpeta y los PDFs que hay. */
export declare function leerOutbox(tenantId: string): Promise<{
    outbox: string;
    archivos: string[];
    cfg: ConfigDropbox;
}>;
/**
 * QUIÉN FIRMA, desde la base. El código del nombre («ID-000123») lleva al `DocumentoGenerado` y de ahí
 * al usuario: su email manda sobre el del nombre de archivo (caso real: el archivo decía
 * `korova-oi@hotmail.com` y la persona tiene `korova_oi@hotmail.com`), y el nombre es «PRIMER NOMBRE
 * APELLIDOS». Sin registro en la base, se busca al usuario por el email del nombre de archivo y se
 * deja constancia del respaldo.
 */
export declare function resolverFirmante(tenantId: string, archivo: string, avisar?: (texto: string) => void): Promise<{
    firmante: {
        nombre: string;
        email: string;
    } | null;
    motivoSinFirmante?: string;
}>;
