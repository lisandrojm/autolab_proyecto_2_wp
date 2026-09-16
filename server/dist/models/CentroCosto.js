import mongoose, { Schema } from "mongoose";
/**
 * Deja `name`, `externalId` y `data` en línea con los cuatro campos de Tango.
 *
 * Exportada para que los caminos que escriben con `insertMany`/`bulkWrite` —que NO pasan por los
 * hooks de documento— guarden exactamente lo mismo que un `save()`.
 */
export const sincronizarCamposDerivados = (doc) => {
    const cod = String(doc.codAuxiliar ?? "").trim();
    const id = Number(doc.idAuxiliar);
    if (cod) {
        doc.name = cod;
        doc.data = { ...doc.data, nombre: cod, descripcion: String(doc.descAuxiliar ?? "").trim() || undefined };
    }
    if (Number.isFinite(id)) {
        doc.externalId = String(id);
        doc.data = { ...doc.data, id };
    }
    return doc;
};
const centroCostoSchema = new Schema({
    idAuxiliar: { type: Number },
    codAuxiliar: { type: String, trim: true },
    descAuxiliar: { type: String, trim: true },
    habilitado: { type: String, enum: ["S", "N"], default: "S" },
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
        id: { type: Number },
        nombre: { type: String },
        descripcion: { type: String },
    },
}, {
    timestamps: true,
    collection: "centros-costo",
});
/*
  Índices únicos PARCIALES: sólo sobre los documentos que tienen el campo.

  Un único a secas trataría a todos los centros viejos —que no tienen `idAuxiliar`— como repetidos del
  mismo valor `null` y haría fallar el segundo. Con `partialFilterExpression` el único rige recién
  cuando el campo existe, que es lo que hace que el catálogo importado no pueda tener duplicados sin
  bloquear a los registros anteriores al cambio.
*/
centroCostoSchema.index({ idAuxiliar: 1 }, { unique: true, partialFilterExpression: { idAuxiliar: { $type: "number" } } });
centroCostoSchema.index({ codAuxiliar: 1 }, { unique: true, partialFilterExpression: { codAuxiliar: { $type: "string" } } });
centroCostoSchema.pre("validate", function (next) {
    sincronizarCamposDerivados(this);
    next();
});
export const CentroCosto = mongoose.model("CentroCosto", centroCostoSchema);
