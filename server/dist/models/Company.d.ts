import { Document, Model } from "mongoose";
export interface ICompany extends Document {
    razonSocial: string;
    cuit?: string;
    domicilioCalle?: string;
    domicilioNumero?: string;
    domicilioPisoDepto?: string;
    localidad?: string;
    provincia?: string;
    codigoPostal?: string;
    firmanteNombre?: string;
    firmanteDni?: string;
    firmanteCargo?: string;
    representanteLegalNombre?: string;
    representanteLegalEmail?: string;
    logoUrl?: string;
    signatureUrl?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Company: Model<ICompany>;
