import mongoose, { Document, Types } from "mongoose";
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
    clientId: Types.ObjectId;
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
        isNotifier: boolean;
        canRegister: boolean;
        useProjectSchedule?: boolean;
        startTime?: string;
        endTime?: string;
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
    };
    workSchedule?: IWorkSchedule;
}
export declare const Project: mongoose.Model<IProject, {}, {}, {}, mongoose.Document<unknown, {}, IProject, {}, {}> & IProject & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
