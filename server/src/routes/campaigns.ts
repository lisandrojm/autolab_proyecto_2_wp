import { Router } from "express";
import { z } from "zod";
import { Campaign } from "../models/Campaign.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyRole } from "../middleware/requireAnyRole.js";

const router = Router();

const createCampaignSchema = z.object({
  clientId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  objectives: z.array(z.string()).default([]),
  targetAudience: z.string().min(1),
  status: z.enum(["draft", "active", "paused", "completed", "cancelled"]).default("draft"),
  budget: z.object({
    total: z.number().min(0).default(0),
    allocated: z.number().min(0).default(0),
    spent: z.number().min(0).default(0),
  }),
  timeline: z.object({
    startDate: z.string().transform((str) => new Date(str)),
    endDate: z.string().transform((str) => new Date(str)),
  }),
  platforms: z.array(z.enum(["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube", "google-ads"])).default([]),
  kpis: z
    .array(
      z.object({
        name: z.string(),
        target: z.number(),
        current: z.number().default(0),
        unit: z.string(),
      })
    )
    .default([]),
});

// GET /campaigns/count
router.get("/count", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { clientId } = req.query as { clientId?: string };

    const filter: any = { tenantId: req.tenantObjectId };
    if (clientId) filter.clientId = clientId;

    // ❌ sin gating por nombres de rol/ownership
    const count = await Campaign.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count campaigns error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /campaigns
router.get("/", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { clientId, status, projectId } = req.query as {
      clientId?: string;
      status?: string;
      projectId?: string;
    };

    const filter: any = { tenantId: req.tenantObjectId };
    if (clientId) filter.clientId = clientId;
    if (status) filter.status = status;
    if (projectId) filter.projectId = projectId;

    // ❌ sin gating por nombres de rol/ownership
    const campaigns = await Campaign.find(filter).sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (error) {
    console.error("Get campaigns error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /campaigns
router.post("/", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createCampaignSchema.parse(req.body);

    if (!data.clientId && !data.projectId) {
      res.status(400).json({ error: "clientId or projectId is required" });
      return;
    }

    const campaign = new Campaign({
      ...data,
      tenantId: req.tenantObjectId,
      createdBy: req.user!.userId,
      usuarios: [
        {
          id: req.user!.userId,
          email: req.user!.email,
          permiso: "editar",
        },
      ],
      assignedUsers: [req.user!.userId],
      status: data.status || "draft",
    });

    await campaign.save();
    res.status(201).json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Campaign validation error:", error.errors);
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create campaign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /campaigns/:id
router.get("/:id", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    res.json(campaign);
  } catch (error) {
    console.error("Get campaign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /campaigns/:id
router.patch("/:id", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const updateData = createCampaignSchema.partial().parse(req.body);
    delete (updateData as any).createdBy;

    const campaign = await Campaign.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, updateData, { new: true, runValidators: true });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    res.json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update campaign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /campaigns/:id/favorite
router.patch("/:id/favorite", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);

    const campaign = await Campaign.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, { favorite }, { new: true });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    res.json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update campaign favorite error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /campaigns/:id
router.delete("/:id", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const campaign = await Campaign.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    res.json({ message: "Campaign deleted successfully" });
  } catch (error) {
    console.error("Delete campaign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /campaigns/:id/share
router.post("/:id/share", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id, email, permiso } = z
      .object({
        id: z.string().min(1),
        email: z.string().email(),
        permiso: z.enum(["ver", "editar"]),
      })
      .parse(req.body);

    const campaign = await Campaign.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    const existingIndex = campaign.usuarios.findIndex((u) => u.id === id);
    if (existingIndex >= 0) {
      campaign.usuarios[existingIndex] = { id, email, permiso };
    } else {
      campaign.usuarios.push({ id, email, permiso });
    }

    await campaign.save();
    res.json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Share campaign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /campaigns/:id/unshare
router.post("/:id/unshare", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.body);

    const campaign = await Campaign.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    // No permitir remover al creador
    if (id === campaign.createdBy) {
      res.status(400).json({ error: "No se puede remover al creador del documento" });
      return;
    }

    campaign.usuarios = campaign.usuarios.filter((u) => u.id !== id);
    await campaign.save();
    res.json(campaign);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Unshare campaign error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as campaignRoutes };
