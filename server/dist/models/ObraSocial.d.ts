import { Document, Model } from "mongoose";
export interface IObraSocial extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ObraSocial: Model<IObraSocial>;
