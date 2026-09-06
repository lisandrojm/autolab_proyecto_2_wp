import mongoose, { Document, Types } from "mongoose";
export interface IArea extends Document {
    tenantId: Types.ObjectId;
    name: string;
    description?: string;
    isSystem: boolean;
    vacationConfig?: {
        useGlobalConfig: boolean;
        permiteFraccionadas: boolean;
        minDiasFraccion?: number;
        diasCorridos?: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Area: mongoose.Model<IArea, {}, {}, {}, mongoose.Document<unknown, {}, IArea, {}, {}> & IArea & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
