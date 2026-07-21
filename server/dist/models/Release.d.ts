import mongoose, { Document, Types } from "mongoose";
export interface IRelease extends Document {
    tenantId: Types.ObjectId;
    empresaId?: Types.ObjectId;
    name: string;
    version: string;
    description?: string;
    fileUrl?: string;
    fileName?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Release: mongoose.Model<IRelease, {}, {}, {}, mongoose.Document<unknown, {}, IRelease, {}, {}> & IRelease & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
