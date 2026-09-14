import mongoose, { Schema, Document, Model, Types } from "mongoose";

/** Tiempo de vida de un link de registro: 30 días desde su creación. */
export const REGISTRO_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Devuelve el timestamp (ms) en que vence un link, con fallback a createdAt + TTL para links legacy sin expiresAt. */
export function getRegistroLinkExpiry(link: { expiresAt?: Date | null; createdAt: Date }): number {
  if (link.expiresAt) return new Date(link.expiresAt).getTime();
  return new Date(link.createdAt).getTime() + REGISTRO_LINK_TTL_MS;
}

export interface IRegistroLink extends Document {
  tenantId: Types.ObjectId;
  token: string;
  tenantSlug: string;
  clientId?: Types.ObjectId;
  label?: string;
  active: boolean;
  createdBy?: Types.ObjectId;
  /**
   * Para DÓNDE es el link, cuando lo genera un supervisor o coordinador desde el móvil (sección Registro):
   * quien se registra queda asociado a ese proyecto, área y turno, y a quien lo invitó. Los links del
   * panel web son generales y no los tienen.
   */
  projectId?: Types.ObjectId;
  areaId?: Types.ObjectId;
  shiftId?: Types.ObjectId;
  /** «mobile» si salió de la sección Registro del móvil (7 días, se renueva solo); ausente = panel web. */
  origen?: "web" | "mobile";
  usageCount: number;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const registroLinkSchema = new Schema<IRegistroLink>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    tenantSlug: { type: String, required: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client" },
    label: { type: String },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    areaId: { type: Schema.Types.ObjectId, ref: "Area" },
    shiftId: { type: Schema.Types.ObjectId, ref: "Shift" },
    origen: { type: String, enum: ["web", "mobile"] },
    usageCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date },
    expiresAt: { type: Date },
  },
  {
    timestamps: true,
    collection: "registro-links",
  }
);

export const RegistroLink: Model<IRegistroLink> = mongoose.model<IRegistroLink>("RegistroLink", registroLinkSchema);
