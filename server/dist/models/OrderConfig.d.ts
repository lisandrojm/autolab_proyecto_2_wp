import mongoose, { Document, Types } from "mongoose";
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
    [key: string]: any;
}
export interface IOrderConfig extends Document {
    tenantId: Types.ObjectId;
    name: string;
    informacion?: string;
    icon?: string;
    isActive: boolean;
    sortOrder: number;
    categoryType: "fecha" | "dinero" | "objeto" | "otros";
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
