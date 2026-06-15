import { Document, Model } from "mongoose";
export interface IBanco extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Banco: Model<IBanco>;
