import { Router } from "express";
import { z } from "zod";
import { Post } from "../models/Post.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyRole } from "../middleware/requireAnyRole.js";

const router = Router();

router.use(requireTenant, authenticateToken, requireAnyRole);

const createPostSchema = z
  .object({
    campaignId: z.string().min(1),
    clientId: z.string().min(1),
    title: z.string().optional().default(""),
    postType: z.enum(["social", "email", "push"]).default("social"),
    contentFormat: z.enum(["post", "reel", "story", "video", "short", "article", "thread"]).optional(),
    channelConfig: z.record(z.any()).optional(),
    content: z.object({
      copy: z.string().optional().default(""),
      hashtags: z.array(z.string()).default([]),
      mentions: z.array(z.string()).default([]),
    }),
    media: z
      .array(
        z.object({
          type: z.enum(["image", "video", "carousel"]),
          urls: z.array(z.string().url()),
          alt: z.string().optional(),
        })
      )
      .default([]),
    platforms: z.array(z.enum(["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube"])).default([]),
    scheduling: z
      .object({
        publishAt: z
          .union([z.string(), z.literal("")])
          .transform((str) => (str ? new Date(str) : undefined))
          .optional(),
        timezone: z.string().default("UTC"),
        isScheduled: z.boolean().default(false),
      })
      .optional(),
  })
  .refine(
    (data) => {
      // Para posts de tipo social, copy y title son requeridos
      if (data.postType === "social") {
        return data.content.copy.trim().length > 0 && data.title.trim().length > 0;
      }
      // Para email y push, copy es opcional (el contenido está en channelConfig)
      return true;
    },
    {
      message: "El título y contenido son obligatorios para publicaciones en redes sociales",
      path: ["content", "copy"],
    }
  );

// ✅ GET /posts/debug
router.get("/debug", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const posts = await Post.find({ tenantId: req.tenantObjectId }).limit(5).lean();
    res.json({
      count: posts.length,
      posts: posts.map((p) => ({
        id: p._id,
        title: p.title,
        campaignId: p.campaignId,
        clientId: p.clientId,
        hasScheduling: !!p.scheduling,
        schedulingData: p.scheduling,
      })),
    });
  } catch (error: any) {
    console.error("Debug error:", error);
    res.status(500).json({ error: error?.message });
  }
});

// ✅ GET /posts/count
router.get("/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { clientId } = req.query;
    const filter: any = { tenantId: req.tenantObjectId };
    if (clientId) filter.clientId = clientId;

    const count = await Post.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count posts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /posts/:id
router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const post = await Post.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    })
      .populate({
        path: "campaignId",
        select: "name projectId",
        populate: { path: "projectId", select: "name" },
      })
      .populate("clientId", "name");

    if (!post) return res.status(404).json({ error: "Post not found" });

    // Clean title in response (defensive measure for existing corrupted data)
    const postData = post.toObject();
    if (postData.title) {
      postData.title = postData.title.replace(/^Publicación\s*\|\s*/i, "");
    }

    res.json(postData);
  } catch (error) {
    console.error("Get post by id error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /posts
router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { campaignId, clientId, status } = req.query;
    const filter: any = { tenantId: req.tenantObjectId };
    if (campaignId) filter.campaignId = campaignId;
    if (clientId) filter.clientId = clientId;
    if (status) filter.status = status;

    const posts = await Post.find(filter)
      .populate({
        path: "campaignId",
        select: "name projectId",
        populate: { path: "projectId", select: "name" },
      })
      .populate("clientId", "name")
      .sort({ createdAt: -1 })
      .lean();

    // Clean titles in response (defensive measure for existing corrupted data)
    const cleanedPosts = posts.map((post) => ({
      ...post,
      title: post.title ? post.title.replace(/^Publicación\s*\|\s*/i, "") : post.title,
    }));

    res.json(cleanedPosts);
  } catch (error: any) {
    console.error("Get posts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ POST /posts
router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createPostSchema.parse(req.body);
    const selectedAssetIds = req.body.selectedAssetIds || [];
    const dynamicFields = req.body.dynamicFields || {};

    let postStatus: "draft" | "scheduled" | "published" = "draft";
    if (data.scheduling?.isScheduled && data.scheduling?.publishAt) {
      postStatus = "scheduled";
    } else if (!data.scheduling?.isScheduled && req.body.publishImmediately) {
      postStatus = "published";
    }

    // Generar título automático si no se proporciona para emails y push
    let finalTitle = data.title || "";

    // Clean title by removing any "Publicación |" prefix that may have been accidentally included
    finalTitle = finalTitle.replace(/^Publicación\s*\|\s*/i, "");

    if (!finalTitle.trim()) {
      if (data.postType === "email") {
        const emailConfig = data.channelConfig as any;
        finalTitle = emailConfig?.subject || "Email sin título";
      } else if (data.postType === "push") {
        const pushConfig = data.channelConfig as any;
        finalTitle = pushConfig?.title || "Notificación push sin título";
      } else if (data.postType === "social" && dynamicFields.title) {
        finalTitle = dynamicFields.title;
      } else {
        finalTitle = "Post sin título";
      }
    }

    const postData: any = {
      ...data,
      title: finalTitle,
      tenantId: req.tenantObjectId,
      createdBy: req.user!.userId,
      usuarios: [
        {
          id: req.user!.userId,
          email: req.user!.email,
          permiso: "editar",
        },
      ],
      usedAssets: selectedAssetIds,
      status: postStatus,
      analytics: { impressions: 0, engagement: 0, clicks: 0, shares: 0 },
    };

    if (data.postType === "social" && data.contentFormat) {
      postData.contentFormat = data.contentFormat;

      if (Object.keys(dynamicFields).length > 0) {
        postData.dynamicFields = dynamicFields;
      }
    }

    if (data.channelConfig) {
      postData.channelConfig = data.channelConfig;
    }

    const post = new Post(postData);

    await post.save();

    if (selectedAssetIds.length > 0) {
      const { Asset } = await import("../models/Asset.js");
      await Asset.updateMany({ _id: { $in: selectedAssetIds } }, { $addToSet: { usedInPosts: post._id }, $set: { lastUsedAt: new Date() } });
    }

    res.status(201).json(post);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Create post error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ PATCH /posts/:id
router.patch("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const updateSchema = z.object({
      title: z.string().min(1).optional(),
      postType: z.enum(["social", "email", "push"]).optional(),
      contentFormat: z.enum(["post", "reel", "story", "video", "short", "article", "thread"]).optional(),
      channelConfig: z.record(z.any()).optional(),
      content: z
        .object({
          copy: z.string().optional(),
          hashtags: z.array(z.string()).default([]),
          mentions: z.array(z.string()).default([]),
        })
        .optional(),
      media: z
        .array(
          z.object({
            type: z.enum(["image", "video", "carousel"]),
            urls: z.array(z.string().url()),
            alt: z.string().optional(),
          })
        )
        .optional(),
      platforms: z.array(z.enum(["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube"])).optional(),
      status: z.enum(["draft", "pending_approval", "approved", "rejected", "scheduled", "published"]).optional(),
      scheduling: z
        .object({
          publishAt: z
            .union([z.string(), z.literal("")])
            .transform((str) => (str ? new Date(str) : undefined))
            .optional(),
          timezone: z.string().default("UTC"),
          isScheduled: z.boolean().default(false),
        })
        .optional(),
    });

    const data = updateSchema.parse(req.body);
    const selectedAssetIds = req.body.selectedAssetIds || [];
    const dynamicFields = req.body.dynamicFields;

    const existingPost = await Post.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!existingPost) return res.status(404).json({ error: "Post not found" });

    // Clean title by removing any "Publicación |" prefix that may have been accidentally included
    if (data.title) {
      data.title = data.title.replace(/^Publicación\s*\|\s*/i, "");
    }

    const updateData: any = { ...data, usedAssets: selectedAssetIds };

    if (dynamicFields && Object.keys(dynamicFields).length > 0) {
      updateData.dynamicFields = dynamicFields;
    }

    const post = await Post.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, { $set: updateData }, { new: true })
      .populate({ path: "campaignId", select: "name projectId", populate: { path: "projectId", select: "name" } })
      .populate("clientId", "name");

    res.json(post);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Update post error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ DELETE /posts/:id
router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const post = await Post.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!post) return res.status(404).json({ error: "Post not found" });

    if (post.usedAssets?.length > 0) {
      const { Asset } = await import("../models/Asset.js");
      await Asset.updateMany({ _id: { $in: post.usedAssets } }, { $pull: { usedInPosts: post._id } });
    }

    res.json({ message: "Post eliminado exitosamente", deletedPost: post });
  } catch (error) {
    console.error("Delete post error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as postRoutes };
