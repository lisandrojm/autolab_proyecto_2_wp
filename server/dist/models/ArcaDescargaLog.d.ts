import { Document, Model, Types } from "mongoose";
/**
 * CADA CORRIDA DE DESCARGA DE CONSTANCIAS de una empleadora (11/11/2026): la encadenada a una
 * presentación, el barrido diario o una pedida a mano. Es el historial de «A.R.C.A Descargas Automáticas»
 * y la métrica del encadenamiento: cuántas constancias salieron de ALTA (la relación seguía activa) y
 * cuántas de BAJA (ARCA la emite así cuando la jornada ya terminó, que es el caso que se quiere evitar).
 *
 * El estado de cada constancia sigue en `constancias_arca`; esto es el registro de la corrida. Va en su
 * colección y no en el tenant: el tenant se lee en cada pedido y esto crece.
 */
export interface IArcaDescargaLog extends Document {
    tenantId: Types.ObjectId;
    origen: "encadenada" | "barrido" | "manual";
    empresaId?: Types.ObjectId | null;
    empresaRazonSocial: string;
    arrancadaEl: Date;
    terminadaEl: Date;
    /** Sólo la encadenada: la presentación de la que salió. */
    presentacion?: {
        terminadaEl: Date;
        logId?: Types.ObjectId | null;
        automatica: boolean;
    } | null;
    pedidas: number;
    listas: number;
    deAlta: number;
    deBaja: number;
    items: Array<{
        cuil: string;
        nombre: string;
        estado: string;
        detalle?: string;
        tipoConstancia?: "alta" | "baja" | null;
    }>;
    error?: string | null;
    createdAt: Date;
}
export declare const ArcaDescargaLog: Model<IArcaDescargaLog>;
