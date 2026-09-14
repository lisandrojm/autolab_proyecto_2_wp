import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * PAÍS DE RESIDENCIA: el país del DOMICILIO de una persona.
 *
 * Es un catálogo propio (Configuración → Países de residencia) y NO el de países de FRAME
 * (`Info` con `type: "pais"`), que sigue siendo el de la nacionalidad y el país de nacimiento. Son
 * preguntas distintas: dónde nació o de dónde es alguien no cambia, dónde vive sí, y la lista de
 * lugares donde vive la gente que se contrata la administra la plataforma, no la trae FRAME.
 *
 * Sigue la forma de los catálogos simples (Bancos, Sindicatos): `{ externalId, name, data }`.
 *
 * `data.id` ES LO QUE GUARDA `metadata.paisId`. La primera carga copia los países de FRAME CON SU
 * MISMO id (ver `services/paisesResidenciaSeed.ts`), así que los domicilios que ya estaban guardados
 * con el id viejo siguen resolviendo a su nombre sin migrar ningún usuario.
 */
export interface IPaisResidencia extends Document {
  externalId: string;
  name: string;
  /** Activo = se ofrece en los formularios. Se apaga desde el ABM sin borrar el país. */
  activo?: boolean;
  data: {
    id: number;
    nombre: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const paisResidenciaSchema = new Schema<IPaisResidencia>(
  {
    externalId: { type: String },
    name: { type: String, required: true },
    activo: { type: Boolean, default: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
  },
  {
    timestamps: true,
    collection: "paises_residencia",
  },
);

// El registro resuelve el nombre del país elegido por su id: se busca por acá.
paisResidenciaSchema.index({ "data.id": 1 });

/** Desde dónde se numeran los países cargados sin ID. Ver `siguienteId`. */
const PRIMER_ID_PROPIO = 100000;

/*
  EL ID DE LOS PAÍSES CARGADOS A MANO.

  Un país sin `data.id` no se puede elegir en ningún formulario: es lo que queda guardado en la persona.
  Así que si se crea o se importa desde el ABM sin ID, se le asigna uno.

  Arrancan en 100.000 y no en el siguiente al último: los países copiados de FRAME tienen su numeración,
  y la sincronización con FRAME sigue escribiendo `paisId` con ella. Un país propio con el número que
  FRAME use mañana para otro haría que esas personas vean un país que no es el suyo.
*/
async function siguienteId(): Promise<number> {
  const ultimo = await PaisResidencia.findOne({ "data.id": { $ne: null } }).sort({ "data.id": -1 }).select("data.id").lean();
  return Math.max((ultimo?.data?.id ?? 0) + 1, PRIMER_ID_PROPIO);
}

// Alta y edición desde el ABM (el router hace `create` y `save`).
paisResidenciaSchema.pre("save", async function () {
  const sinExternalId = !this.externalId || !String(this.externalId).trim();

  // Editar un país y dejarle el ID vacío no puede desconectar a quienes ya lo tienen: conserva el suyo.
  // (El router, con el ID vacío, le pone `data.id = 0`, porque `Number("")` es 0.)
  if (!this.isNew && sinExternalId) {
    const antes = await PaisResidencia.findById(this._id).select("externalId data.id").lean();
    if (antes?.data?.id != null) {
      this.set("data.id", antes.data.id);
      this.externalId = antes.externalId || String(antes.data.id);
      return;
    }
  }

  if (this.data?.id == null || Number.isNaN(this.data.id) || sinExternalId) {
    const id = await siguienteId();
    this.set("data.id", id);
    this.externalId = String(id);
  }
});

// Importación de Excel y carga masiva (el router hace `bulkWrite`, que no pasa por el `save`).
paisResidenciaSchema.post("bulkWrite", async function () {
  const sinId = await PaisResidencia.find({ "data.id": null }).select("_id").sort({ name: 1 }).lean();
  let id = sinId.length > 0 ? await siguienteId() : 0;
  for (const p of sinId) {
    await PaisResidencia.updateOne({ _id: p._id }, { $set: { "data.id": id, externalId: String(id) } });
    id++;
  }
  // Una fila importada por nombre y sin ID pisa `externalId` con "": el país conserva su id, que se vuelve a mostrar.
  await PaisResidencia.updateMany({ externalId: { $in: ["", null] }, "data.id": { $ne: null } }, [{ $set: { externalId: { $toString: "$data.id" } } }]);
});

export const PaisResidencia: Model<IPaisResidencia> = mongoose.model<IPaisResidencia>("PaisResidencia", paisResidenciaSchema);
