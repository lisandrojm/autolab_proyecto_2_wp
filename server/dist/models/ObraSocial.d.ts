import { Document, Model } from "mongoose";
export interface IObraSocial extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
    };
    /** Código RNOS (6 díg.) para el TXT de Alta masiva de AFIP. Se carga por obra social. */
    codigoRnos?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ObraSocial: Model<IObraSocial>;
