import { Document, Model } from "mongoose";
export interface IBanco extends Document {
    externalId: string;
    name: string;
    /** Tipo de entidad financiera: "banco" | "billetera_virtual" | "otro". */
    tipoEntidad?: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Banco: Model<IBanco>;
