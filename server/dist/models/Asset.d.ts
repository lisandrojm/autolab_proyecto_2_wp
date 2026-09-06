import mongoose, { Document } from "mongoose";
export interface IAsset extends Document {
    tenantId: string;
    clientId: string;
    projectId?: string;
    nombre: string;
    tipo: "imagen" | "video" | "audio" | "documento" | "otro";
    url: string;
    scope?: "brandkit" | "assets";
    creadoPor: string;
    tags: string[];
    permisos: {
        editores: string[];
        visores: string[];
    };
    metadata?: {
        name?: string;
        title?: string;
        description?: string;
        category?: string;
        notes?: string;
    };
    createdAt: Date;
    updatedAt: Date;
    lastUsedAt?: Date;
    isAiGenerated?: boolean;
    parentId?: mongoose.Types.ObjectId;
    regeneration?: number;
    revisions: mongoose.Types.ObjectId[];
}
export declare const Asset: mongoose.Model<IAsset, {}, {}, {}, mongoose.Document<unknown, {}, IAsset, {}, {}> & IAsset & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
