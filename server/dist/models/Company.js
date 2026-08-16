import mongoose, { Schema } from "mongoose";
const companySchema = new Schema({
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
    obrasSocialesIds: [{ type: Schema.Types.ObjectId, ref: "ObraSocial" }],
    obraSocialDefaultId: { type: Number },
    convenioIds: [{ type: Schema.Types.ObjectId, ref: "Convenio" }],
    sucursalIds: [{ type: Schema.Types.ObjectId, ref: "ArcaSucursal" }],
    defaultsArca: {
        tipoServicio: { type: String, default: "" },
        modalidadLiquidacion: { type: String, default: "" },
    },
}, {
    timestamps: true,
    collection: "companies",
});
export const Company = mongoose.model("Company", companySchema);
