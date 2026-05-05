import { Document, Model } from "mongoose";
export interface IInfo extends Document {
    externalId: string;
    type: string;
    data: {
        id: number;
        nombre: string;
        [key: string]: any;
    };
    name: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Info: Model<IInfo>;
