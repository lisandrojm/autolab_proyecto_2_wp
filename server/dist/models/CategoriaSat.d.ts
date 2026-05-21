import { Document, Model } from "mongoose";
export interface ICategoriaSat extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        numeroCategoria: number;
        sueldoBruto: number;
        sueldoBrutoLetras: string;
        neto: number;
        sueldoNetoLetras: string;
        fechaActualizacion: Date | string;
        codigoAfip: number;
        presentismo: number;
        sueldoBasico: number;
        sueldoAdicional: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const CategoriaSat: Model<ICategoriaSat>;
