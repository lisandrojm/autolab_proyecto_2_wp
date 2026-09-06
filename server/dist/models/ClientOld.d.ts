import mongoose, { Document, Types } from "mongoose";
export interface IDocument {
    _id?: Types.ObjectId;
    url: string;
    name?: string;
    fileName?: string;
    fileType?: string;
    uploadedAt?: Date;
    size?: number;
}
export interface IClient extends Document {
    tenantId: Types.ObjectId;
    slug?: string;
    ownerUserId?: Types.ObjectId;
    name: string;
    email: string;
    phone?: string;
    company?: string;
    industry?: string;
    website?: string;
    attachments: IDocument[];
    contacts: {
        name?: string;
        email?: string;
        phone?: string;
        role?: string;
    }[];
    proyectos: Types.ObjectId[];
    status: "active" | "inactive" | "onboarding";
    favorite: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdBy?: string;
    costCenters?: {
        name: string;
        code: string;
        description?: string;
        budget: {
            total: number;
            allocated: number;
            spent: number;
            currency: string;
        };
        isActive: boolean;
    }[];
    assignedUsers: Types.ObjectId[];
    usuarios?: {
        userId: Types.ObjectId;
        permiso: "ver" | "editar";
    }[];
}
export declare const Client: mongoose.Model<IClient, {}, {}, {}, mongoose.Document<unknown, {}, IClient, {}, {}> & IClient & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
