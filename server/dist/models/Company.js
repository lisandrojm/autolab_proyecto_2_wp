import mongoose, { Schema } from 'mongoose';
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
    firmanteEmail: { type: String },
    representanteLegalNombre: { type: String },
    representanteLegalEmail: { type: String },
    logoUrl: { type: String },
    signatureUrl: { type: String },
    obrasSocialesIds: [{ type: Schema.Types.ObjectId, ref: 'ObraSocial' }],
    obraSocialDefaultId: { type: Number },
    convenioIds: [{ type: Schema.Types.ObjectId, ref: 'Convenio' }],
    sucursalIds: [{ type: Schema.Types.ObjectId, ref: 'ArcaSucursal' }],
    sucursalActividades: [
        {
            _id: false,
            sucursalId: { type: Schema.Types.ObjectId, ref: 'ArcaSucursal', required: true },
            actividades: [{ _id: false, codigo: { type: String, required: true }, descripcion: { type: String, default: '' } }],
        },
    ],
    defaultsArca: {
        grupoTipoServicio: { type: String, default: '' },
        tipoServicio: { type: String, default: '' },
        modalidadLiquidacion: { type: String, default: '' },
        sucursalId: { type: Schema.Types.ObjectId, ref: 'ArcaSucursal', default: null },
        convenioId: { type: Schema.Types.ObjectId, ref: 'Convenio', default: null },
    },
}, {
    timestamps: true,
    collection: 'companies',
});
export const Company = mongoose.model('Company', companySchema);
