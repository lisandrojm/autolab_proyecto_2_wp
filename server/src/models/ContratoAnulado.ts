import { Schema, model, Document, Types } from "mongoose";

/**
 * UN CONTRATO ANULADO, ENTERO (etapa 2b, 18/11/2026; ver `utils/anulacionContrato.ts`).
 *
 * En `users_&_projects` queda sólo la lápida (su clave y la marca), para que no se corran las posiciones
 * de los demás. Lo que el contrato era vive acá, tal cual estaba al anularlo, con quién lo anuló, cuándo
 * y por qué. Si al anularlo no quedaba ningún contrato de verdad en el vínculo, el vínculo se borró como
 * antes (`vinculoEliminado`): el contrato no se pierde igual.
 */
export interface IContratoAnulado extends Document {
  tenantId: Types.ObjectId | null;
  userProjectId: Types.ObjectId;
  userId: Types.ObjectId;
  projectId: Types.ObjectId;
  contratoKey: Types.ObjectId;
  /** La posición que tenía en el array al anularlo (la lápida queda ahí). */
  posicion: number;
  /** El contrato completo, como estaba. */
  contrato: Record<string, unknown>;
  anuladoEl: Date;
  anuladoPor: Types.ObjectId | null;
  anuladoPorNombre: string;
  motivo: string;
  /** Desde dónde: el panel, o el borrado de la solicitud aprobada que lo había creado. */
  origen: "panel" | "borrar_solicitud" | "delete_deprecado" | "script";
  /** No quedaba ningún contrato de verdad: el vínculo con el proyecto se borró (como hacía el borrado físico). */
  vinculoEliminado: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const contratoAnuladoSchema = new Schema<IContratoAnulado>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    userProjectId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    contratoKey: { type: Schema.Types.ObjectId, required: true },
    posicion: { type: Number, required: true },
    contrato: { type: Schema.Types.Mixed, required: true },
    anuladoEl: { type: Date, required: true },
    anuladoPor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    anuladoPorNombre: { type: String, default: "" },
    motivo: { type: String, default: "" },
    origen: { type: String, enum: ["panel", "borrar_solicitud", "delete_deprecado", "script"], required: true },
    vinculoEliminado: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "contratos_anulados", minimize: false },
);

// Un contrato se anula una vez: la clave es única. Si una corrida falla a mitad, el reintento choca acá en vez de duplicar.
contratoAnuladoSchema.index({ contratoKey: 1 }, { unique: true });
contratoAnuladoSchema.index({ userId: 1, anuladoEl: -1 });
contratoAnuladoSchema.index({ userProjectId: 1 });

export const ContratoAnulado = model<IContratoAnulado>("ContratoAnulado", contratoAnuladoSchema);
export default ContratoAnulado;
