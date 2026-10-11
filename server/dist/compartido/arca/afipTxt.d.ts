import type { ContractOverviewRow } from "./tiposArca.js";
import { AfipCatalogs, AfipValues } from "./afipCompleteness.js";
/** Si esa posición es una de las que un alta no puede informar. */
export declare const noInformableEnAlta: (desde: number, hasta: number) => boolean;
/**
 * CÓMO VIAJA LA RETRIBUCIÓN (58-72): en centavos implícitos (importe × 100) o en pesos enteros.
 *
 * El diseño de 130 no aclara los decimales. El de 85 parte el importe en 8 enteros + 2 decimales, y
 * de ahí sale que las altas lleven centavos — pero es una inferencia, no un dato confirmado, y la
 * diferencia entre las dos lecturas es un sueldo cien veces más grande o cien veces más chico.
 *
 * Queda acá, en una sola constante, para que confirmarlo contra un alta aceptada sea cambiar un
 * `true` por un `false` y no repasar el generador, los tests y el tooltip. Mientras no esté
 * confirmado, el tooltip del campo lo dice en la pantalla en vez de dejarlo sólo en el código.
 */
export declare const RETRIBUCION_EN_CENTAVOS = true;
/** Fecha en formato AAAA/MM/DD que pide ARCA. Acepta "YYYY-MM-DD" o "DD/MM/YYYY". */
export declare const fechaAfip: (s: string) => string;
/**
 * La fecha de fin es ANTERIOR a la de inicio. Las dos ya normalizadas a `AAAA/MM/DD`.
 *
 * EL MISMO DÍA VALE: un jornalero contratado por una jornada empieza y termina el 28/09, y esa
 * relación dura un día, no cero. Antes se exigía fin POSTERIOR al inicio y el alta de una sola
 * jornada —el caso más común de un contrato «Jornada»— salía con la fecha de fin vacía y el panel en
 * «Hay datos cargados mal». CONFIRMADO CONTRA ARCA el 2026-09-28: un TXT con inicio = fin
 * (2026/09/28, modalidad 022, 2030 S.R.L.) se cargó en Simplificación registral como «Válido».
 *
 * Vive acá y no dentro del generador porque la usan DOS lugares que tienen que decir lo mismo: el
 * armado del registro y el chequeo de completitud que la pantalla muestra. Cuando la regla estaba en uno solo, el panel decía «4 de 4 completos»
 * mientras el campo salía vacío en la vista previa, que es la peor combinación posible: afirma que
 * está listo y no dice qué arreglar.
 *
 * Se compara como texto: `AAAA/MM/DD` ordena igual alfabética que cronológicamente, así que no hace
 * falta construir fechas y la zona horaria no puede correr un día.
 */
export declare const finAnteriorAlInicio: (inicioAfip: string, finAfip: string) => boolean;
/** De dónde sale el contenido de un campo del registro. */
export type ClaseCampo = 
/** Constante del formato (tipo de registro, movimiento, rectificación…). */
"constante"
/** Dato del contrato/persona que hay que resolver. */
 | "dato"
/** No aplica a un alta: va en blanco a propósito. */
 | "no_aplica";
export interface CampoRegistro {
    desde: number;
    hasta: number;
    nombre: string;
    clase: ClaseCampo;
    /** Contenido formateado listo para el archivo, o `null` si el dato falta / está mal. */
    contenido: string | null;
    /** Con qué se muestra en la vista previa cuando `contenido` es null. */
    placeholder: string;
    /** `key` del check de completitud que lo resuelve, para poder cruzarlos en la UI. */
    checkKey?: string;
}
/**
 * Describe el registro campo por campo. Es la fuente única del layout: `buildAltaRecord` lo
 * concatena y el modal lo muestra. Los campos que no se pudieron resolver vienen con
 * `contenido: null`, así la vista previa puede marcarlos en su posición exacta.
 */
/**
 * El registro de 130, descripto para DOCUMENTACIÓN: qué hay en cada posición y de dónde sale.
 *
 * Es el mismo layout que arma `describirRegistro`, pero sin necesitar un contrato. La pantalla
 * "Cómo funciona ARCA" lo lee de acá y no de una tabla escrita a mano: una tabla explicativa que se
 * desfasa del generador es peor que no tenerla, porque se le cree. Hay un test que compara las dos
 * listas posición por posición.
 *
 * `tipo` es la única información que agrega sobre el generador, y es lo que contesta las preguntas
 * que se repiten: si un campo hay que pedirlo o si ya está resuelto.
 */
export type TipoCampoAlta = "obligatorio" | "condicional" | "constante" | "en_blanco";
export interface CampoAltaDoc {
    desde: number;
    hasta: number;
    nombre: string;
    /** De dónde sale el dato, en el lenguaje de la app. */
    origen: string;
    tipo: TipoCampoAlta;
}
export declare const LAYOUT_ALTA: CampoAltaDoc[];
export declare function describirRegistro(row: ContractOverviewRow, cat: AfipCatalogs): {
    campos: CampoRegistro[];
    valores: AfipValues;
};
/**
 * Arma el registro de 130 caracteres de un contrato. Devuelve null si le faltan datos obligatorios
 * (no se puede generar una línea válida sin ellos).
 */
export declare function buildAltaRecord(row: ContractOverviewRow, cat: AfipCatalogs): string | null;
/**
 * Une los registros: un LF entre cada uno y UNO al final. Sin CR.
 *
 * Venía con CRLF y sin salto final. El CR es un caracter más pegado al registro, así que la línea
 * medía 131 donde el validador espera 130 y el rechazo no dice eso: dice que algún campo está mal.
 * El salto final cierra el último registro, que sin él queda como una línea sin terminar.
 */
export declare function buildAltaTxt(records: string[]): string;
