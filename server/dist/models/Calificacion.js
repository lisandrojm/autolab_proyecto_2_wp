import mongoose, { Schema } from "mongoose";
/**
 * UNA CALIFICACIÓN DE UNA PERSONA: DE 1 A 5 ESTRELLAS, SIN EL 3.
 *
 * El 3 no se puede elegir a propósito: no se quieren calificaciones «del medio», hay que decidir si la
 * actuación fue buena (4, 5) o mala (1, 2). Al marcar 4 o 5 la tercera estrella aparece pintada, pero
 * lo que se guarda es el número elegido. La calificación DE LA PERSONA (0 a 5) es el promedio de todas
 * las suyas; 0 quiere decir que nadie la calificó todavía.
 *
 * Se guarda cada una por separado —nunca se pisa— con quién la puso, cuándo (día y hora exactos,
 * `createdAt`) y el comentario si lo dejó. `origen` dice desde dónde:
 *
 *  - `fin_contrato`: en «Por vencer» (móvil), al decidir Renovar o Dejar vencer. Es la ÚNICA que se
 *    pisa: hay UNA por contrato, (userProjectId, fechaBajaContrato), igual que `RenovacionContrato`.
 *    Si se califica, se abre la renovación y se cierra sin mandarla, el contrato vuelve a la lista;
 *    calificarlo otra vez corrige la anterior en vez de sumarle una segunda.
 *  - `equipos`: en Equipos (móvil), una calificación extra por una buena o mala actitud.
 *  - `usuarios`: en la lista de Usuarios del escritorio, en cualquier momento y por cualquier motivo.
 *  - `solicitud_renovacion`: en el escritorio, al revisar una solicitud de renovación.
 */
export const ESTRELLAS_VALIDAS = [1, 2, 4, 5];
export const ORIGENES_CALIFICACION = ["fin_contrato", "equipos", "usuarios", "solicitud_renovacion"];
const calificacionSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    estrellas: { type: Number, enum: ESTRELLAS_VALIDAS, required: true },
    comentario: { type: String, trim: true, maxlength: 1000 },
    origen: { type: String, enum: ORIGENES_CALIFICACION, required: true },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject" },
    fechaBajaContrato: { type: String },
    decision: { type: String, enum: ["renovar", "dejar_vencer"] },
    solicitudId: { type: Schema.Types.ObjectId, ref: "User" },
    calificadoPor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    calificadoPorNombre: { type: String },
}, { timestamps: true, collection: "calificaciones" });
calificacionSchema.index({ tenantId: 1, userId: 1, createdAt: -1 });
// Una sola por contrato terminado: ver `fin_contrato` arriba.
calificacionSchema.index({ tenantId: 1, userProjectId: 1, fechaBajaContrato: 1 }, { unique: true, partialFilterExpression: { origen: "fin_contrato" } });
export const Calificacion = mongoose.model("Calificacion", calificacionSchema);
