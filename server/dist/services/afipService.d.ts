export type Ambiente = "homologacion" | "produccion";
export interface TenantAfipConfig {
    cuitRepresentada: string;
    certificadoPem: string;
    clavePrivadaPem: string;
    ambiente: Ambiente;
}
/** Lee y descifra la config de AFIP del tenant. Devuelve null si no está conectado. */
export declare function getTenantAfipConfig(tenant: any): TenantAfipConfig | null;
export declare function isTenantAfipConnected(tenant: any): boolean;
export interface CertificadoInfo {
    alias: string | null;
    vencimiento: string | null;
}
/** Lee del certificado (sin necesidad de la clave privada) el alias/CN y la fecha de vencimiento —
 *  para mostrar en el status, no para autenticar. Nunca tira: si el PEM guardado está corrupto,
 *  devuelve todo null en vez de romper el endpoint de status. */
export declare function getCertificadoInfo(certificadoPemRaw: string): CertificadoInfo;
export interface ResultadoPadron {
    cuit: string;
    encontrado: boolean;
    /** "activo" | "inactivo" | "desconocido" — desconocido si la respuesta no trae el campo esperado. */
    estado: "activo" | "inactivo" | "desconocido";
    tipoPersona?: string;
    denominacion?: string;
    /** Estructura completa parseada de `getPersonaReturn`, tal cual la devolvió AFIP — por si hace
     *  falta algún dato que el mapeo de arriba no extrajo. */
    raw: any;
}
/** Consulta el estado de un CUIT/CUIL en el Padrón de AFIP (servicio A13). */
export declare function consultarPadron(tenantId: string, cfg: TenantAfipConfig, cuitConsultado: string): Promise<ResultadoPadron>;
/** Valida credenciales pidiendo un ticket real — se usa al conectar, antes de guardar nada. */
export declare function verificarCredenciales(tenantId: string, cfg: TenantAfipConfig): Promise<void>;
/** Invalida el ticket cacheado del tenant (al desconectar o cambiar credenciales). */
export declare function clearTenantTicket(tenantId: string): void;
export declare function findTenantAfipConfig(tenantId: string): Promise<TenantAfipConfig | null>;
