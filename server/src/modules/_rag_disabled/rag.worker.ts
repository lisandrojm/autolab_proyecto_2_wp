import { Worker, Job } from "bullmq";
import { redis, RagIngestJob } from "../../config/queue.js";
import { RagDocument, RagChunk } from "./rag.models.js";
import { Asset } from "../assets/assets.model.js";
import { createVectorProvider } from "../../config/vector.js";
import { createStorageProvider, LocalStorageProvider } from "../../config/storage.js";
import { env } from "../../config/env.js";
import fs from "fs/promises";
import OpenAI from "openai";

const vectorProvider = createVectorProvider();
const storage = createStorageProvider();
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

function toPosix(p: string) {
  return p.replace(/\\/g, "/");
}

export const ragWorker = new Worker(
  "rag-ingest",
  async (job: Job<RagIngestJob>) => {
    if (!env.FEATURE_RAG) {
      console.log("[rag-ingest] FEATURE_RAG=false → skip");
      return;
    }
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const { docId, tenantId, assetId, text, title, language, labels, meta } = job.data;

    try {
      console.log(`[rag-ingest] Processing doc ${docId}`);

      const document = await RagDocument.findOne({ _id: docId, tenantId });
      if (!document) throw new Error("Document not found");

      let extractedText = text || "";

      if (assetId && !text) {
        extractedText = await extractTextFromAsset(assetId, tenantId);
      }
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text content to process");
      }

      const normalizedText = normalizeText(extractedText);
      const chunks = chunkText(normalizedText, 600, 100);

      // Embeddings + persist + upsert vector
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await generateEmbedding(chunk.text);

        const ragChunk = new RagChunk({
          tenantId,
          docId,
          order: i,
          text: chunk.text,
          tokens: chunk.tokens,
          embedding,
          meta: meta || {},
        });
        await ragChunk.save();

        await vectorProvider.upsert([
          {
            id: ragChunk._id.toString(),
            text: chunk.text,
            embedding,
            metadata: { tenantId, docId, order: i, ...(meta || {}) },
          },
        ]);
      }

      document.status = "ready";
      (document as any).chunkCount = chunks.length;
      await document.save();

      console.log(`[rag-ingest] OK doc ${docId} (${chunks.length} chunks)`);
    } catch (err) {
      console.error(`[rag-ingest] FAIL doc ${docId}:`, err);
      await RagDocument.updateOne({ _id: docId, tenantId }, { status: "failed" });
      throw err;
    }
  },
  {
    connection: redis,
    concurrency: 1,
  }
);

async function extractTextFromAsset(assetId: string, tenantId: string): Promise<string> {
  const asset = await Asset.findOne({ _id: assetId, tenantId });
  if (!asset) throw new Error("Asset not found");

  let buffer: Buffer;
  if (env.STORAGE_PROVIDER === "local") {
    const localStorage = storage as LocalStorageProvider;
    const filePath = localStorage.getFilePath(toPosix(asset.path));
    buffer = await fs.readFile(filePath);
  } else {
    throw new Error("Cloud storage text extraction not implemented yet");
  }

  const mime = asset.mimeType || "";
  const kind = (asset as any).kind || "";

  if (kind === "pdf" || mime === "application/pdf") {
    const mod = await import("pdf-parse");
    const pdf = (mod as any).default ?? mod;
    const data = await pdf(buffer);
    return data.text || "";
  }

  if (mime.startsWith("text/") || kind === "doc" || kind === "other") {
    return buffer.toString("utf-8");
  }

  throw new Error(`Unsupported file type for text extraction: ${mime || kind}`);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\n+/g, "\n").trim();
}

interface TextChunk {
  text: string;
  tokens: number;
}

function chunkText(text: string, maxTokens: number, overlap: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  let currentChunk = "";
  let currentTokens = 0;

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (!s) continue;

    const sentenceTokens = estimateTokens(s);
    if (currentTokens + sentenceTokens > maxTokens && currentChunk) {
      chunks.push({ text: currentChunk.trim(), tokens: currentTokens });

      const overlapText = getLastSentences(currentChunk, overlap);
      currentChunk = (overlapText + " " + s).trim();
      currentTokens = estimateTokens(currentChunk);
    } else {
      currentChunk = (currentChunk + " " + s).trim();
      currentTokens += sentenceTokens;
    }
  }

  if (currentChunk) {
    chunks.push({ text: currentChunk.trim(), tokens: currentTokens });
  }

  return chunks;
}

function estimateTokens(t: string): number {
  return Math.ceil(t.length / 4);
}

function getLastSentences(t: string, maxTokens: number): string {
  const sentences = t.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  let result = "";
  let tokens = 0;
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i].trim();
    const st = estimateTokens(s);
    if (tokens + st > maxTokens) break;
    result = (s + ". " + result).trim();
    tokens += st;
  }
  return result.trim();
}

async function generateEmbedding(text: string): Promise<number[]> {
  if (!env.OPENAI_API_KEY) throw new Error("OpenAI API key not configured");
  const response = await openai.embeddings.create({
    model: env.EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding as unknown as number[];
}

console.log("RAG worker started");
