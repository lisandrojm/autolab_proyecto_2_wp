import mongoose, { Document, Types } from "mongoose";
export interface IUserOrderBalance extends Document {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    orderConfigId: Types.ObjectId;
    subtypeId?: string;
    year: number;
    totalAnnual?: number;
    taken?: number;
    pending?: number;
    available?: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const UserOrderBalance: mongoose.Model<IUserOrderBalance, {}, {}, {}, mongoose.Document<unknown, {}, IUserOrderBalance, {}, {}> & IUserOrderBalance & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
