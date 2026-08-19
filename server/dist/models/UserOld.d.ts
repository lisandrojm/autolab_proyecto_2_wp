import { type Document, type HydratedDocument, Types } from "mongoose";
export interface IUser extends Document {
    email: string;
    password: string;
    roles: Types.ObjectId[];
    clientIds: Types.ObjectId[];
    projectIds: Types.ObjectId[];
    tenantId: Types.ObjectId;
    firstName?: string;
    lastName?: string;
    positionId?: Types.ObjectId;
    levelId?: Types.ObjectId;
    areaId?: Types.ObjectId;
    isActive: boolean;
    lastLoginAt?: Date;
    hireDate: Date;
    extraVacationDays: number;
    carryOverVacationDays: number;
    createdAt: Date;
    updatedAt: Date;
    vacationDays: {
        lawDays: number;
        extraDays: number;
        carryOverDays: number;
        totalDays: number;
    };
    seniorityAtEndOfYear: number;
    metadata?: Record<string, any>;
    comparePassword(candidatePassword: string): Promise<boolean>;
    closeYear(maxDiasArrastre?: number): Promise<void>;
}
export type UserDocument = HydratedDocument<IUser>;
export declare const User: import("mongoose").Model<IUser, {}, {}, {}, Document<unknown, {}, IUser, {}, {}> & IUser & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
