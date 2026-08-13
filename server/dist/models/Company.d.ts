import mongoose, { Document, Model } from "mongoose";
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
    /**
     * Obra social a usar para los contratos de esta empresa cuando la persona no tiene ninguna
     * asignada. Guarda el `data.id` del catálogo (el RNOS numérico), igual que `osId` en el contrato.
     * Si queda vacío, se usa la marcada como global en el catálogo de Obras Sociales.
     */
    obraSocialId?: number;
    /** Convenios Colectivos (CCT) que aplican a esta empresa. Referencias al catálogo de Convenios. */
    convenioIds?: mongoose.Types.ObjectId[];
    createdAt: Date;
    updatedAt: Date;
}
export declare const Company: Model<ICompany>;
