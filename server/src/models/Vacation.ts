import mongoose, { Schema, Document, Types } from "mongoose";
import { VacationConfig } from "./VacationConfig.js";

// ─────────────────────────────────────────────────────────────────────────────
// Vacation Rules Interface
// ─────────────────────────────────────────────────────────────────────────────
interface AntiguedadTramo {
  desde: number;
  hasta: number;
  dias: number;
}

interface VacationRules {
  diasAnuales: number;
  diasBeneficio?: number;
  antiguedadTramos?: AntiguedadTramo[];
  maxDiasGozados?: number;
  permiteArrastre: boolean;
  maxDiasArrastre?: number;
  vencimientoArrastreDias?: number;

  maxDiasHabiles?: number;
  anticipacionMinimaDias?: number;
  permiteFraccionadas: boolean;
  minDiasFraccion?: number;
  diasCorridos?: boolean;
  /** La ventana anual de goce que regía al crearla (ya resuelta para la persona). Las anteriores al 10/11/2026 no la tienen. */
  ventanaGoce?: { enabled: boolean; tramos: { inicio: string; fin: string }[] };
  requiereFirma: boolean;
  pdfId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vacation Interface
// ─────────────────────────────────────────────────────────────────────────────
export interface IVacation extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  vacationNumber: string;
  userName: string;
  position: string;
  level: string;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  diasDeVacacionesAnuales: number;
  balance: number;
  status: "pending" | "pre_approved" | "approved" | "rejected" | "delivered" | "cancelled";
  reason: string;
  comments?: string;
  managerComment?: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  deliveredAt?: Date;
  rejectedAt?: Date;
  cancelledAt?: Date;
  preApprovedBy?: Types.ObjectId;
  preApprovedAt?: Date;
  requiresSignature?: boolean;
  signatureStatus?: "not_required" | "pending" | "sent" | "signed";
  signatureSentAt?: Date;
  signatureNotifiedAt?: Date;
  signedAt?: Date;
  signedBy?: Types.ObjectId;
  pdfPreAprobacionUrl?: string;
  rules?: VacationRules;
  /**
   * DE DÓNDE SALIÓ. `solicitud` (la persona la pidió desde la app) o `plan` (la creó el plan de
   * vacaciones por proyecto al aprobarla el coordinador; `planVacacionesId` y `projectId` dicen cuál).
   */
  origen?: "solicitud" | "plan";
  planVacacionesId?: Types.ObjectId;
  projectId?: Types.ObjectId;
  /**
   * DE QUÉ AÑO DESCUENTA. Sin este campo, del año en que empieza. El plan lo fija al año de saldo de la
   * temporada: un bloque de enero de 2027 planificado en la temporada 2026/27 descuenta de 2026.
   */
  periodoSaldo?: number;
  /**
   * LA JERARQUÍA QUE LA APRUEBA (15/11/2026): quién podía aprobar cada nivel al pedirla (una foto, por
   * proyecto) y quién aprobó cada uno. Ver `compartido/vacaciones/etapaDeAprobacion.ts`. Las anteriores
   * a la jerarquía no tienen `cadena`: si siguen `pending`, son del admin.
   */
  cadena?: { proyectos: { projectId: Types.ObjectId; supervisores: Types.ObjectId[]; coordinadores: Types.ObjectId[] }[]; calculadaAt?: Date };
  aprobaciones?: {
    supervisor?: { userId: Types.ObjectId; projectId?: Types.ObjectId; at: Date };
    coordinador?: { userId: Types.ObjectId; projectId?: Types.ObjectId; at: Date };
  };
  /** Los avisos del coordinador al supervisor («Solicitar aprobación»), uno por día como mucho. */
  recordatorios?: { porUserId: Types.ObjectId; at: Date }[];
  /** Quién la rechazó y en qué nivel (`admin` = desde la bandeja web). */
  rechazo?: { userId?: Types.ObjectId; nivel: "supervisor" | "coordinador" | "admin"; motivo?: string; at: Date };
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vacation Schema
// ─────────────────────────────────────────────────────────────────────────────
const vacationSchema = new Schema<IVacation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    vacationNumber: { type: String, required: true, trim: true, uppercase: true, index: true },
    userName: { type: String, required: true },
    position: { type: String, required: true },
    level: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    daysRequested: { type: Number, required: true, min: 0.5 },
    diasDeVacacionesAnuales: { type: Number, required: true },
    balance: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "pre_approved", "approved", "rejected", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    reason: { type: String, required: true, trim: true },
    comments: { type: String, trim: true },
    managerComment: { type: String, trim: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    deliveredAt: { type: Date },
    rejectedAt: { type: Date },
    cancelledAt: { type: Date },
    preApprovedBy: { type: Schema.Types.ObjectId, ref: "User" },
    preApprovedAt: { type: Date },
    requiresSignature: { type: Boolean, default: false },
    signatureStatus: {
      type: String,
      enum: ["not_required", "pending", "sent", "signed"],
      default: "not_required",
    },
    signatureSentAt: { type: Date },
    signatureNotifiedAt: { type: Date },
    signedAt: { type: Date },
    signedBy: { type: Schema.Types.ObjectId, ref: "User" },
    pdfPreAprobacionUrl: { type: String },
    origen: { type: String, enum: ["solicitud", "plan"], default: "solicitud" },
    planVacacionesId: { type: Schema.Types.ObjectId, ref: "PlanVacaciones" },
    projectId: { type: Schema.Types.ObjectId, ref: "Project" },
    periodoSaldo: { type: Number },
    cadena: {
      type: new Schema(
        {
          proyectos: {
            type: [
              {
                _id: false,
                projectId: { type: Schema.Types.ObjectId, ref: "Project" },
                supervisores: [{ type: Schema.Types.ObjectId, ref: "User" }],
                coordinadores: [{ type: Schema.Types.ObjectId, ref: "User" }],
              },
            ],
            default: [],
          },
          calculadaAt: { type: Date },
        },
        { _id: false },
      ),
      required: false,
    },
    aprobaciones: {
      supervisor: { type: new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User" }, projectId: { type: Schema.Types.ObjectId, ref: "Project" }, at: Date }, { _id: false }), required: false },
      coordinador: { type: new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User" }, projectId: { type: Schema.Types.ObjectId, ref: "Project" }, at: Date }, { _id: false }), required: false },
    },
    recordatorios: { type: [{ _id: false, porUserId: { type: Schema.Types.ObjectId, ref: "User" }, at: Date }], default: undefined },
    rechazo: {
      type: new Schema({ userId: { type: Schema.Types.ObjectId, ref: "User" }, nivel: { type: String, enum: ["supervisor", "coordinador", "admin"] }, motivo: String, at: Date }, { _id: false }),
      required: false,
    },
    rules: {
      type: {
        diasAnuales: { type: Number, required: true },
        diasBeneficio: { type: Number, required: false },
        antiguedadTramos: {
          type: [
            {
              desde: { type: Number, required: true },
              hasta: { type: Number, required: true },
              dias: { type: Number, required: true },
            },
          ],
          required: false,
          default: [],
        },
        maxDiasGozados: { type: Number, required: false },
        permiteArrastre: { type: Boolean, required: true },
        maxDiasArrastre: { type: Number, required: false },
        vencimientoArrastreDias: { type: Number, required: false },

        maxDiasHabiles: { type: Number, required: false },
        anticipacionMinimaDias: { type: Number, required: false },
        permiteFraccionadas: { type: Boolean, required: true },
        minDiasFraccion: { type: Number, required: false },
        diasCorridos: { type: Boolean, required: false },
        ventanaGoce: {
          enabled: { type: Boolean },
          tramos: { type: [{ _id: false, inicio: { type: String }, fin: { type: String } }], default: undefined },
        },
        requiereFirma: { type: Boolean, required: true },
        pdfId: { type: String, required: false },
      },
      required: false,
    },
  },
  { timestamps: true, collection: "vacations" },
);

vacationSchema.index({ tenantId: 1, userId: 1, status: 1 });
vacationSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
vacationSchema.index({ tenantId: 1, startDate: 1, endDate: 1 });
vacationSchema.index({ tenantId: 1, vacationNumber: 1 }, { unique: true });
vacationSchema.index({ tenantId: 1, planVacacionesId: 1 }, { sparse: true });
vacationSchema.pre("validate", async function (next) {
  if (!this.isNew || this.vacationNumber) {
    return next();
  }

  try {
    const Tenant = mongoose.model("Tenant");
    const tenant = await Tenant.findById(this.tenantId);

    if (!tenant) {
      throw new Error("Tenant not found");
    }

    const prefix = tenant.slug.toUpperCase().slice(0, 3);

    // Use VacationConfig.getNextVacationSequence instead of separate counter
    let sequence = await VacationConfig.getNextVacationSequence(this.tenantId);
    let paddedNumber = sequence.toString().padStart(6, "0");
    let candidateNumber = `${prefix}-VAC-${paddedNumber}`;

    while (await mongoose.model("Vacation").exists({ tenantId: this.tenantId, vacationNumber: candidateNumber })) {
      sequence = await VacationConfig.getNextVacationSequence(this.tenantId);
      paddedNumber = sequence.toString().padStart(6, "0");
      candidateNumber = `${prefix}-VAC-${paddedNumber}`;
    }

    this.vacationNumber = candidateNumber;

    next();
  } catch (error) {
    next(error as Error);
  }
});

export const Vacation = mongoose.model<IVacation>("Vacation", vacationSchema);
