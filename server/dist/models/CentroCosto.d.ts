import { Document, Model } from "mongoose";
export interface ICentroCosto extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const CentroCosto: Model<ICentroCosto>;
