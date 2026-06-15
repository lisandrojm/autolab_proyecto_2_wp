import { Document, Model } from "mongoose";
export interface IContratoFrame extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
        rutaArchivo: string;
        cantidadJornadas: number;
        multiplicadorDiario: number;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ContratoFrame: Model<IContratoFrame>;
