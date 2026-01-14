import mongoose, { Schema, Document } from "mongoose";

export interface IAsset extends Document {
  tenantId: string;
  clientId: string;
  projectId?: string;
  nombre: string;
  tipo: "imagen" | "video" | "audio" | "documento" | "otro";
  url: string;
  scope?: "brandkit" | "assets";
  creadoPor: string;
  tags: string[];
  permisos: {
    editores: string[];
    visores: string[];
  };
  metadata?: {
    name?: string;
    title?: string;
    description?: string;
    category?: string;
    notes?: string;
  };
  createdAt: Date;
  updatedAt: Date;

  // Campos para tracking de uso

  lastUsedAt?: Date;
  isAiGenerated?: boolean;

  // Campos para versionado
  parentId?: mongoose.Types.ObjectId;
  regeneration?: number;
  revisions: mongoose.Types.ObjectId[];
}

const AssetSchema = new Schema<IAsset>(
  {
    tenantId: { type: String, required: true },
    clientId: { type: String, required: true, index: true },
    projectId: { type: String, index: true },
    nombre: { type: String, required: true },
    tipo: { type: String, enum: ["imagen", "video", "audio", "documento", "otro"], required: true },
    url: { type: String, required: true },
    scope: { type: String, enum: ["brandkit", "assets"], index: true },
    creadoPor: { type: String, required: true, index: true },
    tags: [{ type: String, index: true }],
    permisos: {
      editores: [{ type: String }],
      visores: [{ type: String }],
    },
    metadata: {
      name: { type: String, maxlength: 255 },
      title: { type: String, maxlength: 255 },
      description: { type: String, maxlength: 1000 },
      category: { type: String, maxlength: 100 },
      notes: { type: String, maxlength: 2000 },
    },

    // Campos para tracking de uso
    lastUsedAt: { type: Date },
    isAiGenerated: { type: Boolean, default: false },

    // Campos para versionado
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Asset" },
    regeneration: { type: Number, default: 0 },
    revisions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Asset" }],
  },
  { timestamps: true }
);

// Índices compuestos para búsquedas optimizadas
AssetSchema.index({ tenantId: 1, clientId: 1 });
AssetSchema.index({ tenantId: 1, clientId: 1, scope: 1 });
AssetSchema.index({ tenantId: 1, projectId: 1 });
AssetSchema.index({ tenantId: 1, creadoPor: 1 });
AssetSchema.index({ tenantId: 1, tags: 1 });
AssetSchema.index({ tenantId: 1, "metadata.name": 1 });
AssetSchema.index({ tenantId: 1, scope: 1 });
AssetSchema.index({ tenantId: 1, clientId: 1, createdAt: -1 });

AssetSchema.index({ lastUsedAt: -1 });

export const Asset = mongoose.model<IAsset>("Asset", AssetSchema);
