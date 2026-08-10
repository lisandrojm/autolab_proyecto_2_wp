import mongoose, { Document, Types } from "mongoose";
export interface IUserProfile extends Document {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    position?: string;
    department?: string;
    hireDate?: Date;
    birthDate?: Date;
    address?: {
        street?: string;
        city?: string;
        state?: string;
        country?: string;
        zip?: string;
    };
    profilePhotoUrl?: string;
    vacationPolicy: {
        annualDays: number;
        carryOverDays: number;
    };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const UserProfile: mongoose.Model<IUserProfile, {}, {}, {}, mongoose.Document<unknown, {}, IUserProfile, {}, {}> & IUserProfile & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
