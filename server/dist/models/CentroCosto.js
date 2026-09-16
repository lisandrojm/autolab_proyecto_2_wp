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
    empresaId: { type: Schema.Types.ObjectId, ref: "Company", index: true },
    empresaNombre: { type: String, trim: true },
    origen: { type: String, enum: ["tango", "import", "manual"], default: "manual" },
    sincronizadoEl: { type: Date },
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
  ÚNICOS POR EMPRESA, NO GLOBALES.

  Empezaron siendo únicos a secas, cuando el catálogo era uno solo. Con tres empresas eso rechaza el
  segundo «1» y el segundo «99» —los ids y los códigos de Tango arrancan igual en cada empresa— y la
  sincronización de la segunda empresa fallaría entera. Lo que no puede repetirse es el mismo código
  DENTRO de una empresa.

  Son PARCIALES: rigen sólo donde el campo existe. Sin eso, todos los centros viejos —sin `idAuxiliar`—
  contarían como repetidos del mismo `null` y el segundo no entraría.

  OJO AL DEPLOY: los únicos globales ya están creados en la base. Los reemplaza `CentroCosto.syncIndexes()`,
  que corre al sincronizar (ver `services/centrosCostoSync.ts`); sin eso, Mongo sigue aplicando el viejo.
*/
centroCostoSchema.index({ empresaId: 1, idAuxiliar: 1 }, { unique: true, partialFilterExpression: { idAuxiliar: { $type: "number" } } });
centroCostoSchema.index({ empresaId: 1, codAuxiliar: 1 }, { unique: true, partialFilterExpression: { codAuxiliar: { $type: "string" } } });
centroCostoSchema.pre("validate", function (next) {
    sincronizarCamposDerivados(this);
    next();
});
export const CentroCosto = mongoose.model("CentroCosto", centroCostoSchema);
