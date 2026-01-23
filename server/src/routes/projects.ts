import { Router } from "express";
import { z } from "zod";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";
import { User } from "../models/User.js";
import { Info } from "../models/Info.js";
import UserProject from "../models/UserProject.js";

import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyRole } from "../middleware/requireAnyRole.js";
import { Types } from "mongoose"; // <-- IMPORTANTE: para castear a ObjectId

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(["active", "completed", "on_hold", "archived"]).optional(),
  startDate: z
    .string()
    .optional()
    .nullable()
    .transform((s) => {
      if (!s) return undefined;
      const d = new Date(s);
      return isNaN(d.getTime()) ? undefined : d;
    }),
  endDate: z
    .string()
    .optional()
    .nullable()
    .transform((s) => {
      if (!s) return undefined;
      const d = new Date(s);
      return isNaN(d.getTime()) ? undefined : d;
    }),
  objectives: z.array(z.string()).default([]),
  targetAudience: z.string().optional().nullable(),
  assignedUsers: z.array(z.string()).optional(),
  vacationConfig: z
    .object({
      useGlobalConfig: z.boolean(),
      permiteFraccionadas: z.boolean(),
      minDiasFraccion: z.number().min(1).nullable().optional(),
      diasCorridos: z.boolean().optional(),
    })
    .optional()
    .nullable(),
  externalId: z.number().optional(),
  metadata: z.any().optional(),
});

// GET /projects
router.get("/projects", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { q } = req.query as { q?: string };
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 1000);

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
      // Usar Types.ObjectId para asegurar el match en el array de assignedUsers
      filter.assignedUsers = new Types.ObjectId(req.user!.userId);
    }

    console.log(`[PROJECTS] List for tenant ${req.tenantId}, isAdmin=${isAdmin}`);
    console.log(`[PROJECTS] Filter: ${JSON.stringify(filter)}`);

    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([Project.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("clientId", "name").lean(), Project.countDocuments(filter)]);

    // 2. Resolver clientes para proyectos que no tienen clientId pero sí metadata.clienteId
    const projectsToResolve = projects.filter((p) => !p.clientId && p.metadata?.clienteId);
    if (projectsToResolve.length > 0) {
      const externalIds = [...new Set(projectsToResolve.map((p) => String(p.metadata!.clienteId)))];
      const clients = await Client.find({
        tenantId: req.tenantObjectId,
        externalId: { $in: externalIds },
      })
        .select("name externalId")
        .lean();

      const clientMap = new Map();
      clients.forEach((c) => clientMap.set(String(c.externalId), c));

      projects.forEach((p) => {
        if (!p.clientId && p.metadata?.clienteId) {
          const client = clientMap.get(String(p.metadata.clienteId));
          if (client) {
            (p as any).clientId = {
              _id: client._id,
              name: client.name,
            };
          }
        }
      });
    }

    console.log(`[PROJECTS] Found ${projects.length} projects for filter`);

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

// GET /miniprojects - Get minimal project info by IDs (for mobile/dropdowns)
router.get("/miniprojects", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.json([]);

    const idList = String(ids)
      .split(",")
      .filter((id) => Types.ObjectId.isValid(id));
    if (idList.length === 0) return res.json([]);

    const projects = await Project.find({
      _id: { $in: idList },
      tenantId: req.tenantObjectId,
    })
      .select("name status clientId metadata")
      .populate("clientId", "name")
      .lean();

    // Resolver clientes por metadata si es necesario
    const projectsWithMetadata = projects.filter((p) => !p.clientId && p.metadata?.clienteId);
    if (projectsWithMetadata.length > 0) {
      const externalIds = [...new Set(projectsWithMetadata.map((p) => String(p.metadata!.clienteId)))];
      const clients = await Client.find({
        tenantId: req.tenantObjectId,
        externalId: { $in: externalIds },
      })
        .select("name externalId")
        .lean();

      const clientMap = new Map();
      clients.forEach((c) => clientMap.set(String(c.externalId), c));

      projects.forEach((p) => {
        if (!p.clientId && p.metadata?.clienteId) {
          const client = clientMap.get(String(p.metadata.clienteId));
          if (client) {
            (p as any).clientId = {
              _id: client._id,
              name: client.name,
            };
          }
        }
      });
    }

    res.json(projects);
  } catch (error) {
    console.error("Get miniprojects error:", error);
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
      const limit = Number(req.query.limit ?? 1000);
      const { clientId } = req.params;

      // Cast explícito a ObjectId
      let clientObjectId: Types.ObjectId;
      try {
        clientObjectId = new Types.ObjectId(clientId);
      } catch {
        return res.status(400).json({ error: "clientId inválido" });
      }

      // 1. Obtener el cliente para conocer su externalId
      const client = await Client.findOne({
        _id: clientObjectId,
        tenantId: req.tenantObjectId,
      });

      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const externalId = client.externalId;
      const externalIdNum = externalId ? Number(externalId) : null;

      const filter: any = {
        tenantId: req.tenantObjectId,
      };

      // Si tiene externalId, buscamos por _id O por externalId en metadata
      if (externalIdNum !== null && !isNaN(externalIdNum)) {
        filter.$or = [{ clientId: clientObjectId }, { "metadata.clienteId": externalIdNum }];
      } else {
        filter.clientId = clientObjectId;
      }

      if (q) {
        filter.name = { $regex: q, $options: "i" };
      }

      const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
      const primaryRole = req.user?.primaryRole?.toLowerCase();
      const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";

      if (!isAdmin) {
        filter.assignedUsers = new Types.ObjectId(req.user!.userId);
      }

      console.log(`[PROJECTS] List for client ${clientId} (externalId: ${externalId}), tenant ${req.tenantId}, isAdmin=${isAdmin}`);

      const skip = (page - 1) * limit;

      const [projects, total] = await Promise.all([Project.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("clientId", "name").lean(), Project.countDocuments(filter)]);

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
  },
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

    // Actualizar el usuario creador para incluir el proyecto
    await User.findByIdAndUpdate(req.user!.userId, { $addToSet: { projectIds: project._id } });

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

    const project = await Project.findOne(filter).populate("clientId", "name email").populate("assignedUsers", "firstName lastName email").lean();

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // --- Resolución de Metadata ---
    if (project.metadata) {
      const { responsableId, clienteId, sedeId, centroCostoId } = project.metadata;
      const resolutions: any = {};

      if (responsableId) {
        const user = await User.findOne({ "metadata.id": responsableId }).select("firstName lastName email").lean();
        if (user) resolutions.responsable = user;
      }

      if (clienteId) {
        const client = await Client.findOne({
          tenantId: req.tenantObjectId,
          $or: [{ externalId: String(clienteId) }, { "metadata.clienteId": clienteId }],
        })
          .select("name email externalId")
          .lean();
        if (client) resolutions.cliente = client;
      }

      if (sedeId) {
        const sede = await Info.findOne({
          type: "sede",
          "data.id": sedeId,
        }).lean();
        if (sede) resolutions.sede = sede;
      }

      if (centroCostoId) {
        const cc = await Info.findOne({
          type: "centro-costo",
          "data.id": centroCostoId,
        }).lean();
        if (cc) resolutions.centroCosto = cc;
      }

      (project as any).metadataResolutions = resolutions;

      // Fallback para clientId si no existe en el nivel superior
      if (!project.clientId && resolutions.cliente) {
        (project as any).clientId = resolutions.cliente;
      }

      // Contar personas desde la colección users_&_projects
      const externalProjId = project.metadata.id || project.externalId;
      if (externalProjId) {
        const userCount = await UserProject.countDocuments({
          externalProjectId: externalProjId,
        });
        (project as any).metadataUserCount = userCount;
      }
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
    const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    // 1. Fetch current project state explicitly to manage User.projectIds sync
    const currentProject = await Project.findOne(filter);

    if (!currentProject) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // 2. Handle assignedUsers sync if present
    if (updateData.assignedUsers) {
      const oldAssigned = currentProject.assignedUsers.map((id) => id.toString());
      const newAssigned = updateData.assignedUsers;

      const added = newAssigned.filter((id) => !oldAssigned.includes(id));
      const removed = oldAssigned.filter((id) => !newAssigned.includes(id));

      if (added.length > 0) {
        await User.updateMany({ _id: { $in: added }, tenantId: req.tenantObjectId }, { $addToSet: { projectIds: currentProject._id } });
      }

      if (removed.length > 0) {
        await User.updateMany({ _id: { $in: removed }, tenantId: req.tenantObjectId }, { $pull: { projectIds: currentProject._id } });
      }
    }

    const project = await Project.findOneAndUpdate(filter, updateData, { new: true, runValidators: true });

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

// Route removed as teamConfig is no longer supported in the model

export { router as projectRoutes };
