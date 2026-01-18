import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPdfConfig extends Document {
  tenantId: mongoose.Types.ObjectId;
  razonSocial?: string;
  cuit?: string;
  ciudad?: string;
  logoUrl?: string; // stored relative path or full URL
  signatureUrl?: string; // stored relative path or full URL
  createdAt: Date;
  updatedAt: Date;
}

interface IPdfConfigModel extends Model<IPdfConfig> {
  getOrCreateDefault(tenantId: mongoose.Types.ObjectId): Promise<IPdfConfig>;
}

const PdfConfigSchema = new Schema<IPdfConfig>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
      index: true,
    },
    razonSocial: { type: String, trim: true },
    cuit: { type: String, trim: true },
    ciudad: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    signatureUrl: { type: String, trim: true },
  },
  {
    timestamps: true,
    collection: "pdf_config",
  },
);

PdfConfigSchema.statics.getOrCreateDefault = async function (tenantId: mongoose.Types.ObjectId) {
  let config = await this.findOne({ tenantId });

  if (!config) {
    config = await this.create({
      tenantId,
      razonSocial: "",
      cuit: "",
      ciudad: "",
    });
  }

  return config;
};

export const PdfConfig = mongoose.model<IPdfConfig, IPdfConfigModel>("PdfConfig", PdfConfigSchema);
