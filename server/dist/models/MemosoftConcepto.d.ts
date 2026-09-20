import { Document, Types, Model } from "mongoose";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UN CONCEPTO DE MEMOSOFT: la columna del recibo donde termina cada novedad
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Memosoft es el sistema de sueldos, corre en escritorio y NO TIENE API. La única forma de meterle
 * novedades es un XLSX con seis columnas —`d8lega`, `d1nape`, `d8conc`, `d8desc`, `d8par1`,
 * `d8par2`—, y cada fila dice: a este legajo, este concepto, con estos dos parámetros.
 *
 * Este catálogo es el que sabe, para cada código, CUÁL de los dos parámetros se usa y si lo que va
 * ahí es una cantidad de días o un importe en pesos. Sin eso, un 0012 con 3 en `par2` en vez de
 * `par1` entra en Memosoft como tres pesos de licencia por enfermedad en lugar de tres días.
 *
 * ES DATO, NO CONSTANTES EN EL CÓDIGO, por dos razones: los 29 códigos son los de 2030 y FZERO y no
 * un estándar —otra empresa tendría los suyos—, y cuando el estudio de sueldos agregue un concepto
 * nadie debería tener que desplegar para poder usarlo.
 *
 * EL PARÁMETRO QUE NO SE USA VA EN CERO, NUNCA VACÍO: es requisito del importador de Memosoft, y
 * está acá como comentario porque es el tipo de detalle que se pierde y se paga caro.
 */
export type UnidadParametro = "cantidad" | "importe";
export interface IMemosoftConcepto extends Document {
    tenantId: Types.ObjectId;
    /** De qué empresa es este catálogo. Los códigos NO son universales. */
    empresaId: Types.ObjectId;
    /**
     * El código tal cual lo espera Memosoft: CUATRO DÍGITOS, TEXTO. "0012", no 12.
     *
     * Es string y no número porque los ceros de la izquierda son parte del código, y un Excel que los
     * pierda genera un archivo que Memosoft rechaza sin decir por qué.
     */
    codigo: string;
    /** La descripción que va en la columna `d8desc`, tal cual la muestra Memosoft. */
    descripcion: string;
    usaPar1: boolean;
    usaPar2: boolean;
    /** Qué significa el número de `d8par1`. Sólo tiene sentido con `usaPar1`. */
    unidadPar1?: UnidadParametro | null;
    unidadPar2?: UnidadParametro | null;
    activo: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const MemosoftConcepto: Model<IMemosoftConcepto>;
/**
 * LOS 29 CÓDIGOS DE 2030 Y FZERO, como los pasó el estudio de sueldos.
 *
 * Semilla, no verdad inmutable: el script de la fase 0 los carga una vez por empresa y de ahí en
 * más se editan desde la pantalla. Está acá y no en el script para que se pueda leer el catálogo
 * sin abrir una migración.
 *
 * LA LEYENDA DICE BIEN QUÉ COLUMNA USA CADA CONCEPTO, PERO NO SIEMPRE LA UNIDAD.
 *
 * Se confirmó contra el archivo real de agosto:
 *
 *   · 0090 Licencia Sin Goce — la leyenda decía importe en par2. El único caso de agosto (Prestes)
 *     trae par2 = 1, y un importe de un peso no existe: son DÍAS. Corregido.
 *   · 0099 Adelanto — la leyenda dice importe y ahí sí acierta: 100.000, 200.000, 250.000, 430.000.
 *   · 0040 Ropa — SIGUE ABIERTA: no aparece ninguna vez en agosto, así que no hay con qué decidir.
 *     Queda como vino, con el guard de magnitud de `validarEfecto` avisando si el número es chico.
 *
 * Nada se cambia "porque tiene más sentido": lo que se corrige es lo que el archivo real contradice.
 */
export declare const CONCEPTOS_SEMILLA: {
    codigo: string;
    descripcion: string;
    par1?: UnidadParametro;
    par2?: UnidadParametro;
}[];
