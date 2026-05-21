import mongoose, { Schema } from "mongoose";
const ProjectPdfConfigSchema = new Schema({
    tenantId: {
        type: Schema.Types.ObjectId,
        ref: "Tenant",
        required: true,
        index: true,
    },
    name: { type: String, required: true, trim: true },
    razonSocial: { type: String, trim: true },
    cuit: { type: String, trim: true },
    ciudad: { type: String, trim: true },
    direccion: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    signatureUrl: { type: String, trim: true },
    signerName: { type: String, trim: true },
    signerRole: { type: String, trim: true },
    projects: [{ type: Schema.Types.ObjectId, ref: "Project" }],
}, {
    timestamps: true,
    collection: "project_pdf_configs",
});
// Optional: ensure unique name per tenant
ProjectPdfConfigSchema.index({ tenantId: 1, name: 1 }, { unique: true });
export const ProjectPdfConfig = mongoose.model("ProjectPdfConfig", ProjectPdfConfigSchema);
