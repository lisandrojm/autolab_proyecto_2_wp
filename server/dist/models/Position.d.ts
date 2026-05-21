import mongoose, { Document, Types } from "mongoose";
export interface IPosition extends Document {
    tenantId: Types.ObjectId;
    name: string;
    description?: string;
    vacationConfig?: {
        useGlobalConfig: boolean;
        permiteFraccionadas: boolean;
        minDiasFraccion?: number;
        diasCorridos?: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Position: mongoose.Model<IPosition, {}, {}, {}, mongoose.Document<unknown, {}, IPosition, {}, {}> & IPosition & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
