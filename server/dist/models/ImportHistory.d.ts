import mongoose, { Document, Types } from "mongoose";
export interface IImportHistory extends Document {
    tenantId: Types.ObjectId;
    /**
     * "running" se guarda al ARRANCAR la sincronización, antes de recorrer los empleados (que puede
     * tardar varios minutos), y el mismo documento se actualiza a "success"/"failed" al terminar. El
     * frontend hace polling de `GET /import/history/latest` mientras el estado sea "running".
     */
    status: "running" | "success" | "failed";
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
