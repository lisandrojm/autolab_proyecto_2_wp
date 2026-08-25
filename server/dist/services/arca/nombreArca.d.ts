/**
 * EL NOMBRE DE ARCA MANDA.
 *
 * Si lo que el organismo tiene registrado para un CUIT no es lo que hay cargado en WeProdu, gana
 * ARCA. Estos contratos terminan en un trámite ante ese mismo organismo: un nombre que no coincide
 * con el padrón es el que hace que el alta se rechace, y esa diferencia no se veía en ningún lado.
 *
 * ESTÁ EN UN MÓDULO PROPIO porque lo usan tres validaciones distintas: «Validar CUIT» (webservice del
 * padrón), la corrida de obras sociales del servidor, y el lote que manda el Asistente. Tres copias
 * de esta regla se separan solas, y lo que se separa es qué nombre le queda a una persona.
 */
export interface Renombre {
    userId: string;
    /** El CUIL: es con lo que la pantalla de la corrida empareja sus filas. */
    cuil?: string;
    antes: string;
    ahora: string;
}
/**
 * Escribe el nombre de ARCA sobre el de la persona.
 *
 * SE GUARDA TAL CUAL VIENE, en mayúsculas y sin acomodar nada. Cualquier prolijidad que le agreguemos
 * —capitalizar, reordenar— lo aleja de lo que dice el organismo, que es exactamente el valor que
 * tiene el dato.
 *
 * Devuelve el cambio solo si lo hubo. El sello `nombreValidadoArcaAt` se pone igual cuando ya
 * coincidía: lo que afirma es «esto es lo que ARCA tiene», no «esto se cambió».
 */
export declare function aplicarNombreDeArca(opts: {
    tenantObjectId: any;
    userId: string;
    cuil?: string;
    actual: {
        firstName?: string;
        lastName?: string;
    };
    arca: {
        nombre?: string;
        apellido?: string;
    };
}): Promise<Renombre | null>;
export interface ResultadoNombres {
    renombrados: Renombre[];
    /** CUIL a los que ARCA les confirmó el nombre, HAYA CAMBIADO O NO. */
    confirmados: string[];
    consultados: number;
    motivoSinConsultar?: string;
}
/**
 * Confirma contra el Padrón el nombre de un conjunto de personas.
 *
 * POR QUÉ LA VALIDACIÓN DE OBRAS SOCIALES PREGUNTA ACÁ Y NO MIRA LA PANTALLA QUE TIENE ADELANTE
 *
 * La corrida de obras sociales trabaja sobre la pantalla de altas de Simplificación Registral, que
 * muestra el nombre de la persona — pero ENTERO, en un solo campo. Para escribirlo hacen falta nombre
 * y apellido por separado, y partir «MARIA DEL CORAZON DE JESUS SORIA» por un espacio es adivinar
 * dónde termina uno y empieza el otro. El padrón (`ws_sr_padron_a13`) los devuelve separados y es el
 * mismo organismo, así que la respuesta autoritativa ya existe: se pregunta ahí.
 *
 * Best-effort de punta a punta: si el certificado no está conectado, o una consulta falla, quien
 * llama no se entera. Corregir un nombre no puede costar la validación entera.
 */
export declare function confirmarNombresConElPadron(opts: {
    tenantObjectId: any;
    tenantId: string;
    userIds: string[];
}): Promise<ResultadoNombres>;
/**
 * Los `userId` de un conjunto de CUIL.
 *
 * Se compara por DÍGITOS y no por string: `metadata.cuit` se guarda con o sin guiones según de dónde
 * vino. Es el mismo emparejamiento que hace `pendientesObraSocial`, y comparar crudo es exactamente
 * lo que hacía que la validación de obras sociales no encontrara a nadie.
 */
export declare function userIdsDeCuils(tenantObjectId: any, cuils: string[]): Promise<string[]>;
