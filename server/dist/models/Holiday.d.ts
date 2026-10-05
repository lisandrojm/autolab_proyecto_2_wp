import mongoose, { Document, Types } from "mongoose";
export interface IHoliday extends Document {
    tenantId: Types.ObjectId;
    date: Date;
    name: string;
    type: string;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Holiday: mongoose.Model<IHoliday, {}, {}, {}, mongoose.Document<unknown, {}, IHoliday, {}, {}> & IHoliday & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
