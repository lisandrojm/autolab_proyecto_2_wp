import mongoose, { Document, Types } from "mongoose";
export interface IImportHistory extends Document {
    tenantId: Types.ObjectId;
    status: "success" | "failed";
    executedBy: Types.ObjectId | "system";
    stats: {
        createdUsers: number;
        updatedUsers: number;
        skippedUsers: number;
        errorsUsers: number;
    };
    addedUsers: Array<{
        name: string;
        email: string;
        dni?: string;
    }>;
    addedProjects: Array<{
        name: string;
        externalId: number;
    }>;
    errorDetails?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ImportHistory: mongoose.Model<IImportHistory, {}, {}, {}, mongoose.Document<unknown, {}, IImportHistory, {}, {}> & IImportHistory & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
