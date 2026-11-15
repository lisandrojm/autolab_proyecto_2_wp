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
    /** La ventana anual de goce que regía al crearla (ya resuelta para la persona). Las anteriores al 10/11/2026 no la tienen. */
    ventanaGoce?: {
        enabled: boolean;
        tramos: {
            inicio: string;
            fin: string;
        }[];
    };
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
    /**
     * LA JERARQUÍA QUE LA APRUEBA (15/11/2026): quién podía aprobar cada nivel al pedirla (una foto, por
     * proyecto) y quién aprobó cada uno. Ver `compartido/vacaciones/etapaDeAprobacion.ts`. Las anteriores
     * a la jerarquía no tienen `cadena`: si siguen `pending`, son del admin.
     */
    cadena?: {
        proyectos: {
            projectId: Types.ObjectId;
            supervisores: Types.ObjectId[];
            coordinadores: Types.ObjectId[];
        }[];
        calculadaAt?: Date;
    };
    aprobaciones?: {
        supervisor?: {
            userId: Types.ObjectId;
            projectId?: Types.ObjectId;
            at: Date;
        };
        coordinador?: {
            userId: Types.ObjectId;
            projectId?: Types.ObjectId;
            at: Date;
        };
    };
    /** Los avisos del coordinador al supervisor («Solicitar aprobación»), uno por día como mucho. */
    recordatorios?: {
        porUserId: Types.ObjectId;
        at: Date;
    }[];
    /** Quién la rechazó y en qué nivel (`admin` = desde la bandeja web). */
    rechazo?: {
        userId?: Types.ObjectId;
        nivel: "supervisor" | "coordinador" | "admin";
        motivo?: string;
        at: Date;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Vacation: mongoose.Model<IVacation, {}, {}, {}, mongoose.Document<unknown, {}, IVacation, {}, {}> & IVacation & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
export {};
