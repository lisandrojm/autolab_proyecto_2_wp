/**
 * LA «CONSTANCIA DEL TRABAJADOR» DE ARCA (Simplificación Registral): el PDF que sale de Relaciones
 * Laborales → Consultas → impresora. Es el comprobante del alta temprana.
 *
 * Se lee para VALIDAR antes de mandarlo a firmar o archivarlo: un PDF que no es de esta persona, de
 * esta empleadora o de este período —o que es la constancia de BAJA, que ARCA entrega por la misma
 * impresora cuando la relación ya terminó— no puede salir a firma con el nombre de otro contrato.
 *
 * El formato está tomado de una constancia real (2030 S.R.L., 4/10/2026): dos páginas iguales
 * (talón del empleador y del empleado), con el TIPO —«Alta» o «Baja»— en la línea que sigue al
 * título. Si ARCA cambia el formato y algo no se encuentra, el campo queda vacío y la validación lo
 * dice: acá no se adivina.
 */
export interface ConstanciaTrabajador {
    /** La línea que sigue al título: «Alta», «Baja»… en minúsculas. "" si no se encontró el título. */
    tipo: string;
    /** 11 dígitos, o "". */
    empleadorCuit: string;
    cuil: string;
    apellidoNombre: string;
    /** YYYY-MM-DD, o "". */
    fechaInicio: string;
    fechaCese: string;
    /** La clave de alta que da ARCA («Clave: CA 2639…»), sin espacios. */
    clave: string;
    /** «Número de registro de trámite», solo en el talón del empleado. */
    nroTramite: string;
}
/** Lee los datos de la constancia desde su texto. Puro. */
export declare function leerConstanciaTrabajador(textoCrudo: string): ConstanciaTrabajador;
export declare const leerConstanciaTrabajadorPdf: (buffer: Buffer) => Promise<ConstanciaTrabajador>;
/**
 * Por qué esta constancia NO es el alta de ese contrato. Vacío = coincide en todo.
 *
 * Las cuatro cosas que se piden: que diga Alta, y que el CUIL, el CUIT de la empleadora y la fecha
 * de inicio sean los del contrato. Un dato que no se pudo leer cuenta como que no coincide: sin
 * poder comprobarlo, el PDF queda para revisar y no se envía ni se archiva.
 */
export declare function problemasDeConstancia(c: ConstanciaTrabajador, esperado: {
    cuil: unknown;
    empleadorCuit: unknown;
    fechaInicio: unknown;
    fechaBaja?: unknown;
}): string[];
/**
 * Lo mismo que `problemasDeConstancia`, diciendo además si es la constancia de BAJA aceptada.
 *
 * LA CONSTANCIA DE BAJA DE UNA RELACIÓN QUE YA TERMINÓ ES VÁLIDA (07/11/2026). Una jornada empieza y
 * termina el mismo día: cuando la descarga corre, ARCA ya la tiene con cese y por la impresora entrega
 * la constancia como «Baja». Es la constancia de esa relación —alta y cese en el mismo papel—, no un
 * error, y rechazarla la dejaba rebotando todos los días para siempre. Se acepta si su cese es la baja
 * del contrato (`fechaBaja`); con otro cese, o un contrato sin baja, sigue siendo un problema.
 */
export declare function evaluarConstancia(c: ConstanciaTrabajador, esperado: {
    cuil: unknown;
    empleadorCuit: unknown;
    fechaInicio: unknown;
    fechaBaja?: unknown;
}): {
    problemas: string[];
    deBaja: boolean;
    mismoDia: boolean;
};
