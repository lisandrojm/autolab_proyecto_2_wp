import { Request, Response } from "express";
import { z } from "zod";
import { RagService } from "./rag.service.js";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import { TenantRequest } from "../../middleware/tenant.js";

const ingestSchema = z.object({
  assetId: z.string().uuid().optional(),
  text: z.string().optional(),
  title: z.string().min(1),
  labels: z.array(z.string()).optional(),
  language: z.string().default("es"),
  meta: z.object({
    clientId: z.string().optional(),
    campaignId: z.string().optional(),
    tags: z.array(z.string()).optional()
  }).optional()
}).refine(data => data.assetId || data.text, {
  message: "Either assetId or text must be provided"
});

const querySchema = z.object({
  query: z.string().min(1),
  topK: z.number().min(1).max(50).default(10),
  filters: z.object({
    clientId: z.string().optional(),
    campaignId: z.string().optional(),
    labels: z.array(z.string()).optional(),
    language: z.string().optional()
  }).optional()
});

const listDocsSchema = z.object({
  source: z.enum(["upload", "brief", "guideline", "email", "post"]).optional(),
  labels: z.array(z.string()).optional(),
  status: z.enum(["processing", "ready", "failed"]).optional(),
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional()
});

export class RagController {
  static async ingestDocument(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const data = ingestSchema.parse(req.body);
      
      const document = await RagService.ingestDocument({
        ...data,
        tenantId: req.tenantObjectId!
      });

      res.status(201).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
        return;
      }
      console.error("RAG ingest error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async queryDocuments(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const params = querySchema.parse(req.body);
      
      const results = await RagService.queryDocuments({
        ...params,
        tenantId: req.tenantObjectId!
      });

      res.json(results);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
        return;
      }
      console.error("RAG query error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async listDocuments(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const filters = listDocsSchema.parse(req.query);
      
      const result = await RagService.listDocuments({
        ...filters,
        tenantId: req.tenantObjectId!
      });

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
        return;
      }
      console.error("List RAG documents error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async reindexDocument(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const { docId } = req.params;
      
      const document = await RagService.reindexDocument(docId, req.tenantObjectId!);
      
      res.json(document);
    } catch (error) {
      console.error("RAG reindex error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteDocument(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const { docId } = req.params;
      
      await RagService.deleteDocument(docId, req.tenantObjectId!);
      
      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      console.error("RAG delete error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}