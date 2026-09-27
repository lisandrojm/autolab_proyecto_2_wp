import mongoose, { Schema, Types } from "mongoose";

/**
 * QUÉ SE DECIDIÓ CON UN CONTRATO POR VENCER: RENOVARLO O DEJARLO VENCER.
 *
 * Es lo que saca un contrato de la pestaña «Por vencer» de Contratación (ver
 * `services/contratosPorVencer.ts`). Sin esto la lista no tiene memoria: el mismo contrato volvería a
 * aparecer cada día hasta su fecha de baja, aunque alguien ya lo hubiera resuelto.
 *
 * EL CONTRATO SE IDENTIFICA POR (UserProject, fecha de baja, POSICIÓN EN EL ARRAY). Los contratos son
 * subdocumentos sin `_id` (`UserProject.contracts[]`), así que nombrarlos es nombrar su posición —lo
 * mismo que ya hacen editar, descargar y subir documentación—.
 *
 * La posición se sumó porque acá decía que dentro de una misma asignación dos contratos no terminan
 * el mismo día, y NO ES CIERTO: en la base hay 515 pares (asignación, fecha de baja) con más de un
 * contrato. La lista dibujaba dos filas con la misma identidad y decidir sobre una resolvía la otra
 * en silencio: se guardaba un solo registro y las dos desaparecían de «Por vencer».
 *
 * - `renovar`: se pidió una solicitud de contratación con la etiqueta «Renovación» (`solicitudId`). Si
 *   esa solicitud después se RECHAZA o se CANCELA, el contrato vuelve a la lista: la renovación no pasó.
 * - `dejar_vencer`: no se renueva; el contrato termina en su fecha. Queda quién lo decidió y cuándo.
 *
 * Una decisión nueva sobre el mismo contrato pisa a la anterior (se guarda con upsert).
 */
export interface IRenovacionContrato {
  tenantId: Types.ObjectId;
  userProjectId: Types.ObjectId;
  userId?: Types.ObjectId;
  projectId?: Types.ObjectId;
  /** "YYYY-MM-DD": junto con `userProjectId` e `indiceContrato`, la identidad del contrato. */
  fechaBajaContrato: string;
  /** Posición del contrato en `UserProject.contracts`. Lo escrito antes de que esto existiera es 0. */
  indiceContrato: number;
  decision: "renovar" | "dejar_vencer";
  /** La solicitud de renovación, cuando `decision` es "renovar". */
  solicitudId?: Types.ObjectId;
  decididoPor?: Types.ObjectId;
  decididoPorNombre?: string;
  decididoEl: Date;
}

const renovacionContratoSchema = new Schema<IRenovacionContrato>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userProjectId: { type: Schema.Types.ObjectId, ref: "UserProject", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    fechaBajaContrato: { type: String, required: true },
    indiceContrato: { type: Number, required: true, default: 0 },
    decision: { type: String, enum: ["renovar", "dejar_vencer"], required: true },
    solicitudId: { type: Schema.Types.ObjectId, ref: "User" },
    decididoPor: { type: Schema.Types.ObjectId, ref: "User" },
    decididoPorNombre: { type: String },
    decididoEl: { type: Date, required: true },
  },
  { timestamps: true, collection: "renovaciones_contrato" },
);

/*
  El índice único LLEVA LA POSICIÓN. Sin ella, dos contratos de la misma asignación que terminan el
  mismo día comparten registro y la decisión sobre uno se aplica al otro.

  El índice viejo —sin `indiceContrato`— hay que borrarlo a mano: Mongoose crea los que faltan pero no
  saca los que sobran, y mientras esté, el segundo contrato choca contra él.
  Ver `scripts/indiceRenovaciones.ts`.
*/
renovacionContratoSchema.index({ tenantId: 1, userProjectId: 1, fechaBajaContrato: 1, indiceContrato: 1 }, { unique: true });

export const RenovacionContrato = mongoose.model<IRenovacionContrato>("RenovacionContrato", renovacionContratoSchema);
