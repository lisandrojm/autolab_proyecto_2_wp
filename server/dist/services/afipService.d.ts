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
    /** Presentes solo si AFIP devolvió un SOAP Fault (encontrado=false por fault, no por respuesta vacía). */
    faultCode?: string;
    faultString?: string;
    /** Estructura completa parseada de `personaReturn` (o del Fault), tal cual la devolvió AFIP —
     *  por si hace falta algún dato que el mapeo de arriba no extrajo. */
    raw: any;
}
/** Consulta el estado de un CUIT/CUIL en el Padrón de AFIP (servicio A13). `tipo` es solo para el
 *  log persistente: "servicio_test" cuando la llama `verificarServicioPadron` (autoconsulta),
 *  "padron" para el resto (consultas reales a terceros o a uno mismo desde "Validar CUIT"). */
export declare function consultarPadron(tenantId: string, cfg: TenantAfipConfig, cuitConsultado: string, opts?: {
    tipo?: "padron" | "servicio_test";
}): Promise<ResultadoPadron>;
/** Valida credenciales pidiendo un ticket real — se usa al conectar, antes de guardar nada. Ojo: esto
 *  SOLO prueba el login WSAA (que el certificado/clave son válidos); no prueba que el servicio
 *  Consulta Padrón A13 esté autorizado para este certificado en AFIP — para eso ver
 *  `verificarServicioPadron`. */
export declare function verificarCredenciales(tenantId: string, cfg: TenantAfipConfig): Promise<void>;
export interface ResultadoVerificacionPadron {
    ok: boolean;
    estado: "ok" | "no_autorizado" | "error";
    detalle: string;
    faultCode?: string;
    faultString?: string;
    verificadoAt: Date;
}
/**
 * Prueba real del servicio Consulta Padrón A13 (no solo el login WSAA): hace una AUTOCONSULTA del
 * propio `cuitRepresentada` del tenant contra sí mismo. Una autoconsulta nunca puede fallar
 * legítimamente por "la persona no existe" — el tenant es esa persona — así que si AFIP no
 * devuelve datos, la única explicación posible es que el servicio (o el alias del certificado) no
 * esté autorizado en el Administrador de Relaciones de AFIP, no que el CUIT "no exista". Por eso el
 * resultado de una autoconsulta fallida se interpreta como "no_autorizado" y no como "desconocido"
 * (a diferencia de una consulta a un tercero, donde esa ambigüedad sí existe y no se puede resolver
 * con una sola consulta).
 */
export declare function verificarServicioPadron(tenantId: string, cfg: TenantAfipConfig): Promise<ResultadoVerificacionPadron>;
/** Invalida el ticket cacheado del tenant (al desconectar o cambiar credenciales). */
export declare function clearTenantTicket(tenantId: string): void;
export declare function findTenantAfipConfig(tenantId: string): Promise<TenantAfipConfig | null>;
