export interface RelacionArca {
    cuil: string;
    empleadoraCuit: string;
    inicio: string;
    fin: string;
    situacionBaja?: string;
}
export type TipoCambioBaja = "baja_nueva" | "baja_anterior" | "arca_por_tramos" | "arca_plazo_mas_corto" | "arca_posterior" | "arca_abierta";
export interface CambioDeBaja {
    tipo: TipoCambioBaja;
    /** Se escribe sólo en baja_nueva y baja_anterior. */
    aplicar: boolean;
    bajaContrato: string;
    finArca: string;
    situacionBaja: string;
}
export declare function cambioDeBajaSegunArca(contrato: {
    fecha_alta_contrato?: unknown;
    fecha_baja_contrato?: unknown;
    estadoContrato?: unknown;
}, cuil: string, cuit: string, relaciones: RelacionArca[], hoy: string): CambioDeBaja | null;
/** El valor a guardar, con el mismo formato que el alta del contrato (texto «AAAA-MM-DD» o ISO con hora). */
export declare function bajaConFormatoDelAlta(fin: string, alta: unknown): string;
