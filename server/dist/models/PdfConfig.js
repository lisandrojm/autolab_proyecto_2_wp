import mongoose, { Schema } from "mongoose";
const PdfConfigSchema = new Schema({
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
    direccion: { type: String, trim: true },
    logoUrl: { type: String, trim: true },
    signatureUrl: { type: String, trim: true },
    signerName: { type: String, trim: true },
    signerRole: { type: String, trim: true },
}, {
    timestamps: true,
    collection: "pdf_configs",
});
PdfConfigSchema.statics.getOrCreateDefault = async function (tenantId) {
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
export const PdfConfig = mongoose.model("PdfConfig", PdfConfigSchema);
