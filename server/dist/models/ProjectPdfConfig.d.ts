import mongoose, { Document, Types } from "mongoose";
export interface IProjectPdfConfig extends Document {
    tenantId: Types.ObjectId;
    name: string;
    razonSocial?: string;
    cuit?: string;
    ciudad?: string;
    direccion?: string;
    logoUrl?: string;
    signatureUrl?: string;
    signerName?: string;
    signerRole?: string;
    projects: Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}
export declare const ProjectPdfConfig: mongoose.Model<IProjectPdfConfig, {}, {}, {}, mongoose.Document<unknown, {}, IProjectPdfConfig, {}, {}> & IProjectPdfConfig & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
