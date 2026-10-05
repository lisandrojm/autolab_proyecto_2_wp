import mongoose, { Document, Types } from "mongoose";
export interface IUserVacationBalance extends Document {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    year: number;
    totalAnnual?: number;
    taken?: number;
    pending?: number;
    available?: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const UserVacationBalance: mongoose.Model<IUserVacationBalance, {}, {}, {}, mongoose.Document<unknown, {}, IUserVacationBalance, {}, {}> & IUserVacationBalance & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
