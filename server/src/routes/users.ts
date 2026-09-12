import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Project } from "../models/Project.js";
import { Tenant } from "../models/Tenant.js";
import { getTenantAfipConfig, consultarPadron } from "../services/afipService.js";
import { usuarioExistenteConCuit } from "../services/arca/consultaCuit.js";
import { cuitEsValido, normalizarCuit } from "../utils/constanciaPdf.js";
import { MOBILE_ACTIVITY_LOGS, MOBILE_USERS, permisosDeRoles, permisosDeRolesIds } from "../utils/permisosMobile.js";
import { Info } from "../models/Info.js";
import { RoleFrame } from "../models/RoleFrame.js";
import UserProject from "../models/UserProject.js"; // This registers the model
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { Client } from "../models/Client.js";
import { Company } from "../models/Company.js";
import bcrypt from "bcryptjs";

// Side-effect imports to be extra sure they are registered
import "../models/User.js";
import "../models/Role.js";
import "../models/Project.js";
import "../models/Tenant.js";
import "../models/Info.js";
import "../models/RoleFrame.js";
import "../models/UserProject.js";
import "../models/Area.js";
import "../models/Client.js";

import { ImportConfig } from "../models/ImportConfig.js";
import { ImportHistory } from "../models/ImportHistory.js";
import { ExternalApiService } from "../services/externalApiService.js";

import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyPermission, requirePermission } from "../middleware/permissions.js";
import { toObjectIdArray } from "../utils/mongoIds.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";
import { esContratoVigente, getContratoActivo } from "../utils/contratoVigencia.js";
import { claveEstado } from "../utils/estadoClave.js";

const router = Router();

/* ------------------- Filtros del equipo de un proyecto (client-side → server) -------------------
 * Estos filtros dependen del ÚLTIMO contrato del miembro en el proyecto o de su asignación de
 * área/turno, así que no se pueden expresar como query de Mongo. Se resuelven acá y se aplican al
 * listado como `_id in [...]`: de esa forma la paginación devuelve los resultados correlativos en
 * vez de filtrar solo la página ya cargada. Replican exactamente el criterio que usaba el front.
 */

/*
  La clave can\u00f3nica del estado sale de `utils/estadoClave.ts`, no de una copia local.

  Estaba escrita ac\u00e1 con sus alias (\u00abFalta pedido de AFIP\u00bb y \u00abPedido de AFIP\u00bb son el mismo estado) y
  la misma tabla viv\u00eda adem\u00e1s en el front. Con tres copias, agregar un alias en una y olvidarlo en
  otra hace que un contrato se encuentre desde una pantalla y no desde la otra \u2014 que es exactamente
  el tipo de bug que no se ve hasta que un filtro devuelve de menos.
*/
const estadoCanonico = claveEstado;


interface TeamFilters {
  vigencia?: string; // "vigente" | "novigente"
  tipoContrato?: string; // nombre_contrato exacto
  estadoContrato?: string; // etiqueta canónica del estado
  areaTurno?: string; // "__none__" | "areaId::shiftId"
  reemplazo?: string; // "con" | "sin"
}

async function resolveProjectTeamFilterIds(projectId: string, filtros: TeamFilters): Promise<Types.ObjectId[]> {
  const project: any = await Project.findById(projectId).select("teamConfig coordinatorAssignments").lean();
  if (!project) return [];

  const members = await User.find({ projectIds: projectId })
    .select("_id firstName lastName roles metadata.projects")
    .populate({ path: "roles", select: "name permissions", model: Role })
    .populate({
      path: "metadata.projects",
      model: UserProject,
      // `fecha_alta_contrato` y `fecha_carga` son obligatorios: `getContratoActivo` los usa para
      // desempatar cuál es el contrato más reciente. Sin ellos, todos los contratos quedan con la
      // misma "antigüedad" y el filtro termina resolviendo el contrato activo de forma distinta a
      // como lo calcula el front (con los datos completos) — el filtro matchea un estado que
      // después la tabla no muestra para esa misma persona.
      select: "projectId contracts.areaShiftAssignments contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.fecha_carga contracts.nombre_contrato contracts.nombre_estado_empleado contracts.reemplazo",
    })
    .lean();

  const configByUser = new Map<string, any>((project.teamConfig || []).map((c: any) => [String(c.userId), c]));

  /*
    Coordinador = puede cargar novedades. Se pregunta por PERMISO, no por el nombre del rol.

    Antes se buscaba la palabra "coordinador" en el nombre del rol, con lo cual dependía de que el rol
    se siguiera llamando así; ahora el permiso es el dato. Se conserva el fallback por nombre de la
    persona —el mismo criterio laxo que el front (`checkIsCoordinator`)— porque hay equipos donde el
    puesto viene en el nombre y no hay usuario con rol detrás.
  */
  const esCoordinador = (m: any): boolean => {
    if (permisosDeRoles(m.roles).has(MOBILE_ACTIVITY_LOGS)) return true;
    return `${m.firstName || ""} ${m.lastName || ""}`.toLowerCase().includes("coordinador");
  };

  const ids: Types.ObjectId[] = [];

  for (const member of members) {
    const up: any = ((member as any).metadata?.projects || []).find((p: any) => p && String(p.projectId) === String(projectId));
    const contracts: any[] = up?.contracts || [];
    // El contrato que representa su situación actual: el vigente más reciente (un tiempo
    // indeterminado no tiene baja y siempre lo es), no simplemente el último cargado.
    const contratoActivo = getContratoActivo(contracts);

    if (filtros.vigencia) {
      // Sin contratos se considera vigente, como se venía comportando el filtro.
      const vigente = contracts.length === 0 || esContratoVigente(contratoActivo);
      if (filtros.vigencia === "vigente" ? !vigente : vigente) continue;
    }

    if (filtros.tipoContrato && String(contratoActivo?.nombre_contrato ?? "") !== String(filtros.tipoContrato)) continue;

    if (filtros.reemplazo) {
      // Igual que la columna Reemplazo: el contrato marca que la persona reemplaza a otra.
      const esReemplazo = !!contratoActivo?.reemplazo;
      if (filtros.reemplazo === "con" ? !esReemplazo : esReemplazo) continue;
    }

    if (filtros.estadoContrato && estadoCanonico(String(contratoActivo?.nombre_estado_empleado ?? "")) !== estadoCanonico(String(filtros.estadoContrato))) continue;

    if (filtros.areaTurno) {
      // Área/turno del miembro: teamConfig + lo que coordina (si es coordinador).
      const keys = new Set<string>();
      for (const asa of configByUser.get(String(member._id))?.areaShiftAssignments || []) {
        const areaId = asa?.areaId?._id || asa?.areaId;
        if (!areaId) continue;
        for (const sid of asa?.shiftIds || []) {
          const shiftId = sid?._id || sid;
          if (shiftId) keys.add(`${areaId}::${shiftId}`);
        }
      }
      if (esCoordinador(member)) {
        for (const asm of project.coordinatorAssignments || []) {
          if (String(asm?.userId) !== String(member._id)) continue;
          const areaId = asm?.areaId?._id || asm?.areaId;
          const shiftId = asm?.shiftId?._id || asm?.shiftId;
          if (areaId && shiftId) keys.add(`${areaId}::${shiftId}`);
        }
      }

      if (filtros.areaTurno === "__none__") {
        if (keys.size > 0) continue;
      } else if (!keys.has(String(filtros.areaTurno))) {
        continue;
      }
    }

    ids.push(member._id as Types.ObjectId);
  }

  return ids;
}

/**
 * En el modelo el campo real es `metadata.roles_frame` y `rolesFrameIds` es un alias de Mongoose
 * (ver models/User.ts). Los alias NO se aplican en rutas anidadas: mandar
 * `metadata.rolesFrameIds` guardaba un array VACÍO y el rol frame se perdía en silencio (así se
 * creaban las solicitudes de alta, que después figuraban "Sin rol"). Se normaliza acá y no en cada
 * cliente para que valga también para los que ya están publicados.
 */
const normalizarRolesFrame = (metadata: any): void => {
  if (!metadata || typeof metadata !== "object") return;
  const alias = metadata.rolesFrameIds;
  if (Array.isArray(alias) && alias.length > 0 && (!Array.isArray(metadata.roles_frame) || metadata.roles_frame.length === 0)) {
    metadata.roles_frame = alias;
  }
  delete metadata.rolesFrameIds;
};

const createUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    roles: z.array(z.string()).default([]),
    // Puede quedar a cargo de un proyecto. Es de la persona, no de sus roles: ver GET /eligible-responsables.
    isProjectResponsible: z.boolean().optional(),
    hireDate: z
      .string()
      .or(z.date())
      .transform((val) => new Date(val)),
    extraVacationDays: z.number().default(0),
    clientIds: z.array(z.string()).default([]),
    projectIds: z.array(z.string()).default([]),
    name: z.string().optional(),
    metadata: z.any().optional(),
  });

const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    roles: z.array(z.string()).optional(),
    isProjectResponsible: z.boolean().optional(),
    hireDate: z
      .string()
      .or(z.date())
      .transform((val) => new Date(val))
      .optional(),
    extraVacationDays: z.number().optional(),
    clientIds: z.array(z.string()).optional(),
    projectIds: z.array(z.string()).optional(),
    name: z.string().optional(),
    metadata: z.any().optional(),
    password: z.string().min(6).optional(),
  });

const updatePasswordSchema = z.object({
  password: z.string().min(6),
});

// GET /users/count - Contar usuarios
router.get("/count", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { isActive } = req.query;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    const filter: any = isSuperAdmin ? {} : { tenantId: req.tenantObjectId };

    if (isActive !== undefined) {
      filter["metadata.activo"] = isActive === "true";
    }

    if (req.query.metadataActivo !== undefined) {
      filter["metadata.activo"] = req.query.metadataActivo === "true";
    }

    const count = await User.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
  GET /users - Listar usuarios

  También lo mira la tarjeta «Usuarios» de la app mobile (el historial de solicitudes de
  contratación), que hasta ahora pedía `admin_users:view` y por eso respondía 403 a todo el que no
  fuera Admin: la pantalla estaba rota justo para quien la tenía habilitada. Con el permiso propio
  del móvil ya no depende de tener acceso a la administración.
*/
router.get("/", requireTenant, authenticateToken, requireAnyPermission("admin_users:view", MOBILE_USERS), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 50, email, isActive, areaId } = req.query;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    const andConditions: any[] = [];
    if (!isSuperAdmin) {
      andConditions.push({ tenantId: req.tenantObjectId });
    }

    if (email) {
      const fuzzySearch = createFuzzySearchRegex(String(email));
      const searchRegex = { $regex: fuzzySearch, $options: "i" };
      andConditions.push({
        $or: [
          { email: searchRegex },
          { firstName: searchRegex },
          { lastName: searchRegex },
          { "metadata.fullName": searchRegex },
          { "metadata.nombre": searchRegex },
          { "metadata.apellido": searchRegex },
          {
            $expr: {
              $regexMatch: {
                input: {
                  $concat: [
                    { $ifNull: ["$firstName", ""] },
                    " ",
                    { $ifNull: ["$lastName", ""] }
                  ]
                },
                regex: fuzzySearch,
                options: "i"
              }
            }
          },
          {
            $expr: {
              $regexMatch: {
                input: {
                  $concat: [
                    { $ifNull: ["$metadata.nombre", ""] },
                    " ",
                    { $ifNull: ["$metadata.apellido", ""] }
                  ]
                },
                regex: fuzzySearch,
                options: "i"
              }
            }
          }
        ]
      });
    }

    if (isActive !== undefined) {
      andConditions.push({ "metadata.activo": isActive === "true" });
    }

    if (req.query.isSolicitud !== undefined) {
      andConditions.push({ "metadata.isSolicitud": req.query.isSolicitud === "true" });
    }

    // Trae TODA solicitud de alta sin importar su estado (pendiente/aprobada/rechazada/cancelada).
    if (req.query.solicitudAny === "true") {
      andConditions.push({ "metadata.solicitudStatus": { $exists: true, $ne: null } });
    } else if (req.query.isSolicitud === undefined) {
      // Listado normal de Usuarios: las solicitudes que corresponden a alguien que YA es usuario no
      // se listan aparte (se muestran dentro de la ficha de esa persona, ver `solicitudesPendientes`),
      // para no duplicar la tarjeta. Las de gente que todavía no existe sí siguen apareciendo.
      // `null` matchea tanto el campo ausente como el nulo (las solicitudes viejas y los usuarios
      // normales no lo tienen), así que solo se excluyen las que sí quedaron vinculadas.
      andConditions.push({ "metadata.solicitudUserId": null });
    }

    if (req.query.metadataActivo !== undefined) {
      andConditions.push({ "metadata.activo": req.query.metadataActivo === "true" });
    }

    if (req.query.clientId) {
      const cid = req.query.clientId;
      const clientProjectIds = await Project.find({ clientId: cid }).distinct("_id");
      andConditions.push({
        $or: [
          { clientIds: cid },
          { projectIds: { $in: clientProjectIds } },
          { "metadata.projects.projectId": { $in: clientProjectIds } }
        ]
      });
    }

    if (req.query.projectId) {
      const pid = req.query.projectId;
      andConditions.push({
        $or: [
          { projectIds: pid },
          { "metadata.projects.projectId": pid }
        ]
      });
    }

    if (req.query.roleId) {
      andConditions.push({ roles: req.query.roleId });
    }

    // Filtro por NOMBRE de rol (ej. "Administración"). Se resuelve acá porque el cliente no puede
    // listar /roles sin el permiso admin_roles:view. El separador es flexible: "Mobile-Coordinador",
    // "Mobile Coordinador" y "mobile_coordinador" matchean igual (match exacto sobre el nombre completo).
    if (req.query.roleName) {
      const parts = String(req.query.roleName)
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .filter(Boolean);
      if (parts.length > 0) {
        const roleFilter: any = { name: { $regex: `^${parts.join("[^a-z0-9]*")}$`, $options: "i" } };
        if (!isSuperAdmin) roleFilter.tenantId = req.tenantObjectId;
        const roleIds = await Role.find(roleFilter).distinct("_id");
        andConditions.push({ roles: { $in: roleIds } }); // sin roles que matcheen → 0 resultados
      }
    }

    /*
      Filtro por PERMISO (ej. `permission=mobile_activity_logs:view`, «carga novedades»).

      Es el reemplazo del filtro por nombre de rol que usaban Contratos y Equipo de Proyecto para
      separar coordinadores de colaboradores: preguntaban por dos roles que ya no existen como tales.
      Con `notPermission` se pide el complemento —los que NO lo tienen—, que es la otra mitad de ese
      mismo filtro y no se puede expresar con `$in`.
    */
    const filtroPorPermiso = async (permiso: string) => {
      const roleFilter: any = { permissions: permiso };
      if (!isSuperAdmin) roleFilter.tenantId = req.tenantObjectId;
      return Role.find(roleFilter).distinct("_id");
    };

    if (req.query.permission) {
      andConditions.push({ roles: { $in: await filtroPorPermiso(String(req.query.permission)) } });
    }

    if (req.query.notPermission) {
      andConditions.push({ roles: { $nin: await filtroPorPermiso(String(req.query.notPermission)) } });
    }

    // Filtros del equipo que dependen del último contrato o del área/turno del miembro. Resolverlos
    // acá (y no en el front sobre la página cargada) es lo que hace que la paginación sea correlativa.
    const teamFilters: TeamFilters = {
      vigencia: req.query.vigencia ? String(req.query.vigencia) : undefined,
      tipoContrato: req.query.tipoContrato ? String(req.query.tipoContrato) : undefined,
      estadoContrato: req.query.estadoContrato ? String(req.query.estadoContrato) : undefined,
      areaTurno: req.query.areaTurno ? String(req.query.areaTurno) : undefined,
      reemplazo: req.query.reemplazo ? String(req.query.reemplazo) : undefined,
    };
    if (req.query.projectId && Object.values(teamFilters).some(Boolean)) {
      const teamIds = await resolveProjectTeamFilterIds(String(req.query.projectId), teamFilters);
      andConditions.push({ _id: { $in: teamIds } }); // sin coincidencias → 0 resultados
    }

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};


    const limitNum = Number(limit) || 50;
    const skip = (Number(page) - 1) * limitNum;

    // Modo liviano: para lookups (id -> nombre) que no necesitan el detalle
    // de proyectos/contratos. Evita el populate anidado pesado que de otro
    // modo escala con (usuarios x proyectos x contratos) y produce timeouts.
    const lightweight = req.query.lightweight === "true";
    // slimProjects: no trae los contratos ni el populate anidado de metadata.projects.
    // Lo usa la búsqueda de candidatos (que no muestra contratos): baja mucho la memoria.
    // El contrato se trae on-demand al abrir el wizard vía GET /users/:id.
    const slimProjects = req.query.slimProjects === "true";

    const projectsPopulate: any = slimProjects
      ? {
          path: "metadata.projects",
          model: UserProject,
          select: "projectId nombre_rol_frame nombre_proyecto nombre_sede",
        }
      : {
          path: "metadata.projects",
          model: UserProject,
          select: "projectId areaId nombre_rol_frame nombre_proyecto contracts",
          populate: [
            { path: "areaId", select: "name", model: Area },
            // NOTA: no traer teamConfig/coordinatorAssignments aquí: son arrays
            // potencialmente enormes que no se usan en esta lista y disparan timeouts.
            { path: "projectId", select: "name status clientId", model: Project },
          ],
        };

    /*
      MODO SELECTOR (`?picker=true`): para buscar a una persona en una lista y elegirla.

      Está entre `lightweight` —que es un id → nombre y no alcanza acá— y el listado completo, que
      trae la ficha entera de cada uno: domicilio, datos bancarios, proyectos poblados, cliente,
      tenant. Un buscador necesita el nombre, el mail, el documento y con qué rol empresa figura en
      sus proyectos (que es de donde sale `externalInfo`, el filtro por rol). Nada más.

      Medido contra la base para 83 personas: 1280 ms y 131 KB el listado completo, 224 ms y 16 KB
      este. La diferencia crece con la cantidad de gente del tenant.
    */
    const picker = req.query.picker === "true";

    let query: any = lightweight
      ? User.find(filter).select("firstName lastName email metadata.id metadata.activo metadata.isSolicitud roles").populate({ path: "roles", select: "name", model: Role })
      : picker
        ? User.find(filter)
            .select("firstName lastName email metadata.id metadata.activo metadata.documento metadata.fullName metadata.projects metadata.roles_frame")
            .populate({ path: "metadata.projects", model: UserProject, select: "projectId nombre_rol_frame nombre_sede" })
            .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame })
      : User.find(filter)
          .select("-password")
          .populate({ path: "roles", select: "name", model: Role })
          .populate({
            path: "projectIds",
            select: "name clientId",
            model: Project,
            populate: {
              path: "clientId",
              select: "name",
              model: Client,
            },
          })
          .populate({ path: "clientIds", select: "name", model: Client })
          .populate({ path: "tenantId", select: "name", model: Tenant })
          .populate(projectsPopulate)
          .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame });

    // Orden: por defecto _id desc (más nuevos primero). Con ?sort=<columna>&order=asc|desc se ordena
    // por la columna pedida, case- y acento-insensible (collation es). `sort=name` sin `order` sigue
    // dando el alfabético ascendente de siempre.
    // Ordenar en el server (y no sobre la página ya cargada) es lo único correcto acá: la lista está
    // paginada, así que ordenar en el cliente ordenaría 50 de 1500 filas.
    const sortKey = String(req.query.sort || "");
    const sortDir: 1 | -1 = req.query.order === "desc" ? -1 : 1;

    // Columnas que salen directo del documento del usuario.
    const CAMPOS_ORDENABLES: Record<string, string[]> = {
      name: ["firstName", "lastName"],
      email: ["email"],
      cuit: ["metadata.cuit"],
      documento: ["metadata.documento"],
      estado: ["metadata.activo"],
    };

    // Columnas calculadas (dependen de otra colección). Se resuelven con una agregación liviana que
    // solo devuelve los _id de la página ya ordenados; el populate pesado de arriba corre después
    // sobre esos pocos documentos, no sobre los ~1500 del tenant.
    let idsOrdenados: any[] | null = null;
    if (sortKey === "contratos" || sortKey === "roles") {
      const pipeline: any[] = [{ $match: filter }];
      if (sortKey === "contratos") {
        pipeline.push(
          {
            $lookup: {
              // Ojo: la colección no es la pluralización por defecto, está fijada en el modelo.
              from: UserProject.collection.name,
              localField: "metadata.projects",
              foreignField: "_id",
              as: "_ups",
              pipeline: [{ $project: { n: { $size: { $ifNull: ["$contracts", []] } } } }],
            },
          },
          { $addFields: { _orden: { $sum: "$_ups.n" } } },
        );
      } else {
        pipeline.push(
          {
            $lookup: {
              from: Role.collection.name,
              localField: "roles",
              foreignField: "_id",
              as: "_roles",
              pipeline: [{ $project: { name: 1 } }],
            },
          },
          // Con varios roles ordena por el primero alfabéticamente, que es el que la tabla muestra primero.
          { $addFields: { _orden: { $min: "$_roles.name" } } },
        );
      }
      pipeline.push({ $sort: { _orden: sortDir, _id: 1 } }, { $skip: skip }, { $limit: limitNum }, { $project: { _id: 1 } });
      const ordenados = await User.aggregate(pipeline).collation({ locale: "es", strength: 1 }).exec();
      idsOrdenados = ordenados.map((d: any) => d._id);
    }

    if (idsOrdenados) {
      // La agregación ya paginó: acá solo se hidratan esos _id (el orden se reaplica más abajo).
      query = query.find({ _id: { $in: idsOrdenados } });
    } else if (CAMPOS_ORDENABLES[sortKey]) {
      const spec: any = {};
      for (const campo of CAMPOS_ORDENABLES[sortKey]) spec[campo] = sortDir;
      // Desempate estable: sin esto dos usuarios con el mismo valor pueden repetirse o saltearse
      // entre páginas, porque Mongo no garantiza un orden para los empates.
      spec._id = 1;
      query = query.collation({ locale: "es", strength: 1 }).sort(spec).skip(skip).limit(limitNum);
    } else {
      query = query.sort({ _id: -1 }).skip(skip).limit(limitNum);
    }
    query = query.lean();

    const [users, total] = await Promise.all([query.exec(), User.countDocuments(filter).exec()]);

    // `find({_id: {$in: [...]}})` no respeta el orden del array: hay que reaplicarlo.
    if (idsOrdenados) {
      const posicion = new Map(idsOrdenados.map((id: any, i: number) => [String(id), i]));
      (users as any[]).sort((a: any, b: any) => (posicion.get(String(a._id)) ?? 0) - (posicion.get(String(b._id)) ?? 0));
    }

    // Filter out projects that no longer exist for each user
    const cleanedUsers = users.map((u: any) => {
      if (u.metadata?.projects && Array.isArray(u.metadata.projects)) {
        u.metadata.projects = u.metadata.projects.filter((up: any) => up && up.projectId);
      }
      return u;
    });

    // Fast enrichment using populated data
    const enrichedUsers = cleanedUsers.map((userObj: any) => {
      const userSedeNames = new Set<string>();
      const userRolFrameNames = new Set<string>();

      if (userObj.metadata?.projects && Array.isArray(userObj.metadata.projects)) {
        for (const up of userObj.metadata.projects) {
          if (!up || typeof up !== "object") continue;

          // Priority 1: Top level names (Fastest)
          if (up.nombre_rol_frame) userRolFrameNames.add(up.nombre_rol_frame);
          if (up.nombre_sede) userSedeNames.add(up.nombre_sede);

          // Priority 2: From contracts (Only if needed or to ensure we have all history)
          // We limit this to avoid heavy processing if contracts is large
          if (Array.isArray(up.contracts)) {
            for (const c of up.contracts) {
              if (c.nombre_sede) userSedeNames.add(c.nombre_sede);
              if (c.nombre_rol_frame) userRolFrameNames.add(c.nombre_rol_frame);
            }
          }
        }
      }

      // Priority 3: Roles frame propios del usuario (metadata.roles_frame, populado desde RoleFrame)
      if (Array.isArray(userObj.metadata?.roles_frame)) {
        for (const rf of userObj.metadata.roles_frame) {
          if (rf?.name) userRolFrameNames.add(rf.name);
        }
      }

      return {
        ...userObj,
        externalInfo: {
          sedes: Array.from(userSedeNames),
          rolFrames: Array.from(userRolFrameNames),
        },
      };
    });

    // Solicitudes de alta pendientes de las personas de ESTA página: se adjuntan a su ficha para
    // mostrarlas ahí (con el proyecto pedido) en lugar de listarlas como una tarjeta duplicada.
    const idsPagina = enrichedUsers.map((u: any) => u._id).filter(Boolean);
    const solicitudesPorUsuario = new Map<string, any[]>();
    if (idsPagina.length > 0) {
      const pendientes: any[] = await User.find({
        "metadata.isSolicitud": true,
        "metadata.solicitudStatus": "pendiente",
        "metadata.solicitudUserId": { $in: idsPagina },
      })
        .select("metadata.solicitudUserId metadata.projectIds metadata.startDate metadata.dueDate createdAt")
        .populate({ path: "metadata.projectIds", select: "name", model: Project })
        .lean();

      pendientes.forEach((s: any) => {
        const dueño = String(s.metadata?.solicitudUserId || "");
        if (!dueño) return;
        const lista = solicitudesPorUsuario.get(dueño) || [];
        lista.push({
          _id: String(s._id),
          proyectos: (s.metadata?.projectIds || []).map((p: any) => ({ _id: String(p?._id || p), name: p?.name || "" })).filter((p: any) => p.name),
          startDate: s.metadata?.startDate || "",
          dueDate: s.metadata?.dueDate || "",
          createdAt: s.createdAt,
        });
        solicitudesPorUsuario.set(dueño, lista);
      });
    }

    res.json({
      users: enrichedUsers.map((u: any) => ({ ...u, solicitudesPendientes: solicitudesPorUsuario.get(String(u._id)) || [] })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
 * GET /users/contracts-overview - Listado global de contratos (Contratos, la página que no está
 * atada a un proyecto). A diferencia de GET /users (que pagina por usuario), acá cada fila es un
 * (usuario × proyecto) con su contrato ACTIVO (mismo criterio que Gestionar Equipo:
 * `getContratoActivo`), con Cliente/Proyecto/Sede resueltos. Se arma consultando `UserProject`
 * directamente (tiene `userId` y `projectId` propios) en vez de pasar por `User.metadata.projects`.
 */
router.get("/contracts-overview", requireTenant, authenticateToken, requirePermission("admin_contracts:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    const projectFilter: any = isSuperAdmin ? {} : { tenantId: req.tenantObjectId };
    if (req.query.clientId) projectFilter.clientId = req.query.clientId;
    if (req.query.projectId) projectFilter._id = req.query.projectId;

    // Se traen los proyectos con sus empresas (contrato/release) para poder ofrecer la descarga por
    // empresa en la tabla (igual que /all-contracts), no solo sus ids.
    const projectsList: any[] = await Project.find(projectFilter).select("_id name clientId contratoEmpresas releaseEmpresas").lean();
    if (projectsList.length === 0) {
      res.json({ rows: [], total: 0, page: 1, totalPages: 1 });
      return;
    }
    const projectIds = projectsList.map((p) => p._id);

    // Empresas por proyecto, con fallback a todas las del ABM cuando el proyecto no tiene ninguna
    // configurada (mismo criterio que GET /:id/all-contracts, si no no habría con qué generar el PDF).
    const companies = await Company.find({}).select("razonSocial").lean();
    const companyMap = new Map(companies.map((c: any) => [String(c._id), c.razonSocial]));
    const allEmpresas = companies.map((c: any) => ({ id: String(c._id), label: c.razonSocial || "" })).filter((e) => e.label);
    const toEmpresas = (ids: any[] = []) => {
      const fromProject = (ids || []).map((id) => ({ id: String(id), label: companyMap.get(String(id)) || "" })).filter((e) => e.label);
      return fromProject.length > 0 ? fromProject : allEmpresas;
    };
    const empresasPorProyecto = new Map<string, { contratoEmpresas: any[]; releaseEmpresas: any[] }>();
    projectsList.forEach((p: any) => empresasPorProyecto.set(String(p._id), { contratoEmpresas: toEmpresas(p.contratoEmpresas), releaseEmpresas: toEmpresas(p.releaseEmpresas) }));

    const tFase1 = Date.now();

    // FASE 1 — barrido liviano. Hay que recorrer TODOS los contratos de todas las personas para
    // elegir el activo y aplicar los filtros, pero de cada contrato alcanzan seis campos: traer el
    // contrato entero movía ~3,6 MB por una página de 25 filas y la consulta se pasaba del
    // socketTimeout (500). Los datos completos se piden en la FASE 2, solo para la página devuelta.
    //
    // Va por aggregate con claves de UNA letra en vez de un select: con ~4000 contratos, repetir los
    // nombres largos de los campos en cada uno pesa más que los valores (medido: 1017 KB con select
    // contra 630 KB así). Se renombran a los nombres reales apenas llegan, así el resto del handler
    // no se entera.
    //
    // Las fechas van siempre (definen cuál es el contrato activo), pero el nombre del contrato, el
    // estado y el flag de reemplazo solo se traen si hay un filtro que los mire: sin filtros, pedirlos
    // es casi la mitad del payload para nada.
    const necesitaNombreContrato = !!req.query.tipoContrato || !!req.query.search;
    const necesitaEstado = !!req.query.estadoContrato || !!req.query.estados;
    const necesitaReemplazo = !!req.query.reemplazo;
    // La empleadora solo se trae si se está filtrando por ella (contexto Empresa): sin filtro, pedirla
    // sería payload de la fase 1 para nada, que es justamente lo que esta fase evita.
    const necesitaEmpresa = !!req.query.empresaContratoId;
    const camposContrato: any = { a: "$$x.fecha_alta_contrato", b: "$$x.fecha_baja_contrato", g: "$$x.fecha_carga" };
    if (necesitaNombreContrato) camposContrato.n = "$$x.nombre_contrato";
    if (necesitaEstado) camposContrato.e = "$$x.nombre_estado_empleado";
    if (necesitaReemplazo) camposContrato.m = "$$x.reemplazo";
    if (necesitaEmpresa) camposContrato.q = "$$x.empresaContratoId";

    const membershipsRaw: any[] = await UserProject.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      {
        $project: {
          p: "$projectId",
          u: "$userId",
          r: "$nombre_rol_frame",
          c: { $map: { input: { $ifNull: ["$contracts", []] }, as: "x", in: camposContrato } },
        },
      },
    ]);
    const memberships: any[] = membershipsRaw.map((d: any) => ({
      _id: d._id,
      projectId: d.p,
      userId: d.u,
      nombre_rol_frame: d.r,
      contracts: (d.c || []).map((c: any) => ({ fecha_alta_contrato: c.a, fecha_baja_contrato: c.b, fecha_carga: c.g, nombre_contrato: c.n, nombre_estado_empleado: c.e, reemplazo: c.m, empresaContratoId: c.q })),
    }));
    const msFase1 = Date.now() - tFase1;

    // Usuario, roles y cliente se resuelven con tres consultas en bloque en vez de con populate por
    // membership (el populate de `metadata` completo traía 40+ campos por persona, incluido el array
    // de proyectos, para usar cuatro).
    // Hay memberships viejos sin userId: si se cuelan, el $in revienta al castear a ObjectId.
    const userIds = [...new Set(memberships.map((m: any) => String(m.userId || "")))].filter((id) => Types.ObjectId.isValid(id));
    const [usersList, clientsList] = await Promise.all([
      User.find({ _id: { $in: userIds } })
        // OJO: este `select` es campo por campo. Cualquier dato de `metadata` que la fila de contratos
        // necesite hay que PEDIRLO acá: si no, llega `undefined` y la pantalla lo muestra como si el
        // dato no existiera. Así estuvo `nombreValidadoArcaAt`, y el mismo nombre salía validado en
        // Usuarios y sin validar en Contratos.
        .select("firstName lastName email roles metadata.activo metadata.id metadata.cuit metadata.sinCuit metadata.nombreValidadoArcaAt")
        // `permissions` además del nombre: el filtro por rol de esta pantalla pasó a ser por permiso.
        .populate({ path: "roles", select: "name permissions", model: Role })
        .lean(),
      Client.find({ _id: { $in: [...new Set(projectsList.map((p: any) => String(p.clientId?._id || p.clientId || "")))].filter((id) => Types.ObjectId.isValid(id)) } })
        .select("name")
        .lean(),
    ]);
    const userMap = new Map(usersList.map((u: any) => [String(u._id), u]));
    const clientNameById = new Map(clientsList.map((c: any) => [String(c._id), c.name as string]));
    const projectMap = new Map(projectsList.map((p: any) => [String(p._id), p]));

    const search = req.query.search ? String(req.query.search) : "";
    const fuzzySearch = search ? createFuzzySearchRegex(search) : "";
    const searchRegex = fuzzySearch ? new RegExp(fuzzySearch, "i") : null;

    const metadataActivo = req.query.metadataActivo !== undefined ? req.query.metadataActivo === "true" : undefined;
    const vigencia = req.query.vigencia ? String(req.query.vigencia) : undefined;
    const tipoContrato = req.query.tipoContrato ? String(req.query.tipoContrato) : undefined;
    const estadoContrato = req.query.estadoContrato ? String(req.query.estadoContrato) : undefined;
    const reemplazo = req.query.reemplazo ? String(req.query.reemplazo) : undefined;
    /**
     * Empleadora del contrato (contexto Empresa). Filtra por el valor FIJADO en el contrato, no por
     * las candidatas del proyecto: para ARCA, la empleadora de un alta es la que efectivamente se
     * eligió, y las candidatas son solo las opciones que ofrece el proyecto.
     */
    const empresaContratoId = req.query.empresaContratoId ? String(req.query.empresaContratoId) : undefined;
    const roleNameParts = req.query.roleName
      ? String(req.query.roleName)
          .toLowerCase()
          .split(/[^a-z0-9]+/i)
          .filter(Boolean)
      : [];
    const roleFilterRegex = roleNameParts.length > 0 ? new RegExp(`^${roleNameParts.join("[^a-z0-9]*")}$`, "i") : null;

    // Filtro por PERMISO: reemplaza al que separaba coordinadores de colaboradores por nombre de rol.
    const permisoRequerido = req.query.permission ? String(req.query.permission) : undefined;
    const permisoExcluido = req.query.notPermission ? String(req.query.notPermission) : undefined;

    // Estados impositivos (u otros) pedidos por la pantalla de Gestión de Contratos: filtrar acá
    // evita devolverle el padrón entero al front para que descarte casi todo del lado del cliente.
    const estadosFiltro = req.query.estados
      ? String(req.query.estados)
          .split(",")
          .map((e) => estadoCanonico(e.trim()))
          .filter(Boolean)
      : [];

    // Filas "livianas": lo mínimo para filtrar, ordenar y paginar. El contrato completo se resuelve
    // después, ya recortado a la página.
    const rows: any[] = [];

    for (const m of memberships) {
      const user: any = userMap.get(String(m.userId));
      const project: any = projectMap.get(String(m.projectId));
      if (!user || !project) continue;

      const contratos: any[] = m.contracts || [];
      const contratoActivo: any = getContratoActivo(contratos);
      if (!contratoActivo) continue;

      if (metadataActivo !== undefined && !!user.metadata?.activo !== metadataActivo) continue;

      if (vigencia) {
        const vigente = esContratoVigente(contratoActivo);
        if (vigencia === "vigente" ? !vigente : vigente) continue;
      }

      if (tipoContrato && String(contratoActivo.nombre_contrato ?? "") !== tipoContrato) continue;

      if (estadoContrato && estadoCanonico(String(contratoActivo.nombre_estado_empleado ?? "")) !== estadoCanonico(estadoContrato)) continue;

      if (estadosFiltro.length > 0 && !estadosFiltro.includes(estadoCanonico(String(contratoActivo.nombre_estado_empleado ?? "")))) continue;

      if (reemplazo) {
        const esReemplazo = !!contratoActivo.reemplazo;
        if (reemplazo === "con" ? !esReemplazo : esReemplazo) continue;
      }

      if (empresaContratoId && String(contratoActivo.empresaContratoId ?? "") !== empresaContratoId) continue;

      if (roleFilterRegex && !(user.roles || []).some((r: any) => roleFilterRegex.test(String(r?.name || "")))) continue;

      if (permisoRequerido || permisoExcluido) {
        const permisos = permisosDeRoles(user.roles);
        if (permisoRequerido && !permisos.has(permisoRequerido)) continue;
        if (permisoExcluido && permisos.has(permisoExcluido)) continue;
      }

      if (searchRegex) {
        const nombreCompleto = `${user.firstName || ""} ${user.lastName || ""}`.trim();
        const candidatos = [nombreCompleto, user.email, project.name, m.nombre_rol_frame, contratoActivo.nombre_contrato];
        if (!candidatos.some((c) => c && searchRegex.test(String(c)))) continue;
      }

      const clientId = project.clientId ? String(project.clientId?._id || project.clientId) : "";
      rows.push({
        _id: String(m._id),
        userId: String(user._id),
        userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
        userEmail: user.email,
        userActivo: !!user.metadata?.activo,
        /** El nombre de esta persona es literalmente el que ARCA tiene para su CUIT. */
        userNombreValidadoArca: !!user.metadata?.nombreValidadoArcaAt,
        userExternalId: user.metadata?.id ?? null,
        // Con los permisos: las pantallas que separan «carga novedades» de «no carga» los necesitan,
        // y antes lo deducían del nombre del rol.
        userRoles: (user.roles || []).map((r: any) => ({ _id: String(r._id), name: r.name, permissions: r.permissions || [] })),
        clientId,
        clientName: clientNameById.get(clientId) || "",
        projectId: String(project._id),
        projectName: project.name || "",
        nombreRolFrame: m.nombre_rol_frame || "",
        contractsInProject: contratos.length,
        contractIndex: contratos.indexOf(contratoActivo),
        // Los campos del contrato activo se completan en la FASE 2 (solo para la página devuelta).
        contratoEmpresas: empresasPorProyecto.get(String(project._id))?.contratoEmpresas || [],
        releaseEmpresas: empresasPorProyecto.get(String(project._id))?.releaseEmpresas || [],
        // Datos para el chequeo de completitud AFIP (se resuelven contra los catálogos en el front).
        cuit: user.metadata?.cuit || "",
        // Declaración explícita de "no tiene CUIT/CUIL argentino" (extranjeros): la usa la
        // pestaña "Sin CUIT" de Gestión de Contratos para separarlos de los trámites de AFIP.
        sinCuit: user.metadata?.sinCuit === true,
      });
    }

    rows.sort((a, b) => a.userName.localeCompare(b.userName, "es", { sensitivity: "base" }));

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 25);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageRows = rows.slice((page - 1) * limit, page * limit);

    // FASE 2 — los contratos completos, solo de las filas de esta página y solo el contrato ACTIVO
    // de cada una. Traer el array `contracts` entero movía todos los contratos de esas personas (hay
    // quien tiene 146), y de ahí se usaba uno: eran 8,6 s para 30 filas. El índice ya lo resolvió la
    // FASE 1, así que se le pide a Mongo justo ese elemento con un $switch por membership.
    const tFase2 = Date.now();
    const contratoActivoPorMembership = new Map<string, any>();
    if (pageRows.length > 0) {
      const ids = pageRows.map((r) => new Types.ObjectId(r._id));

      /*
       * EL $switch VA POR ÍNDICE DE CONTRATO, NO POR FILA.
       *
       * Antes era una rama por fila de la página (`$eq` contra su `_id`), y Mongo evalúa ese árbol
       * ENTERO por cada documento: con una página de 25 son 25 comparaciones y no se nota, pero la
       * pantalla de Contratos pide el conjunto completo para poder contar las pestañas y correr las
       * acciones masivas, y ahí son ~900 ramas × ~900 documentos. Cuadrático, y encima el comando
       * que viaja a Mongo lleva las 900 ramas escritas adentro: varios MB de pipeline.
       *
       * Los índices distintos, en cambio, son un puñado (la mayoría de la gente tiene 1 o 2
       * contratos en un proyecto). Agrupando por índice quedan ~5 ramas, cada una un `$in` nativo
       * contra una lista de ids: el costo deja de depender del tamaño de la página.
       *
       * El índice 0 no necesita rama: ya es el `default`.
       */
      const idsPorIndice = new Map<number, Types.ObjectId[]>();
      for (const r of pageRows) {
        const idx = Number(r.contractIndex) || 0;
        if (idx === 0) continue;
        const lista = idsPorIndice.get(idx) || [];
        lista.push(new Types.ObjectId(r._id));
        idsPorIndice.set(idx, lista);
      }
      const ramas = [...idsPorIndice.entries()].map(([idx, lista]) => ({ case: { $in: ["$_id", lista] }, then: idx }));
      const indiceDelContrato: any = ramas.length > 0 ? { $switch: { branches: ramas, default: 0 } } : 0;

      const docs: any[] = await UserProject.aggregate([
        { $match: { _id: { $in: ids } } },
        {
          $project: {
            c: { $arrayElemAt: [{ $ifNull: ["$contracts", []] }, indiceDelContrato] },
          },
        },
      ]);
      docs.forEach((d: any) => contratoActivoPorMembership.set(String(d._id), d.c || {}));
    }

    const fullRows = pageRows.map((r) => {
      const c: any = contratoActivoPorMembership.get(r._id) || {};
      return {
        ...r,
        nombre_contrato: c.nombre_contrato || "",
        nombre_estado_empleado: c.nombre_estado_empleado || "",
        nombre_sede: c.nombre_sede || "",
        areaShiftAssignments: c.areaShiftAssignments || [],
        reemplazo: !!c.reemplazo,
        empleado_id_reemplezado: c.empleado_id_reemplezado ?? null,
        fecha_alta_contrato: c.fecha_alta_contrato || "",
        fecha_baja_contrato: c.fecha_baja_contrato || "",
        sueldo_mano: c.sueldo_mano,
        cantidad_jornadas_laborales: c.cantidad_jornadas_laborales,
        hora_inicio: c.hora_inicio,
        hora_fin: c.hora_fin,
        // Documentos descargables/subibles del contrato ACTIVO (para las columnas de la tabla).
        altaDocumentoUrl: c.altaDocumentoUrl || "",
        altaDocumentoNombre: c.altaDocumentoNombre || "",
        // Datos leídos del PDF de la Constancia de CUIT (vigencia = cuándo hay que volver a pedirla).
        constanciaVigenciaDesde: c.constanciaVigenciaDesde || "",
        constanciaVigenciaHasta: c.constanciaVigenciaHasta || "",
        constanciaVerificador: c.constanciaVerificador || "",
        // Resultado de la última consulta al Padrón de AFIP (reemplaza al PDF como fuente de verdad).
        constanciaAfipEstado: c.constanciaAfipEstado || "",
        constanciaAfipConsultadaAt: c.constanciaAfipConsultadaAt || "",
        // Recién con esto el trámite se considera terminado (ver ConstanciaBulk.tsx estadoConstancia).
        constanciaAfipDropboxSubidaAt: c.constanciaAfipDropboxSubidaAt || "",
        // "Firma Digital": Contrato y Release(s) se generan con botones independientes — paso 2
        // (Enviar a firmar) marca firmaEnviadaAt recién cuando ambos están generados.
        firmaContratoUrl: c.firmaContratoUrl || "",
        firmaContratoNombre: c.firmaContratoNombre || "",
        firmaReleases: c.firmaReleases || [],
        firmaGeneradoAt: c.firmaGeneradoAt || "",
        firmaReleasesGeneradoAt: c.firmaReleasesGeneradoAt || "",
        firmaEnviadaAt: c.firmaEnviadaAt || "",
        empresaContratoId: c.empresaContratoId ? String(c.empresaContratoId) : "",
        empresaReleaseId: c.empresaReleaseId ? String(c.empresaReleaseId) : "",
        nombre_empresa_contrato: c.nombre_empresa_contrato || "",
        nombre_empresa_release: c.nombre_empresa_release || "",
        categoria_sat_id: c.categoria_sat_id ?? null,
        sede_id: c.sede_id ?? null,
        tipo_contrato_id: c.tipo_contrato_id ?? null,
        // Sucursal del padrón de ARCA (independiente de sede_id) y, si tiene varias actividades
        // declaradas, con cuál se declara este contrato.
        sucursalArcaId: c.sucursalArcaId ? String(c.sucursalArcaId) : "",
        actividadArca: c.actividadArca || "",
        /**
         * Obra social del CONTRATO, no de la persona.
         *
         * Antes salía de `user.metadata.osId`: un dato guardado al dar de alta a la persona, sin
         * fecha ni verificación, que se propagaba a todos sus contratos. ARCA la declara por alta
         * (pos. 40-45) y caduca sola por desregulación, así que vive acá.
         *
         * Vacío NO es un faltante: significa que no se constató ninguna y que se aplica la del
         * convenio, que es el caso normal.
         */
        osId: c.obraSocialId ?? null,
        obraSocialOrigen: c.obraSocialOrigen || "",
        // Identidad del contrato, para que el cliente NO tenga que direccionarlo por índice: la
        // posición cambia sola si alguien borra otro contrato mientras esta pantalla está abierta.
        contratoId: c._id ? String(c._id) : "",
        obraSocialConstatadaEn: c.obraSocialConstatadaEn || "",
        obraSocialConstatadaEl: c.obraSocialConstatadaEl || "",
        // "No figura en el padrón" es una respuesta constatada, no un vacío: la fila va en verde.
        obraSocialNoFigura: !!c.obraSocialNoFigura,
        // Lo que devolvió ARCA queda fijo: el cliente muestra el campo en modo lectura.
        obraSocialBloqueada: !!c.obraSocialBloqueada,
        // Flujo "Sin CUIT": documentación de respaldo + OK manual (pestaña Sin CUIT de Contratos).
        sinCuitValidacion: c.sinCuitValidacion || null,
      };
    });

    // Deja a la vista dónde se va el tiempo (es la consulta más pesada de la app y depende del
    // ancho de banda contra Atlas, no del CPU): sin esto hay que adivinar si tarda por la fase 1 o la 2.
    console.log(`[contracts-overview] fase1 ${msFase1}ms (${memberships.length} memberships) · fase2 ${Date.now() - tFase2}ms (${pageRows.length} filas) · total ${total}`);

    res.json({ rows: fullRows, total, page, totalPages });
  } catch (error) {
    console.error("Get contracts overview error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
 * GET /users/solicitudes-overview - Listado GLOBAL de solicitudes de alta, el equivalente de
 * `contracts-overview` para el otro lado del ciclo: lo que todavía no es un contrato.
 *
 * Hasta acá las solicitudes solo se veían adentro de un proyecto (pestaña Solicitudes de Gestionar
 * Equipo), que obliga a saber de antemano en qué proyecto buscar. Acá se listan todas, con los
 * mismos filtros de visualización que Contratos: búsqueda, cliente, proyecto y estado.
 *
 * OJO CON EL MODELO: una solicitud NO es una colección propia, es un `User` con
 * `metadata.isSolicitud`. El filtro correcto es `metadata.solicitudStatus` y no `isSolicitud`:
 * al aprobarla, `isSolicitud` pasa a false (el documento se convierte en el usuario real) pero el
 * status queda en "aprobada", y una aprobada tiene que seguir listándose. Por eso el criterio es
 * "tiene solicitudStatus", que es lo único que sobrevive a la aprobación.
 *
 * UNA FILA POR SOLICITUD, con sus proyectos adentro: `metadata.projectIds` es un array —se puede
 * pedir a la misma persona para varios proyectos en un solo pedido— y repetirla por proyecto haría
 * ver tres solicitudes donde hay una. Filtrar por proyecto o cliente devuelve la solicitud si
 * ALGUNO de sus proyectos coincide.
 */
router.get("/solicitudes-overview", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const estado = req.query.estado ? String(req.query.estado) : "";
    const clientId = req.query.clientId ? String(req.query.clientId) : "";
    const projectId = req.query.projectId ? String(req.query.projectId) : "";
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 25);

    const and: any[] = [{ tenantId: req.tenantObjectId }, { "metadata.solicitudStatus": { $exists: true, $ne: null } }];

    if (estado) and.push({ "metadata.solicitudStatus": estado });

    /*
     * Cliente y proyecto son el MISMO filtro sobre `metadata.projectIds`: por cliente se resuelven
     * antes sus proyectos y se pide que la solicitud tenga alguno. Un `$in` sobre el array ya
     * significa "alguno coincide", así que no hace falta nada más.
     */
    if (projectId) {
      and.push({ "metadata.projectIds": projectId });
    } else if (clientId) {
      const delCliente = await Project.find({ tenantId: req.tenantObjectId, clientId }).distinct("_id");
      and.push({ "metadata.projectIds": { $in: delCliente } }); // sin proyectos → 0 resultados
    }

    /*
     * La búsqueda mira `metadata.fullName` ADEMÁS de nombre/apellido/email: una solicitud de alguien
     * que todavía no es usuario trae el nombre solo ahí, así que buscar únicamente por `firstName`
     * no encontraría justamente a las que están esperando ser aprobadas.
     */
    if (search) {
      const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      and.push({ $or: [{ "metadata.fullName": rx }, { firstName: rx }, { lastName: rx }, { email: rx }] });
    }

    const filter = { $and: and };

    const [docs, total] = await Promise.all([
      User.find(filter)
        .select("firstName lastName email createdAt metadata")
        .populate({ path: "metadata.projectIds", select: "name clientId", model: Project, populate: { path: "clientId", select: "name", model: Client } })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    const rows = docs.map((u: any) => {
      const m = u.metadata || {};
      const proyectos = (m.projectIds || [])
        .filter((p: any) => p && typeof p === "object")
        .map((p: any) => ({ _id: String(p._id), name: p.name || "", clienteId: p.clientId?._id ? String(p.clientId._id) : "", clienteNombre: p.clientId?.name || "" }));

      return {
        _id: String(u._id),
        // El alta desde mobile guarda el nombre en `metadata.fullName` y deja firstName/lastName vacíos.
        nombre: m.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
        email: u.email,
        estado: m.solicitudStatus || "pendiente",
        creadaEl: u.createdAt,
        proyectos,
        // El resto va crudo: quién lo resuelve a nombre es la pantalla, contra los catálogos que ya
        // tiene cargados (roles frame, categorías SAT, estados), igual que la pestaña del proyecto.
        roleFrameId: m.roleFrameId ?? null,
        rolesFrameIds: m.rolesFrameIds ?? null,
        roles_frame: m.roles_frame ?? null,
        categoriaSatId: m.categoriaSatId ?? null,
        tipoImpositivo: m.tipoImpositivo ?? null,
        startDate: m.startDate ?? null,
        dueDate: m.dueDate ?? null,
        schedule: m.schedule ?? null,
        dailyRate: m.dailyRate ?? null,
        comentarios: m.comentarios ?? null,
        solicitudUserId: m.solicitudUserId ? String(m.solicitudUserId) : null,
      };
    });

    res.json({ rows, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    console.error("Get solicitudes overview error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /users - Crear usuario
router.post("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createUserSchema.parse(req.body);
    normalizarRolesFrame((data as any).metadata);

    // Toda solicitud de alta nace "pendiente" (ciclo de vida tipo Pedido).
    if ((data as any).metadata?.isSolicitud === true && !(data as any).metadata.solicitudStatus) {
      (data as any).metadata.solicitudStatus = "pendiente";
    }

    // Verificar que no existe usuario con el mismo email en el tenant
    const existingUser = await User.findOne({
      email: data.email,
      tenantId: req.tenantObjectId,
    });

    if (existingUser) {
      res.status(409).json({ error: "Email already exists in this tenant" });
      return;
    }

    // Si no se especifican roles, asignar rol por defecto
    let rolesToAssign = data.roles;
    if (!rolesToAssign || rolesToAssign.length === 0) {
      const defaultRole = await Role.findOne({
        tenantId: req.tenantObjectId,
        isDefault: true,
      });

      if (!defaultRole) {
        console.warn(`[User Creation] No default role found for tenant: ${req.tenantObjectId}`);
      } else {
        console.log(`[User Creation] Assigning default role: ${defaultRole.name} (${defaultRole._id})`);
      }

      rolesToAssign = defaultRole ? [(defaultRole._id as any).toString()] : [];
    }

    // Verificar que todos los roles existen en el tenant
    if (rolesToAssign.length > 0) {
      const roleObjectIds = toObjectIdArray(rolesToAssign);

      if (roleObjectIds.length !== rolesToAssign.length) {
        res.status(400).json({ error: "Some role IDs are invalid" });
        return;
      }

      const existingRoles = await Role.find({
        _id: { $in: roleObjectIds },
        tenantId: req.tenantObjectId,
      });

      if (existingRoles.length !== rolesToAssign.length) {
        res.status(400).json({ error: "Some roles do not exist in this tenant" });
        return;
      }

      rolesToAssign = roleObjectIds.map((id) => id.toString());
    }

    /*
      EL SELLO "validado en ARCA" LO PONE EL SERVIDOR, NUNCA EL CLIENTE.

      El alta puede pedir `validarConArca: true` (lo hace el botón del formulario), pero el sello se
      escribe solo después de que ESTE proceso vio la respuesta del organismo. Aceptar un
      `nombreValidadoArcaAt` que viene en el body sería dejar que cualquiera marque como confirmado un
      nombre que ARCA nunca vio, y ese sello es justamente lo que evita volver a consultarlo: una vez
      puesto, nadie lo revisa de nuevo.

      Es una consulta más además de la del botón, y está bien que así sea: la del botón sirve para
      completar el formulario, y esta es la que respalda el sello. Dar de alta a alguien no es una
      operación frecuente.
    */
    // Mismo criterio que el registro público: el CUIT identifica a la persona, el email no.
    const cuitAlta = normalizarCuit(String((data as any).metadata?.cuit || ""));
    if (cuitAlta) {
      const duplicado = await usuarioExistenteConCuit(req.tenantObjectId, cuitAlta);
      if (duplicado) {
        res.status(409).json({ error: `Ese CUIT ya figura a nombre de ${duplicado.nombre}${duplicado.email ? ` (${duplicado.email})` : ""}. Buscá esa ficha en el listado, o revisá el número si esperabas otra persona.` });
        return;
      }
    }

    delete (data as any).metadata?.nombreValidadoArcaAt;
    if (req.body?.validarConArca === true) {
      const cuit = normalizarCuit(String((data as any).metadata?.cuit || ""));
      const tenantDoc = await Tenant.findById(req.tenantObjectId).lean();
      const cfg = getTenantAfipConfig(tenantDoc);
      if (cuitEsValido(cuit) && cfg) {
        try {
          const r = await consultarPadron(String(req.tenantObjectId), cfg, cuit);
          if (r.encontrado && r.nombre && r.apellido) {
            (data as any).firstName = r.nombre;
            (data as any).lastName = r.apellido;
            (data as any).metadata = { ...((data as any).metadata || {}), nombreValidadoArcaAt: new Date() };
          }
        } catch {
          // Sin sello: el alta sigue igual y la persona queda "sin validar", que es lo que es.
        }
      }
    }

    const user = new User({
      ...data,
      roles: rolesToAssign,
      tenantId: req.tenantObjectId,
    });

    await user.save();

    // Sync projects: Add this user to assignedUsers of selected projects
    if (user.projectIds && user.projectIds.length > 0) {
      await Project.updateMany({ _id: { $in: user.projectIds }, tenantId: req.tenantObjectId }, { $addToSet: { assignedUsers: user._id } });
    }

    // Agregar usuario al array userIds del tenant
    await Tenant.findByIdAndUpdate(req.tenantObjectId, {
      $addToSet: { userIds: user._id },
      $inc: { "usage.users.current": 1 },
    });

    // Devolver usuario sin password y con roles poblados
    const userResponse = await User.findById(user._id)
      .select("-password")
      .populate("roles", "name description permissions")
      .populate("clientIds", "name")
      .populate("projectIds", "name")
      .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame });

    res.status(201).json(userResponse);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/directory - Listar usuarios del tenant para selectores (Sin permiso de admin)
// Query params: ?status=active|inactive|all (default: active)
// Caché corta en memoria de /users/directory por tenant+status: el populate anidado de
// metadata.projects (contratos de ~1500+ usuarios) mide 30+ segundos incluso ya acotado a los
// campos usados — la latencia real está en el roundtrip a Mongo, no en el volumen que viaja. Este
// directorio es de solo lectura y no cambia todo el tiempo, así que amortizar con un TTL corto es
// más efectivo que seguir exprimiendo la query. Si el proceso corre en varias instancias (PM2
// cluster), cada una cachea por su cuenta: la inconsistencia entre instancias con un TTL de este
// tamaño es aceptable acá (roster de un reporte, no un dato transaccional).
const DIRECTORY_CACHE_TTL_MS = 90_000;
const directoryCache = new Map<string, { at: number; data: unknown }>();

router.get("/directory", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const status = req.query.status as string | undefined;
    const cacheKey = `${req.tenantObjectId}:${status || "active"}`;
    const cached = directoryCache.get(cacheKey);
    if (cached && Date.now() - cached.at < DIRECTORY_CACHE_TTL_MS) {
      res.json(cached.data);
      return;
    }

    const filter: any = { tenantId: req.tenantObjectId };

    if (status === "inactive") {
      filter["metadata.activo"] = { $ne: true };
    } else if (status === "all") {
      // No filter on activo - return all users
    } else {
      // Default: active only
      filter["metadata.activo"] = true;
    }

    // Ningún consumidor de este directory (RequestsPage.tsx, mobile ActivityLogs.tsx) lee
    // areaId POBLADO de metadata.projects (solo el areaId crudo, como id) —
    // ese sub-populate triple, multiplicado por cada proyecto de cada uno de los ~1500+ usuarios
    // del tenant, era puro costo sin uso. `/users` (el endpoint completo) sigue poblándolos para
    // quien sí los necesite.
    //
    // `contracts` también se acota a los campos que realmente se leen (vigencia + área/turno): hay
    // UserProject con hasta ~95 contratos históricos, cada uno con decenas de campos (sueldos, URLs
    // de PDFs, el JSON crudo de la consulta a AFIP, etc.) que nadie mira desde este directory — solo
    // infla el payload y fue lo que estaba causando timeouts. El historial completo sigue disponible
    // desde `/users` o `/users/:id` para quien sí lo necesite.
    /*
      `metadata` VIENE RECORTADA, y esto es lo que hacía lento al directorio.

      Estaba pidiendo el subdocumento ENTERO: cuarenta campos por persona —domicilio, CBU, número de
      cuenta, CUIT, fecha de nacimiento, obra social— por cada uno de los ~1400 usuarios del tenant.
      Medido contra la base: 1.4 MB de respuesta, de los cuales 1.1 MB eran esos campos que ninguna
      de las dos pantallas que consumen este endpoint llega a leer. El tiempo de este endpoint es
      proporcional a los bytes, así que era más de la mitad de la espera.

      Los consumidores (`RequestsPage.tsx` y la vista Novedades del móvil) leen exactamente dos cosas
      de `metadata`: `activo` y `projects`. Se agregan `id` y `fullName`, que pesan nada y son como se
      matchea a la gente que viene de FRAME y a las solicitudes sin nombre cargado.

      Si una pantalla necesita otro campo de la ficha, lo pide a `/users/:id`: este endpoint es un
      roster, no la ficha de nadie.
    */
    const users = await User.find(filter)
      .select("firstName lastName email projectIds roles metadata.activo metadata.id metadata.fullName metadata.projects")
      // `roles` con nombre y permisos: mobile los necesita para distinguir a los coordinadores al
      // armar el roster de novedades —hoy por permiso, antes por el nombre del rol—. Es un array chico
      // de refs con unos pocos strings, cuesta bastante menos que lo de arriba.
      .populate({ path: "roles", select: "name permissions", model: Role })
      .populate("projectIds", "name")
      .populate({
        path: "metadata.projects",
        model: UserProject,
        select:
          "projectId areaId nombre_proyecto nombre_rol_frame " +
          "contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.fecha_carga " +
          "contracts.hora_inicio contracts.hora_fin contracts.areaId contracts.shiftId contracts.areaShiftAssignments",
      })
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    directoryCache.set(cacheKey, { at: Date.now(), data: users });
    res.json(users);
  } catch (error) {
    console.error("Get user directory error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/*
  GET /users/eligible-responsables — quiénes pueden quedar a cargo de un proyecto.

  Sale de un tilde en la ficha de la persona (`isProjectResponsible`). Antes salía de los roles: se
  buscaban los que tuvieran el permiso `project_responsible:eligible` O cuyo nombre dijera
  "responsable", y después los usuarios con esos roles. Eso obligaba a inventarle un rol a alguien
  para poder elegirlo en el selector, y hacía que renombrar un rol cambiara quién era elegible.
  Poder estar a cargo de un proyecto es un atributo de la persona, no una pantalla que se destapa.
*/
router.get("/eligible-responsables", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const users = await User.find({
      tenantId: req.tenantObjectId,
      "metadata.activo": true,
      isProjectResponsible: true,
    })
      .select("firstName lastName email metadata isProjectResponsible")
      .populate("roles", "name")
      .sort({ firstName: 1, lastName: 1 });

    res.json(users);
  } catch (error) {
    console.error("Get eligible responsables error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});




// GET /users/:id - Obtener usuario específico
router.get("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    })
      .select("-password")
      .populate("roles", "name description permissions")
      .populate("clientIds", "name")
      .populate("projectIds", "name")
      .populate({
        path: "metadata.projects",
        model: UserProject,
        populate: [
          { path: "areaId", select: "name description", model: Area },
          { path: "projectId", select: "name status teamConfig coordinatorAssignments clientId", model: "Project" },
        ],
      })
      .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame })
      .lean();

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userObj = user as any;
    if (userObj.metadata && Array.isArray(userObj.metadata.projects)) {
      userObj.metadata.projects = userObj.metadata.projects.filter((up: any) => up && up.projectId);
    }

    res.json(userObj);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/:id/all-contracts - Todos los contratos de la persona (cross-proyecto/cliente), enriquecidos
// con proyecto, cliente y empresas de cada proyecto para poder listarlos, filtrarlos y descargarlos.
router.get("/:id/all-contracts", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.params.id;
    // Validar que el usuario pertenece al tenant (UserProject no guarda tenantId; el scope viene por el usuario).
    const user = await User.findOne({ _id: userId, tenantId: req.tenantObjectId }).select("_id").lean();
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const ups = await UserProject.find({ userId }).lean();

    const projIds = [...new Set(ups.map((up: any) => String(up.projectId)).filter(Boolean))];
    const projects = await Project.find({ _id: { $in: projIds }, tenantId: req.tenantObjectId })
      .select("name clientId contratoEmpresas releaseEmpresas")
      .lean();
    const projMap = new Map(projects.map((p: any) => [String(p._id), p]));

    const clientIds = [...new Set(projects.map((p: any) => p.clientId).filter(Boolean).map(String))];
    const clients = await Client.find({ _id: { $in: clientIds }, tenantId: req.tenantObjectId }).select("name").lean();
    const clientMap = new Map(clients.map((c: any) => [String(c._id), c.name]));

    // Todas las empresas del ABM: sirven para resolver la razón social y, además, como fallback para los
    // proyectos que no tienen empresas configuradas (si no, no habría con qué generar el documento).
    const companies = await Company.find({}).select("razonSocial").lean();
    const companyMap = new Map(companies.map((c: any) => [String(c._id), c.razonSocial]));
    const allEmpresas = companies.map((c: any) => ({ id: String(c._id), label: c.razonSocial || "" })).filter((e) => e.label);

    const toEmpresas = (ids: any[] = []) => {
      const fromProject = ids.map((id) => ({ id: String(id), label: companyMap.get(String(id)) || "" })).filter((e) => e.label);
      return fromProject.length > 0 ? fromProject : allEmpresas;
    };

    const rows: any[] = [];
    for (const up of ups as any[]) {
      const proj: any = projMap.get(String(up.projectId));
      const projectName = proj?.name || up.nombre_proyecto || "";
      const clientId = proj?.clientId ? String(proj.clientId) : "";
      const clientName = clientId ? clientMap.get(clientId) || "" : "";
      const contratoEmpresas = toEmpresas(proj?.contratoEmpresas);
      const releaseEmpresas = toEmpresas(proj?.releaseEmpresas);
      (up.contracts || []).forEach((c: any, idx: number) => {
        rows.push({
          projectId: String(up.projectId),
          projectName,
          clientId,
          clientName,
          contratoEmpresas,
          releaseEmpresas,
          contractIndex: idx,
          contract: c,
        });
      });
    }

    // Más reciente primero (por fecha de alta).
    rows.sort((a, b) => new Date(b.contract?.fecha_alta_contrato || 0).getTime() - new Date(a.contract?.fecha_alta_contrato || 0).getTime());

    res.json(rows);
  } catch (error) {
    console.error("Get all contracts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/:id - Actualizar usuario
router.patch("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateUserSchema.parse(req.body);
    normalizarRolesFrame((data as any).metadata);
    const userId = req.params.id;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");

    // 1. Fetch Target User to identify tenant
    const query: any = { _id: userId };
    if (!isSuperAdmin) {
      if (!req.tenantObjectId) {
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      query.tenantId = req.tenantObjectId;
    }

    const currentUser = await User.findOne(query); // No "select -password" yet, we need full doc for arrays

    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Use the user's tenant for all subsequent checks
    const targetTenantId = currentUser.tenantId;

    // Si se está cambiando el email, verificar unicidad
    if (data.email) {
      const existingUser = await User.findOne({
        email: data.email,
        tenantId: targetTenantId,
        _id: { $ne: userId },
      });

      if (existingUser) {
        res.status(409).json({ error: "Email already exists in this tenant" });
        return;
      }
    }

    // Si se están actualizando roles, verificar que existen
    if (data.roles) {
      const roleObjectIds = toObjectIdArray(data.roles);

      if (roleObjectIds.length !== data.roles.length) {
        res.status(400).json({ error: "Some role IDs are invalid" });
        return;
      }

      const existingRoles = await Role.find({
        _id: { $in: roleObjectIds },
        tenantId: targetTenantId,
      });

      if (existingRoles.length !== data.roles.length) {
        res.status(400).json({ error: "Some roles do not exist in this tenant" });
        return;
      }

      data.roles = roleObjectIds.map((id) => id.toString());

      /*
        No se puede dejar sin el permiso de Novedades a alguien que tiene turnos a cargo.

        La asignación vive en `Project.coordinatorAssignments`. Sin ese permiso, esa persona abre la
        app y no tiene dónde cargar las novedades de sus áreas/turnos: no las carga nadie y aparecen
        vencidas en Cumplimiento, sin nada que explique por qué. Primero se la libera desde el equipo
        del proyecto, después se le cambian los roles.

        Antes la pregunta era "¿le queda el rol Mobile-Coordinador?" y dependía de cómo se llamara ese
        rol. Ahora se comparan los permisos EFECTIVOS —la unión de los de sus roles— antes y después,
        que es lo que la persona realmente pierde o conserva.

        Va acá y no solo en el modal porque el front se puede saltear: esto es un PATCH del API.
      */
      const permisosAntes = await permisosDeRolesIds(targetTenantId, currentUser.roles);
      const permisosDespues = permisosDeRoles(existingRoles);
      if (permisosAntes.has(MOBILE_ACTIVITY_LOGS) && !permisosDespues.has(MOBILE_ACTIVITY_LOGS)) {
        const proyectos = await Project.find({ tenantId: targetTenantId, "coordinatorAssignments.userId": currentUser._id })
          .select("name")
          .lean();
        if (proyectos.length > 0) {
          res.status(409).json({
            error: `Se quedaría sin el permiso "APP MOBILE | Novedades" y coordina turnos en ${proyectos.map((p: any) => p.name).join(", ")}. Liberá esas coordinaciones desde el equipo del proyecto y volvé a intentar.`,
          });
          return;
        }
      }
    }



    /*
      EL SELLO, TAMBIÉN AL EDITAR — y con la misma regla que en el alta: lo escribe el servidor.

      Se borra cualquier `nombreValidadoArcaAt` que venga en el body y, si el cliente pidió
      `validarConArca`, este proceso consulta el Padrón y recién entonces sella y normaliza el nombre.
      Un sello puesto desde afuera diría "confirmado contra ARCA" sobre algo que el organismo no vio.
    */
    delete (data as any).metadata?.nombreValidadoArcaAt;
    if (req.body?.validarConArca === true) {
      const cuitEditado = normalizarCuit(String((data as any).metadata?.cuit ?? currentUser.metadata?.cuit ?? ""));
      const tenantDoc = await Tenant.findById(targetTenantId).lean();
      const cfgArca = getTenantAfipConfig(tenantDoc);
      if (cuitEsValido(cuitEditado) && cfgArca) {
        try {
          const r = await consultarPadron(String(targetTenantId), cfgArca, cuitEditado);
          if (r.encontrado && r.nombre && r.apellido) {
            (data as any).firstName = r.nombre;
            (data as any).lastName = r.apellido;
            (data as any).metadata = { ...((data as any).metadata || {}), nombreValidadoArcaAt: new Date() };
          }
        } catch {
          // Sin sello: la edición sigue igual y la persona queda como estaba.
        }
      }
    }

    // Preparar updateData
    const updateData: any = { $set: {} };
    const fieldsToUnset: string[] = [];

    // Si hay password, hashear antes de update
    if (data.password) {
      const salt = await bcrypt.genSalt(12);
      data.password = await bcrypt.hash(data.password, salt);
    }

    Object.keys(data).forEach((key) => {
      const value = data[key];

      if (value === null) {
        fieldsToUnset.push(key);
      } else if (value !== undefined) {
        updateData.$set[key] = value;
      }
    });

    if (fieldsToUnset.length > 0) {
      updateData.$unset = {};
      fieldsToUnset.forEach((field) => {
        updateData.$unset[field] = "";
      });
    }

    if (Object.keys(updateData.$set).length === 0) {
      delete updateData.$set;
    }

    // Actualizar usuario
    const user = await User.findOneAndUpdate({ _id: userId, tenantId: targetTenantId }, updateData, { new: true, runValidators: true })
      .select("-password")
      .populate("roles", "name description permissions")
      .populate("clientIds", "name")
      .populate("projectIds", "name")
      .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame });

    // Sincronizar proyectos si hubo cambio
    if (data.projectIds) {
      const oldProjectIds = currentUser.projectIds.map((id) => id.toString());
      const newProjectIds = data.projectIds;

      const added = newProjectIds.filter((id) => !oldProjectIds.includes(id));
      const removed = oldProjectIds.filter((id) => !newProjectIds.includes(id));

      if (added.length > 0) {
        await Project.updateMany({ _id: { $in: added }, tenantId: targetTenantId }, { $addToSet: { assignedUsers: userId } });
      }
      if (removed.length > 0) {
        await Project.updateMany({ _id: { $in: removed }, tenantId: targetTenantId }, { $pull: { assignedUsers: userId } });
      }
    }

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/:id/password - Cambiar contraseña
router.patch("/:id/password", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { password } = updatePasswordSchema.parse(req.body);
    const userId = req.params.id;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");

    const query: any = { _id: userId };
    if (!isSuperAdmin) {
      query.tenantId = req.tenantObjectId;
    }

    const user = await User.findOne(query);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    user.password = password;
    await user.save();

    res.json({ message: "Password updated successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update password error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/:id/confirmar-cuenta-bancaria - Confirmar que la cuenta fue creada y los datos cargados
router.patch("/:id/confirmar-cuenta-bancaria", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.params.id;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");

    const query: any = { _id: userId };
    if (!isSuperAdmin) {
      if (!req.tenantObjectId) {
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      query.tenantId = req.tenantObjectId;
    }

    const currentUser = await User.findOne(query);
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Guard: no se puede confirmar si todavía no se cargaron los datos bancarios.
    const meta: any = currentUser.metadata || {};
    if (!meta.bancoId && !meta.cbu) {
      res.status(400).json({ error: "Cargá primero los datos bancarios antes de confirmar." });
      return;
    }

    const user = await User.findOneAndUpdate(
      { _id: userId, tenantId: currentUser.tenantId },
      { $set: { "metadata.cuentaBancariaConfirmada": true, "metadata.cuentaBancariaConfirmadaAt": new Date() } },
      { new: true },
    )
      .select("-password")
      .populate("roles", "name description permissions")
      .populate("clientIds", "name")
      .populate("projectIds", "name")
      .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame });

    res.json(user);
  } catch (error) {
    console.error("Confirm bank account error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/:id/confirmar-cambio-cuenta - Confirmar que el cambio de datos bancarios fue aplicado en el banco/FRAME
router.patch("/:id/confirmar-cambio-cuenta", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.params.id;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");

    const query: any = { _id: userId };
    if (!isSuperAdmin) {
      if (!req.tenantObjectId) {
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      query.tenantId = req.tenantObjectId;
    }

    const currentUser = await User.findOne(query);
    if (!currentUser) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Guard: sólo se confirma si hay un cambio de datos bancarios pendiente.
    const meta: any = currentUser.metadata || {};
    if (!meta.solicitaCambioCuenta) {
      res.status(400).json({ error: "No hay un cambio de datos bancarios pendiente para confirmar." });
      return;
    }

    const user = await User.findOneAndUpdate(
      { _id: userId, tenantId: currentUser.tenantId },
      { $set: { "metadata.cambioCuentaConfirmada": true, "metadata.cambioCuentaConfirmadaAt": new Date() } },
      { new: true },
    )
      .select("-password")
      .populate("roles", "name description permissions")
      .populate("clientIds", "name")
      .populate("projectIds", "name")
      .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame });

    res.json(user);
  } catch (error) {
    console.error("Confirm bank change error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/:id/solicitud-status - Cambiar el estado de una solicitud SIN borrarla. Se permite
// volver a "pendiente" para deshacer un rechazo/cancelación hecho por error.
router.patch("/:id/solicitud-status", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { status } = req.body || {};
    if (!["rechazada", "cancelada", "pendiente"].includes(String(status))) {
      res.status(400).json({ error: "Estado inválido. Sólo se acepta 'rechazada', 'cancelada' o 'pendiente'." });
      return;
    }

    const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!user) {
      res.status(404).json({ error: "Solicitud no encontrada" });
      return;
    }
    // Una vez aprobada ya es un usuario real: no se puede volver atrás desde acá.
    if (!user.metadata?.isSolicitud || user.metadata?.solicitudStatus === "aprobada") {
      res.status(400).json({ error: "Esta solicitud ya fue aprobada o no es una solicitud." });
      return;
    }

    const updated = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantObjectId },
      { $set: { "metadata.solicitudStatus": status } },
      { new: true },
    ).select("-password");

    res.json(updated);
  } catch (error) {
    console.error("Update solicitud status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /users/:id/approve-solicitud - Aprobar solicitud de alta y convertir en miembro del equipo
router.put("/:id/approve-solicitud", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.params.id;
    const {
      email,
      password,
      sueldo_jornada = 0,
      sueldo_mano = 0,
      nombre_contrato = "Tiempo Indeterminado",
      nombre_sede = "",
      observaciones = "",
    } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "Email y contraseña son obligatorios." });
      return;
    }

    // Find the solicitud user
    const solicitudUser = await User.findOne({ _id: userId, tenantId: req.tenantObjectId });
    if (!solicitudUser) {
      res.status(404).json({ error: "Solicitud no encontrada." });
      return;
    }

    if (!solicitudUser.metadata?.isSolicitud) {
      res.status(400).json({ error: "Este usuario no es una solicitud pendiente." });
      return;
    }

    // Check email uniqueness (excluding current user)
    const existingEmail = await User.findOne({ email, tenantId: req.tenantObjectId, _id: { $ne: userId } });
    if (existingEmail) {
      res.status(409).json({ error: "Ya existe un usuario con ese email en este tenant." });
      return;
    }

    const meta = solicitudUser.metadata;
    const projectIds = meta?.projectIds || [];
    const [horaInicio, horaFin] = (meta?.schedule || " - ").split(" - ").map(s => s.trim());

    // Create UserProject documents + contracts for each requested project
    const userProjectRefs: Types.ObjectId[] = [];

    for (const projId of projectIds) {
      // Fetch project name
      const proj = await Project.findById(projId).lean();
      const nombreProyecto = proj?.name || "";

      const contractData = {
        proyecto_id: 0,
        empleado_id: 0,
        estado_id: 1,
        categoria_sat_id: 0,
        fecha_alta_contrato: meta?.startDate || new Date().toISOString().split("T")[0],
        fecha_baja_contrato: meta?.dueDate || "",
        tipo_contrato_id: 0,
        cantidad_jornadas_laborales: meta?.workdaysCount || 0,
        // Los días viajan de la solicitud al contrato: si no, aprobarla perdería lo que la persona
        // acaba de cargar y el contrato quedaría con las jornadas pero sin saber cuáles.
        dias_por_semana: meta?.diasPorSemana ?? undefined,
        dias_semana: meta?.diasSemana || [],
        dias_rotativos: !!meta?.diasRotativos,
        sueldo_jornada,
        sueldo_mano,
        sueldo_mano_texto: `$${sueldo_mano}`,
        reemplazo: meta?.isReplacement || false,
        empleado_id_reemplezado: null,
        observaciones,
        sede_id: 0,
        rol_frame_id: 0,
        fecha_inicio_participacion: meta?.startDate || null,
        fecha_fin_participacion: meta?.dueDate || null,
        hora_inicio: horaInicio || "",
        hora_fin: horaFin || "",
        calificacion: null,
        fecha_carga: new Date().toISOString().split("T")[0],
        puede_renovar_contrato: true,
        nombre_proyecto: nombreProyecto,
        nombre_estado_empleado: "Activo",
        nombre_categoria_sat: "",
        nombre_contrato,
        nombre_sede,
        nombre_rol_frame: "",
      };

      // Resolve rol frame name if we have the id
      const rfId = meta?.rolesFrameIds?.[0];
      if (rfId) {
        try {
          const rf = await RoleFrame.findById(rfId).lean();
          if (rf) {
            contractData.nombre_rol_frame = (rf as any).name || "";
          }
        } catch (e) { /* ignore */ }
      }

      // Check if a UserProject already exists for this combination
      let userProject = await UserProject.findOne({
        projectId: new Types.ObjectId(projId.toString()),
        userId: new Types.ObjectId(userId),
        externalEmployeeId: 0,
        externalProjectId: 0,
      });

      if (!userProject) {
        userProject = new UserProject({
          projectId: new Types.ObjectId(projId.toString()),
          userId: new Types.ObjectId(userId),
          externalProjectId: 0,
          externalEmployeeId: 0,
          nombre_proyecto: nombreProyecto,
          nombre_rol_frame: contractData.nombre_rol_frame,
          contracts: [contractData],
        });
        await userProject.save();
      } else {
        userProject.contracts.push(contractData as any);
        await userProject.save();
      }

      userProjectRefs.push(userProject._id as Types.ObjectId);

      // Add user to project assignedUsers
      await Project.findByIdAndUpdate(projId, { $addToSet: { assignedUsers: userId } });
    }

    // Hash the new password
    const bcryptModule = await import("bcryptjs");
    const salt = await bcryptModule.default.genSalt(12);
    const hashedPassword = await bcryptModule.default.hash(password, salt);

    // Update the user: activate, set real email/password, link projects
    const updatePayload: any = {
      email,
      password: hashedPassword,
      "metadata.activo": true,
      projectIds: projectIds.map((id: any) => new Types.ObjectId(id.toString())),
      "metadata.isSolicitud": false,
      "metadata.solicitudStatus": "aprobada",
      "metadata.projects": userProjectRefs,
    };

    // Set firstName/lastName from fullName
    if (meta?.fullName) {
      const parts = meta.fullName.split(" ");
      updatePayload.firstName = parts[0] || "Usuario";
      updatePayload.lastName = parts.slice(1).join(" ") || "";
    }

    await User.findByIdAndUpdate(userId, { $set: updatePayload });

    // Return the updated user
    const updatedUser = await User.findById(userId)
      .select("-password")
      .populate("roles", "name description permissions")
      .populate("clientIds", "name")
      .populate("projectIds", "name")
      .populate({ path: "metadata.projects", model: UserProject })
      .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame });

    res.json(updatedUser);
  } catch (error) {
    console.error("Approve solicitud error:", error);
    res.status(500).json({ error: "Error al aprobar la solicitud." });
  }
});

// DELETE /users/:id - Eliminar usuario
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.params.id;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");

    const query: any = { _id: userId };
    if (!isSuperAdmin) {
      query.tenantId = req.tenantObjectId;
    }
    const userToDelete = await User.findOne(query);

    if (!userToDelete) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (userToDelete.isSystem) {
      res.status(403).json({ error: "No se puede eliminar un usuario del sistema protegido." });
      return;
    }

    const user = await User.findOneAndDelete(query);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Remover usuario del array userIds del tenant
    if (user.tenantId) {
      await Tenant.findByIdAndUpdate(user.tenantId, {
        $pull: { userIds: user._id },
        $inc: { "usage.users.current": -1 },
      });
    }

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const externalApi = new ExternalApiService();

// GET /users/import/config - Obtener configuración de auto-importación
router.get("/import/config", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    let config = await ImportConfig.findOne({ tenantId: req.tenantObjectId });
    if (!config) {
      config = await ImportConfig.create({
        tenantId: req.tenantObjectId,
        isEnabled: false,
        intervalHours: 24,
        syncProjects: true
      });
    }
    res.json(config);
  } catch (error) {
    console.error("Get import config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /users/import/config - Guardar configuración de auto-importación
router.post("/import/config", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { isEnabled, intervalHours, syncProjects, sinceDays } = req.body;
    
    let config = await ImportConfig.findOne({ tenantId: req.tenantObjectId });
    
    const wasEnabled = config?.isEnabled === true;

    if (!config) {
      config = new ImportConfig({
        tenantId: req.tenantObjectId
      });
    }

    config.isEnabled = isEnabled === true;
    config.intervalHours = Number(intervalHours) || 24;
    config.syncProjects = syncProjects === true;
    config.sinceDays = sinceDays !== undefined ? Number(sinceDays) : undefined;

    if (config.isEnabled && (!wasEnabled || config.isModified("intervalHours"))) {
      // Recalculate next run
      const nextRunTime = new Date();
      // Sync immediately in 1 minute on enable
      nextRunTime.setMinutes(nextRunTime.getMinutes() + 1);
      config.nextRun = nextRunTime;
    } else if (!config.isEnabled) {
      config.nextRun = undefined;
    }

    await config.save();
    res.json(config);
  } catch (error) {
    console.error("Save import config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/import/history - Obtener historial completo de importaciones
router.get("/import/history", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const history = await ImportHistory.find({ tenantId: req.tenantObjectId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(history);
  } catch (error) {
    console.error("Get import history error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/import/history/latest - Obtener último registro de importación
router.get("/import/history/latest", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const latest = await ImportHistory.findOne({ tenantId: req.tenantObjectId })
      .sort({ createdAt: -1 });
    res.json(latest || null);
  } catch (error) {
    console.error("Get latest import history error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/import/last-added-details - Usuarios del último import con sus proyectos,
// rol frame y contratos (desde users_&_projects), para la tabla "Nuevos Usuarios".
router.get("/import/last-added-details", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const latest = await ImportHistory.findOne({
      tenantId: req.tenantObjectId,
      status: "success",
      "addedUsers.0": { $exists: true },
    }).sort({ createdAt: -1 });

    if (!latest) {
      res.json([]);
      return;
    }

    const emails = latest.addedUsers.map((u) => u.email).filter(Boolean);
    const users = await User.find({ tenantId: req.tenantObjectId, email: { $in: emails } })
      .select("_id email name firstName lastName metadata.documento");

    const userIds = users.map((u) => u._id);
    const relations = await UserProject.find({ userId: { $in: userIds } })
      .select("userId nombre_proyecto nombre_rol_frame contracts");

    // Agrupar relaciones por usuario
    const relByUser = new Map<string, any[]>();
    for (const r of relations) {
      const key = r.userId.toString();
      if (!relByUser.has(key)) relByUser.set(key, []);
      relByUser.get(key)!.push({
        nombre_proyecto: r.nombre_proyecto || "",
        nombre_rol_frame: r.nombre_rol_frame || "",
        contracts: (r.contracts || []).map((c: any) => ({
          nombre_contrato: c.nombre_contrato || "",
          nombre_rol_frame: c.nombre_rol_frame || "",
          fecha_alta_contrato: c.fecha_alta_contrato || "",
          fecha_baja_contrato: c.fecha_baja_contrato || "",
        })),
      });
    }

    const result = users.map((u) => ({
      name: u.name || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      email: u.email,
      dni: u.metadata?.documento || "",
      projects: relByUser.get((u._id as any).toString()) || [],
    }));

    res.json(result);
  } catch (error) {
    console.error("Get last added details error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /users/import/check - Pre-chequear importación de usuarios
router.post("/import/check", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { sinceDays } = req.body;
    if (sinceDays === undefined || isNaN(Number(sinceDays))) {
      res.status(400).json({ error: "sinceDays parameter is required and must be a number" });
      return;
    }

    const result = await externalApi.checkImportUsers(Number(sinceDays));
    res.json(result);
  } catch (error) {
    console.error("Check import error:", error);
    res.status(500).json({ error: "Failed to check import users" });
  }
});

// POST /users/import/trigger - Disparar importación manual de usuarios
// Con ~1900+ empleados y llamadas secuenciales por empleado contra FRAME, un ciclo completo puede
// tardar varios minutos: muy por encima de cualquier timeout razonable de un request HTTP (el
// frontend corta a los 60s). Por eso NO se espera acá: se dispara en segundo plano y se responde
// al toque; el frontend hace polling de `GET /import/history/latest` (que arranca en "running")
// hasta que termine. El propio `importUsers` deja el registro en Mongo con el resultado final.
router.post("/import/trigger", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { syncProjects, sinceDays } = req.body;
    const limitDays = sinceDays !== undefined && !isNaN(Number(sinceDays)) ? Number(sinceDays) : undefined;

    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const yaHayUnaEnCurso = await ImportHistory.exists({ tenantId: req.tenantObjectId, status: "running" });
    if (yaHayUnaEnCurso) {
      res.status(409).json({ error: "Ya hay una sincronización en curso. Esperá a que termine antes de disparar otra." });
      return;
    }

    // Fire-and-forget: `importUsers` guarda su propio registro "running" → "success"/"failed" en
    // ImportHistory, así que no hace falta esperar el resultado acá ni manejarlo en el .catch (ya
    // queda reflejado en el historial; esto solo evita un "unhandled rejection" en los logs).
    externalApi
      .importUsers(req.tenantObjectId.toString(), new Types.ObjectId(userId), syncProjects === true, limitDays)
      .catch((err) => console.error("[IMPORT USERS] Background sync failed:", err));

    res.status(202).json({ message: "Sincronización iniciada en segundo plano." });
  } catch (error: any) {
    console.error("Trigger import error:", error);
    res.status(500).json({ error: error.message || "Failed to import users" });
  }
});

export { router as userRoutes };
