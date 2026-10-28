export declare const CAMPOS_RETRIBUCION: readonly [{
    readonly value: "jornada_neto";
    readonly label: "Importe por jornada neto";
}, {
    readonly value: "jornada_bruto";
    readonly label: "Importe por jornada bruto";
}, {
    readonly value: "semana_neto";
    readonly label: "Importe por semana neto";
}, {
    readonly value: "semana_bruto";
    readonly label: "Importe por semana bruto";
}, {
    readonly value: "mensual_neto";
    readonly label: "Importe mensual neto";
}, {
    readonly value: "mensual_bruto";
    readonly label: "Importe mensual bruto";
}, {
    readonly value: "total_neto";
    readonly label: "Importe total del contrato neto";
}, {
    readonly value: "sueldo_diario_neto";
    readonly label: "Sueldo diario neto";
}, {
    readonly value: "sueldo_bruto";
    readonly label: "Sueldo bruto";
}, {
    readonly value: "sueldo_neto";
    readonly label: "Sueldo neto";
}];
export type CampoRetribucion = (typeof CAMPOS_RETRIBUCION)[number]["value"];
export declare const TEXTO_SIN_CAMPO = "Sueldo bruto de la escala (categor\u00EDa)";
export declare const esCampoRetribucion: (v: unknown) => v is CampoRetribucion;
export declare const rotuloCampoRetribucion: (v: unknown) => string;
/** Lo que hace falta del contrato (`UserProject.contracts[i]` o la fila de Contratos). */
export interface ContratoParaRetribucion {
    sueldo_jornada?: number | string | null;
    sueldo_bruto?: number | string | null;
    sueldo_neto?: number | string | null;
    sueldo_diario_neto?: number | string | null;
    cantidad_jornadas_laborales?: number | string | null;
    dias_semana?: number[] | null;
    dias_por_semana?: number | string | null;
    dias_rotativos?: boolean | null;
    fechas_trabajadas?: string[] | null;
    fecha_alta_contrato?: string | null;
    fecha_baja_contrato?: string | null;
}
export interface ContextoRetribucion {
    /** Del tipo de contrato: `data.cantidadJornadas`, `data.diasPorSemana`, `data.esTiempoIndeterminado`. */
    tipo?: {
        cantidadJornadas?: number | null;
        diasPorSemana?: number | null;
        esTiempoIndeterminado?: boolean | null;
    } | null;
    /** La escala de la categoría: `sueldoBruto` y `neto` dan la proporción neto/bruto. */
    escala?: {
        sueldoBruto?: number | null;
        neto?: number | null;
    } | null;
}
/**
 * El importe del contrato que pide `campo`. `null` si no se puede calcular (falta la jornada, o el
 * período para el mensual): el checklist lo muestra como faltante en vez de declarar un 0.
 */
export declare function importeDelContrato(campo: CampoRetribucion, c: ContratoParaRetribucion, ctx?: ContextoRetribucion): number | null;
/** Qué campo usa la modalidad de liquidación con este código (1 díg.). `""` = el de la escala. */
export declare function campoDeModalidad(codigo: string | null | undefined, modalidades: Array<{
    externalId?: string | null;
    retribucionPactada?: string | null;
}> | null | undefined): CampoRetribucion | "";
/**
 * LA RETRIBUCIÓN QUE SE DECLARA: el importe del contrato que pide la modalidad o, si no pide ninguno,
 * el bruto de la escala. `origen` dice de dónde salió, para explicarlo en el checklist.
 */
export declare function retribucionPactada(campo: CampoRetribucion | "", c: ContratoParaRetribucion, ctx?: ContextoRetribucion): {
    valor: number;
    origen: "escala" | CampoRetribucion;
};
