import { Document, Model } from "mongoose";
export interface IObraSocial extends Document {
    /** Código RNOS (6 díg., posible cero a la izquierda) para el TXT de Alta masiva de AFIP.
     *  Es el mismo "ID Externo" genérico de los catálogos FRAME: para Obras Sociales, ese id
     *  siempre fue el código RNOS, así que no hace falta un campo separado. */
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
