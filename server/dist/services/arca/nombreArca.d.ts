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
/**
 * ¿Es el mismo nombre, aunque venga escrito distinto?
 *
 * Se compara como CONJUNTO DE PALABRAS, normalizadas: ARCA muestra «STOLTZING MICAELA SOL» —apellido
 * primero, todo en mayúsculas— y WeProdu guarda «Micaela Sol» + «Stoltzing». Comparar los strings
 * daría distinto SIEMPRE, y mandaría a consultar el padrón por las veinte personas en cada corrida.
 *
 * Comparar el conjunto y no la secuencia es a propósito: el orden apellido/nombre cambia según la
 * pantalla, y no es una diferencia de dato. Lo que sí importa —que falte o sobre una palabra— se
 * detecta igual.
 */
export declare function mismoNombre(a: string, b: string): boolean;
export interface ResultadoNombres {
    renombrados: Renombre[];
    /** CUIL a los que ARCA les confirmó el nombre, HAYA CAMBIADO O NO. */
    confirmados: string[];
    consultados: number;
    /**
     * Los que ARCA rechazó, con el motivo que dio el organismo.
     *
     * Antes se descartaban en silencio (`if (!r.encontrado) return;`) y la corrida informaba "1
     * consultado · todos los nombres ya coincidían": un fracaso contado como éxito. El caso típico es
     * un CUIT que pasa el dígito verificador pero no existe en el Padrón — un tipeo que da un número
     * válido pero de nadie.
     */
    noEncontrados: Array<{
        cuit: string;
        motivo: string;
    }>;
    /**
     * CUIT que EXISTEN pero están dados de baja. No son un fracaso de la corrida.
     *
     * Van aparte de `noEncontrados` porque son otra cosa y piden otra acción. El padrón contesta los
     * dos casos con un SOAP Fault —de ahí que estuvieran mezclados—, pero significan lo opuesto:
     *
     *   inexistente   ese CUIT no es de nadie: hay un número mal y hay que corregirlo
     *   INACTIVA      la persona existe, su CUIT está de baja ante el organismo
     *
     * Mezclados, la pantalla le decía a alguien «ARCA no reconoció ese CUIT · corregí el dato», sobre
     * un número que estaba perfecto. Es el mismo criterio con el que corre la validación de obras
     * sociales: lo que no pasa se informa con su motivo real y no frena al resto.
     *
     * NO HAY NOMBRE QUE CORREGIR: el fault no trae nombre ni apellido, así que estas personas no se
     * renombran ni reciben el sello. Lo único verificable es el DOCUMENTO, y no porque lo diga ARCA:
     * en un CUIT de persona física los ocho dígitos del medio SON el DNI, una cuenta que se hace sin
     * consultar nada. Se compara con el guardado y se informa; no se escribe.
     */
    inactivos: Array<{
        cuit: string;
        documento: string;
        documentoGuardado: string;
        coincide: boolean;
    }>;
    motivoSinConsultar?: string;
}
/**
 * Resuelve contra el Padrón el nombre de unas pocas personas.
 *
 * SOLO SE LLAMA POR LOS QUE DIFIEREN, y esa es toda la diferencia de costo.
 *
 * La corrida de obras sociales ya lee el nombre de la pantalla de altas —ARCA lo precompleta al lado
 * del CUIL— así que comparar es gratis. Pero la pantalla lo muestra ENTERO: para ESCRIBIRLO hacen
 * falta nombre y apellido por separado, y partir «MARIA DEL CORAZON DE JESUS SORIA» por un espacio es
 * adivinar dónde termina uno y empieza el otro. El padrón (`ws_sr_padron_a13`) los devuelve separados
 * y es el mismo organismo.
 *
 * Antes esto se corría por TODAS las personas de la corrida, en paralelo con el navegador: veinte
 * consultas SOAP y veinte handshakes TLS peleando por el mismo VPS con el Chromium que estaba
 * cargando el login de AFIP. Ahora se llama por los pocos que de verdad difieren — casi siempre,
 * ninguno.
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
 * Los usuarios de un conjunto de CUIL, indexados por CUIL en dígitos.
 *
 * Se compara por DÍGITOS y no por string: `metadata.cuit` se guarda con o sin guiones según de dónde
 * vino. Es el mismo emparejamiento que hace `pendientesObraSocial`, y comparar crudo es exactamente
 * lo que hacía que la validación de obras sociales no encontrara a nadie.
 *
 * Devuelve el usuario entero y no solo el id porque quien llama necesita el nombre guardado para
 * compararlo: con los ids sueltos habría que volver a leer los mismos documentos.
 */
export declare function usuariosDeCuils(tenantObjectId: any, cuils: string[]): Promise<Map<string, any>>;
