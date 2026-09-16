import { Router } from "express";
import { alcanceDeResponsable } from "../utils/visibilidadResponsable.js";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";
import { User } from "../models/User.js";
import { Info } from "../models/Info.js";
import { CentroCosto } from "../models/CentroCosto.js";
import { agruparContratosPorDocumento, partirClaveDocumento } from "../utils/agruparContratos.js";
import { arrancarCorrida, corridaDe, detenerCorrida } from "../services/arca/corridaServidor.js";
import { buscarCategoriaCompatPorLegacyId } from "../utils/categoriaCompat.js";
import UserProject from "../models/UserProject.js";

import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyRole } from "../middleware/requireAnyRole.js";
import { Types } from "mongoose";
import { aplicarLoteObrasSociales, pendientesObraSocial, LoteObrasSocialesError } from "../services/obrasSocialesLoteService.js";
import { confirmarNombresConElPadron, usuariosDeCuils, mismoNombre, Renombre } from "../services/arca/nombreArca.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { Company } from "../models/Company.js";
import { getArcaDefaults } from "../models/ArcaDefault.js";
import { ObraSocial } from "../models/ObraSocial.js";
import { ArcaSucursal } from "../models/ArcaSucursal.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";

/**
 * El filtro del buscador de proyectos: por NOMBRE o por CENTRO DE COSTO, en el mismo campo.
 *
 * El centro de costo se identifica por un número («720») y es lo que la gente tiene a mano cuando
 * busca un proyecto — pero vive en otra colección, así que hay que resolverlo primero: se buscan
 * los centros cuyo nombre matchee y después los proyectos que apunten a alguno de ellos.
 *
 * Se agrega el número CRUDO como id además del nombre: `metadata.centroCostoId` guarda el id del
 * catálogo, y en algunos casos ese id ES el número que la gente escribe. Buscar por las dos vías
 * cuesta una query y evita que «no aparece» dependa de cuál de los dos números conozca quien busca.
 */
async function filtroBusquedaProyecto(q: string): Promise<Record<string, unknown>> {
  const regex = { $regex: createFuzzySearchRegex(String(q)), $options: "i" };
  const centros = await CentroCosto.find({ $or: [{ name: regex }, { "data.nombre": regex }] })
    .select("data.id")
    .lean();
  const ids = (centros as any[]).map((c) => c?.data?.id).filter((n) => typeof n === "number");

  const comoNumero = Number(String(q).trim());
  if (Number.isFinite(comoNumero) && !ids.includes(comoNumero)) ids.push(comoNumero);

  const o: Record<string, unknown>[] = [{ name: regex }];
  if (ids.length > 0) o.push({ "metadata.centroCostoId": { $in: ids } });
  return { $or: o };
}

/**
 * Suma una condición al filtro sin pisar un `$or` que ya esté puesto.
 *
 * El listado por cliente YA usa `$or` para matchear por `clientId` o por `metadata.clienteId`.
 * Asignarle otro `$or` encima lo reemplazaría en silencio y el listado pasaría a devolver los
 * proyectos de todos los clientes.
 */
function sumarAlFiltro(filter: any, condicion: Record<string, unknown>): void {
  if (filter.$or) {
    filter.$and = [...(filter.$and || []), { $or: filter.$or }, condicion];
    delete filter.$or;
    return;
  }
  Object.assign(filter, condicion);
}
import { ActivityLogGeneralConfig } from "../models/ActivityLogGeneralConfig.js";
import { NOVEDAD_SOLICITUD_APROBADA, nombreDePersona, notificar } from "../services/novedadesNotificaciones.js";
import { esContratoVigente, getContratoActivo, hoyArgentina } from "../utils/contratoVigencia.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function ensureDir(dir: string) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch (err) {
    console.error("Error creating directory:", dir, err);
    throw err;
  }
}

// Documento de "Alta" (AFIP/Servicios) de un contrato puntual: solo PDF, guardado bajo la carpeta
// del EMPLEADO dueño del contrato (req.params.userId), no del admin que sube el archivo.
const altaDocumentoStorage = multer.diskStorage({
  destination: async (req: any, _file, cb) => {
    try {
      const tenantId = req.tenantId || "unknown_tenant";
      const employeeUserId = req.params?.userId || "unknown_user";
      const dir = path.join(__dirname, "../../storage", tenantId, employeeUserId, "contratos");
      await ensureDir(dir);
      cb(null, dir);
    } catch (err) {
      console.error("Error in multer destination:", err);
      cb(err as any, "");
    }
  },
  filename: (_req: any, _file, cb) => {
    const docId = new mongoose.Types.ObjectId();
    cb(null, `alta_${docId}.pdf`);
  },
});

const uploadAltaDocumento = multer({
  storage: altaDocumentoStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isPdfExt = path.extname(file.originalname).toLowerCase() === ".pdf";
    const isPdfMime = file.mimetype === "application/pdf";
    if (isPdfExt && isPdfMime) return cb(null, true);
    cb(new Error("Solo se permiten archivos PDF"));
  },
}).single("document");

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
  /* Los convenios bajo los que contrata este proyecto. Ver `models/Project.ts`. */
  convenioIds: z
    .array(z.string())
    .optional()
    .nullable()
    .transform((v) => v ?? undefined),
});

/*
  El esquema ACEPTA el área y los turnos, y no es un agregado cosmético.

  Este endpoint reemplaza `teamConfig` entero con lo que recibe, y el esquema no listaba `areaId` ni
  `areaShiftAssignments` —que el modelo sí tiene—, así que zod los descartaba en silencio: guardar la
  configuración del equipo borraba a quién estaba asignado a qué área. El wizard después leía el área
  del contrato (su respaldo) y por eso no se notaba enseguida.
*/
const updateTeamConfigSchema = z.object({
  config: z.array(
    z.object({
      userId: z.string(),
      canRegister: z.boolean(),
      useProjectSchedule: z.boolean().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      areaId: z.string().optional(),
      shiftId: z.string().optional(),
      areaShiftAssignments: z.array(z.object({ areaId: z.string(), shiftIds: z.array(z.string()) })).optional(),
    }),
  ),
});

/** Las áreas y turnos de UN miembro. Ver el endpoint de más abajo. */
const asignarAreasSchema = z.object({
  areaShiftAssignments: z.array(z.object({ areaId: z.string(), shiftIds: z.array(z.string()) })),
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
      sumarAlFiltro(filter, await filtroBusquedaProyecto(String(q)));
    }

    const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
    const primaryRole = req.user?.primaryRole?.toLowerCase();
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";

    if (!isAdmin) {
      // Lo asignado MÁS los proyectos que la persona tiene a cargo como Responsable de Proyecto
      // (ver `alcanceDeResponsable`). `sumarAlFiltro` se encarga de no pisar un `$or` que ya venga
      // de la búsqueda por texto.
      const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user!.userId);
      if (proyectos.length > 0) sumarAlFiltro(filter, { $or: [{ assignedUsers: new Types.ObjectId(req.user!.userId) }, { _id: { $in: proyectos } }] });
      else filter.assignedUsers = new Types.ObjectId(req.user!.userId);
    }

    console.log(`[PROJECTS] List for tenant ${req.tenantId}, isAdmin=${isAdmin}, limit=${limit}`);

    /*
      MODO SELECTOR (`?slim=true`): sólo lo que hace falta para elegir un proyecto de una lista.

      El listado normal trae siete populate anidados —áreas, turnos, coordinadores— y después resuelve
      sede, centro de costo y responsable en bloque. Todo eso lo necesita la grilla de Proyectos; una
      lista para elegir uno no necesita nada de eso, y pagarlo igual es lo que hacía que el selector
      del móvil tardara. Medido contra la base: 1451 ms y 84 KB el listado completo, 142 ms y 5 KB este.

      Devuelve la misma forma (`{ projects, pagination }`) y respeta el mismo filtro de visibilidad,
      así que quien pida `slim` ve exactamente los mismos proyectos que vería sin pedirlo.
    */
    if (req.query.slim === "true") {
      const proyectos: any[] = await Project.find(filter)
        // `metadata.responsableId`: la solicitud del móvil deja elegir TODAS las áreas y turnos al coordinador del proyecto.
        .select("name status clientId contratoEmpresas convenioIds coordinatorAssignments metadata.responsableId")
        .populate("clientId", "name")
        .populate("coordinatorAssignments.areaId", "name")
        .populate("coordinatorAssignments.shiftId", "name startTime endTime order days")
        .sort({ name: 1 })
        .lean();

      /*
        De `coordinatorAssignments` van SÓLO las de quien pregunta.

        El que usa esto es la solicitud de contratación del móvil, que necesita saber qué área y turno
        coordina la persona en ese proyecto para dejarlos puestos en el alta. Las de los demás no las
        necesita, y mandarlas sería contarle a cualquier coordinador cómo está repartido el proyecto
        entero. La lista completa sigue viniendo en el listado normal, que es el que usa el escritorio.
      */
      const yo = String(req.user!.userId);
      for (const p of proyectos) {
        p.coordinatorAssignments = (p.coordinatorAssignments || []).filter((a: any) => String(typeof a.userId === "object" ? a.userId?._id : a.userId) === yo);
      }

      res.json({
        projects: proyectos,
        pagination: { page: 1, limit: proyectos.length, total: proyectos.length, pages: 1 },
      });
      return;
    }

    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("clientId", "name")
        .populate("turnos", "name")
        .populate("areasConfig.areaId", "name")
        .populate("areasConfig.shiftIds", "name order startTime endTime days")
        .populate("coordinatorAssignments.areaId", "name")
        .populate("coordinatorAssignments.shiftId", "name order startTime endTime days")
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

    /*
      RESOLUCIÓN EN BLOQUE DEL CENTRO DE COSTO.

      La ficha del proyecto lo resolvía y el LISTADO no, así que la tabla mostraba «ID: 46» donde la
      ficha del mismo proyecto decía «99_PRODUCTORA». No era un problema de la pantalla: el dato no
      llegaba, y el número crudo es lo que la pantalla muestra cuando el id no resuelve —que también
      es el caso real de un centro de costo borrado, y por eso conviene que se distinga de un guion.

      Va en bloque, como sede y responsable: un `findOne` por proyecto serían 12 consultas para
      mostrar una columna.
    */
    const centroCostoIds = new Set<number>();
    projects.forEach((p) => {
      if (p.metadata?.centroCostoId) centroCostoIds.add(Number(p.metadata.centroCostoId));
    });

    if (centroCostoIds.size > 0) {
      /*
        SE BUSCA EN LOS DOS CATÁLOGOS, y no es una precaución teórica.

        Los centros de costo viven duplicados: `Info` con `type: "centro-costo"` —de donde salía esta
        resolución— y el modelo `CentroCosto`, colección `centros-costo`, que es el que administra
        Configuración → Centros de Costos y el que exporta e importa por Excel. Hoy los dos tienen los
        mismos 32 ids, así que la diferencia no se nota; pero dar de alta uno desde el ABM escribe SOLO
        en `centros-costo`, y la resolución seguiría sin encontrarlo. El síntoma sería exactamente el
        de hoy —«ID: 46» en la columna— después de haberlo cargado, que es la peor forma de un bug:
        hiciste lo correcto y no pasó nada.

        Se prefiere el del ABM porque es el que una persona puede corregir.
      */
      const ids = Array.from(centroCostoIds);
      const [propios, deInfo] = await Promise.all([
        CentroCosto.find({ "data.id": { $in: ids } }).lean(),
        Info.find({ type: "centro-costo", "data.id": { $in: ids } }).lean(),
      ]);
      const ccMap = new Map();
      (deInfo as any[]).forEach((c) => ccMap.set(String(c.data?.id), c));
      (propios as any[]).forEach((c) => ccMap.set(String(c.data?.id), c));

      projects.forEach((p) => {
        if (p.metadata?.centroCostoId) {
          const cc = ccMap.get(String(p.metadata.centroCostoId));
          if (cc) {
            if (!(p as any).metadataResolutions) (p as any).metadataResolutions = {};
            (p as any).metadataResolutions.centroCosto = cc;
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
        sumarAlFiltro(filter, await filtroBusquedaProyecto(String(q)));
      }

      const userRoles = (req.user?.roles || []).map((r) => r.toString().toLowerCase());
      const primaryRole = req.user?.primaryRole?.toLowerCase();
      const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin") || primaryRole === "admin" || primaryRole === "superadmin";

      if (!isAdmin) {
        const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user!.userId);
        if (proyectos.length > 0) sumarAlFiltro(filter, { $or: [{ assignedUsers: new Types.ObjectId(req.user!.userId) }, { _id: { $in: proyectos } }] });
        else filter.assignedUsers = new Types.ObjectId(req.user!.userId);
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
          .populate("areasConfig.shiftIds", "name order startTime endTime days")
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
      const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user!.userId);
      if (proyectos.length > 0) filter.$or = [{ assignedUsers: req.user!.userId }, { _id: { $in: proyectos } }];
      else filter.assignedUsers = req.user!.userId;
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
      const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user!.userId);
      if (proyectos.length > 0) filter.$or = [{ assignedUsers: req.user!.userId }, { _id: { $in: proyectos } }];
      else filter.assignedUsers = req.user!.userId;
    }

    /**
     * `?team=ids` devuelve `assignedUsers` como ids pelados, sin poblar.
     *
     * Poblar el equipo es lo caro de este endpoint y la mayoría de las pantallas no lo necesita:
     * el panel web solo muestra el CONTADOR de personas (Detalle) o mapea la lista a `_id` para
     * saber a quién no ofrecer al agregar (Equipo, que además carga el equipo real por su endpoint
     * paginado). El móvil sí necesita los datos —usa `assignedUsers` como fallback cuando el
     * coordinador recibe 403 en `/users`— así que el default sigue siendo poblado.
     */
    const soloIdsDeEquipo = String(req.query.team || "") === "ids";

    const query = Project.findOne(filter)
      .populate("clientId", "name email")
      .populate("turnos")
      .populate("areasConfig.areaId")
      .populate("areasConfig.shiftIds")
      .populate("coordinatorAssignments.areaId")
      .populate("coordinatorAssignments.shiftId")
      // Los campos que el móvil usa para matchear al coordinador (`_id`, `metadata.id`, email o
      // nombre). Antes venía el usuario ENTERO, con todo su `metadata`, por cada asignación.
      .populate("coordinatorAssignments.userId", "firstName lastName name email metadata.id");

    if (!soloIdsDeEquipo) {
      query.populate({
        path: "assignedUsers",
        select: "firstName lastName email metadata roles",
        populate: [{ path: "roles", select: "name permissions" }],
      });
    }

    const project = await query.lean();

    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    /**
     * EL VÍNCULO DE CADA MIEMBRO, SOLO EL DE ESTE PROYECTO.
     *
     * `user.metadata.projects` son refs a UserProject: UNO POR CADA PROYECTO en el que la persona
     * estuvo alguna vez, con todo su historial de contratos adentro. Poblarlo anidado bajo
     * `assignedUsers` traía, para un proyecto de N personas, N × (proyectos de cada una) documentos
     * completos — decenas de MB y timeouts de más de 60 s en proyectos grandes.
     *
     * Acá se reemplaza por una sola consulta indexada (`{projectId, userId}`) que trae exactamente
     * un documento por miembro: el de ESTE proyecto. Es lo único que los consumidores buscan
     * (siempre hacen `projects.find(p => p.projectId === projectId)`).
     */
    if (!soloIdsDeEquipo) {
      const miembros = ((project as any).assignedUsers || []).filter((u: any) => u && typeof u === "object");
      if (miembros.length > 0) {
        // Sólo los campos de contrato que lee el móvil (vigencia, horario y área/turno), los mismos que
        // manda `/users/directory`: el vínculo entero de 254 personas eran 5,5 MB y ~56 s, y la
        // llamada se cortaba por timeout. El historial completo sigue en `/users/:id`.
        const vinculos = await UserProject.find({
          projectId: project._id,
          userId: { $in: miembros.map((u: any) => u._id) },
        })
          .select("projectId userId areaId nombre_proyecto nombre_rol_frame contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.fecha_carga contracts.hora_inicio contracts.hora_fin contracts.areaId contracts.shiftId contracts.areaShiftAssignments")
          .lean();
        const porUsuario = new Map(vinculos.map((v: any) => [String(v.userId), v]));
        for (const miembro of miembros) {
          const vinculo = porUsuario.get(String(miembro._id));
          miembro.metadata = { ...(miembro.metadata || {}), projects: vinculo ? [vinculo] : [] };
        }
      }
    }

    // --- Resolución de Metadata ---
    // Son búsquedas independientes entre sí: van en paralelo, no encadenadas.
    if (project.metadata) {
      const { responsableId, clienteId, sedeId, centroCostoId } = project.metadata;
      const externalProjId = project.metadata.id || project.externalId;

      const [responsable, cliente, sede, centroCosto, userCount] = await Promise.all([
        responsableId
          ? User.findOne({ tenantId: req.tenantObjectId, "metadata.id": responsableId })
              .select("firstName lastName email")
              .lean()
          : null,
        clienteId
          ? Client.findOne({
              tenantId: req.tenantObjectId,
              $or: [{ externalId: String(clienteId) }, { "metadata.clienteId": clienteId }],
            })
              .select("name email externalId")
              .lean()
          : null,
        sedeId ? Info.findOne({ type: "sede", "data.id": sedeId }).lean() : null,
        // Los dos catálogos, con la misma preferencia que el listado: ver el comentario de arriba.
        centroCostoId
          ? (async () => (await CentroCosto.findOne({ "data.id": centroCostoId }).lean()) || (await Info.findOne({ type: "centro-costo", "data.id": centroCostoId }).lean()))()
          : null,
        // Contar personas desde la colección users_&_projects
        externalProjId ? UserProject.countDocuments({ externalProjectId: externalProjId }) : null,
      ]);

      const resolutions: any = {};
      if (responsable) resolutions.responsable = responsable;
      if (cliente) resolutions.cliente = cliente;
      if (sede) resolutions.sede = sede;
      if (centroCosto) resolutions.centroCosto = centroCosto;

      (project as any).metadataResolutions = resolutions;

      // Fallback para clientId si no existe en el nivel superior
      if (!project.clientId && resolutions.cliente) {
        (project as any).clientId = resolutions.cliente;
      }

      if (userCount !== null) (project as any).metadataUserCount = userCount;
    }

    await resolveProjectGlobalConfig(project, req.tenantObjectId);

    res.json(project);
  } catch (error) {
    console.error("Get project error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Área/turno de un miembro en el proyecto, con la misma precedencia que usa la UI:
// `project.teamConfig` y, si ahí no está, las asignaciones de su último contrato.
function claveAreaTurnoDelMiembro(assignments: any[]): Set<string> {
  const keys = new Set<string>();
  for (const asa of assignments || []) {
    const areaId = asa?.areaId?._id || asa?.areaId;
    if (!areaId) continue;
    for (const sid of asa?.shiftIds || []) {
      const shiftId = sid?._id || sid;
      if (shiftId) keys.add(`${areaId}::${shiftId}`);
    }
  }
  return keys;
}

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

    const hoy = hoyArgentina();
    // Con `tenantId` el filtro usa el índice {tenantId, projectIds}; sin él recorría todos los usuarios.
    // Los contratos no se traen: la base devuelve sólo el que rige de cada uno.
    const [members, contratoDe] = await Promise.all([User.find({ tenantId: req.tenantObjectId, projectIds: projectId }).select("_id metadata.activo").lean(), contratosQueRigenDelProyecto(projectId, hoy)]);

    const configByUser = new Map<string, any>((project.teamConfig || []).map((c: any) => [String(c.userId), c]));
    const counts: Record<string, number> = {};
    // Ids por combinación: el front los usa para el total del área sin contar dos veces a quien
    // está en más de un turno de esa misma área.
    const userIds: Record<string, string[]> = {};

    for (const member of members) {
      if ((member as any).metadata?.activo !== true) continue;

      // Contrato que representa su situación actual (ver `contratosQueRigenDelProyecto`).
      const contratoActivo = contratoDe.get(String(member._id));
      if (!contratoActivo || !esContratoVigente(contratoActivo, hoy)) continue;

      let assignments: any[] = configByUser.get(String(member._id))?.areaShiftAssignments || [];
      if (assignments.length === 0) assignments = contratoActivo.areaShiftAssignments || [];

      // Un miembro cuenta UNA vez por combinación, aunque la tenga repetida en sus asignaciones.
      for (const key of claveAreaTurnoDelMiembro(assignments)) {
        counts[key] = (counts[key] || 0) + 1;
        (userIds[key] = userIds[key] || []).push(String(member._id));
      }
    }

    res.json({ counts, userIds });
  } catch (error) {
    console.error("Get area/shift counts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /projects/:projectId/area-shift-members?areaId=&shiftId=
// Detalle de las personas asignadas a un área + turno: estado del usuario, estado y fechas del
// contrato. Sin `shiftId` devuelve TODA el área, sumando sus horarios (cada persona una sola vez,
// con la lista de turnos que tiene ahí). `cuenta` marca a los que suman en el número de la columna
// Área/Turno Coordinada (activos con contrato vigente); los demás se devuelven igual para poder
// mostrarlos aparte y explicar la diferencia.
router.get("/projects/:projectId/area-shift-members", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId } = req.params;
    const { areaId, shiftId, shiftIds } = req.query;
    // `todos=true`: el estado de TODO el equipo, tenga área o no. Lo usa la Jerarquía para explicar
    // por qué alguien figura «sin área asignada» (sin contrato vigente, inactivo...).
    const todos = req.query.todos === "true";

    if (!areaId && !todos) {
      res.status(400).json({ error: "areaId es obligatorio" });
      return;
    }

    // Turnos a incluir: uno puntual (`shiftId`), varios (`shiftIds`, los que coordina esa persona)
    // o, si no viene ninguno, todos los del área.
    const turnosPedidos = shiftIds
      ? String(shiftIds)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : shiftId
        ? [String(shiftId)]
        : [];

    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("teamConfig").lean();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const hoy = hoyArgentina();
    // Igual que `area-shift-counts`: usuarios por índice y sólo el contrato que rige de cada uno.
    const [members, contratoDe] = await Promise.all([
      User.find({ tenantId: req.tenantObjectId, projectIds: projectId }).select("_id firstName lastName email metadata.activo").lean(),
      contratosQueRigenDelProyecto(String(projectId), hoy),
    ]);
    const configByUser = new Map<string, any>((project.teamConfig || []).map((c: any) => [String(c.userId), c]));
    const prefijoArea = `${areaId}::`;
    const rows: any[] = [];

    for (const member of members) {
      const contratoActivo = contratoDe.get(String(member._id)) || null;

      let assignments: any[] = configByUser.get(String(member._id))?.areaShiftAssignments || [];
      if (assignments.length === 0) assignments = contratoActivo?.areaShiftAssignments || [];
      const keys = claveAreaTurnoDelMiembro(assignments);

      // Turnos que la persona tiene en esta área, acotados a los pedidos (los que coordina quien abre el detalle).
      const turnosDelMiembro = [...keys].filter((k) => k.startsWith(prefijoArea)).map((k) => k.split("::")[1]!);
      const shiftIdsDelMiembro = turnosPedidos.length > 0 ? turnosDelMiembro.filter((s) => turnosPedidos.includes(String(s))) : turnosDelMiembro;
      if (!todos && shiftIdsDelMiembro.length === 0) continue;

      const activo = (member as any).metadata?.activo === true;
      const vigente = esContratoVigente(contratoActivo, hoy);

      rows.push({
        _id: member._id,
        firstName: (member as any).firstName || "",
        lastName: (member as any).lastName || "",
        email: (member as any).email || "",
        activo,
        vigente,
        cuenta: activo && vigente,
        shiftIds: shiftIdsDelMiembro,
        // Todas sus combinaciones "areaId::shiftId" del proyecto: con `todos=true` alcanza una sola
        // llamada para repartir a cada uno en sus turnos, en vez de una por área.
        claves: [...keys],
        nombreContrato: contratoActivo?.nombre_contrato || "",
        estadoContrato: contratoActivo?.nombre_estado_empleado || "",
        fechaAlta: contratoActivo?.fecha_alta_contrato || "",
        fechaBaja: contratoActivo?.fecha_baja_contrato || "",
      });
    }

    rows.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "es", { sensitivity: "base" }));

    res.json({ members: rows, total: rows.length, cuentan: rows.filter((r) => r.cuenta).length });
  } catch (error) {
    console.error("Get area/shift members error:", error);
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
      // A propósito NO se suma el alcance de Responsable de Proyecto: acá se EDITA. Tener un proyecto
      // a cargo explica por qué alguien necesita verlo, no por qué podría modificarlo.
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
      // Igual que en la edición: el alcance de Responsable de Proyecto es de LECTURA. Borrar sigue
      // pidiendo estar asignado.
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

/*
  PATCH /projects/:projectId/team-config/:userId/areas — el área y turno de UNA persona.

  Existe aparte del endpoint de abajo por dos razones. La primera es que ese reemplaza el array entero:
  con dos personas acomodando el mismo equipo a la vez, la última pisa a la otra sin que nadie se
  entere. Acá se toca un elemento y el resto ni se lee.

  La segunda es de alcance: esto lo usa el tab de jerarquía, donde se arrastra a alguien de un área a
  otra. Cambiar el área de un miembro no debería poder alterar de paso su horario ni si puede
  registrar novedades, y con un endpoint que manda todo junto eso depende de que el cliente reenvíe
  bien lo que no quiso tocar.

  NO toca contratos: el wizard lee el área de `teamConfig` primero y del contrato sólo como respaldo,
  así que arrastrar mal no altera un alta de ARCA ni un sueldo.
*/
router.patch("/projects/:projectId/team-config/:userId/areas", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId } = req.params;
    const { areaShiftAssignments } = asignarAreasSchema.parse(req.body);

    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId });
    if (!project) return res.status(404).json({ error: "Project not found" });

    const asignaciones = areaShiftAssignments.map((a) => ({
      areaId: new Types.ObjectId(a.areaId),
      shiftIds: a.shiftIds.map((s) => new Types.ObjectId(s)),
    }));

    const config: any[] = project.teamConfig || [];
    const entrada = config.find((c: any) => String(c.userId) === String(userId));

    if (entrada) {
      entrada.areaShiftAssignments = asignaciones;
    } else {
      // Alguien del equipo que todavía no tenía fila propia en `teamConfig`: se crea con los defaults
      // del modelo, sin inventarle horario.
      config.push({ userId: new Types.ObjectId(userId), canRegister: true, useProjectSchedule: true, areaShiftAssignments: asignaciones });
    }

    project.teamConfig = config;
    await project.save();

    res.json({ teamConfig: project.teamConfig });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Assign areas error:", error);
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

    const [sede, cat, estado, tipo, area, shift] = await Promise.all([
      Info.findOne({ type: "sede", "data.id": Number(contract.sede_id) }).lean(),
      // La categoría NO vive en `Info`: nunca hubo un solo documento de tipo "categoria-sat" ahí, así
      // que este lookup siempre devolvía null y todo contrato creado desde el wizard quedaba guardado
      // con `nombre_categoria_sat: "Sin categoria"`. Va contra el catálogo real.
      buscarCategoriaCompatPorLegacyId(Number(contract.categoria_sat_id)),
      Info.findOne({ type: "estado-empleado", "data.id": Number(contract.estado_id) }).lean(),
      Info.findOne({ type: "contrato", "data.id": Number(contract.tipo_contrato_id) }).lean(),
      isValidId(contract.areaId) ? Area.findById(contract.areaId).lean() : Promise.resolve(null),
      isValidId(contract.shiftId) ? Shift.findById(contract.shiftId).lean() : Promise.resolve(null),
    ]);

    // --- Validation: Check for overlapping shifts in OTHER projects only ---
    // Sanitize optional reference IDs (empty string -> null) to avoid BSON casting errors
    const sanitizeId = (id: any) => (id === "" || id === undefined) ? null : id;
    contract.areaId = sanitizeId(contract.areaId);
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

      // El wizard no conoce altaDocumentoUrl/altaDocumentoNombre (no hay campo para eso en el form),
      // así que `enrichedContract` nunca los trae. Como acá se reemplaza el subdocumento ENTERO, hay
      // que arrastrar el valor previo o el upload de "Alta AFIP/Servicios" desaparece en cuanto se
      // edite cualquier otra cosa del contrato.
      const prevContract = hasExplicitIndex ? userProject.contracts[idxNum] : isUpdate && userProject.contracts.length > 0 ? userProject.contracts[userProject.contracts.length - 1] : null;
      if (prevContract) {
        if ((enrichedContract as any).altaDocumentoUrl === undefined) (enrichedContract as any).altaDocumentoUrl = (prevContract as any).altaDocumentoUrl;
        if ((enrichedContract as any).altaDocumentoNombre === undefined) (enrichedContract as any).altaDocumentoNombre = (prevContract as any).altaDocumentoNombre;
      }

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
    /*
      APROBAR UNA SOLICITUD: la solicitud y quien recibe el contrato pueden ser DOS documentos.

      Una solicitud cargada desde la app es un usuario de paso (`solicitud_…@pending.com`) que apunta a
      la persona real en `metadata.solicitudUserId`; el contrato va en la ficha de ESA persona. Por eso
      `approveSolicitud` llega como el id de la solicitud: dando por sentado que era el mismo usuario,
      el contrato terminaba en el usuario de paso y la persona seguía sin contrato.

      Se sigue aceptando `true` para las solicitudes que no apuntan a nadie —el alta crea a la persona,
      así que solicitud y usuario son el mismo documento— y para un front que todavía no se actualizó.
    */
    const idSolicitud = typeof approveSolicitud === "string" && Types.ObjectId.isValid(approveSolicitud) ? String(approveSolicitud) : approveSolicitud ? String(userId) : "";
    let solicitudAprobada: any = null;
    if (idSolicitud) {
      // Quien recibe el contrato queda activo: ya está contratado y tiene que poder entrar.
      userUpdate.$set = { "metadata.activo": true };
      if (idSolicitud === String(userId)) {
        userUpdate.$set["metadata.isSolicitud"] = false;
        userUpdate.$set["metadata.solicitudStatus"] = "aprobada";
        solicitudAprobada = user;
      } else {
        solicitudAprobada = await User.findOneAndUpdate({ _id: idSolicitud, tenantId: req.tenantObjectId }, { $set: { "metadata.isSolicitud": false, "metadata.solicitudStatus": "aprobada" } });
      }
    }
    await User.findByIdAndUpdate(userId, userUpdate);

    /*
      AVISARLE A QUIEN PIDIÓ EL ALTA que se aprobó.

      Cierra el circuito que abre la solicitud: quien la cargó desde la app se enteraba sólo si volvía
      a mirar la pantalla. Va después de guardar todo, porque lo que se avisa es un contrato que ya está.
    */
    if (solicitudAprobada) {
      await notificar({
        tenantId: req.tenantObjectId!,
        destinatarios: [(solicitudAprobada.metadata as any)?.solicitudCreadaPor],
        type: NOVEDAD_SOLICITUD_APROBADA,
        title: "Solicitud aprobada",
        message: `${nombreDePersona(solicitudAprobada)} ya tiene contrato en ${project.name}.`,
        excepto: req.user!.userId,
      });
    }

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
    // Por `_id` cuando el cliente lo manda: el índice es una posición y puede haber cambiado.
    const idx = resolverIndiceContrato(up, index);
    if (idx < 0) {
      res.status(400).json({ error: "Contrato no encontrado" });
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

// PATCH /projects/:projectId/members/:userId/contracts/:index/empresa-contrato - Actualiza SOLO la
// Empresa del Contrato de un contrato puntual (por índice), sin tocar el resto de sus campos — para
// poder elegirla desde la tabla (p. ej. "Alta temprana de ARCA") sin abrir el wizard de "Configurar
// Miembro" completo. `nombre_empresa_contrato` se deriva acá mismo, igual que en /assign-member.
router.patch("/projects/:projectId/members/:userId/contracts/:index/empresa-contrato", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId, index } = req.params;
    const empresaContratoId = req.body?.empresaContratoId ? String(req.body.empresaContratoId) : "";
    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("_id").lean();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const up = await UserProject.findOne({ projectId, userId });
    // Por `_id` cuando el cliente lo manda: el índice es una posición y puede haber cambiado.
    const idx = up ? resolverIndiceContrato(up, index) : -1;
    if (!up || idx < 0) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }

    let nombreEmpresaContrato = "";
    /**
     * Aviso, no bloqueo: la obra social ya cargada puede no estar registrada por la empresa NUEVA.
     *
     * La regla "el RNOS tiene que estar entre las registradas por esa empleadora" es sobre el PAR
     * (obra social, empresa), así que también hay que mirarla cuando cambia la empresa — si no, se
     * evade cargando la obra social primero y eligiendo la empleadora después.
     *
     * Acá se avisa en vez de rechazar: el operador está eligiendo la EMPRESA, y negarle esa acción
     * por un dato cargado antes lo deja sin salida obvia. El bloqueo real está donde duele y no se
     * puede saltear: al generar el TXT.
     */
    let avisoObraSocial = "";
    if (empresaContratoId) {
      const empresa = await Company.findById(empresaContratoId).select("razonSocial obrasSocialesIds").lean();
      if (!empresa) {
        res.status(400).json({ error: "La empresa elegida no existe" });
        return;
      }
      nombreEmpresaContrato = (empresa as any).razonSocial || "";

      const osIdContrato = (up.contracts[idx] as any).obraSocialId;
      const registradas = ((empresa as any).obrasSocialesIds || []).map((id: any) => String(id));
      // Lista vacía = no se extrajo el padrón de esa empleadora. No se afirma nada sobre algo que no se sabe.
      if (osIdContrato && registradas.length > 0) {
        const os = await ObraSocial.findOne({ "data.id": Number(osIdContrato) }).select("_id name").lean();
        if (os && !registradas.includes(String((os as any)._id))) {
          avisoObraSocial = `La obra social de este contrato (${(os as any).name}) no está entre las que ${nombreEmpresaContrato} tiene registradas ante ARCA. El alta se va a rechazar: registrala en la ficha de la empresa o constatá otra para este contrato.`;
        }
      }
    }

    /**
     * Quitar la empleadora BORRA todo lo que dependía de ella.
     *
     * Los tres datos que salen del padrón de ESE CUIT —sucursal, actividad y la validación de la obra
     * social— dejan de tener sujeto sin empleadora. El contrato quedaba mostrando una sucursal
     * elegida y una obra social en verde, fija y con fecha, mientras arriba decía "Falta elegir la
     * empleadora": datos que ya no se podían sostener y que nadie iba a revisar, justamente porque se
     * veían resueltos.
     *
     * NO se toca lo que es del contrato o de la persona: categoría, convenio, fechas y retribución no
     * dependen de quién emplea.
     *
     * Al CAMBIAR de empleadora, en cambio, no se borra nada acá: la sucursal nueva se valida en su
     * propio endpoint y el RNOS es de la PERSONA, así que sigue siendo el mismo. Lo que cambia es si
     * la empleadora nueva lo tiene registrado, y eso ya se avisa (`avisoObraSocial`) y lo marca el
     * checklist en rojo. Borrarlo obligaría a rehacer una tanda entera por corregir la empresa, que
     * es castigar a alguien por arreglar un error.
     */
    const quitandoEmpleadora = !empresaContratoId;
    const contratoPrevio = (up.contracts[idx] as any).toObject();

    up.contracts[idx] = {
      ...contratoPrevio,
      empresaContratoId: empresaContratoId || null,
      nombre_empresa_contrato: nombreEmpresaContrato,
      ...(quitandoEmpleadora
        ? {
            sucursalArcaId: null,
            actividadArca: "",
            obraSocialId: null,
            obraSocialOrigen: undefined,
            obraSocialConstatadaEn: undefined,
            obraSocialConstatadaEl: null,
            obraSocialNoFigura: false,
            obraSocialBloqueada: false,
          }
        : {}),
    } as any;
    up.markModified("contracts");
    await up.save();

    // Se informa que se borró: es un efecto sobre OTRO campo, y en silencio se lee como que la
    // validación se perdió sola.
    const obraSocialLimpiada = quitandoEmpleadora && (contratoPrevio.obraSocialBloqueada === true || contratoPrevio.obraSocialId != null || contratoPrevio.obraSocialNoFigura === true);

    res.json({ empresaContratoId: empresaContratoId || null, nombre_empresa_contrato: nombreEmpresaContrato, avisoObraSocial, obraSocialLimpiada });
  } catch (error) {
    console.error("Update contract empresa-contrato error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Resuelve QUÉ contrato del member se está tocando, aceptando su `_id` o su índice.
 *
 * El índice es una POSICIÓN, no una identidad: cambia sola. El escenario real es que alguien abra el
 * contrato en posición 2, se vaya a constatar la obra social en la SSS (hay captcha, tarda), y
 * mientras tanto se elimine el contrato en posición 0. Al volver y guardar, el índice 2 ya apunta a
 * otro contrato: el dato se escribe en el alta equivocada, sin error y sin aviso.
 *
 * Por eso se prefiere el `_id` del subdocumento, que Mongoose genera para cada elemento del array.
 * Se sigue aceptando el índice para no romper a los clientes que todavía lo mandan, pero es el camino
 * viejo: el que manda un id no puede escribir en el contrato equivocado.
 *
 * Devuelve el índice resuelto, porque el resto del código escribe con `up.contracts[idx] = ...`.
 */
function resolverIndiceContrato(up: any, param: string): number {
  const esObjectId = /^[a-f\d]{24}$/i.test(String(param || ""));
  if (esObjectId) {
    return (up.contracts as any[]).findIndex((c: any) => String(c?._id || "") === String(param));
  }
  const idx = Number(param);
  return Number.isInteger(idx) && idx >= 0 && idx < up.contracts.length ? idx : -1;
}

/**
 * PATCH /projects/:projectId/members/:userId/contracts/:index/obra-social
 *
 * Fija la obra social de ESTE contrato (RNOS, pos. 40-45 del TXT). Body:
 *   { obraSocialId: number|null, origen: "constatada"|"manual", constatadaEn?: "sss"|"arca" }
 *   { noFigura: true, constatadaEn: "arca" }  ← se consultó y ARCA no devolvió obra social
 *   { ..., forzar: true }                     ← sobrescribir un valor ya sellado en ARCA
 *
 * Vive en el contrato y no en la persona: ARCA declara el RNOS en cada alta, y el dato caduca solo
 * por desregulación. Mandar `obraSocialId: null` la desfija y vuelve a resolver por la cascada
 * (convenio → excepción de la empresa → excluidos), que es el caso normal.
 *
 * VALIDACIÓN que no puede faltar: el RNOS tiene que estar entre las obras sociales que esa
 * empleadora tiene registradas ante ARCA. Sigue haciendo falta aunque el dato venga de ARCA: lo que
 * la pantalla de altas precompleta sale de la afiliación de la PERSONA (relaciones laborales
 * anteriores, con cualquier empleador), y no tiene por qué estar entre las que esta empleadora
 * declaró. Se avisa con 400 y el motivo, en vez de dejar pasar un dato que falla recién en la carga.
 */
router.patch("/projects/:projectId/members/:userId/contracts/:index/obra-social", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId, index } = req.params;
    const obraSocialId = req.body?.obraSocialId === null || req.body?.obraSocialId === "" ? null : Number(req.body?.obraSocialId);
    const origen = String(req.body?.origen || "manual") as "constatada" | "manual";
    const constatadaEn = req.body?.constatadaEn ? (String(req.body.constatadaEn) as "sss" | "arca") : undefined;
    /**
     * "No figura en el padrón" es un RESULTADO de la consulta, no la ausencia de uno. Se guarda con
     * `obraSocialId: null` —porque no figurar significa que corresponde la del convenio— pero
     * sellando la fecha, así el contrato deja de pedir que se vuelva a consultar.
     */
    const noFigura = req.body?.noFigura === true;

    if (obraSocialId !== null && !Number.isFinite(obraSocialId)) {
      res.status(400).json({ error: "Obra social inválida" });
      return;
    }
    if (noFigura && (!constatadaEn || !["sss", "arca"].includes(constatadaEn))) {
      res.status(400).json({ error: "Falta indicar dónde se consultó: arca (Registrar Nuevas Altas) o sss (padrón de beneficiarios)" });
      return;
    }
    if (!noFigura && !["constatada", "manual"].includes(origen)) {
      res.status(400).json({ error: "Origen inválido" });
      return;
    }
    // El enum se valida en el SERVER y no solo en el cliente: un `origen: "constatada"` mandado a
    // mano pintaría de verde algo que nadie constató, y el verde es lo que hace que no se vuelva a
    // mirar. Lo mismo con la fuente: "sss" y "arca" no son etiquetas libres, significan cosas
    // distintas sobre cuánto se le puede creer al dato.
    if (origen === "constatada" && (!constatadaEn || !["sss", "arca"].includes(constatadaEn))) {
      res.status(400).json({ error: "Falta indicar dónde se constató: arca (Registrar Nuevas Altas) o sss (padrón de beneficiarios)" });
      return;
    }

    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("_id").lean();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const up = await UserProject.findOne({ projectId, userId });
    // Por `_id` cuando el cliente lo manda: el índice puede haber cambiado mientras se constataba.
    const idx = up ? resolverIndiceContrato(up, index) : -1;
    if (!up || idx < 0) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }
    const contrato = up.contracts[idx] as any;

    /**
     * Lo que devolvió ARCA queda FIJO.
     *
     * Es la regla que pidió el negocio y tiene que vivir acá, no en la UI: ARCA es la autoridad que
     * después recibe el alta, así que su respuesta no se "mejora" con una elección a mano. Si el
     * campo quedara editable, un cambio posterior produciría un TXT que contradice al organismo que
     * lo va a validar — y el error aparecería recién en la carga, sin rastro de quién lo cambió.
     *
     * `forzar: true` es la única puerta, y existe por una razón concreta: el paso es manual y un
     * dígito mal tipeado quedaría clavado para siempre, sin más salida que editar la base a mano. El
     * cliente lo manda solo después de una confirmación explícita.
     */
    // Se lee el flag persistido. El fallback por `constatadaEn` cubre los contratos que se sellaron
    // antes de que el flag existiera: sin él, un valor viejo de ARCA quedaría editable.
    const selladaEnArca =
      contrato.obraSocialBloqueada === true || (contrato.obraSocialConstatadaEn === "arca" && (contrato.obraSocialId != null || contrato.obraSocialNoFigura === true));
    if (selladaEnArca && req.body?.forzar !== true) {
      const cuando = contrato.obraSocialConstatadaEl ? new Date(contrato.obraSocialConstatadaEl).toLocaleDateString("es-AR") : "";
      res.status(409).json({
        error: `La obra social de este contrato ya se constató en ARCA${cuando ? ` el ${cuando}` : ""} y queda fija. Si el dato está mal, desbloqueala y volvé a constatarla.`,
        selladaEnArca: true,
      });
      return;
    }

    if (obraSocialId !== null) {
      const os = await ObraSocial.findOne({ "data.id": obraSocialId }).select("_id name externalId").lean();
      if (!os) {
        res.status(400).json({ error: "Esa obra social no está en el catálogo. Cargala en Configuración → ARCA → Obras Sociales." });
        return;
      }
      // Solo se puede verificar si el contrato ya tiene empleadora. Sin ella no se sabe contra qué
      // padrón comparar, y no se inventa: se guarda igual y el checklist lo marca cuando se elija.
      if (contrato.empresaContratoId) {
        const empresa = await Company.findById(contrato.empresaContratoId).select("obrasSocialesIds razonSocial").lean();
        const registradas = ((empresa as any)?.obrasSocialesIds || []).map((id: any) => String(id));
        // Vacío = todavía no se extrajo el padrón de esa empleadora. No se bloquea por algo que no se sabe.
        if (registradas.length > 0 && !registradas.includes(String((os as any)._id))) {
          res.status(400).json({
            error: `${(os as any).name} no está entre las obras sociales que ${(empresa as any)?.razonSocial || "esta empleadora"} tiene registradas ante ARCA, así que el organismo va a rechazar el alta. Registrala en la ficha de la empresa (ARCA → Obras Sociales) y volvé a intentar.`,
          });
          return;
        }
      }
    }

    // "No figura" sella la consulta sin fijar obra social: el valor lo sigue poniendo el convenio.
    const sellaConstatacion = noFigura || (obraSocialId !== null && origen === "constatada");
    up.contracts[idx] = {
      ...contrato.toObject(),
      obraSocialId: noFigura ? null : obraSocialId,
      // Desfijarla borra también el rastro: dejar el origen de un valor que ya no está solo confunde.
      obraSocialOrigen: noFigura || obraSocialId === null ? undefined : origen,
      obraSocialConstatadaEn: sellaConstatacion ? constatadaEn : undefined,
      obraSocialConstatadaEl: sellaConstatacion ? new Date() : null,
      obraSocialNoFigura: noFigura,
      // Fijo solo si la respuesta vino de ARCA. "Cargar a mano" sigue siendo editable: no es lo que
      // dice el organismo, y bloquear una excepción cargada a mano dejaría clavado un dato sin fuente.
      obraSocialBloqueada: sellaConstatacion && constatadaEn === "arca",
    } as any;
    up.markModified("contracts");
    await up.save();

    const guardado = up.contracts[idx] as any;
    res.json({
      obraSocialId: guardado.obraSocialId ?? null,
      obraSocialOrigen: guardado.obraSocialOrigen || "",
      obraSocialConstatadaEn: guardado.obraSocialConstatadaEn || "",
      obraSocialConstatadaEl: guardado.obraSocialConstatadaEl || "",
      obraSocialNoFigura: !!guardado.obraSocialNoFigura,
      obraSocialBloqueada: !!guardado.obraSocialBloqueada,
    });
  } catch (error) {
    console.error("Update contract obra-social error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /projects/obras-sociales/quitar-lote
 *
 * Saca la obra social de varios contratos de una vez. Body:
 *   { contratos: [{ projectId, userId, contratoId }] }
 *
 * Cada contrato vuelve a quedar SIN VALIDAR: el valor lo resuelve otra vez la cascada del convenio y
 * el TXT no se puede generar hasta validarlo de nuevo en ARCA.
 *
 * POR QUÉ ES UN ENDPOINT Y NO UN BUCLE EN EL CLIENTE
 *
 * Es el mismo argumento que ya justifica `aplicar-lote`, y acá pesa más: veinte requests desde el
 * navegador dejan el resultado a mitad de camino ante cualquier corte, y sin forma de saber cuáles
 * entraron. En una operación que BORRA, quedarse sin saber qué se borró es el peor final posible.
 *
 * SIEMPRE FUERZA, y por eso el pedido tiene que llegar confirmado desde la UI. Lo que ARCA devolvió
 * queda fijo (ver el PATCH de más arriba, que contesta 409); quitar es justamente la puerta de salida
 * cuando el dato quedó mal, así que exigir `forzar` acá sería pedir dos veces lo mismo. Lo que no se
 * pierde es información de ARCA: el valor lo devuelve el organismo, no se carga a mano, y volver a
 * validar lo recupera.
 *
 * Devuelve `quitados` y el detalle de los que no se pudieron tocar, para que la pantalla pueda decir
 * exactamente qué pasó con cada uno en vez de un "listo" que puede ser mentira.
 */
router.post("/projects/obras-sociales/quitar-lote", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const pedidos = Array.isArray(req.body?.contratos) ? req.body.contratos : [];
    if (pedidos.length === 0) {
      res.status(400).json({ error: "No vino ningún contrato." });
      return;
    }

    const quitados: Array<{ projectId: string; userId: string; contratoId: string }> = [];
    const fallidos: Array<{ projectId: string; userId: string; contratoId: string; motivo: string }> = [];

    // Ver `agruparContratosPorDocumento`: agrupar no es una optimización, es lo que evita que una
    // operación masiva pierda cambios en silencio. Está aparte para poder probarlo sin base de datos.
    const { porDocumento, invalidos } = agruparContratosPorDocumento(pedidos);
    for (const it of invalidos) fallidos.push({ ...it, motivo: "Faltan datos del contrato." });

    for (const [clave, items] of porDocumento) {
      const { projectId, userId } = partirClaveDocumento(clave);
      const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("_id").lean();
      if (!project) {
        for (const it of items) fallidos.push({ ...it, motivo: "El proyecto no existe o es de otro tenant." });
        continue;
      }
      const up = await UserProject.findOne({ projectId, userId });
      if (!up) {
        for (const it of items) fallidos.push({ ...it, motivo: "La persona no está en ese proyecto." });
        continue;
      }

      let toco = false;
      for (const it of items) {
        const idx = resolverIndiceContrato(up, it.contratoId);
        if (idx < 0) {
          fallidos.push({ ...it, motivo: "Contrato no encontrado." });
          continue;
        }
        const contrato = (up.contracts[idx] as any).toObject ? (up.contracts[idx] as any).toObject() : up.contracts[idx];
        up.contracts[idx] = {
          ...contrato,
          obraSocialId: null,
          // Se borra también el rastro: dejar el origen y la fecha de un valor que ya no está solo
          // confunde. Es lo mismo que hace el PATCH de a uno al desfijarla.
          obraSocialOrigen: undefined,
          obraSocialConstatadaEn: undefined,
          obraSocialConstatadaEl: null,
          obraSocialNoFigura: false,
          obraSocialBloqueada: false,
        } as any;
        quitados.push(it);
        toco = true;
      }

      if (toco) {
        up.markModified("contracts");
        await up.save();
      }
    }

    res.json({ quitados: quitados.length, fallidos });
  } catch (error) {
    console.error("Quitar lote obras sociales error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /projects/obras-sociales/aplicar-lote
 *
 * Aplica de una vez lo que ARCA devolvió para una tanda de CUIL. Body:
 *   { empresaId: string, filas: [{ cuil: string, rnos: string }] }
 *
 * `rnos` vacío significa que ARCA no devolvió obra social para ese CUIL: se registra como consultado
 * —igual que el "No devolvió ninguna" del modal— y rige la del convenio.
 *
 * Con `previsualizar: true` calcula exactamente lo mismo y NO escribe nada. La previsualización usa
 * este mismo código a propósito: una que recorra otro camino puede prometer un resultado distinto al
 * que después ocurre, y entonces no sirve para decidir.
 *
 * Existe porque la constatación es de a una PANTALLA pero de a muchas PERSONAS: el operador entra a
 * ARCA una vez y sale con 26 respuestas. Aplicarlas con 26 requests desde el cliente dejaba el
 * resultado a mitad de camino ante cualquier corte, y sin forma de saber cuáles entraron.
 *
 * Se direcciona por CUIL y no por contrato porque eso es lo único que ARCA conoce. La traducción
 * CUIL → contratos la hace el server, y NO es 1 a 1: una persona puede tener varios contratos en la
 * misma empleadora. Todos reciben la misma obra social —el RNOS es de la persona, aunque se declare
 * por alta— y la respuesta dice a cuántos alcanzó cada fila.
 *
 * Se acota a UNA empleadora a propósito: la validación de "está entre las registradas ante ARCA" es
 * por CUIT, y mezclar empleadoras en una tanda haría que el mismo RNOS sea válido para unas filas e
 * inválido para otras dentro del mismo lote.
 */
router.post("/projects/obras-sociales/aplicar-lote", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const resultado = await aplicarLoteObrasSociales({
      tenantObjectId: req.tenantObjectId,
      empresaId: String(req.body?.empresaId || ""),
      filas: Array.isArray(req.body?.filas) ? req.body.filas : [],
      previsualizar: req.body?.previsualizar === true,
      origen: "panel",
      usuarioId: req.user?.userId,
    });

    /*
      El mismo chequeo de nombre que hace la corrida del servidor, para que los dos caminos dejen a
      la persona igual: por acá entra el Asistente, que lee las obras sociales desde el Chrome de
      alguien y después manda las filas.

      No en la previsualización: previsualizar no escribe nada, y confirmar un nombre escribe.
      Se espera el resultado (el cliente refresca enseguida y con `void` vería el nombre viejo), pero
      cualquier fallo se traga: corregir un nombre no puede hacer fallar la aplicación del lote.
    */
    let renombrados: Renombre[] = [];
    if (req.body?.previsualizar !== true) {
      try {
        /*
          Se compara con el nombre que ARCA mostró en la pantalla y que viene en cada fila, y SOLO se
          consulta el padrón por los que difieren — igual que la corrida del servidor.

          Sin `nombreArca` no se consulta nada: preguntarle al padrón por las veinte personas «por las
          dudas» es el doble de trabajo contra el mismo organismo para confirmar lo que la pantalla
          que se acaba de leer ya decía.
        */
        const filas = (Array.isArray(req.body?.filas) ? req.body.filas : []).filter((f: any) => f?.nombreArca);
        if (filas.length > 0) {
          const users = await usuariosDeCuils(req.tenantObjectId, filas.map((f: any) => String(f.cuil || "")));
          const difieren = filas
            .map((f: any) => ({ f, u: users.get(String(f.cuil || "").replace(/\D/g, "")) }))
            // Quien ya tiene el sello no se vuelve a consultar: ARCA ya confirmó ese nombre.
            .filter(({ f, u }: any) => u && !u?.metadata?.nombreValidadoArcaAt && !mismoNombre(String(f.nombreArca), `${u.firstName || ""} ${u.lastName || ""}`))
            .map(({ u }: any) => String(u._id));
          if (difieren.length > 0) {
            renombrados = (await confirmarNombresConElPadron({ tenantObjectId: req.tenantObjectId, tenantId: String(req.tenantObjectId), userIds: difieren })).renombrados;
          }
        }
      } catch {
        /* best-effort */
      }
    }

    res.json({ ...resultado, renombrados });
  } catch (error: any) {
    if (error instanceof LoteObrasSocialesError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Aplicar lote obras sociales error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /contratos/obras-sociales/pendientes?empresa=<id>
 *
 * Los CUIL que le faltan constatar a una empleadora. Existe para que el script que opera ARCA no
 * tenga que replicar el criterio de "sin validar": replicarlo es cómo se termina consultando gente
 * que ya estaba resuelta, o salteando gente que faltaba.
 */
/**
 * POST /contratos/obras-sociales/validar-servidor   { empresaId }
 *
 * Dispara la validación contra ARCA desde el SERVIDOR, con el usuario delegado de clave fiscal.
 * Vuelve enseguida: la corrida dura minutos y se sigue por el GET de abajo.
 *
 * Los CUIL salen de `pendientesObraSocial`, la MISMA función que alimenta el contador de la grilla:
 * pedirle al cliente que mande la lista permitiría validar a alguien que la pantalla no mostró.
 */
router.post("/contratos/obras-sociales/validar-servidor", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const empresaId = String(req.body?.empresaId || "");
    const todosLosPendientes = await pendientesObraSocial(req.tenantObjectId, empresaId);

    /*
      LA SELECCIÓN DEL CLIENTE ACOTA, NUNCA AMPLÍA.

      Los CUIL siguen saliendo de `pendientesObraSocial` —el server decide quién está pendiente, y
      nadie que la pantalla no haya mostrado puede colarse—, pero si el cliente manda una lista, se
      INTERSECTA con ella.

      Sin esto, validar la obra social de UNA persona desde su modal abría ARCA y procesaba a las
      veinte pendientes de la empleadora: veinte bloques cargados y borrados en el navegador del
      servidor, minutos, para un dato de una sola. El contador lo mostraba sin disimulo — «20 de 1».
    */
    const pedidos = new Set(
      (Array.isArray(req.body?.cuils) ? req.body.cuils : [])
        .map((c: unknown) => String(c || "").replace(/\D/g, ""))
        .filter((c: string) => c.length === 11),
    );
    const pendientes = pedidos.size > 0 ? todosLosPendientes.filter((p) => pedidos.has(String(p.cuil || "").replace(/\D/g, ""))) : todosLosPendientes;
    const cuils = pendientes.map((p) => String(p.cuil || "").replace(/\D/g, "")).filter((c) => c.length === 11);

    const r = await arrancarCorrida({
      tenantId: String(req.tenantObjectId),
      tenantObjectId: req.tenantObjectId,
      empresaId,
      cuils,
      usuarioId: req.user?.userId,
      // Las personas de esta corrida: además de la obra social se les confirma el nombre contra el
      // padrón, con la misma regla que «Validar CUIT».
      userIds: [...new Set(pendientes.map((p) => p.userId).filter(Boolean))],
    });
    res.json({ arrancada: true, ...r });
  } catch (error: any) {
    if (error instanceof LoteObrasSocialesError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    // Los errores de esta ruta son casi todos «falta configurar algo» y su texto ES la instrucción:
    // 400 con el mensaje, no un 500 que obliga a ir a los logs del VPS.
    res.status(400).json({ error: String(error?.message || "No se pudo arrancar la validación.") });
  }
});

/**
 * GET /contratos/obras-sociales/validar-servidor
 *
 * El estado de la corrida en curso (o de la última). Se consulta por polling y no por SSE a
 * propósito: son minutos y unos pocos eventos, y un stream abierto contra la API agrega una conexión
 * viva por pestaña para ahorrar un request cada dos segundos.
 *
 * Devuelve TODOS los eventos, no solo los nuevos: así una pantalla que se abre a mitad de camino ve
 * lo que ya pasó en vez de arrancar en blanco.
 */
router.get("/contratos/obras-sociales/validar-servidor", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  const c = corridaDe(String(req.tenantObjectId));
  if (!c) {
    res.json({ hay: false, corriendo: false, eventos: [] });
    return;
  }
  res.json({ hay: true, corriendo: !c.terminada, empresaId: c.empresaId, total: c.total, arrancadaEl: c.arrancadaEl, eventos: c.eventos });
});

/** POST /contratos/obras-sociales/validar-servidor/detener — lo ya guardado queda guardado. */
router.post("/contratos/obras-sociales/validar-servidor/detener", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  res.json({ detenida: detenerCorrida(String(req.tenantObjectId)) });
});

router.get("/contratos/obras-sociales/pendientes", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const empresa = String(req.query?.empresa || "");
    const pendientes = await pendientesObraSocial(req.tenantObjectId, empresa);
    res.json(pendientes);
  } catch (error: any) {
    if (error instanceof LoteObrasSocialesError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Pendientes obras sociales error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /contratos/obras-sociales/constatar
 *
 * La punta de escritura del camino automático. Body:
 *   { empresa, origen: "script", items: [{ cuil, rnos }], dryRun?, forzar? }
 *
 * Corre EXACTAMENTE la misma validación que el panel de pegado —mismo servicio— porque escribir por
 * API saltea la previsualización humana que hasta ahora era la última red. La regla de catálogo
 * ("este RNOS existe y la empleadora lo tiene registrado ante ARCA") vivía en el navegador; acá está
 * del lado del server, donde no se puede saltear.
 *
 * Es idempotente por contrato: lo ya constatado queda bloqueado y no se pisa, así que el mismo lote
 * dos veces no cambia nada la segunda vez.
 */
router.post("/contratos/obras-sociales/constatar", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const r = await aplicarLoteObrasSociales({
      tenantObjectId: req.tenantObjectId,
      empresaId: String(req.body?.empresa || req.body?.empresaId || ""),
      filas: Array.isArray(req.body?.items) ? req.body.items : [],
      previsualizar: req.body?.dryRun === true,
      forzar: req.body?.forzar === true,
      origen: req.body?.origen === "panel" ? "panel" : "script",
      usuarioId: req.user?.userId,
    });
    // Se traduce a la forma que el script entiende: cuántas entraron y, de las que no, POR QUÉ. Un
    // "rechazadas: 3" sin motivo obliga a adivinar entre catálogo, empleadora y ya-constatada, que se
    // arreglan de tres formas distintas.
    const rechazadas = [
      ...r.rnosDesconocido.map((x) => ({ ...x, motivo: "El código no está en el catálogo de Obras Sociales." })),
      ...r.noRegistrada.map((x) => ({ cuil: x.cuil, rnos: x.rnos, motivo: `«${x.nombre}» no está entre las obras sociales que la empleadora tiene registradas ante ARCA.` })),
      ...r.yaBloqueados.map((cuil) => ({ cuil, rnos: "", motivo: "Ya estaba constatada: no se pisa (usá forzar para reemplazarla)." })),
      ...r.sinContrato.map((cuil) => ({ cuil, rnos: "", motivo: "No tiene ningún contrato con esa empleadora." })),
    ];
    res.json({ aplicadas: r.aplicados, contratosAlcanzados: r.contratosAlcanzados, sinObraSocial: r.noFigura, rechazadas, dryRun: r.previsualizacion });
  } catch (error: any) {
    if (error instanceof LoteObrasSocialesError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error("Constatar obras sociales error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /projects/:projectId/members/:userId/contracts/:index/sucursal-arca - Elige la sucursal del
// padrón de ARCA (domicilio de desempeño) de un contrato puntual, igual que empresa-contrato.
//
// Solo se admiten sucursales asignadas a la empresa empleadora del contrato: el código sale del
// padrón de ESE CUIT, así que una sucursal de otra empresa daría un alta válida para ARCA pero mal
// declarada. Al cambiar de sucursal se limpia `actividadArca`, porque las actividades son de la
// sucursal y la elegida antes puede no existir en la nueva.
router.patch("/projects/:projectId/members/:userId/contracts/:index/sucursal-arca", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId, index } = req.params;
    const sucursalArcaId = req.body?.sucursalArcaId ? String(req.body.sucursalArcaId) : "";
    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("_id").lean();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const up = await UserProject.findOne({ projectId, userId });
    // Por `_id` cuando el cliente lo manda: el índice es una posición y puede haber cambiado.
    const idx = up ? resolverIndiceContrato(up, index) : -1;
    if (!up || idx < 0) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }

    const contrato = up.contracts[idx] as any;
    if (sucursalArcaId) {
      if (!contrato.empresaContratoId) {
        res.status(400).json({ error: "Primero hay que elegir la Empresa del Contrato: la sucursal sale de su padrón de ARCA" });
        return;
      }
      const empresa = await Company.findById(contrato.empresaContratoId).select("sucursalIds razonSocial").lean();
      const asignada = ((empresa as any)?.sucursalIds || []).some((id: any) => String(id) === sucursalArcaId);
      if (!asignada) {
        res.status(400).json({ error: "Esa sucursal no está asignada a la empresa del contrato. Asignásela en Configuración → Empresas." });
        return;
      }
    }

    const cambioDeSucursal = String(contrato.sucursalArcaId || "") !== sucursalArcaId;
    up.contracts[idx] = {
      ...contrato.toObject(),
      sucursalArcaId: sucursalArcaId || null,
      actividadArca: cambioDeSucursal ? "" : contrato.actividadArca || "",
    } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ sucursalArcaId: sucursalArcaId || null, actividadArca: cambioDeSucursal ? "" : contrato.actividadArca || "" });
  } catch (error) {
    console.error("Update contract sucursal-arca error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /projects/:projectId/members/:userId/contracts/:index/actividad-arca - Elige la actividad
// del domicilio de desempeño de un contrato puntual.
//
// Solo hace falta cuando la sucursal del contrato tiene MÁS DE UNA actividad declarada (ARCA lo
// permite). Con una sola, el contrato la hereda y este campo queda vacío. Se valida contra las
// actividades realmente declaradas para esa sucursal: sin esto se podría guardar un código de otro
// domicilio, que es exactamente el bug que este cambio vino a arreglar.
router.patch("/projects/:projectId/members/:userId/contracts/:index/actividad-arca", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId, index } = req.params;
    const actividadArca = req.body?.actividadArca ? String(req.body.actividadArca).replace(/\D/g, "") : "";
    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("_id").lean();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const up = await UserProject.findOne({ projectId, userId });
    // Por `_id` cuando el cliente lo manda: el índice es una posición y puede haber cambiado.
    const idx = up ? resolverIndiceContrato(up, index) : -1;
    if (!up || idx < 0) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }

    const contrato = up.contracts[idx] as any;
    if (actividadArca) {
      /*
        LA SUCURSAL SE RESUELVE COMO LA LEE EL FRONT: la del contrato, y si no eligió ninguna, la que
        la empleadora dejó marcada con ★.

        Preguntar solo por `contrato.sucursalArcaId` rechazaba con «Primero hay que elegir la
        Sucursal» a alguien que la está viendo puesta en pantalla: el default se RESUELVE al leer y no
        se escribe, así que el contrato no lo tiene aunque el domicilio esté decidido. La regla de
        resolución tiene que ser la misma de los dos lados o el formulario ofrece algo que la ruta
        niega.
      */
      /*
        Los TRES escalones, en el mismo orden que el front: contrato → empleadora → instalación.

        El global se toma solo si esta empleadora tiene ese domicilio declarado: el código de
        domicilio es POR CUIT, así que uno global puede no existir para este CUIT y ARCA rechazaría el
        alta. Mejor pedir que se elija a mandar un código que el organismo no reconoce.
      */
      const empresaDelContrato = contrato.empresaContratoId ? await Company.findById(contrato.empresaContratoId).select("defaultsArca.sucursalId sucursalIds").lean() : null;
      const globalDefaults = await getArcaDefaults();
      const sucursalGlobal = globalDefaults.sucursalId ? String(globalDefaults.sucursalId) : "";
      const sucursalesDeLaEmpresa = ((empresaDelContrato as any)?.sucursalIds || []).map(String);
      const globalAplica = sucursalGlobal && sucursalesDeLaEmpresa.includes(sucursalGlobal);
      const sucursalId = contrato.sucursalArcaId || (empresaDelContrato as any)?.defaultsArca?.sucursalId || (globalAplica ? sucursalGlobal : null);
      if (!sucursalId) {
        res.status(400).json({ error: "Primero hay que elegir la Sucursal: las actividades son del domicilio de desempeño" });
        return;
      }
      const sucursal = await ArcaSucursal.findById(sucursalId).select("actividades codigo").lean();
      if (!sucursal) {
        res.status(400).json({ error: "La sucursal del contrato ya no existe en el catálogo" });
        return;
      }
      const declarada = ((sucursal as any).actividades || []).some((a: any) => String(a.codigo) === actividadArca);
      if (!declarada) {
        res.status(400).json({ error: `Esa actividad no está declarada para la sucursal ${(sucursal as any).codigo}` });
        return;
      }
    }

    up.contracts[idx] = { ...contrato.toObject(), actividadArca } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ actividadArca });
  } catch (error) {
    console.error("Update contract actividad-arca error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH .../contracts/:index/categoria-sat — cambia la categoría profesional de UN contrato.
 *
 * POR QUÉ ES UNA RUTA Y NO UN CAMPO MÁS DEL GUARDADO DEL WIZARD
 *
 * La categoría es lo ÚNICO del encuadre convencional que viaja a ARCA (pos. 101-106): el convenio va
 * en blanco y el organismo lo deduce de ella. Hasta ahora solo se podía cambiar desde el wizard del
 * miembro, así que desde «Datos ARCA» —que es donde se está mirando el alta— había que salir, abrir
 * otra pantalla y volver.
 *
 * LOS SUELDOS SE RECALCULAN ACÁ, y esa es la razón de que esto no sea un `$set` de un campo.
 *
 * El contrato guarda `sueldo_neto`, `sueldo_bruto`, `sueldo_diario_neto` y `diferencia_diaria_neto`
 * DERIVADOS de la categoría. El wizard los recalcula en un efecto; una ruta que escribiera solo
 * `categoria_sat_id` dejaría el contrato con la categoría de un convenio y el sueldo de otro, sin que
 * nada avisara. Las fórmulas son las mismas que las del wizard, a propósito: si alguna vez cambian,
 * tienen que cambiar en los dos lados.
 *
 * `sueldo_mano` y su versión en letras NO se tocan: salen de `sueldo_jornada × jornadas`, que es lo
 * que se pactó con la persona y no depende de la categoría.
 */
router.patch("/projects/:projectId/members/:userId/contracts/:index/categoria-sat", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId, index } = req.params;
    /*
      `null` LIMPIA la categoría, no es un error de entrada.

      Cambiar de convenio con una categoría de otro deja al contrato en un estado que ARCA rechaza:
      la categoría manda al archivo y el convenio que el organismo deduce de ella no es el que se
      eligió. Dejarla ahí «hasta que alguien la corrija» es lo que produce altas rechazadas, así que
      se limpia y el checklist la marca como faltante — que es lo que de verdad es.
    */
    const limpiar = req.body?.categoriaSatId === null;
    const categoriaSatId = Number(req.body?.categoriaSatId);
    if (!limpiar && (!Number.isFinite(categoriaSatId) || categoriaSatId <= 0)) {
      res.status(400).json({ error: "Falta la categoría." });
      return;
    }
    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("_id").lean();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const up = await UserProject.findOne({ projectId, userId });
    const idx = up ? resolverIndiceContrato(up, index) : -1;
    if (!up || idx < 0) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }

    /*
      SE RESUELVE POR LA MISMA VISTA QUE LEE EL FRONT, no por la colección `categorias-sat`.

      Acá había un bug de verdad: consultar `CategoriaSat` directo. El catálogo real ya no es esa
      colección —es `convenio → grupo (escala) → categoría`, y `categorias-sat` quedó como tabla
      vieja—; lo que el front lista viene aplanado por `listarCategoriasCompat`. El `findOne` no
      encontraba nada y la ruta contestaba «esa categoría no existe en el catálogo» para categorías
      que el usuario estaba viendo en pantalla.

      `buscarCategoriaCompatPorLegacyId` busca en el modelo nuevo y cae a la tabla vieja si la
      migración todavía no corrió en esa base — que es la misma regla que usa la lectura.
    */
    if (limpiar) {
      const contrato = up.contracts[idx] as any;
      // Los sueldos derivados vuelven a 0 con ella: son de la escala de ESA categoría, y dejarlos
      // sería mostrar el sueldo de un encuadre que ya no está.
      up.contracts[idx] = { ...contrato.toObject(), categoria_sat_id: null, nombre_categoria_sat: "", sueldo_neto: 0, sueldo_bruto: 0, sueldo_diario_neto: 0, diferencia_diaria_neto: 0 } as any;
      up.markModified("contracts");
      await up.save();
      res.json({ categoria_sat_id: null, nombre_categoria_sat: "", sueldo_neto: 0, sueldo_bruto: 0, sueldo_diario_neto: 0, diferencia_diaria_neto: 0 });
      return;
    }

    const cat: any = await buscarCategoriaCompatPorLegacyId(categoriaSatId);
    if (!cat) {
      res.status(400).json({ error: "Esa categoría no existe en el catálogo." });
      return;
    }
    // Las no elegibles son alias que existen solo para resolver contratos históricos: sirven para
    // LEER uno ya cargado, no para elegir. Guardarla acá sería cargar a mano lo que el catálogo marcó
    // como no ofrecible.
    if (cat.isActive === false) {
      res.status(400).json({ error: "Esa categoría no se puede elegir: quedó como alias de una anterior." });
      return;
    }

    const contrato = up.contracts[idx] as any;
    const jornada = Number(contrato.sueldo_jornada || 0);
    const sueldo_neto = Number(Number(cat.data?.neto ?? 0).toFixed(2));
    const sueldo_bruto = Number(Number(cat.data?.sueldoBruto ?? 0).toFixed(2));
    const sueldo_diario_neto = Number((sueldo_neto / 30).toFixed(2));
    const diferencia_diaria_neto = Number((jornada - sueldo_diario_neto).toFixed(2));

    up.contracts[idx] = {
      ...contrato.toObject(),
      categoria_sat_id: categoriaSatId,
      nombre_categoria_sat: cat.name || "",
      sueldo_neto,
      sueldo_bruto,
      sueldo_diario_neto,
      diferencia_diaria_neto,
    } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ categoria_sat_id: categoriaSatId, nombre_categoria_sat: cat.name || "", sueldo_neto, sueldo_bruto, sueldo_diario_neto, diferencia_diaria_neto });
  } catch (error) {
    console.error("Update contract categoria-sat error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /projects/:projectId/members/:userId/contracts/:index/empresa-release - Igual que
// empresa-contrato de arriba, pero para la Empresa del Release (no es obligatoria).
router.patch("/projects/:projectId/members/:userId/contracts/:index/empresa-release", requireTenant, authenticateToken, requireAnyRole, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId, index } = req.params;
    const empresaReleaseId = req.body?.empresaReleaseId ? String(req.body.empresaReleaseId) : "";
    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("_id").lean();
    if (!project) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    const up = await UserProject.findOne({ projectId, userId });
    // Por `_id` cuando el cliente lo manda: el índice es una posición y puede haber cambiado.
    const idx = up ? resolverIndiceContrato(up, index) : -1;
    if (!up || idx < 0) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }

    let nombreEmpresaRelease = "";
    if (empresaReleaseId) {
      const empresa = await Company.findById(empresaReleaseId).select("razonSocial").lean();
      if (!empresa) {
        res.status(400).json({ error: "La empresa elegida no existe" });
        return;
      }
      nombreEmpresaRelease = (empresa as any).razonSocial || "";
    }

    up.contracts[idx] = {
      ...(up.contracts[idx] as any).toObject(),
      empresaReleaseId: empresaReleaseId || null,
      nombre_empresa_release: nombreEmpresaRelease,
    } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ empresaReleaseId: empresaReleaseId || null, nombre_empresa_release: nombreEmpresaRelease });
  } catch (error) {
    console.error("Update contract empresa-release error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /projects/:projectId/members/:userId/contracts/:index/alta-documento - Sube (o reemplaza) el
// PDF de "Alta" (AFIP/Servicios) de UN contrato puntual (por índice).
router.patch(
  "/projects/:projectId/members/:userId/contracts/:index/alta-documento",
  requireTenant,
  authenticateToken,
  requireAnyRole,
  uploadAltaDocumento,
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const { projectId, userId, index } = req.params;
      if (!req.file) {
        res.status(400).json({ error: "No se recibió ningún archivo" });
        return;
      }

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
      // Por `_id` cuando el cliente lo manda: el índice es una posición y puede haber cambiado.
      const idx = resolverIndiceContrato(up, index);
      if (idx < 0) {
        res.status(400).json({ error: "Contrato no encontrado" });
        return;
      }

      const tenantId = req.tenantId || "unknown_tenant";
      const altaDocumentoUrl = `/storage/${tenantId}/${userId}/contratos/${req.file.filename}`;
      const altaDocumentoNombre = req.file.originalname;

      // Reemplazo: borrar el archivo anterior del disco (best-effort, no bloquea la respuesta).
      const anterior = (up.contracts[idx] as any)?.altaDocumentoUrl;
      if (anterior && typeof anterior === "string") {
        const anteriorPath = path.join(__dirname, "../..", anterior.replace(/^\/storage\//, "storage/"));
        fs.promises.unlink(anteriorPath).catch(() => {});
      }

      up.contracts[idx] = { ...(up.contracts[idx] as any).toObject(), altaDocumentoUrl, altaDocumentoNombre } as any;
      up.markModified("contracts");
      await up.save();

      res.json({ altaDocumentoUrl, altaDocumentoNombre });
    } catch (error) {
      console.error("Upload alta-documento error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

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
