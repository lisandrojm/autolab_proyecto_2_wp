import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPdf extends Document {
  tenantId: Types.ObjectId;
  code: "dinero" | "fechaRango" | "fechaUnica" | "fechasMultiples" | "vacaciones" | "objeto" | "otros";
  name: string;
  title?: string;
  content: string;
  variablesHint?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pdfSchema = new Schema<IPdf>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    code: {
      type: String,
      required: true,
      enum: ["dinero", "fechaRango", "fechaUnica", "fechasMultiples", "vacaciones", "objeto", "otros"],
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    content: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 50000,
    },
    variablesHint: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true, collection: "pdf" },
);

pdfSchema.index({ tenantId: 1, code: 1 }, { unique: true });
pdfSchema.index({ tenantId: 1, isActive: 1 });

export const Pdf = mongoose.model<IPdf>("Pdf", pdfSchema);
