import { RagDocument, RagChunk } from "./rag.models.js";
import { Asset } from "../assets/assets.model.js";
import { createVectorProvider } from "../../config/vector.js";
import { ragQueue } from "../../config/queue.js";
import { v4 as uuidv4 } from "uuid";
import { env } from "../../config/env.js";

let vectorProvider: any = null;

function getVectorProvider() {
  if (!vectorProvider) {
    vectorProvider = createVectorProvider();
  }
  return vectorProvider;
}

export class RagService {
  static async ingestDocument(data: {
    tenantId: string;
    assetId?: string;
    text?: string;
    title: string;
    labels?: string[];
    language?: string;
    meta?: {
      clientId?: string;
      campaignId?: string;
      tags?: string[];
    };
  }) {
    // Validate input
    if (!data.assetId && !data.text) {
      throw new Error("Either assetId or text must be provided");
    }

    // If assetId provided, verify asset exists and is accessible
    if (data.assetId) {
      const asset = await Asset.findOne({ _id: data.assetId, tenantId: data.tenantId });
      if (!asset) {
        throw new Error("Asset not found");
      }
      
      // Check if asset is suitable for RAG (PDF, doc, text)
      if (!["pdf", "doc", "other"].includes(asset.kind)) {
        throw new Error("Asset type not suitable for RAG ingestion");
      }
    }

    // Create RAG document
    const ragDoc = new RagDocument({
      tenantId: data.tenantId,
      source: data.assetId ? "upload" : "brief",
      title: data.title,
      assetId: data.assetId,
      language: data.language || "es",
      labels: data.labels || [],
      status: "processing",
      meta: data.meta || {}
    });

    await ragDoc.save();

    // Queue for processing
    await ragQueue.add("ingest", {
      docId: ragDoc._id.toString(),
      tenantId: data.tenantId,
      assetId: data.assetId,
      text: data.text,
      title: data.title,
      language: data.language || "es",
      labels: data.labels || [],
      meta: data.meta || {}
    });

    return ragDoc;
  }

  static async queryDocuments(params: {
    tenantId: string;
    query: string;
    topK?: number;
    filters?: {
      clientId?: string;
      campaignId?: string;
      labels?: string[];
      language?: string;
    };
  }) {
    const { tenantId, query, topK = 10, filters = {} } = params;

    if (!env.OPENAI_API_KEY) {
      console.warn("RAG query attempted but OpenAI API key not configured");
      return {
        vector: [],
        text: [],
        hybrid: []
      };
    }

    // Build vector search filters
    const vectorFilters: any = { tenantId };
    
    if (filters.clientId) {
      vectorFilters["meta.clientId"] = filters.clientId;
    }
    
    if (filters.campaignId) {
      vectorFilters["meta.campaignId"] = filters.campaignId;
    }
    
    if (filters.labels && filters.labels.length > 0) {
      vectorFilters["meta.tags"] = { $in: filters.labels };
    }

    try {
      // Perform vector search
      const vectorResults = await getVectorProvider().search(query, topK, vectorFilters);

      // Enhance results with document metadata
      const chunkIds = vectorResults.map(r => r.id);
      const chunks = await RagChunk.find({ _id: { $in: chunkIds } })
        .populate('docId')
        .lean();

      const enhancedResults = vectorResults.map(result => {
        const chunk = chunks.find(c => c._id.toString() === result.id);
        return {
          ...result,
          document: chunk ? {
            id: chunk.docId._id,
            title: chunk.docId.title,
            source: chunk.docId.source,
            labels: chunk.docId.labels
          } : null,
          chunk: chunk ? {
            order: chunk.order,
            tokens: chunk.tokens
          } : null
        };
      });

      // Also perform text search for hybrid results
      const textResults = await this.performTextSearch(tenantId, query, filters, topK);

      return {
        vector: enhancedResults,
        text: textResults,
        hybrid: this.combineResults(enhancedResults, textResults, topK)
      };
    } catch (error) {
      console.error("RAG query error:", error);
      throw new Error("Failed to query documents");
    }
  }

  static async listDocuments(filters: {
    tenantId: string;
    source?: string;
    labels?: string[];
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const query: any = { tenantId: filters.tenantId };
    
    if (filters.source) {
      query.source = filters.source;
    }
    
    if (filters.labels && filters.labels.length > 0) {
      query.labels = { $in: filters.labels };
    }
    
    if (filters.status) {
      query.status = filters.status;
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [documents, total] = await Promise.all([
      RagDocument.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RagDocument.countDocuments(query)
    ]);

    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async reindexDocument(docId: string, tenantId: string) {
    const doc = await RagDocument.findOne({ _id: docId, tenantId });
    if (!doc) {
      throw new Error("Document not found");
    }

    // Delete existing chunks
    await RagChunk.deleteMany({ docId, tenantId });
    await vectorProvider.deleteByDocId(docId);

    // Reset document status
    doc.status = "processing";
    doc.chunkCount = 0;
    await doc.save();

    // Re-queue for processing
    await ragQueue.add("ingest", {
      docId: docId,
      tenantId: tenantId,
      assetId: doc.assetId,
      title: doc.title,
      language: doc.language,
      labels: doc.labels,
      meta: doc.meta
    });

    return doc;
  }

  static async deleteDocument(docId: string, tenantId: string) {
    const doc = await RagDocument.findOne({ _id: docId, tenantId });
    if (!doc) {
      throw new Error("Document not found");
    }

    // Delete chunks from vector store
    if (env.OPENAI_API_KEY) {
      await getVectorProvider().deleteByDocId(docId);
    }

    // Delete chunks from database
    await RagChunk.deleteMany({ docId, tenantId });

    // Delete document
    await RagDocument.deleteOne({ _id: docId, tenantId });
  }

  private static async performTextSearch(tenantId: string, query: string, filters: any, limit: number) {
    // Simple text search using MongoDB text index
    const searchQuery: any = {
      tenantId,
      $text: { $search: query }
    };

    if (filters.clientId) {
      searchQuery["meta.clientId"] = filters.clientId;
    }

    if (filters.campaignId) {
      searchQuery["meta.campaignId"] = filters.campaignId;
    }

    try {
      const results = await RagChunk.find(searchQuery)
        .select({ score: { $meta: "textScore" }, text: 1, meta: 1, docId: 1 })
        .sort({ score: { $meta: "textScore" } })
        .limit(limit)
        .populate('docId')
        .lean();

      return results.map(result => ({
        id: result._id.toString(),
        score: result.score || 0,
        text: result.text,
        metadata: result.meta,
        document: {
          id: result.docId._id,
          title: result.docId.title,
          source: result.docId.source,
          labels: result.docId.labels
        }
      }));
    } catch (error) {
      console.error("Text search error:", error);
      return [];
    }
  }

  private static combineResults(vectorResults: any[], textResults: any[], limit: number) {
    // Simple hybrid scoring: combine vector and text results
    const combined = new Map();

    // Add vector results with weight
    vectorResults.forEach(result => {
      combined.set(result.id, {
        ...result,
        hybridScore: result.score * 0.7 // Vector weight
      });
    });

    // Add text results with weight, or boost existing
    textResults.forEach(result => {
      const existing = combined.get(result.id);
      if (existing) {
        existing.hybridScore += result.score * 0.3; // Text weight
      } else {
        combined.set(result.id, {
          ...result,
          hybridScore: result.score * 0.3
        });
      }
    });

    // Sort by hybrid score and return top results
    return Array.from(combined.values())
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, limit);
  }
}