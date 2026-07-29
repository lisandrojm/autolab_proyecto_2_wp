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
import { Area } from "../models/Area.js";
import { Position } from "../models/Position.js";
import { Level } from "../models/Level.js";
import { Shift } from "../models/Shift.js";
import { Company } from "../models/Company.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";
import { ActivityLogGeneralConfig } from "../models/ActivityLogGeneralConfig.js";

async function resolveProjectGlobalConfig(project: any, tenantId: any) {
  if (!project) return;
  if (!project.activityLogConfig) {
    project.activityLogConfig = { useGlobalConfig: true };
  }
  if (project.activityLogConfig.useGlobalConfig !== false) {
    const generalConfig = await ActivityLogGeneralConfig.getOrCreateDefault(tenantId);
    project.activityLogConfig.allowedPastDays = generalConfig.allowedPastDays;
  }
}

async function resolveProjectsGlobalConfig(projects: any[], tenantId: any) {
  if (!projects || projects.length === 0) return;
  const generalConfig = await ActivityLogGeneralConfig.getOrCreateDefault(tenantId);
  for (const project of projects) {
    if (!project.activityLogConfig) {
      project.activityLogConfig = { useGlobalConfig: true };
    }
    if (project.activityLogConfig.useGlobalConfig !== false) {
      project.activityLogConfig.allowedPastDays = generalConfig.allowedPastDays;
    }
  }
}

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
  metadata: z.object({
    responsableId: z.number({ required_error: "El responsable del proyecto es obligatorio" }),
    sedeId: z.number().optional().nullable(),
    centroCostoId: z.number().optional().nullable(),
    clienteId: z.number().optional().nullable(),
    nombre: z.string().optional().nullable(),
    descripcion: z.string().optional().nullable(),
    fechaAlta: z.string().optional().nullable(),
    fechaInicio: z.string().optional().nullable(),
    fechaFin: z.string().optional().nullable(),
    activo: z.boolean().optional().nullable(),
  }),
  workSchedule: z.any().optional(),
  activityLogConfig: z
    .object({
      useGlobalConfig: z.boolean(),
      enableFastEntry: z.boolean().optional(),
      allowsAdditionalStaff: z.boolean().optional(),
      allowedPastDays: z.number().optional(),
      schedule: z
        .object({
          type: z.enum(["daily", "workdays", "custom"]),
          days: z.array(z.number()),
        })
        .optional(),
    })
    .optional()
    .nullable(),
  turnos: z.array(z.string()).optional(),
  areasConfig: z
    .array(
      z.object({
        areaId: z.string(),
        shiftIds: z.array(z.string()),
      }),
    )
    .optional(),
  coordinatorAssignments: z
    .array(
      z.object({
        areaId: z.string(),
        shiftId: z.string(),
        userId: z.string(),
      })
    )
    .optional(),
  clientId: z.string().optional(),
  contratoEmpresas: z
    .array(z.string())
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
  releaseEmpresas: z
    .array(z.string())
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
});

const updateTeamConfigSchema = z.object({
  config: z.array(
    z.object({
      userId: z.string(),
      canRegister: z.boolean(),
      useProjectSchedule: z.boolean().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      shiftId: z.string().optional(),
    }),
  ),
});

// GET /projects
router.get("/projects", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { q } = req.query as { q?: string };
    const page = Number(req.query.page ?? 1);
    let limit = Number(req.query.limit ?? 50);
    if (limit > 100) limit = 100; // Cap limit to 100 to prevent OOM/Timeouts

    const filter: any = {
      tenantId: req.tenantObjectId,
    };

    if (q) {
      filter.name = { $regex: createFuzzySearchRegex(String(q)), $options: "i" };
    }

    const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
    const primaryRole = req.user?.primaryRole?.toLowerCase();
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";

    if (!isAdmin) {
      // Usar Types.ObjectId para asegurar el match en el array de assignedUsers
      filter.assignedUsers = new Types.ObjectId(req.user!.userId);
    }

    console.log(`[PROJECTS] List for tenant ${req.tenantId}, isAdmin=${isAdmin}, limit=${limit}`);

    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("clientId", "name")
        .populate("turnos", "name")
        .populate("areasConfig.areaId", "name")
        .populate("areasConfig.shiftIds", "name")
        .populate("coordinatorAssignments.areaId", "name")
        .populate("coordinatorAssignments.shiftId", "name")
        .populate("coordinatorAssignments.userId", "firstName lastName email")
        .select("-objectives -workSchedule -teamConfig") // Exclude heavy/unused fields in list
        .lean(),
      Project.countDocuments(filter),
    ]);

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

    // 3. BULK METADATA RESOLUTION (Sedes)
    // Recolectar IDs de sedes
    const sedeIds = new Set<string>();
    projects.forEach((p) => {
      if (p.metadata?.sedeId) {
        sedeIds.add(String(p.metadata.sedeId));
      }
    });

    if (sedeIds.size > 0) {
      // Convertir a números ya que data.id es Number en el modelo Info
      const sedeIdsArray = Array.from(sedeIds).map((id) => Number(id));
      const sedes = await Info.find({
        type: "sede",
        "data.id": { $in: sedeIdsArray },
      }).lean();

      const sedeMap = new Map();
      sedes.forEach((s) => sedeMap.set(String(s.data.id), s));

      projects.forEach((p) => {
        if (p.metadata?.sedeId) {
          const sede = sedeMap.get(String(p.metadata.sedeId));
          if (sede) {
            if (!(p as any).metadataResolutions) (p as any).metadataResolutions = {};
            (p as any).metadataResolutions.sede = sede;
          }
        }
      });
    }

    // 4. BULK METADATA RESOLUTION (Responsables)
    const responsableIds = new Set<number>();
    projects.forEach((p) => {
      if (p.metadata?.responsableId) {
        responsableIds.add(Number(p.metadata.responsableId));
      }
    });

    if (responsableIds.size > 0) {
      const responsables = await User.find({
        tenantId: req.tenantObjectId,
        "metadata.id": { $in: Array.from(responsableIds) }
      }).select("firstName lastName email metadata").lean();

      const respMap = new Map();
      responsables.forEach((r) => respMap.set(String(r.metadata?.id), r));

      projects.forEach((p) => {
        if (p.metadata?.responsableId) {
          const resp = respMap.get(String(p.metadata.responsableId));
          if (resp) {
            if (!(p as any).metadataResolutions) (p as any).metadataResolutions = {};
            (p as any).metadataResolutions.responsable = {
               _id: resp._id,
               name: `${resp.firstName || ""} ${resp.lastName || ""}`.trim() || resp.email,
               firstName: resp.firstName,
               lastName: resp.lastName
            };
          }
        }
      });
    }

    // 5. BULK PEOPLE COUNT (cantidad de personas asignadas al proyecto)
    // Se cuenta desde la colección users_&_projects (UserProject), fuente autoritativa.
    const projectIdsForCount = projects.map((p) => p._id);
    if (projectIdsForCount.length > 0) {
      const counts = await UserProject.aggregate([
        { $match: { projectId: { $in: projectIdsForCount } } },
        { $group: { _id: "$projectId", count: { $sum: 1 } } },
      ]);
      const countMap = new Map<string, number>();
      counts.forEach((c) => countMap.set(String(c._id), c.count));
      projects.forEach((p) => {
        (p as any).metadataUserCount = countMap.get(String(p._id)) || 0;
      });
    }

    console.log(`[PROJECTS] Found ${projects.length} projects for filter`);

    await resolveProjectsGlobalConfig(projects, req.tenantObjectId);

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

    await resolveProjectsGlobalConfig(projects, req.tenantObjectId);

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
    console.log(`[PROJECTS] Count for clientId: ${clientId}, tenant: ${req.tenantId}`);

    // Cast explícito a ObjectId
    let clientObjectId: Types.ObjectId;
    try {
      clientObjectId = new Types.ObjectId(clientId);
    } catch (err) {
      console.error(`[PROJECTS] Invalid clientId: ${clientId}`);
      return res.status(400).json({ error: "clientId inválido" });
    }

    // Get the client to find its externalId
    const client = await Client.findOne({
      _id: clientObjectId,
      tenantId: req.tenantObjectId,
    });

    if (!client) {
      console.warn(`[PROJECTS] Client not found: ${clientId}`);
      return res.status(404).json({ error: "Client not found" });
    }

    const externalId = client.externalId;
    const externalIdNum = externalId ? Number(externalId) : null;

    // Build filter to search by clientId OR by metadata.clienteId (using externalId)
    const filter: any = {
      tenantId: req.tenantObjectId,
    };

    if (externalIdNum !== null && !isNaN(externalIdNum)) {
      filter.$or = [{ clientId: clientObjectId }, { "metadata.clienteId": externalIdNum }];
    } else {
      filter.clientId = clientObjectId;
    }

    console.log(`[PROJECTS] Count filter: ${JSON.stringify(filter)}`);
    const count = await Project.countDocuments(filter);
    console.log(`[PROJECTS] Count result: ${count}`);

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
      let limit = Number(req.query.limit ?? 50);
      if (limit > 100) limit = 100; // Cap limit to 100 to prevent server colapse
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
        filter.name = { $regex: createFuzzySearchRegex(String(q)), $options: "i" };
      }

      const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
      const primaryRole = req.user?.primaryRole?.toLowerCase();
      const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";

      if (!isAdmin) {
        filter.assignedUsers = new Types.ObjectId(req.user!.userId);
      }

      console.log(`[PROJECTS] List for client ${clientId} (externalId: ${externalId}), tenant ${req.tenantId}, isAdmin=${isAdmin}, limit=${limit}`);

      const skip = (page - 1) * limit;

      const [projects, total] = await Promise.all([
        Project.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate("clientId", "name")
          .populate("turnos", "name")
          .populate("areasConfig.areaId", "name")
          .populate("areasConfig.shiftIds", "name")
          .select("-objectives -workSchedule -teamConfig")
          .lean(),
        Project.countDocuments(filter),
      ]);

      // Bulk Sede Resolution
      const sedeIds = new Set<string>();
      projects.forEach((p) => {
        if (p.metadata?.sedeId) {
          sedeIds.add(String(p.metadata.sedeId));
        }
      });

      if (sedeIds.size > 0) {
        // Convertir a números ya que data.id es Number en el modelo Info
        const sedeIdsArray = Array.from(sedeIds).map((id) => Number(id));
        const sedes = await Info.find({
          type: "sede",
          "data.id": { $in: sedeIdsArray },
        }).lean();

        const sedeMap = new Map();
        sedes.forEach((s) => sedeMap.set(String(s.data.id), s));

        projects.forEach((p) => {
          if (p.metadata?.sedeId) {
            const sede = sedeMap.get(String(p.metadata.sedeId));
            if (sede) {
              if (!(p as any).metadataResolutions) (p as any).metadataResolutions = {};
              (p as any).metadataResolutions.sede = sede;
            }
          }
        });
      }

      // Bulk People Count (cantidad de personas asignadas al proyecto)
      const projectIdsForCount = projects.map((p) => p._id);
      if (projectIdsForCount.length > 0) {
        const counts = await UserProject.aggregate([
          { $match: { projectId: { $in: projectIdsForCount } } },
          { $group: { _id: "$projectId", count: { $sum: 1 } } },
        ]);
        const countMap = new Map<string, number>();
        counts.forEach((c) => countMap.set(String(c._id), c.count));
        projects.forEach((p) => {
          (p as any).metadataUserCount = countMap.get(String(p._id)) || 0;
        });
      }

      await resolveProjectsGlobalConfig(projects, req.tenantObjectId);

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
      clientId: clientObjectId,
      createdBy: req.user!.userId,
      assignedUsers: [new Types.ObjectId(req.user!.userId)],
    });

    // Ensure metadata is populated correctly as requested
    const now = new Date();
    project.metadata = {
      ...(data.metadata || {}),
      id: data.externalId || project.externalId,
      nombre: project.name,
      descripcion: project.description || "",
      clienteId: client.externalId ? Number(client.externalId) : undefined,
      fechaAlta: project.metadata?.fechaAlta || now.toISOString(),
      fechaInicio: project.startDate ? project.startDate.toISOString() : "",
      fechaFin: project.endDate ? project.endDate.toISOString() : "",
      activo: project.status === "active",
      responsableId: data.metadata?.responsableId,
      sedeId: data.metadata?.sedeId,
      centroCostoId: data.metadata?.centroCostoId,
    };


    await project.save();

    // Actualizar el cliente para incluir el proyecto
    await Client.findByIdAndUpdate(clientObjectId, { $push: { proyectos: project._id } });

    // Actualizar el usuario creador para incluir el proyecto
    await User.findByIdAndUpdate(req.user!.userId, { $addToSet: { projectIds: project._id } });

    const projectObj = project.toObject();
    await resolveProjectGlobalConfig(projectObj, req.tenantObjectId);
    res.status(201).json(projectObj);
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

// GET /projects/count - Contar proyectos
router.get("/projects/count", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const filter: any = { tenantId: req.tenantObjectId };

    const userRoles = (req.user?.roles || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    if (!isAdmin) {
      filter.assignedUsers = req.user!.userId;
    }

    const count = await Project.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count projects error:", error);
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

    const project = await Project.findOne(filter)
      .populate("clientId", "name email")
      .populate("assignedUsers", "firstName lastName email metadata")
      .populate("turnos")
      .populate("areasConfig.areaId")
      .populate("areasConfig.shiftIds")
      .populate("coordinatorAssignments.areaId")
      .populate("coordinatorAssignments.shiftId")
      .populate("coordinatorAssignments.userId")
      .lean();

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    // --- Resolución de Metadata ---
    if (project.metadata) {
      const { responsableId, clienteId, sedeId, centroCostoId } = project.metadata;
      const resolutions: any = {};

      if (responsableId) {
        const user = await User.findOne({ 
          tenantId: req.tenantObjectId,
          "metadata.id": responsableId 
        }).select("firstName lastName email").lean();
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

    await resolveProjectGlobalConfig(project, req.tenantObjectId);

    res.json(project);
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /projects/:projectId/area-shift-counts
// Cuántas personas del equipo pertenecen a cada combinación exacta de área + turno.
// Solo cuentan los miembros ACTIVOS con su último contrato VIGENTE (sin fecha de baja o con
// baja de hoy en adelante). Se calcula en el server porque el listado del equipo está paginado:
// el front solo tiene la página cargada y contaría de menos. Misma precedencia que usa la UI
// para el área/turno de cada miembro: `project.teamConfig` y, si ahí no está, su último contrato.
router.get("/projects/:projectId/area-shift-counts", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("teamConfig").lean();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const members = await User.find({ projectIds: projectId })
      .select("_id metadata.activo metadata.projects")
      .populate({ path: "metadata.projects", model: UserProject, select: "projectId contracts.areaShiftAssignments contracts.fecha_baja_contrato" })
      .lean();

    // "Hoy" en hora de Argentina (el VPS puede estar en UTC) y comparación como string ISO,
    // que evita cualquier corrimiento de zona horaria al parsear la fecha de baja.
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
    const contratoVigente = (baja?: string) => !baja || String(baja).substring(0, 10) >= hoy;

    const configByUser = new Map<string, any>((project.teamConfig || []).map((c: any) => [String(c.userId), c]));
    const counts: Record<string, number> = {};

    for (const member of members) {
      if ((member as any).metadata?.activo !== true) continue;

      const up: any = ((member as any).metadata?.projects || []).find((p: any) => p && String(p.projectId) === String(projectId));
      const contracts: any[] = up?.contracts || [];
      const ultimoContrato = contracts.length > 0 ? contracts[contracts.length - 1] : null;
      if (!ultimoContrato || !contratoVigente(ultimoContrato.fecha_baja_contrato)) continue;

      let assignments: any[] = configByUser.get(String(member._id))?.areaShiftAssignments || [];
      if (assignments.length === 0) assignments = ultimoContrato.areaShiftAssignments || [];

      // Un miembro cuenta UNA vez por combinación, aunque la tenga repetida en sus asignaciones.
      const keys = new Set<string>();
      for (const asa of assignments) {
        const areaId = asa?.areaId?._id || asa?.areaId;
        if (!areaId) continue;
        for (const sid of asa?.shiftIds || []) {
          const shiftId = sid?._id || sid;
          if (shiftId) keys.add(`${areaId}::${shiftId}`);
        }
      }
      for (const key of keys) counts[key] = (counts[key] || 0) + 1;
    }

    res.json({ counts });
  } catch (error) {
    console.error("Get area/shift counts error:", error);
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

    // Apply updates to currentProject
    Object.assign(currentProject, updateData);

    // Sync metadata
    if (!currentProject.metadata) {
      currentProject.metadata = {} as any;
    }

    if (updateData.externalId !== undefined) currentProject.metadata.id = updateData.externalId;
    if (updateData.name) currentProject.metadata.nombre = updateData.name;
    if (updateData.description !== undefined) currentProject.metadata.descripcion = updateData.description || "";
    if (updateData.startDate !== undefined) currentProject.metadata.fechaInicio = updateData.startDate ? updateData.startDate.toISOString() : "";
    if (updateData.endDate !== undefined) currentProject.metadata.fechaFin = updateData.endDate ? updateData.endDate.toISOString() : "";
    if (updateData.status) currentProject.metadata.activo = updateData.status === "active";

    if (updateData.metadata) {
      if (updateData.metadata.responsableId !== undefined) currentProject.metadata.responsableId = updateData.metadata.responsableId;
      if (updateData.metadata.sedeId !== undefined) currentProject.metadata.sedeId = updateData.metadata.sedeId;
      if (updateData.metadata.centroCostoId !== undefined) currentProject.metadata.centroCostoId = updateData.metadata.centroCostoId;
    }

    // Re-verify clientId/externalId relation if needed
    if (updateData.clientId) {
      const updatedClient = await Client.findById(updateData.clientId);
      if (updatedClient?.externalId) {
        currentProject.metadata.clienteId = Number(updatedClient.externalId);
      }
    }


    await currentProject.save();

    const projectObj = currentProject.toObject();
    await resolveProjectGlobalConfig(projectObj, req.tenantObjectId);
    res.json(projectObj);
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

    // --- CLEANUP ASSOCIATED DATA ---
    // 1. Get all UserProject documents associated with this project
    const userProjects = await UserProject.find({ projectId: project._id }).select("_id");
    const userProjectIds = userProjects.map((up) => up._id);

    // 2. Remove UserProject references from all users metadata and projectIds
    await User.updateMany(
      { tenantId: req.tenantObjectId },
      {
        $pull: {
          "metadata.projects": { $in: userProjectIds },
          projectIds: project._id,
        },
      }
    );

    // 3. Delete the UserProject documents themselves
    await UserProject.deleteMany({ projectId: project._id });

    res.json({ message: "Project deleted successfully" });
  } catch (error) {
    console.error("Delete project error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /projects/:projectId/team-config
router.patch("/projects/:projectId/team-config", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId } = req.params;
    const { config } = updateTeamConfigSchema.parse(req.body);

    const project = await Project.findOneAndUpdate({ _id: projectId, tenantId: req.tenantObjectId }, { teamConfig: config }, { new: true, runValidators: true });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid data", details: error.errors });
    }
    console.error("Update team config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /projects/:projectId/cleanup-team - Remove orphaned user IDs from assignedUsers
router.post("/projects/:projectId/cleanup-team", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findOne({
      _id: projectId,
      tenantId: req.tenantObjectId,
    });

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    const originalCount = project.assignedUsers?.length || 0;

    if (originalCount === 0) {
      return res.json({
        message: "No users to clean up",
        removedCount: 0,
        newCount: 0,
      });
    }

    // Find which assigned user IDs actually exist in the database
    const existingUsers = await User.find({
      _id: { $in: project.assignedUsers },
      tenantId: req.tenantObjectId,
    }).select("_id");

    const existingIds = new Set(existingUsers.map((u) => u._id.toString()));
    const validAssignedUsers = project.assignedUsers.filter((id) => existingIds.has(id.toString()));

    const removedCount = originalCount - validAssignedUsers.length;

    if (removedCount === 0) {
      return res.json({
        message: "All assigned users are valid",
        removedCount: 0,
        newCount: originalCount,
      });
    }

    // Update the project with only valid user IDs
    await Project.findByIdAndUpdate(projectId, {
      assignedUsers: validAssignedUsers,
    });

    console.log(`[CLEANUP] Project ${projectId}: removed ${removedCount} orphaned user IDs (${originalCount} -> ${validAssignedUsers.length})`);

    res.json({
      message: `Cleaned up ${removedCount} orphaned user IDs`,
      removedCount,
      newCount: validAssignedUsers.length,
    });
  } catch (error) {
    console.error("Cleanup team error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /projects/:projectId/assign-member - Specialized endpoint for the wizard
router.post("/projects/:projectId/assign-member", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId } = req.params;
    const { userId, contract, isUpdate, contractIndex, approveSolicitud } = req.body;

    if (!userId || !contract) {
      return res.status(400).json({ error: "userId and contract data are required" });
    }

    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const user = await User.findOne({ _id: userId, tenantId: req.tenantObjectId });
    if (!user) return res.status(404).json({ error: "User not found" });

    // 1. Resolve names for the contract from Info collection and other collections
    const isValidId = (id: any) => id && Types.ObjectId.isValid(id);

    const [sede, cat, estado, tipo, area, pos, level, shift] = await Promise.all([
      Info.findOne({ type: "sede", "data.id": Number(contract.sede_id) }).lean(),
      Info.findOne({ type: "categoria-sat", "data.id": Number(contract.categoria_sat_id) }).lean(),
      Info.findOne({ type: "estado-empleado", "data.id": Number(contract.estado_id) }).lean(),
      Info.findOne({ type: "contrato", "data.id": Number(contract.tipo_contrato_id) }).lean(),
      isValidId(contract.areaId) ? Area.findById(contract.areaId).lean() : Promise.resolve(null),
      isValidId(contract.positionId) ? Position.findById(contract.positionId).lean() : Promise.resolve(null),
      isValidId(contract.levelId) ? Level.findById(contract.levelId).lean() : Promise.resolve(null),
      isValidId(contract.shiftId) ? Shift.findById(contract.shiftId).lean() : Promise.resolve(null),
    ]);

    // --- Validation: Check for overlapping shifts in OTHER projects only ---
    // Sanitize optional reference IDs (empty string -> null) to avoid BSON casting errors
    const sanitizeId = (id: any) => (id === "" || id === undefined) ? null : id;
    contract.areaId = sanitizeId(contract.areaId);
    contract.positionId = sanitizeId(contract.positionId);
    contract.levelId = sanitizeId(contract.levelId);
    contract.shiftId = sanitizeId(contract.shiftId);

    if (contract.shiftId && contract.fecha_alta_contrato) {
      const newStart = new Date(contract.fecha_alta_contrato);
      const newEnd = contract.fecha_baja_contrato ? new Date(contract.fecha_baja_contrato) : new Date("2100-01-01");

      // Only check OTHER projects, never block same-project saves
      const existingUserAssignments = await UserProject.find({
        userId,
        projectId: { $ne: new Types.ObjectId(projectId) },
      }).lean();

      for (const assignment of existingUserAssignments) {
        for (const c of assignment.contracts) {
          if (c.shiftId && String(c.shiftId) === String(contract.shiftId)) {
            const exStart = new Date(c.fecha_alta_contrato);
            const exEnd = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date("2100-01-01");

            // Overlap condition: (StartA <= EndB) and (EndA >= StartB)
            if (newStart <= exEnd && newEnd >= exStart) {
              return res.status(409).json({ 
                error: `El turno ya está asignado a este usuario en el proyecto "${assignment.nombre_proyecto || 'otro proyecto'}" para las fechas seleccionadas.`,
                details: {
                  projectName: assignment.nombre_proyecto,
                  startDate: c.fecha_alta_contrato,
                  endDate: c.fecha_baja_contrato
                }
              });
            }
          }
        }
      }
    }

    // Resolve role frame name. El wizard toma los roles frame de la colección `roles_frame`, pero acá
    // el catálogo `infos` (type: "role-frame") puede no tenerlos → se honra el nombre que manda el
    // cliente, con fallback al lookup en `infos` (para flujos viejos / sync FRAME).
    let rolFrameName = "";
    if (contract.rol_frame_id) {
      const rfInfo = await Info.findOne({ type: "role-frame", "data.rol.id": Number(contract.rol_frame_id) }).lean();
      if (rfInfo) rolFrameName = rfInfo.name;
    }
    if (!rolFrameName && contract.nombre_rol_frame) rolFrameName = String(contract.nombre_rol_frame);

    // Sanitize areaShiftAssignments to ensure valid ObjectIds
    let sanitizedAssignments = [];
    if (contract.areaShiftAssignments && Array.isArray(contract.areaShiftAssignments)) {
      sanitizedAssignments = contract.areaShiftAssignments
        .map((asa: any) => ({
          areaId: isValidId(asa.areaId) ? new Types.ObjectId(asa.areaId) : null,
          shiftIds: (asa.shiftIds || []).filter(isValidId).map((id: string) => new Types.ObjectId(id))
        }))
        .filter((asa: any) => asa.areaId !== null);
    }

    // Empresas (contrato / release) elegidas para este miembro: resolvemos la razón social
    // para guardarla junto al id (parity con los otros nombre_*; útil para el detalle y el PDF).
    const empresaContratoDoc = contract.empresaContratoId ? await Company.findById(contract.empresaContratoId).select("razonSocial").lean() : null;
    const empresaReleaseDoc = contract.empresaReleaseId ? await Company.findById(contract.empresaReleaseId).select("razonSocial").lean() : null;

    const enrichedContract = {
      ...contract,
      empresaContratoId: contract.empresaContratoId || null,
      empresaReleaseId: contract.empresaReleaseId || null,
      nombre_empresa_contrato: (empresaContratoDoc as any)?.razonSocial || "",
      nombre_empresa_release: (empresaReleaseDoc as any)?.razonSocial || "",
      areaShiftAssignments: sanitizedAssignments,
      nombre_sede: sede?.name || "Sin sede",
      nombre_categoria_sat: cat?.name || "Sin categoria",
      nombre_estado_empleado: estado?.name || "Activo",
      nombre_contrato: contract.nombre_contrato || tipo?.name || "Sin tipo",
      nombre_area: (area as any)?.name || "Sin área",
      nombre_cargo: (pos as any)?.name || "Sin cargo",
      nombre_nivel: (level as any)?.name || "Sin nivel",
      nombre_turno: (shift as any)?.name || "Sin turno",
      nombre_rol_frame: rolFrameName || "Sin rol frame",
      fecha_carga: new Date().toISOString(),
      nombre_proyecto: project.name,
      proyecto_id: (project.metadata as any)?.id || project.externalId,
      empleado_id: (user.metadata as any)?.id,
    };

    // 2. Find or Create UserProject (assignment)
    // Search by internal IDs first, then also by external IDs to prevent duplicate key errors
    const extProjId = enrichedContract.proyecto_id;
    const extEmpId = enrichedContract.empleado_id;
    
    let userProject = await UserProject.findOne({
      $or: [
        { projectId, userId },
        ...(extProjId && extEmpId ? [{ externalProjectId: extProjId, externalEmployeeId: extEmpId }] : []),
      ],
    });

    if (!userProject) {
      userProject = new UserProject({
        projectId: project._id,
        userId: user._id,
        externalProjectId: enrichedContract.proyecto_id,
        externalEmployeeId: enrichedContract.empleado_id,
        nombre_proyecto: project.name,
        nombre_rol_frame: rolFrameName,
        contracts: [enrichedContract],
      });
    } else {
      // Índice explícito (editar una tarjeta puntual del modal de contratos) → actualizar ESE contrato.
      const idxNum = Number(contractIndex);
      const hasExplicitIndex = contractIndex !== undefined && contractIndex !== null && Number.isInteger(idxNum) && idxNum >= 0 && idxNum < userProject.contracts.length;
      if (hasExplicitIndex) {
        userProject.contracts[idxNum] = enrichedContract as any;
      } else if (isUpdate && userProject.contracts.length > 0) {
        userProject.contracts[userProject.contracts.length - 1] = enrichedContract as any;
      } else {
        userProject.contracts.push(enrichedContract as any);
      }
      userProject.markModified("contracts");
      userProject.projectId = project._id;
      userProject.userId = user._id;
      if (enrichedContract.proyecto_id) userProject.externalProjectId = enrichedContract.proyecto_id;
      if (enrichedContract.empleado_id) userProject.externalEmployeeId = enrichedContract.empleado_id;
      if (rolFrameName) userProject.nombre_rol_frame = rolFrameName;
    }

    await userProject.save();

    // 3. Sync internal arrays in Project and User
    // Update assignedUsers
    if (!project.assignedUsers.some(id => id.toString() === user._id.toString())) {
      project.assignedUsers.push(user._id);
    }

    // Update teamConfig (replace if exists)
    if (!project.teamConfig) project.teamConfig = [];
    const configIndex = project.teamConfig.findIndex(c => c.userId.toString() === user._id.toString());
    
    const newConfig = {
      userId: user._id,
      areaId: isValidId(contract.areaId) ? new Types.ObjectId(contract.areaId) : undefined,
      shiftId: isValidId(contract.shiftId) ? new Types.ObjectId(contract.shiftId) : undefined,
      areaShiftAssignments: sanitizedAssignments,
      canRegister: true,
      useProjectSchedule: true
    };

    if (configIndex > -1) {
      project.teamConfig[configIndex] = newConfig as any;
    } else {
      project.teamConfig.push(newConfig as any);
    }

    await project.save();

    // Update User metadata and projectIds
    const userUpdate: any = {
      $addToSet: {
        projectIds: project._id,
        "metadata.projects": userProject._id,
      },
    };
    // Si el alta viene de aprobar una solicitud (desde el wizard), marcamos la solicitud como aprobada
    // y activamos al usuario (ya tiene login). Así deja de aparecer en la pestaña Solicitudes.
    if (approveSolicitud) {
      userUpdate.$set = {
        "metadata.isSolicitud": false,
        "metadata.solicitudStatus": "aprobada",
        "metadata.activo": true,
      };
    }
    await User.findByIdAndUpdate(userId, userUpdate);

    res.json({ message: isUpdate ? "Member updated successfully" : "Member assigned successfully", userProject });
  } catch (error: any) {
    // Handle duplicate key error by finding the existing document and updating it
    if (error.code === 11000) {
      try {
        console.log("[AssignMember] E11000 duplicate key, attempting findOneAndUpdate fallback...");
        const { projectId } = req.params;
        const { userId, contract, isUpdate: isUpd } = req.body;
        
        // Find the conflicting document by any matching criteria
        const existing = await UserProject.findOne({
          $or: [
            { projectId, userId },
            { externalProjectId: contract?.externalProjectId, externalEmployeeId: contract?.externalEmployeeId },
          ],
        });
        
        if (existing) {
          // Update the existing document's internal IDs to match
          existing.projectId = new Types.ObjectId(projectId);
          existing.userId = new Types.ObjectId(userId);
          await existing.save();
          return res.json({ message: "Member updated successfully (resolved conflict)", userProject: existing });
        }
      } catch (retryError: any) {
        console.error("Assign member retry also failed:", retryError);
      }
    }
    
    console.error("Assign member error CRASH:", error);
    res.status(500).json({ 
      error: "Internal server error during assignment",
      details: error.message
    });
  }
});

// DELETE /projects/:projectId/members/:userId/contracts/:index - Elimina UN contrato puntual (por índice).
// Si la persona queda sin contratos en el proyecto, se limpia el UserProject y sus referencias.
router.delete("/projects/:projectId/members/:userId/contracts/:index", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId, index } = req.params;
    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("_id").lean();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const up = await UserProject.findOne({ projectId, userId });
    if (!up) {
      res.status(404).json({ error: "No hay contratos para esta persona en el proyecto" });
      return;
    }
    const idx = Number(index);
    if (!Number.isInteger(idx) || idx < 0 || idx >= up.contracts.length) {
      res.status(400).json({ error: "Índice de contrato inválido" });
      return;
    }

    up.contracts.splice(idx, 1);
    up.markModified("contracts");

    if (up.contracts.length === 0) {
      const upId = up._id;
      await up.deleteOne();
      await Project.findByIdAndUpdate(projectId, { $pull: { assignedUsers: userId, teamConfig: { userId }, coordinatorAssignments: { userId } } });
      await User.findByIdAndUpdate(userId, { $pull: { projectIds: projectId, "metadata.projects": upId } });
    } else {
      await up.save();
    }

    res.json({ message: "Contrato eliminado" });
  } catch (error) {
    console.error("Delete member contract error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /projects/:projectId/members/:userId - Complete removal of a member from a project
router.delete("/projects/:projectId/members/:userId", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId } = req.params;

    // 1. Update Project: remove from assignedUsers, teamConfig, and coordinatorAssignments
    await Project.findByIdAndUpdate(projectId, {
      $pull: { 
        assignedUsers: userId,
        teamConfig: { userId },
        coordinatorAssignments: { userId }
      }
    });

    // 2. Remove the UserProject document (it holds history and creates shift conflicts)
    await UserProject.deleteMany({ projectId, userId });

    // 3. Update User: remove from projectIds and metadata.projects
    await User.findByIdAndUpdate(userId, {
      $pull: {
        projectIds: projectId,
        "metadata.projects": { projectId } // Pull from metadata projects if it matches the ID
      }
    });
    
    // Some metadata.projects might be stored as ObjectIds or the UserProject ID itself. 
    // Let's also pull by searching for any entry that might reference the now-deleted UserProject
    // but the above usually covers the projectIds link.

    res.json({ message: "Member removed and data cleaned up successfully" });
  } catch (error) {
    console.error("Remove member error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as projectRoutes };
