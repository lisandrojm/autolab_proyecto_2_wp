export interface RelacionArca {
    cuil: string;
    empleadoraCuit: string;
    inicio: string;
    fin: string;
    situacionBaja?: string;
}
/** Umbral de alerta de la granularidad (decisión del usuario, 19/11): 15 días. */
export declare const UMBRAL_GRANULARIDAD_DIAS = 15;
export type TipoCambioBaja = "baja_nueva" | "baja_por_tramos" | "baja_anterior" | "baja_paraguas" | "arca_granularidad" | "revision_manual" | "arca_posterior" | "arca_abierta";
export interface CambioDeBaja {
    tipo: TipoCambioBaja;
    /** Se escribe sólo en baja_nueva, baja_por_tramos, baja_anterior y baja_paraguas. */
    aplicar: boolean;
    /** Por qué va a revisión manual (o qué mirar), en una línea. */
    alerta?: string;
    bajaContrato: string;
    finArca: string;
    situacionBaja: string;
    /** En `arca_granularidad`: cuántos días antes de la baja del contrato termina el ÚLTIMO tramo de ARCA.
     *  Más de `UMBRAL_GRANULARIDAD_DIAS` ya no parece granularidad (la persona pudo dejar antes): se lista
     *  aparte para que alguien mire, sin cambiar la decisión. */
    diasAntesDelFin?: number;
    /** Los tramos de ARCA que se miraron (misma persona y empleadora), para mostrar la evidencia. */
    tramos?: {
        inicio: string;
        fin: string;
        situacionBaja: string;
    }[];
}
export declare function cambioDeBajaSegunArca(contrato: {
    fecha_alta_contrato?: unknown;
    fecha_baja_contrato?: unknown;
    estadoContrato?: unknown;
}, cuil: string, cuit: string, relaciones: RelacionArca[], hoy: string, 
/** Las altas («AAAA-MM-DD») de los OTROS contratos no anulados de la misma persona y empleadora. */
otrasAltas?: string[]): CambioDeBaja | null;
/** El valor a guardar, con el mismo formato que el alta del contrato (texto «AAAA-MM-DD» o ISO con hora). */
export declare function bajaConFormatoDelAlta(fin: string, alta: unknown): string;
