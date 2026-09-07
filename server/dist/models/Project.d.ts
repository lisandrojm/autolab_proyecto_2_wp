import { Document, Types, Model } from "mongoose";
export interface IProjectMetadata {
    id: number;
    nombre: string;
    descripcion: string;
    responsableId: number;
    clienteId: number;
    fechaInicio: string;
    fechaFin: string;
    fechaAlta: string;
    sedeId: number;
    activo: boolean;
    centroCostoId: number;
}
export interface IWorkScheduleDay {
    startTime: string;
    endTime: string;
    isWorkDay: boolean;
}
export interface IWorkSchedule {
    mode: "weekdays" | "all_week" | "per_day";
    weekdays?: IWorkScheduleDay;
    weekend?: IWorkScheduleDay;
    days?: {
        monday?: IWorkScheduleDay;
        tuesday?: IWorkScheduleDay;
        wednesday?: IWorkScheduleDay;
        thursday?: IWorkScheduleDay;
        friday?: IWorkScheduleDay;
        saturday?: IWorkScheduleDay;
        sunday?: IWorkScheduleDay;
    };
}
export interface IProject extends Document {
    tenantId: Types.ObjectId;
    clientId?: Types.ObjectId;
    contratoEmpresas?: Types.ObjectId[];
    /**
     * LOS CONVENIOS BAJO LOS QUE ESTE PROYECTO CONTRATA.
     *
     * Cuelgan de `contratoEmpresas`: solo pueden ser convenios que alguna de esas empleadoras tenga
     * registrados ante ARCA, porque el organismo únicamente acepta categorías de los CCT que ese CUIT
     * registró. Sacarle una empresa al proyecto se lleva sus convenios.
     *
     * Sirven para acotar el alta: una productora puede tener seis CCT registrados y este proyecto
     * contratar bajo uno. Con la lista cargada, el alta ofrece esa; vacía, ofrece todas las de la
     * empresa — vacío es «todavía no se acotó», no «ninguno».
     */
    convenioIds?: Types.ObjectId[];
    releaseEmpresas?: Types.ObjectId[];
    name: string;
    description?: string;
    status: "active" | "completed" | "on_hold" | "archived";
    startDate?: Date;
    endDate?: Date;
    objectives: string[];
    targetAudience?: string;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
    assignedUsers: Types.ObjectId[];
    teamConfig?: {
        userId: Types.ObjectId;
        canRegister: boolean;
        useProjectSchedule?: boolean;
        startTime?: string;
        endTime?: string;
        areaId?: Types.ObjectId;
        shiftId?: Types.ObjectId;
        areaShiftAssignments?: {
            areaId: Types.ObjectId;
            shiftIds: Types.ObjectId[];
        }[];
    }[];
    favorite?: boolean;
    vacationConfig?: {
        useGlobalConfig: boolean;
        permiteFraccionadas: boolean;
        minDiasFraccion?: number;
        diasCorridos?: boolean;
    };
    activityLogConfig?: {
        useGlobalConfig: boolean;
        enableFastEntry?: boolean;
        allowsAdditionalStaff?: boolean;
        allowedPastDays?: number;
        schedule?: {
            type: "daily" | "workdays" | "custom";
            days: number[];
        };
    };
    externalId?: number;
    metadata?: IProjectMetadata;
    workSchedule?: IWorkSchedule;
    turnos: Types.ObjectId[];
    areasConfig?: {
        areaId: Types.ObjectId;
        shiftIds: Types.ObjectId[];
    }[];
    coordinatorAssignments?: {
        areaId: Types.ObjectId;
        shiftId: Types.ObjectId;
        userId: Types.ObjectId;
    }[];
}
export declare const Project: Model<IProject>;
