import mongoose, { Document, Types } from "mongoose";
export interface IShift extends Document {
    tenantId: Types.ObjectId;
    name: string;
    days: number[];
    startTime: string;
    endTime: string;
    order: number;
    description?: string;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Shift: mongoose.Model<IShift, {}, {}, {}, mongoose.Document<unknown, {}, IShift, {}, {}> & IShift & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
