import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRelease extends Document {
  tenantId: Types.ObjectId;
  name: string;
  version: string;
  description?: string;
  /** Contenido del release redactado en la plataforma (HTML del editor, con variables `{{variable}}`). */
  content: string;
  isActive: boolean;
  /** Si el release lleva membrete (logo + encabezado de empresa) y firma al generar el PDF. */
  usaMembrete: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const releaseSchema = new Schema<IRelease>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 150,
    },
    version: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    description: {
      type: String,
      trim: true,
      default: "",
      maxlength: 2000,
    },
    content: {
      type: String,
      default: "",
      maxlength: 200000,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    usaMembrete: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, collection: "release" },
);

releaseSchema.index({ tenantId: 1, isActive: 1 });

export const Release = mongoose.model<IRelease>("Release", releaseSchema);
