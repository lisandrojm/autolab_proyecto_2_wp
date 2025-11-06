import { Request, Response } from "express";
import { z } from "zod";
import { AssetsService } from "./assets.service.js";
import { AuthenticatedRequest } from "../../middleware/auth.js";
import { TenantRequest } from "../../middleware/tenant.js";

const uploadUrlSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  bytes: z.number().min(1),
  tags: z.array(z.string()).optional(),
  linkedEntity: z.object({
    type: z.string(),
    id: z.string()
  }).optional()
});

const completeUploadSchema = z.object({
  assetId: z.string().uuid()
});

const listAssetsSchema = z.object({
  kind: z.enum(["image", "video", "audio", "pdf", "doc", "other"]).optional(),
  tags: z.array(z.string()).optional(),
  page: z.string().transform(Number).optional(),
  limit: z.string().transform(Number).optional()
});

export class AssetsController {
  static async generateUploadUrl(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const data = uploadUrlSchema.parse(req.body);
      
      const result = await AssetsService.generateUploadUrl({
        ...data,
        tenantId: req.tenantObjectId!,
        ownerId: req.user!.userId
      });

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
        return;
      }
      console.error("Generate upload URL error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async completeUpload(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const { assetId } = completeUploadSchema.parse(req.body);
      
      const asset = await AssetsService.completeUpload(assetId, req.tenantObjectId!);
      
      res.json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
        return;
      }
      console.error("Complete upload error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getAsset(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const asset = await AssetsService.getAsset(id, req.tenantObjectId!);
      
      if (!asset) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }

      res.json(asset);
    } catch (error) {
      console.error("Get asset error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getAssetUrl(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const { id } = req.params;
      const { variant } = req.query;
      
      const url = await AssetsService.getAssetUrl(id, req.tenantObjectId!, variant as string);
      
      res.json({ url });
    } catch (error) {
      console.error("Get asset URL error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async listAssets(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const filters = listAssetsSchema.parse(req.query);
      
      const result = await AssetsService.listAssets({
        ...filters,
        tenantId: req.tenantObjectId!
      });

      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
        return;
      }
      console.error("List assets error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async deleteAsset(req: AuthenticatedRequest & TenantRequest, res: Response) {
    try {
      const { id } = req.params;
      
      await AssetsService.deleteAsset(id, req.tenantObjectId!);
      
      res.json({ message: "Asset deleted successfully" });
    } catch (error) {
      console.error("Delete asset error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}