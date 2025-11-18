import { Schema, model } from "mongoose";

const RagDocSchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  source: { type: String, enum: ["upload", "brief", "guideline", "email", "post"], default: "upload" },
  title: String,
  assetId: String,
  language: { type: String, default: "es" },
  labels: [String],
  status: { type: String, enum: ["processing", "ready", "failed"], default: "processing" },
  chunkCount: { type: Number, default: 0 },
  meta: {
    clientId: String,
    campaignId: String,
    tags: [String]
  }
}, { timestamps: true });

const RagChunkSchema = new Schema({
  tenantId: { type: String, index: true, required: true },
  docId: { type: Schema.Types.ObjectId, ref: "rag_documents", index: true },
  order: Number,
  text: String,
  tokens: Number,
  embedding: { type: [Number] }, // Will be indexed externally in Atlas
  meta: {
    clientId: String,
    campaignId: String,
    tags: [String]
  }
}, { timestamps: true });

// Indexes for efficient querying
RagDocSchema.index({ tenantId: 1, source: 1 });
RagDocSchema.index({ tenantId: 1, labels: 1 });
RagDocSchema.index({ tenantId: 1, status: 1 });

RagChunkSchema.index({ tenantId: 1, docId: 1 });
RagChunkSchema.index({ tenantId: 1, "meta.clientId": 1 });
RagChunkSchema.index({ tenantId: 1, "meta.campaignId": 1 });

export const RagDocument = model("rag_documents", RagDocSchema);
export const RagChunk = model("rag_chunks", RagChunkSchema);