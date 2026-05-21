import mongoose, { Document, Model } from "mongoose";
export interface IPdfConfig extends Document {
    tenantId: mongoose.Types.ObjectId;
    razonSocial?: string;
    cuit?: string;
    ciudad?: string;
    direccion?: string;
    logoUrl?: string;
    signatureUrl?: string;
    signerName?: string;
    signerRole?: string;
    createdAt: Date;
    updatedAt: Date;
}
interface IPdfConfigModel extends Model<IPdfConfig> {
    getOrCreateDefault(tenantId: mongoose.Types.ObjectId): Promise<IPdfConfig>;
}
export declare const PdfConfig: IPdfConfigModel;
export {};
