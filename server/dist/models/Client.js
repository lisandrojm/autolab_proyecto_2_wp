import mongoose, { Schema } from "mongoose";
const clientSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    slug: { type: String, index: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User" },
    // External ID for syncing
    externalId: { type: String, index: true },
    cuit: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    company: { type: String, trim: true },
    industry: { type: String, trim: true },
    website: { type: String, trim: true },
    attachments: [
        {
            url: { type: String, required: true },
            name: { type: String, maxlength: 100 },
            fileName: String,
            fileType: String,
            uploadedAt: { type: Date, default: Date.now },
            size: Number,
        },
    ],
    contacts: [
        {
            name: String,
            email: String,
            phone: String,
            role: String,
        },
    ],
    proyectos: [{ type: Schema.Types.ObjectId, ref: "Project", index: true }],
    brief: {
        objectives: [String],
        targetAudience: String,
        budget: Number,
        timeline: String,
        preferences: String,
    },
    costCenters: [
        {
            name: String,
            code: String,
            description: String,
            budget: {
                total: Number,
                allocated: { type: Number, default: 0 },
                spent: { type: Number, default: 0 },
                currency: { type: String, default: "EUR" },
            },
            isActive: { type: Boolean, default: true },
        },
    ],
    status: { type: String, enum: ["active", "inactive", "onboarding"], default: "onboarding", index: true },
    createdBy: { type: String }, // opcional por seed
    assignedUsers: [{ type: Schema.Types.ObjectId, ref: "User", index: true }],
    usuarios: [
        {
            userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
            permiso: { type: String, enum: ["ver", "editar"], default: "ver" },
        },
    ],
    favorite: { type: Boolean, default: false, index: true },
    brandKit: {
        logos: [
            {
                url: String,
                name: String,
                fileName: String,
                uploadedAt: { type: Date, default: Date.now },
                size: Number,
            },
        ],
        documents: [
            {
                url: String,
                name: String,
                fileName: String,
                fileType: String,
                uploadedAt: { type: Date, default: Date.now },
                size: Number,
            },
        ],
        colors: [String],
        fonts: [String],
        guidelines: String,
    },
}, { timestamps: true });
// único por tenant + email
clientSchema.index({ tenantId: 1, email: 1 }, { unique: true });
clientSchema.index({ tenantId: 1, slug: 1 });
export const Client = mongoose.model("Client", clientSchema);
