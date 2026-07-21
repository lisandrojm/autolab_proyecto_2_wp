import mongoose, { Schema, Document, Model } from "mongoose";

// Empresa / Productora usada para armar los contratos (datos de "La Empleadora").
export interface ICompany extends Document {
  razonSocial: string;
  cuit?: string;
  // Domicilio legal
  domicilioCalle?: string;
  domicilioNumero?: string;
  domicilioPisoDepto?: string;
  localidad?: string;
  provincia?: string;
  codigoPostal?: string;
  // Firmante (quien representa a la empresa en el contrato)
  firmanteNombre?: string;
  firmanteDni?: string;
  firmanteCargo?: string;
  // Representante legal / apoderado
  representanteLegalNombre?: string;
  representanteLegalEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const companySchema = new Schema<ICompany>(
  {
    razonSocial: { type: String, required: true },
    cuit: { type: String },
    domicilioCalle: { type: String },
    domicilioNumero: { type: String },
    domicilioPisoDepto: { type: String },
    localidad: { type: String },
    provincia: { type: String },
    codigoPostal: { type: String },
    firmanteNombre: { type: String },
    firmanteDni: { type: String },
    firmanteCargo: { type: String },
    representanteLegalNombre: { type: String },
    representanteLegalEmail: { type: String },
  },
  {
    timestamps: true,
    collection: "companies",
  }
);

export const Company: Model<ICompany> = mongoose.model<ICompany>("Company", companySchema);
