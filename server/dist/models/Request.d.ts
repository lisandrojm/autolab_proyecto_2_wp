import mongoose, { Document, Types } from "mongoose";
export interface IRequest extends Document {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    reportNumber?: string;
    date: string;
    projectId?: Types.ObjectId;
    areaId?: Types.ObjectId;
    hasActivity: boolean;
    comments?: string;
    attendance: Types.DocumentArray<any>;
    submittedAt: Date;
}
export declare const Request: mongoose.Model<IRequest, {}, {}, {}, mongoose.Document<unknown, {}, IRequest, {}, {}> & IRequest & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
