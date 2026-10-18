import mongoose, { Document, Types } from "mongoose";
interface AntiguedadTramo {
    desde: number;
    hasta: number;
    dias: number;
}
interface VacationRules {
    diasAnuales: number;
    diasBeneficio?: number;
    antiguedadTramos?: AntiguedadTramo[];
    maxDiasGozados?: number;
    permiteArrastre: boolean;
    maxDiasArrastre?: number;
    vencimientoArrastreDias?: number;
    maxDiasHabiles?: number;
    anticipacionMinimaDias?: number;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
    requiereFirma: boolean;
    pdfId?: string;
}
export interface IVacation extends Document {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    vacationNumber: string;
    userName: string;
    position: string;
    level: string;
    startDate: Date;
    endDate: Date;
    daysRequested: number;
    diasDeVacacionesAnuales: number;
    balance: number;
    status: "pending" | "pre_approved" | "approved" | "rejected" | "delivered" | "cancelled";
    reason: string;
    comments?: string;
    managerComment?: string;
    approvedBy?: Types.ObjectId;
    approvedAt?: Date;
    deliveredAt?: Date;
    rejectedAt?: Date;
    cancelledAt?: Date;
    preApprovedBy?: Types.ObjectId;
    preApprovedAt?: Date;
    requiresSignature?: boolean;
    signatureStatus?: "not_required" | "pending" | "sent" | "signed";
    signatureSentAt?: Date;
    signatureNotifiedAt?: Date;
    signedAt?: Date;
    signedBy?: Types.ObjectId;
    pdfPreAprobacionUrl?: string;
    rules?: VacationRules;
    /**
     * DE DÓNDE SALIÓ. `solicitud` (la persona la pidió desde la app) o `plan` (la creó el plan de
     * vacaciones por proyecto al aprobarla el coordinador; `planVacacionesId` y `projectId` dicen cuál).
     */
    origen?: "solicitud" | "plan";
    planVacacionesId?: Types.ObjectId;
    projectId?: Types.ObjectId;
    /**
     * DE QUÉ AÑO DESCUENTA. Sin este campo, del año en que empieza. El plan lo fija al año de saldo de la
     * temporada: un bloque de enero de 2027 planificado en la temporada 2026/27 descuenta de 2026.
     */
    periodoSaldo?: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Vacation: mongoose.Model<IVacation, {}, {}, {}, mongoose.Document<unknown, {}, IVacation, {}, {}> & IVacation & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
export {};
