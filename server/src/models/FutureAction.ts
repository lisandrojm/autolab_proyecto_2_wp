import mongoose, { Schema, Document, Types } from "mongoose";

export type TipoAccionFutura =
  | "plazoDias"
  | "fechaEspecifica"
  | "presentacionDocumento"
  | "sinVencimiento";

export type EstadoAccion = "pendiente" | "cumplida" | "vencida" | "en_revision";

export type ResponsableAccion = "usuario" | "cliente" | "area_interna";

export type QuienDefineVencimiento = "cliente" | "sistema" | "area_interna";

export interface IFutureAction extends Document {
  tenantId: Types.ObjectId;
  orderId: Types.ObjectId;
  requiereAccionFutura: boolean;
  tipoAccionFutura: TipoAccionFutura;
  descripcionAccion: string;
  responsableAccion: ResponsableAccion;
  documentoRequerido?: string;
  plazoDias?: number;
  fechaLimite?: Date;
  fechaCreacionAccion: Date;
  fechaCumplimiento?: Date;
  estadoAccion: EstadoAccion;
  quienDefineVencimiento?: QuienDefineVencimiento;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const futureActionSchema = new Schema<IFutureAction>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    requiereAccionFutura: {
      type: Boolean,
      required: true,
      default: true,
    },
    tipoAccionFutura: {
      type: String,
      enum: [
        "plazoDias",
        "fechaEspecifica",
        "presentacionDocumento",
        "sinVencimiento",
      ],
      required: true,
      index: true,
    },
    descripcionAccion: {
      type: String,
      required: true,
      trim: true,
    },
    responsableAccion: {
      type: String,
      enum: ["usuario", "cliente", "area_interna"],
      required: true,
      index: true,
    },
    documentoRequerido: {
      type: String,
      trim: true,
    },
    plazoDias: {
      type: Number,
      min: 0,
    },
    fechaLimite: {
      type: Date,
      index: true,
    },
    fechaCreacionAccion: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    fechaCumplimiento: {
      type: Date,
    },
    estadoAccion: {
      type: String,
      enum: ["pendiente", "cumplida", "vencida", "en_revision"],
      default: "pendiente",
      required: true,
      index: true,
    },
    quienDefineVencimiento: {
      type: String,
      enum: ["cliente", "sistema", "area_interna"],
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

futureActionSchema.index({ tenantId: 1, estadoAccion: 1 });
futureActionSchema.index({ tenantId: 1, orderId: 1 });
futureActionSchema.index({ tenantId: 1, fechaLimite: 1 });
futureActionSchema.index({ tenantId: 1, responsableAccion: 1, estadoAccion: 1 });
futureActionSchema.index({ estadoAccion: 1, fechaLimite: 1 });

futureActionSchema.pre("save", function (next) {
  if (this.tipoAccionFutura === "plazoDias" && this.plazoDias && !this.fechaLimite) {
    const creationDate = this.fechaCreacionAccion || new Date();
    this.fechaLimite = new Date(creationDate.getTime() + this.plazoDias * 24 * 60 * 60 * 1000);
  }

  next();
});

export const FutureAction = mongoose.model<IFutureAction>("FutureAction", futureActionSchema);
