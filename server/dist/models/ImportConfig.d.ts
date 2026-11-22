import mongoose, { Document, Types } from "mongoose";
export interface IImportConfig extends Document {
    tenantId: Types.ObjectId;
    isEnabled: boolean;
    intervalHours: number;
    syncProjects: boolean;
    sinceDays?: number;
    lastRun?: Date;
    nextRun?: Date;
    /** La importación quedó deprecada (ver `utils/importFramePausado.ts`): desde cuándo y por qué, junto al `isEnabled: false`. */
    deprecadoDesde?: string;
    nota?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ImportConfig: mongoose.Model<IImportConfig, {}, {}, {}, mongoose.Document<unknown, {}, IImportConfig, {}, {}> & IImportConfig & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
