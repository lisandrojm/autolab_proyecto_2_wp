import mongoose, { Document, Model } from "mongoose";
export interface IContratoFrame extends Document {
    externalId: string;
    name: string;
    empresaId?: mongoose.Types.ObjectId;
    data: {
        id: number;
        nombre: string;
        rutaArchivo: string;
        cantidadJornadas: number;
        multiplicadorDiario: number;
        fileUrl: string;
        fileName: string;
        esTiempoIndeterminado: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ContratoFrame: Model<IContratoFrame>;
