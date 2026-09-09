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
/** Domicilio del padrón, ya aplanado a los campos que la ficha de una persona sabe guardar.
 *  `provincia` viaja para poder mostrarla, aunque hoy `User` no tenga dónde escribirla. */
export interface DomicilioPadron {
    calle?: string;
    numero?: string;
    localidad?: string;
    codigoPostal?: string;
    provincia?: string;
    /** "FISCAL" | "LEGAL/REAL" — de cuál de los dos salió, para poder decirlo en pantalla. */
    tipo?: string;
}
/**
 * CUÁL DE LOS DOS DOMICILIOS, Y POR QUÉ ESTA FUNCIÓN EXISTE SEPARADA.
 *
 * ARCA devuelve `<domicilio>` con multiplicidad 0..* (§4.2 del manual): el FISCAL, que es el declarado
 * ante el organismo, y el LEGAL/REAL. Para una persona física el LEGAL/REAL es el que más se parece a
 * dónde vive, así que ese manda y el FISCAL queda de respaldo.
 *
 * LA TRAMPA ESTÁ EN EL PARSER, NO EN ARCA. `XMLParser` se construye sin `isArray`, así que una etiqueta
 * repetida llega como array y una sola llega como OBJETO. Un `.find()` directo sobre el objeto no tira
 * error: devuelve `undefined` en silencio, y el domicilio simplemente no aparecería para toda persona
 * que tenga uno solo declarado — el peor tipo de bug, porque parece "ARCA no lo mandó".
 *
 * Está exportada para poder probar justamente eso con los dos XML de ejemplo, sin llamar al organismo.
 */
export declare function elegirDomicilio(persona: any): DomicilioPadron | undefined;
export interface ResultadoPadron {
    cuit: string;
    encontrado: boolean;
    /** "activo" | "inactivo" | "desconocido" — desconocido si la respuesta no trae el campo esperado. */
    estado: "activo" | "inactivo" | "desconocido";
    tipoPersona?: string;
    denominacion?: string;
    /** Nombre y apellido TAL CUAL los devuelve ARCA (en mayúsculas, sin normalizar), separados.
     *  `denominacion` los junta, pero para escribirlos en `firstName`/`lastName` hacen falta aparte.
     *  Vacíos en personas jurídicas, que traen `razonSocial` y no se pueden partir sin adivinar. */
    nombre?: string;
    apellido?: string;
    /** "YYYY-MM-DD". ARCA la manda como DateTime con offset ("1936-02-11T12:00:00-03:00"). */
    fechaNacimiento?: string;
    /** Sigla del tipo de documento SEGÚN ARCA: DNI, LC, LE, CI, PAS, DNI M, TRAM… (anexo 5.1 del manual).
     *  No es el `tipoDocumentoId` de la plataforma: la traducción vive en el frontend, que es donde está
     *  cargado el catálogo de FRAME. */
    tipoDocumento?: string;
    /** Documento TAL COMO LO DECLARA EL ORGANISMO. Es mejor dato que los ocho dígitos del medio del CUIT
     *  (la cuenta que hacen `consultaCuit` y `nombreArca`): esa cuenta solo vale para personas físicas y
     *  no lleva sello de nadie. */
    numeroDocumento?: string;
    /** Domicilio de la persona, ya elegido entre los que devuelve ARCA (ver `elegirDomicilio`). */
    domicilio?: DomicilioPadron;
    /** Si viene, la persona figura fallecida en el padrón. Nunca frena nada acá: quien consume decide. */
    fechaFallecimiento?: string;
    /** Presentes solo si AFIP devolvió un SOAP Fault (encontrado=false por fault, no por respuesta vacía). */
    faultCode?: string;
    faultString?: string;
    /** Estructura completa parseada de `personaReturn` (o del Fault), tal cual la devolvió AFIP —
     *  por si hace falta algún dato que el mapeo de arriba no extrajo. */
    raw: any;
}
/**
 * ¿ESTE FAULT DICE «INACTIVO» O DICE «NO EXISTE»? La diferencia decide si se puede dar un alta.
 *
 * El A13 no devuelve `persona` con `estadoClave: INACTIVO`: cuando el CUIT está dado de baja contesta
 * un SOAP Fault, igual que cuando el CUIT no existe. Son los dos únicos faults que aparecen en el log
 * de producción, seis veces cada uno sobre 273 consultas:
 *
 *     «La Clave (CUIT/CUIL) consultada es inexistente»           → no hay nadie
 *     «La clave (CUIT/CUIL) consultada se encuentra INACTIVA»    → hay alguien, está de baja
 *
 * Tratarlos igual hacía imposible dar de alta a una persona con el CUIT inactivo, y el mensaje le
 * pedía corregir un número que estaba bien.
 *
 * Se matchea por «inactiv» y no por la frase completa: el organismo cambia mayúsculas y redacción sin
 * avisar, y ningún otro fault de este servicio contiene esa raíz. Si algún día aparece uno que la
 * contenga y signifique otra cosa, el peor resultado es dejar pasar un alta sin sello — que es
 * exactamente lo que ya pasa hoy con cualquier CUIT que no se valida.
 */
export declare const faultEsCuitInactivo: (faultString?: string | null) => boolean;
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
