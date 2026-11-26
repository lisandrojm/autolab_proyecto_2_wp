import mongoose, { Document, Types } from "mongoose";
import type { ReglasCambioTurno } from "../compartido/cambioDeTurno.js";
export type TipoAccionFutura = "documento" | "otra";
export type DeadlineMode = "none" | "plazoDias" | "fechaEspecifica";
export type DateMode = "single" | "range";
export interface ISubtype {
    id: string;
    label: string;
    requiere_certificado?: boolean;
    maxDays?: number;
    [key: string]: any;
}
export interface IFutureActionConfig {
    enabled?: boolean;
    tipoAccionPorDefecto?: string;
    plazoDiasPorDefecto?: number;
    responsablePorDefecto?: string;
    requiereDocumento?: boolean;
    documentoRequerido?: string;
}
export interface ITypeConfig {
    subtipos?: ISubtype[];
    futureActionConfig?: IFutureActionConfig;
    /** Reglas del tipo de sistema «Cambio de turno» (ver `compartido/cambioDeTurno.ts`). */
    reglasCambioTurno?: Partial<ReglasCambioTurno>;
    [key: string]: any;
}
export interface IOrderConfig extends Document {
    tenantId: Types.ObjectId;
    name: string;
    /**
     * TIPO DE SISTEMA (26/11/2026): lo crea el server para cada tenant (`services/orderConfigInitService.ts`),
     * no se borra y no cambia de `categoryType`. Mismo patrón que los turnos (`Shift.isSystem`), más una
     * `systemKey` para reconocerlo aunque lo renombren.
     */
    isSystem: boolean;
    systemKey?: string;
    informacion?: string;
    icon?: string;
    isActive: boolean;
    sortOrder: number;
    categoryType: "fecha" | "dinero" | "objeto" | "otros" | "datos_personales" | "cambio_turno";
    dateMode?: DateMode;
    maxDays?: number;
    config: ITypeConfig;
    limitType?: "monto" | "porcentaje";
    montoMaximo?: number;
    porcentajeMaximo?: number;
    requiresAction?: boolean;
    actionText?: string;
    actionDescription?: string;
    tituloAccion?: string;
    futureActionType?: TipoAccionFutura;
    deadlineMode?: DeadlineMode;
    plazoDias?: number;
    fechaLimite?: Date;
    documentoRequerido?: string;
    requiresSignature?: boolean;
    requiresUserConfirmation?: boolean;
    pdfId?: Types.ObjectId;
    pdfText?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const OrderConfig: mongoose.Model<IOrderConfig, {}, {}, {}, mongoose.Document<unknown, {}, IOrderConfig, {}, {}> & IOrderConfig & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
