import { Asset } from "./assets.model.js";
import { createStorageProvider } from "../../config/storage.js";
import { assetsQueue } from "../../config/queue.js";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

const storage = createStorageProvider();

export class AssetsService {
  static async generateUploadUrl(data: {
    tenantId: string;
    ownerId: string;
    filename: string;
    mimeType: string;
    bytes: number;
    tags?: string[];
    linkedEntity?: { type: string; id: string };
  }) {
    const assetId = uuidv4();
    const ext = data.filename.split('.').pop() || '';
    const kind = this.getKindFromMimeType(data.mimeType);
    
    // Generate storage path
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const path = `assets/originals/${data.tenantId}/${year}/${month}/${assetId}.${ext}`;

    // Create asset record
    const asset = new Asset({
      _id: assetId,
      tenantId: data.tenantId,
      ownerId: data.ownerId,
      kind,
      filename: data.filename,
      mimeType: data.mimeType,
      bytes: data.bytes,
      path,
      tags: data.tags || [],
      linkedEntity: data.linkedEntity,
      status: "uploaded"
    });

    await asset.save();

    // Generate upload URL
    const uploadUrl = await storage.getUploadUrl(path, data.mimeType);

    return {
      assetId,
      uploadUrl,
      path,
      bucket: process.env.S3_BUCKET || 'local'
    };
  }

  static async completeUpload(assetId: string, tenantId: string) {
    const asset = await Asset.findOne({ _id: assetId, tenantId });
    if (!asset) {
      throw new Error("Asset not found");
    }

    // Generate checksum if needed
    // asset.checksum = await this.generateChecksum(asset.path);

    asset.status = "processing";
    await asset.save();

    // Queue for variant generation
    await assetsQueue.add("derive", {
      assetId,
      tenantId,
      kind: asset.kind,
      originalPath: asset.path,
      mimeType: asset.mimeType
    });

    return asset;
  }

  static async getAsset(assetId: string, tenantId: string) {
    return Asset.findOne({ _id: assetId, tenantId });
  }

  static async getAssetUrl(assetId: string, tenantId: string, variant?: string) {
    const asset = await Asset.findOne({ _id: assetId, tenantId });
    if (!asset) {
      throw new Error("Asset not found");
    }

    let path = asset.path;
    if (variant && asset.variants) {
      const variantObj = asset.variants.find(v => v.name === variant);
      if (variantObj) {
        path = variantObj.path;
      }
    }

    return storage.getDownloadUrl(path);
  }

  static async listAssets(filters: {
    tenantId: string;
    kind?: string;
    tags?: string[];
    page?: number;
    limit?: number;
  }) {
    const query: any = { tenantId: filters.tenantId };
    
    if (filters.kind) {
      query.kind = filters.kind;
    }
    
    if (filters.tags && filters.tags.length > 0) {
      query.tags = { $in: filters.tags };
    }

    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const [assets, total] = await Promise.all([
      Asset.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Asset.countDocuments(query)
    ]);

    return {
      assets,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  static async deleteAsset(assetId: string, tenantId: string) {
    const asset = await Asset.findOne({ _id: assetId, tenantId });
    if (!asset) {
      throw new Error("Asset not found");
    }

    // Delete from storage
    await storage.deleteFile(asset.path);
    
    // Delete variants
    if (asset.variants) {
      for (const variant of asset.variants) {
        await storage.deleteFile(variant.path);
      }
    }

    // Delete from database
    await Asset.deleteOne({ _id: assetId, tenantId });
  }

  private static getKindFromMimeType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('document') || mimeType.includes('text')) return 'doc';
    return 'other';
  }

  private static async generateChecksum(path: string): Promise<string> {
    // Implementation depends on storage provider
    return crypto.randomBytes(16).toString('hex');
  }
}