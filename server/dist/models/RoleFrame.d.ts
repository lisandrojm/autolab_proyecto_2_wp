import { Document, Model } from "mongoose";
interface ICategoriaSat {
    id: number;
    numeroCategoria: number;
    sueldoBruto: number;
    sueldoBrutoLetras: string;
    neto: number;
    sueldoNetoLetras: string;
    fechaActualizacion: string | Date;
    codigoAfip: number;
    presentismo: number;
    sueldoBasico: number;
    sueldoAdicional: number;
    nombre: string;
}
export interface IRoleFrame extends Document {
    externalId: string;
    data: {
        rol: {
            id: number;
            nombre: string;
        };
        categoriasSat: ICategoriaSat[];
    };
    name: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const RoleFrame: Model<IRoleFrame>;
export {};
