import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPdfTemplate extends Document {
  tenantId: Types.ObjectId;
  code: "dinero" | "fechaRango" | "fechaUnica";
  name: string;
  content: string;
  variablesHint?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pdfTemplateSchema = new Schema<IPdfTemplate>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    code: {
      type: String,
      required: true,
      enum: ["dinero", "fechaRango", "fechaUnica"],
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
  { timestamps: true }
);

pdfTemplateSchema.index({ tenantId: 1, code: 1 }, { unique: true });
pdfTemplateSchema.index({ tenantId: 1, isActive: 1 });

export const PdfTemplate = mongoose.model<IPdfTemplate>("PdfTemplate", pdfTemplateSchema);
