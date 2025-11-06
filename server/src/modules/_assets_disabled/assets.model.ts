import { Schema, model } from "mongoose";

const VariantSchema = new Schema({
  name: { type: String, required: true },   // thumb|web|720p
  path: { type: String, required: true },
  mimeType: String,
  bytes: Number
}, { _id: false });

const AssetSchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  ownerId: { type: String, index: true },
  kind: { type: String, enum: ["image", "video", "audio", "pdf", "doc", "other"], required: true },
  filename: String,
  mimeType: String,
  bytes: Number,
  bucket: String,
  path: { type: String, index: true },
  variants: [VariantSchema],
  tags: [String],
  linkedEntity: { type: { type: String }, id: String },
  checksum: { type: String, index: true },
  status: { type: String, enum: ["uploaded", "processing", "ready", "failed"], default: "uploaded" }
}, { timestamps: true });

AssetSchema.index({ tenantId: 1, kind: 1 });
AssetSchema.index({ tenantId: 1, tags: 1 });
AssetSchema.index({ tenantId: 1, status: 1 });

export const Asset = model("assets", AssetSchema);