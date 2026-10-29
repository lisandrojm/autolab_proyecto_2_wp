export declare const PROPORCION_NETO = 0.81;
export declare const FACTOR_PRESENTISMO = 1.1;
/** Montos que son datos de prueba cargados en producción: se avisan, no se corrigen. */
export declare const RATES_DE_PRUEBA: number[];
/** La tabla 1 del Resumen tiene 9 filas fijas (los gráficos apuntan a ellas). */
export declare const FILAS_CATEGORIAS_RESUMEN = 9;
/** % de Adicional Sattsaid sobre el básico, por grupo (escala 131/75; G2 no aparece en ninguna planilla). */
export declare const PCT_SATTSAID_POR_GRUPO: Record<number, number>;
export declare const MESES: string[];
export interface SolicitudJornada {
    id: string;
    personaId: string;
    legajo: string;
    apellido: string;
    nombre: string;
    rol: string;
    categoriaNumero: number | null;
    categoriaNombre: string;
    dailyRate: number;
    fechas: string[];
}
export interface FilaReporte {
    legajo: string;
    apellido: string;
    nombre: string;
    rol: string;
    /** «Apellido Nombre»: la clave con la que la planilla agrupa y busca. */
    clave: string;
    categoriaNumero: number | null;
    categoriaNombre: string;
    sueldoJornada: number;
    fecha: string;
    solicitudId: string;
}
export interface FilaLiquidacion {
    clave: string;
    categoriaNumero: number | null;
    categoriaNombre: string;
    contratos: number;
    jornadas: number;
    netoPactado: number;
}
export interface FilaEscala {
    numero: number;
    basico: number;
    sattsaid: number;
    jornal: number;
}
export interface PlanillaJornaleros {
    mes: string;
    reporte: FilaReporte[];
    liquidacion: FilaLiquidacion[];
    escala: FilaEscala[];
    /** Nombre de categoría + número, de mayor a menor neto: las que entran en la tabla 1 del Resumen. */
    categoriasResumen: {
        numero: number | null;
        nombre: string;
    }[];
    totales: {
        contratos: number;
        jornadas: number;
        personas: number;
        netoPactado: number;
    };
    advertencias: string[];
}
/** "2026-10" → primer y último día, en "YYYY-MM-DD". */
export declare const rangoDelMes: (mes: string) => {
    desde: string;
    hasta: string;
};
export declare const nombreDelArchivo: (mes: string) => string;
export declare function armarPlanilla(mes: string, solicitudes: SolicitudJornada[]): PlanillaJornaleros;
