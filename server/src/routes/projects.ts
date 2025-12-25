import { Router } from "express";
import { z } from "zod";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";
import { Campaign } from "../models/Campaign.js";

import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyRole } from "../middleware/requireAnyRole.js";
import { Types } from "mongoose"; // <-- IMPORTANTE: para castear a ObjectId

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["active", "completed", "on_hold", "archived"]).optional(),
  startDate: z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return undefined;
      const d = new Date(s);
      return isNaN(d.getTime()) ? undefined : d;
    }),
  endDate: z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return undefined;
      const d = new Date(s);
      return isNaN(d.getTime()) ? undefined : d;
    }),
  objectives: z.array(z.string()).default([]),
  targetAudience: z.string().optional(),
});

// GET /projects
router.get("/", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { q } = req.query as { q?: string };
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const filter: any = {
      tenantId: req.tenantObjectId,
    };

    if (q) {
      filter.name = { $regex: q, $options: "i" };
    }

    const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
    const primaryRole = req.user?.primaryRole?.toLowerCase();
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([Project.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("clientId", "name"), Project.countDocuments(filter)]);

    res.json({
      projects,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get all projects error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /clients/:clientId/projects/count
router.get("/clients/:clientId/projects/count", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { clientId } = req.params;

    // Cast explícito a ObjectId
    let clientObjectId: Types.ObjectId;
    try {
      clientObjectId = new Types.ObjectId(clientId);
    } catch {
      return res.status(400).json({ error: "clientId inválido" });
    }

    const count = await Project.countDocuments({
      clientId: clientObjectId,
      tenantId: req.tenantObjectId,
    });

    res.json({ count });
  } catch (error) {
    console.error("Get projects count error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /clients/:clientId/projects
router.get(
  "/clients/:clientId/projects",
  requireTenant,
  authenticateToken,
  requireAnyRole, // ⬅️ única restricción: debe tener algún rol (sin importar el nombre)
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const { q } = req.query as { q?: string };
      const page = Number(req.query.page ?? 1);
      const limit = Number(req.query.limit ?? 20);
      const { clientId } = req.params;

      // Cast explícito a ObjectId
      let clientObjectId: Types.ObjectId;
      try {
        clientObjectId = new Types.ObjectId(clientId);
      } catch {
        return res.status(400).json({ error: "clientId inválido" });
      }

      const filter: any = {
        clientId: clientObjectId,
        tenantId: req.tenantObjectId,
      };

      if (q) {
        filter.name = { $regex: q, $options: "i" };
      }

      const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
      const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

      if (!isAdmin) {
        filter.assignedUsers = req.user!.userId;
      }

      const skip = (page - 1) * limit;

      const [projects, total] = await Promise.all([Project.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit), Project.countDocuments(filter)]);

      res.json({
        projects,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Get client projects error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /clients/:clientId/projects
router.post("/clients/:clientId/projects", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createProjectSchema.parse(req.body);

    const { clientId } = req.params;

    // Cast explícito a ObjectId para la búsqueda
    let clientObjectId: Types.ObjectId;
    try {
      clientObjectId = new Types.ObjectId(clientId);
    } catch {
      return res.status(400).json({ error: "clientId inválido" });
    }

    // Verificar que el cliente existe
    const client = await Client.findOne({
      _id: clientObjectId,
      tenantId: req.tenantObjectId,
    });

    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    const project = new Project({
      ...data,
      tenantId: req.tenantObjectId,
      // Guardar como string funciona porque Mongoose castea, pero dejamos el valor original
      clientId: clientObjectId,
      createdBy: req.user!.userId,
      assignedUsers: [new Types.ObjectId(req.user!.userId)],
    });

    await project.save();

    // Actualizar el cliente para incluir el proyecto
    await Client.findByIdAndUpdate(clientObjectId, { $push: { proyectos: project._id } });

    res.status(201).json(project);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid data", details: error.errors });
    }
    if (error.code === 11000) {
      return res.status(409).json({ error: "Ya existe un proyecto con este nombre para este cliente" });
    }
    console.error("Create project error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /projects/:projectId
router.get("/projects/:projectId", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    // Si además querés pertenencia/ACL finas, podrías mantener canViewDocument aquí.
    // Como pediste eliminar filtros por nombre de rol, lo saco.
    const { projectId } = req.params;

    const filter: any = {
      _id: projectId,
      tenantId: req.tenantObjectId,
    };

    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    const project = await Project.findOne(filter).populate("clientId", "name email").populate("assignedUsers", "firstName lastName email");

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json(project);
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /projects/:projectId
router.patch("/projects/:projectId", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const updateData = createProjectSchema.partial().parse(req.body);

    // No permitir cambiar creator
    delete (updateData as any).createdBy;

    const { projectId } = req.params;

    const filter: any = { _id: projectId, tenantId: req.tenantObjectId };
    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    const project = await Project.findOneAndUpdate(filter, updateData, { new: true, runValidators: true });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    res.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update project error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /projects/:projectId
router.delete("/projects/:projectId", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId } = req.params;

    const filter: any = {
      _id: projectId,
      tenantId: req.tenantObjectId,
    };

    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    const project = await Project.findOneAndDelete(filter);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // Remover el proyecto del cliente
    await Client.findByIdAndUpdate(project.clientId, {
      $pull: { proyectos: project._id },
    });

    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /projects/:projectId/campaigns
router.get("/projects/:projectId/campaigns", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId } = req.params;
    const filter: any = {
      _id: projectId,
      tenantId: req.tenantObjectId,
    };

    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    const project = await Project.findOne(filter);

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const campaigns = await Campaign.find({
      projectId: project._id,
      tenantId: req.tenantObjectId,
    }).sort({ createdAt: -1 });

    res.json(campaigns);
  } catch (error) {
    console.error("Get project campaigns error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /projects/:projectId/campaigns
router.post("/projects/:projectId/campaigns", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId } = req.params;

    let projectObjectId: Types.ObjectId;
    try {
      projectObjectId = new Types.ObjectId(projectId);
    } catch {
      return res.status(400).json({ error: "projectId inválido" });
    }

    const project = await Project.findOne({
      _id: projectObjectId,
      tenantId: req.tenantObjectId,
    });

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const campaignData = {
      ...req.body,
      tenantId: req.tenantObjectId,
      clientId: project.clientId,
      projectId: project._id,
      createdBy: req.user!.userId,
      assignedUsers: [req.user!.userId],
      status: req.body.status || "draft",
      objectives: req.body.objectives || [],
      platforms: req.body.platforms || [],
      kpis: req.body.kpis || [],
    };

    const campaign = new Campaign(campaignData);
    await campaign.save();

    res.status(201).json(campaign);
  } catch (error: any) {
    console.error("Create project campaign error:", error);
    const message = error?.message || "Internal server error";
    res.status(500).json({ error: message });
  }
});

export { router as projectRoutes };
