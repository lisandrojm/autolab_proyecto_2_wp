import mongoose, { Schema, Document, Model, Types } from "mongoose";

/*
  UN REGISTRO POR CADA DOCUMENTO QUE LA PLATAFORMA NOMBRA, CON SU CÓDIGO ÚNICO («ID-000123»).

  El código va dentro del nombre del archivo (`{{codigo}}` en Plantillas › Nomenclatura) y es lo que
  permite reconocer el documento cuando vuelve: el aviso de Dropbox Sign «Se inició el proceso de firma
  de …_ID-000123…» se resuelve buscando ESTE registro, sin deducir la persona y el período del nombre.
  Por nombre, un alta, su contrato y su release comparten persona y período, y el aviso de uno movía
  los tres.

  El contrato se guarda de dos formas porque los contratos (subdocumentos de `UserProject.contracts`)
  casi nunca tienen `_id`: la posición en el array y sus fechas. La posición puede correrse si se borra
  un contrato anterior; las fechas no, y son las que se usan primero para encontrarlo.
*/
export interface IDocumentoGenerado extends Document {
  tenantId: Types.ObjectId;
  /** «ID-000123»: el texto exacto que va en el nombre. */
  codigo: string;
  /** El número del correlativo (123), para ordenar y para saber cuál sigue. */
  numero: number;
  /** El tipo de la nomenclatura: Contrato, Release, AltaAFIP, ConstanciaCUIT, Documentacion, Pedido, Vacacion. */
  tipo: string;
  /** El nombre con el que se generó, SIN extensión. */
  archivo: string;
  userId?: Types.ObjectId | null;
  userProjectId?: Types.ObjectId | null;
  projectId?: Types.ObjectId | null;
  contrato?: {
    indice?: number | null;
    /** YYYY-MM-DD, como las guarda el contrato. */
    alta?: string;
    baja?: string;
    carga?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IDocumentoGenerado>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    codigo: { type: String, required: true },
    numero: { type: Number, required: true },
    tipo: { type: String, required: true },
    archivo: { type: String, default: "" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    userProjectId: { type: Schema.Types.ObjectId, default: null },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", default: null },
    contrato: {
      indice: { type: Number, default: null },
      alta: { type: String, default: "" },
      baja: { type: String, default: "" },
      carga: { type: String, default: "" },
    },
  },
  { timestamps: true, collection: "documentos_generados" },
);

// Un código no se repite NUNCA dentro del tenant: es la garantía de que un aviso apunta a un solo documento.
schema.index({ tenantId: 1, codigo: 1 }, { unique: true });

export const DocumentoGenerado: Model<IDocumentoGenerado> = mongoose.model<IDocumentoGenerado>("DocumentoGenerado", schema);

/*
  EL CORRELATIVO, POR TENANT. Un documento por clave con el último número entregado; `$inc` con
  `upsert` es atómico en Mongo, así que dos documentos generados al mismo tiempo nunca reciben el
  mismo número. Los huecos (un número pedido para un archivo que al final no se guardó) no importan:
  lo que importa es que no se repita.
*/
interface IContador {
  _id: string;
  seq: number;
}
const contadorSchema = new Schema<IContador>({ _id: { type: String, required: true }, seq: { type: Number, default: 0 } }, { collection: "contadores", versionKey: false });
const Contador: Model<IContador> = mongoose.model<IContador>("Contador", contadorSchema);

/** El próximo número del correlativo de documentos del tenant. */
export async function proximoNumeroDeDocumento(tenantId: unknown): Promise<number> {
  const r = await Contador.findOneAndUpdate({ _id: `documentos:${String(tenantId)}` }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return Number(r?.seq) || 1;
}

/** «ID-000123»: seis dígitos como mínimo, para que el ancho no cambie durante mucho tiempo. */
export const formatoCodigo = (numero: number): string => `ID-${String(numero).padStart(6, "0")}`;
