import mongoose, { Document, Types } from "mongoose";
export interface IRequest extends Document {
    tenantId: Types.ObjectId;
    userId: Types.ObjectId;
    reportNumber?: string;
    date: string;
    projectId?: Types.ObjectId;
    areaId?: Types.ObjectId;
    shiftId?: Types.ObjectId;
    hasActivity: boolean;
    comments?: string;
    attendance: Types.DocumentArray<any>;
    /** Cuántas veces se editó. Ver el comentario del schema: de acá sale la idempotencia del ledger. */
    version: number;
    submittedAt: Date;
}
export declare const Request: mongoose.Model<IRequest, {}, {}, {}, mongoose.Document<unknown, {}, IRequest, {}, {}> & IRequest & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
