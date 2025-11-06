import { Router } from "express";
import { z } from "zod";
import { Brief } from "../models/Brief.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyRole } from "../middleware/requireAnyRole.js";

const router = Router();

const createBriefSchema = z.object({
  clientId: z.string().min(1),
  campaignId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  objectives: z.array(z.string()).min(1),
  targetAudience: z
    .object({
      demographics: z
        .object({
          ageRange: z.string().optional(),
          gender: z.string().optional(),
          location: z.string().optional(),
          income: z.string().optional(),
        })
        .optional(),
      psychographics: z
        .object({
          interests: z.array(z.string()).default([]),
          behaviors: z.array(z.string()).default([]),
          values: z.array(z.string()).default([]),
        })
        .optional(),
      painPoints: z.array(z.string()).default([]),
    })
    .optional(),
  brandGuidelines: z
    .object({
      toneOfVoice: z.string().optional(),
      keyMessages: z.array(z.string()).default([]),
      dosDonts: z
        .object({
          dos: z.array(z.string()).default([]),
          donts: z.array(z.string()).default([]),
        })
        .optional(),
      visualStyle: z.string().optional(),
    })
    .optional(),
  deliverables: z
    .array(
      z.object({
        type: z.enum(["post", "campaign", "strategy", "content-calendar", "other"]),
        quantity: z.number().min(1),
        format: z.array(z.string()).default([]),
        platforms: z.array(z.enum(["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube", "website", "email"])).default([]),
        deadline: z.string().transform((str) => new Date(str)),
      })
    )
    .min(1),
  budget: z.object({
    total: z.number().min(0),
    breakdown: z
      .array(
        z.object({
          category: z.string(),
          amount: z.number().min(0),
          description: z.string().optional(),
        })
      )
      .default([]),
  }),
  timeline: z.object({
    startDate: z.string().transform((str) => new Date(str)),
    endDate: z.string().transform((str) => new Date(str)),
    milestones: z
      .array(
        z.object({
          name: z.string(),
          date: z.string().transform((str) => new Date(str)),
          description: z.string().optional(),
        })
      )
      .default([]),
  }),
  requirements: z
    .object({
      mandatory: z.array(z.string()).default([]),
      preferred: z.array(z.string()).default([]),
      restrictions: z.array(z.string()).default([]),
    })
    .optional(),
  success_metrics: z
    .object({
      primary: z.array(z.string()).default([]),
      secondary: z.array(z.string()).default([]),
      kpis: z
        .array(
          z.object({
            name: z.string(),
            target: z.number(),
            unit: z.string(),
          })
        )
        .default([]),
    })
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assignedTo: z.array(z.string()).default([]),
});

// GET /briefs (leer: tenant + auth + algún rol)
router.get("/", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { clientId, campaignId, status, priority, favorite } = req.query as any;

    const filter: any = { tenantId: req.tenantObjectId };

    if (clientId) filter.clientId = clientId;
    if (campaignId) filter.campaignId = campaignId;
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (favorite !== undefined) filter.favorite = favorite === "true";

    // ❌ Eliminado gating por nombres de rol/ownership
    const briefs = await Brief.find(filter).sort({ createdAt: -1 });
    res.json(briefs);
  } catch (error) {
    console.error("Get briefs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /briefs (crear: tenant + auth + algún rol)
router.post("/", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createBriefSchema.parse(req.body);

    const brief = new Brief({
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
      status: "draft",
      favorite: false,
    });

    await brief.save();
    res.status(201).json(brief);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create brief error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /briefs/:id (leer uno: tenant + auth + algún rol)
router.get("/:id", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const brief = await Brief.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!brief) {
      res.status(404).json({ error: "Brief not found" });
      return;
    }

    res.json(brief);
  } catch (error) {
    console.error("Get brief error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /briefs/:id (editar: tenant + auth + algún rol)
router.patch("/:id", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const updateData = createBriefSchema.partial().parse(req.body);
    delete (updateData as any).createdBy;

    const brief = await Brief.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, updateData, { new: true, runValidators: true });

    if (!brief) {
      res.status(404).json({ error: "Brief not found" });
      return;
    }

    res.json(brief);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update brief error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /briefs/:id/favorite (toggle favorite: tenant + auth + algún rol)
router.patch("/:id/favorite", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);

    const brief = await Brief.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantObjectId },
      { favorite }, // Ojo: tu query usa "favorite" arriba. Si el modelo usa "favorite", cambia esta línea a { favorite: favorite }.
      { new: true }
    );

    if (!brief) {
      res.status(404).json({ error: "Brief not found" });
      return;
    }

    res.json(brief);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update brief favorite error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /briefs/:id (borrar: tenant + auth + algún rol)
router.delete("/:id", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const brief = await Brief.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!brief) {
      res.status(404).json({ error: "Brief not found" });
      return;
    }

    res.json({ message: "Brief deleted successfully" });
  } catch (error) {
    console.error("Delete brief error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as briefRoutes };
