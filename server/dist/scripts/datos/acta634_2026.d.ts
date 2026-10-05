/**
 * LOS DATOS DEL ACTA, EN UN SOLO LUGAR.
 *
 * Acuerdo salarial ATA – CAPIT – SATTSAID, paritaria 2025-2026, 2.º tramo (febrero–junio 2026), expediente
 * RE-2026-43103223-APN-DTD#JGM, firmado el 28/04/2026, Anexo A.
 *
 * Está separado de los scripts que lo cargan para que se pueda leer y auditar sin leer código de carga: acá
 * está lo que dice el papel, ahí está lo que se hace con eso.
 *
 * LO QUE EL ACTA NO DICE, ACÁ NO ESTÁ. El tipo de cálculo y el carácter remunerativo de cada adicional no
 * figuran en el acuerdo: van con `confirmado: false` y `remunerativo: null`, y la sugerencia de tipo queda
 * anotada como sugerencia. Los importes de la escala por grupo tampoco están escritos acá — se leen de la
 * base, que ya los tiene cargados y verificados (ver `seed634Tramos.ts`).
 */
export declare const EXPEDIENTE = "RE-2026-43103223-APN-DTD#JGM";
export declare const CONVENIOS: string[];
export declare const MARCA_ACUERDO = "634-acuerdo-v1";
export declare const MARCA_TRAMOS = "634-tramos-v1";
export declare const MARCA_ADICIONALES = "634-adicionales-v1";
export declare const MARCA_PEQUENAS = "634-pequenas-v1";
/** Los tramos, con el régimen alternativo del art. 3.2 incluido. */
export declare const TRAMOS: ({
    codigo: string;
    desde: string;
    porcentaje: number;
    base: string;
    baseDesde: string;
    acumulativo: boolean;
    regimen: "general";
    nota: string;
    absorbe?: undefined;
} | {
    codigo: string;
    desde: string;
    porcentaje: number;
    base: string;
    baseDesde: string;
    acumulativo: boolean;
    regimen: "alternativo";
    nota: string;
    absorbe?: undefined;
} | {
    codigo: string;
    desde: string;
    porcentaje: number;
    base: string;
    baseDesde: string;
    acumulativo: boolean;
    regimen: "alternativo";
    absorbe: string;
    nota: string;
})[];
/** El período paritario completo, que es más largo que este tramo. */
export declare const PERIODO_PARITARIO: {
    desde: string;
    hasta: string;
};
/**
 * El factor del 2.º tramo: +4,8 %.
 *
 * Es el que relaciona abril con junio, y está verificado: 1.132.832,62 (grupo 1, abril, Anexo A) × 1,048 =
 * 1.187.208,59, que es el básico de junio tal como está cargado en la base. Por eso `seed634Tramos` puede
 * derivar abril desde junio mientras no llegue la tabla completa del Anexo A.
 */
export declare const FACTOR_JUNIO = 1.048;
/** Grupo 1 de abril, el único que el acta dejó escrito en el pedido. Se usa para VERIFICAR la derivación. */
export declare const CONTROL_ABRIL_G1: {
    grupo: number;
    basico: number;
    adicionalPct: number;
    adicionalMonto: number;
    presentismoMonto: number;
    total: number;
};
export interface AdicionalDelActa {
    codigo: string;
    nombre: string;
    /** SUGERENCIA, no dato del acta. Se carga con `confirmado: false`. */
    tipoSugerido: "monto_fijo" | "mensual" | "por_anio_antiguedad" | "por_evento";
    unidad: string;
    /** Importe del tramo de abril (01/04/2026). */
    abril: number;
    /** Importe del tramo de junio (01/06/2026). */
    junio: number;
    nota?: string;
}
/**
 * Los siete adicionales, con los dos importes que publica el acta.
 *
 * Los dos juegos van literales y no derivados: `abril × 1,048` da un centavo de diferencia en seis de los
 * siete (sólo Exteriores coincide), así que el acta no se reproduce con el porcentaje. Ver
 * `utils/aplicarParitaria.test.ts`, que fija exactamente eso.
 */
export declare const ADICIONALES: AdicionalDelActa[];
/** Las vigencias de los dos tramos que se cargan. `hasta` es INCLUSIVE. */
export declare const VIGENCIA_ABRIL: {
    desde: string;
    hasta: string;
};
export declare const VIGENCIA_JUNIO: {
    desde: string;
    hasta: string;
};
