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
  // Membrete: logo y firma (imágenes) de la empresa para encabezar/firmar los documentos.
  // La aclaración de firma y el cargo reutilizan firmanteNombre / firmanteCargo.
  logoUrl?: string;
  signatureUrl?: string;
  /**
   * Obra social a usar para los contratos de esta empresa cuando la persona no tiene ninguna
   * asignada. Guarda el `data.id` del catálogo (el RNOS numérico), igual que `osId` en el contrato.
   * Si queda vacío, se usa la marcada como global en el catálogo de Obras Sociales.
   */
  obraSocialId?: number;
  /**
   * Convenios Colectivos (CCT) habilitados para esta empleadora. Referencias al catálogo de Convenios.
   *
   * NO se manda al TXT: el campo Convenio del registro de 130 (pos. 91-100) va en blanco a propósito.
   * Su función es ser el CONJUNTO VÁLIDO contra el que se valida la Categoría SAT del contrato: ARCA
   * solo ofrece las categorías de los convenios que la empresa tiene habilitados (l_CatCCT viene
   * filtrado por CCT), así que una categoría de otro convenio es un dato mal cargado.
   *
   * No borrar por "no se usa": es el único lugar donde vive la relación empresa → convenios, y sin
   * él la validación de `categorias-sat.data.convenio` se queda sin padre.
   *
   * Ojo: "9999/99 — EXCLUIDO DE CONVENIO" es un convenio más de la lista, no la ausencia de convenio.
   */
  convenioIds?: mongoose.Types.ObjectId[];
  /**
   * Sucursales del padrón de ARCA que le corresponden a esta empresa. Son referencias al catálogo
   * de Sucursales (ARCA → Sucursales), donde vive TODO el dato: código, domicilio y actividades.
   * Acá solo se elige cuáles aplican, igual que con los convenios.
   */
  sucursalIds?: mongoose.Types.ObjectId[];
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
    logoUrl: { type: String },
    signatureUrl: { type: String },
    obraSocialId: { type: Number },
    convenioIds: [{ type: Schema.Types.ObjectId, ref: "Convenio" }],
    sucursalIds: [{ type: Schema.Types.ObjectId, ref: "ArcaSucursal" }],
  },
  {
    timestamps: true,
    collection: "companies",
  }
);

export const Company: Model<ICompany> = mongoose.model<ICompany>("Company", companySchema);
