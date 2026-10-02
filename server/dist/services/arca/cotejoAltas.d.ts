/**
 * EL COTEJO DEL LOTE DE ALTAS, puro: registro contra lo que dice la base.
 *
 * El cliente arma los registros (el generador vive en el frontend) y el servidor NO confía en ellos:
 * antes de que un byte llegue a ARCA, cada posición se compara contra el dato de la base del contrato
 * que dice representar. Un registro adulterado, corrido o armado contra otro contrato no pasa.
 *
 * Esto es la parte sin base de datos —recibe lo esperado ya resuelto— para que se pueda testear
 * campo por campo. La carga de lo esperado está en `validarLoteAltas.ts`.
 */
export type ModoAltas = "carga_masiva" | "altas_masivas";
/** Lo que la base dice de UN contrato, ya resuelto. */
export interface EsperadoAlta {
    /** Para los mensajes: «Juan Pérez (contrato 2)». */
    etiqueta: string;
    cuil: string;
    /** "YYYY-MM-DD" (o lo que haya guardado; se normaliza). */
    fechaInicio: string;
    fechaFin: string;
    categoria: string;
    convenio: string;
    /** Sueldo bruto en pesos, con decimales. */
    retribucion: number;
    /** El RNOS que corresponde, o "" si no se puede saber (obra social sin validar): eso rechaza. */
    rnos: string;
    /** Por qué no hay RNOS, para el mensaje. */
    rnosMotivo?: string;
    /** Solo para 85: puesto y situación de revista resueltos por la cascada. */
    puesto?: string;
    situacionRevista?: string;
}
/** Los códigos que existen: los del nomenclador, y los que ESTA empleadora declaró. */
export interface CatalogosCotejo {
    modalidadesContrato: Set<string>;
    modalidadesLiquidacion: Set<string>;
    tiposServicio: Set<string>;
    /** codigo de sucursal → actividades que ESTA empleadora declaró ahí. */
    sucursales: Map<string, Set<string>>;
}
export interface Diferencia {
    etiqueta: string;
    campo: string;
    esperado: string;
    recibido: string;
}
/** "YYYY-MM-DD" / "DD/MM/YYYY" → AAAA/MM/DD (formato del 130). */
export declare const fecha130: (s: string) => string;
/** Errores de FORMA del lote, antes de mirar la base: largo, charset, cantidad. */
export declare function problemasDeForma(modo: ModoAltas, registros: string[]): string[];
/**
 * Compara UN registro contra lo esperado. Devuelve las diferencias (vacío = coincide).
 *
 * Lo que es dato del contrato se compara EXACTO. Lo que sale de una cascada que el servidor no
 * replica (modalidades y tipo de servicio, que dependen del tipo de contrato) se valida contra el
 * nomenclador; sucursal y actividad, contra lo que la empleadora tiene declarado.
 */
export declare function cotejarRegistro(modo: ModoAltas, registro: string, e: EsperadoAlta, cat: CatalogosCotejo): Diferencia[];
/** El CUIL de un registro, sin importar el formato. */
export declare const cuilDeRegistro: (modo: ModoAltas, registro: string) => string;
