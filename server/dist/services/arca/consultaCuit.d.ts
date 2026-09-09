/**
 * «¿Quién es este CUIT?» — UNA sola implementación para las tres pantallas.
 *
 * La usan el alta de usuario, la edición y el registro público. Son tres rutas distintas porque cada
 * una se autentica distinto —las dos primeras con JWT de administrador, el registro con el token de
 * invitación—, pero lo que hacen contra ARCA es idéntico: misma conexión del tenant, mismo
 * certificado, mismo webservice del Padrón, misma forma de respuesta.
 *
 * Estaba escrito dos veces, y ya habían empezado a divergir (una devolvía `estado` y `tipoPersona`,
 * la otra no). Acá vive una vez.
 *
 * NO ESCRIBE NADA: es una consulta. El sello «validado en ARCA» lo ponen las rutas de alta/edición
 * después de llamar a esto, nunca el cliente.
 */
export interface DatosDeArca {
    cuit: string;
    nombre: string;
    apellido: string;
    denominacion: string;
    estado: string;
    tipoPersona?: string;
    /** Número de documento. Sale del padrón cuando ARCA lo manda; si no, son los 8 dígitos del medio del
     *  CUIT, sin ceros a la izquierda. Vacío en personas jurídicas. */
    documento: string;
    /**
     * DATOS PARA PRELLENAR LA FICHA, no para sellarla.
     *
     * Vienen en la misma respuesta que ya se pedía para confirmar el nombre, así que no cuestan una
     * consulta más. El sello (`nombreValidadoArcaAt`) sigue siendo solo del nombre y el apellido: estos
     * campos se ofrecen completados y quien carga el alta los puede corregir, empezando por el domicilio
     * —que es el declarado ante el organismo y puede no ser dónde vive la persona—.
     *
     * `tipoDocumento` es la sigla de ARCA (anexo 5.1: DNI, LC, LE, CI, PAS…), no el `tipoDocumentoId` de
     * la plataforma: traducirla necesita el catálogo de FRAME, que está cargado en el frontend.
     */
    fechaNacimiento?: string;
    tipoDocumento?: string;
    domicilio?: {
        calle?: string;
        numero?: string;
        localidad?: string;
        codigoPostal?: string;
        provincia?: string;
        tipo?: string;
    };
    /** Si viene, la persona figura fallecida en el padrón. Se informa; no frena el alta. */
    fechaFallecimiento?: string;
}
/** Error con el status HTTP que le corresponde, para que cada ruta lo traduzca igual. */
export declare class ErrorConsultaCuit extends Error {
    readonly status: number;
    constructor(status: number, mensaje: string);
}
export declare function consultarCuitEnArca(tenantId: any, cuitCrudo: string): Promise<DatosDeArca>;
/**
 * ¿Ya hay alguien con este CUIT en la organización?
 *
 * El email no alcanza como identidad: la misma persona puede registrarse dos veces con dos correos y
 * quedar duplicada, y ahí el problema recién aparece cuando dos contratos apuntan a legajos distintos
 * del mismo CUIL. El CUIT sí identifica a una persona ante ARCA, así que es la clave que corresponde.
 *
 * Compara por DÍGITOS, no por string: `metadata.cuit` se guarda con o sin guiones según de dónde vino,
 * y comparar crudo devolvía "no existe" para alguien que sí estaba.
 */
export declare function usuarioExistenteConCuit(tenantId: any, cuitCrudo: string): Promise<{
    _id: string;
    nombre: string;
    email?: string;
} | null>;
