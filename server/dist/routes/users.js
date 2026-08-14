import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Project } from "../models/Project.js";
import { Tenant } from "../models/Tenant.js";
import { RoleFrame } from "../models/RoleFrame.js";
import UserProject from "../models/UserProject.js"; // This registers the model
import { Position } from "../models/Position.js";
import { Level } from "../models/Level.js";
import { Area } from "../models/Area.js";
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
import "../models/Position.js";
import "../models/Level.js";
import "../models/Area.js";
import "../models/Client.js";
import { ImportConfig } from "../models/ImportConfig.js";
import { ImportHistory } from "../models/ImportHistory.js";
import { ExternalApiService } from "../services/externalApiService.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdArray } from "../utils/mongoIds.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";
import { esContratoVigente, getContratoActivo } from "../utils/contratoVigencia.js";
const router = Router();
/* ------------------- Filtros del equipo de un proyecto (client-side → server) -------------------
 * Estos filtros dependen del ÚLTIMO contrato del miembro en el proyecto o de su asignación de
 * área/turno, así que no se pueden expresar como query de Mongo. Se resuelven acá y se aplican al
 * listado como `_id in [...]`: de esa forma la paginación devuelve los resultados correlativos en
 * vez de filtrar solo la página ya cargada. Replican exactamente el criterio que usaba el front.
 */
const normalizarEstado = (s) => (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
// "Falta pedido de AFIP" y "Pedido de AFIP" son el mismo estado (igual que `estadoLabel` en el front).
const ESTADO_ALIAS = { "falta pedido de afip": "pedido de afip", "pedido servicios": "pedido de servicios" };
const estadoCanonico = (s) => {
    const n = normalizarEstado(s);
    return ESTADO_ALIAS[n] || n;
};
async function resolveProjectTeamFilterIds(projectId, filtros) {
    const project = await Project.findById(projectId).select("teamConfig coordinatorAssignments").lean();
    if (!project)
        return [];
    const members = await User.find({ projectIds: projectId })
        .select("_id firstName lastName roles metadata.projects")
        .populate({ path: "roles", select: "name", model: Role })
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
    const configByUser = new Map((project.teamConfig || []).map((c) => [String(c.userId), c]));
    // Mismo criterio laxo que el front (`checkIsCoordinator`): rol o nombre que diga "coordinador".
    const esCoordinador = (m) => {
        if ((m.roles || []).some((r) => String(r?.name || "").toLowerCase().includes("coordinador")))
            return true;
        return `${m.firstName || ""} ${m.lastName || ""}`.toLowerCase().includes("coordinador");
    };
    const ids = [];
    for (const member of members) {
        const up = (member.metadata?.projects || []).find((p) => p && String(p.projectId) === String(projectId));
        const contracts = up?.contracts || [];
        // El contrato que representa su situación actual: el vigente más reciente (un tiempo
        // indeterminado no tiene baja y siempre lo es), no simplemente el último cargado.
        const contratoActivo = getContratoActivo(contracts);
        if (filtros.vigencia) {
            // Sin contratos se considera vigente, como se venía comportando el filtro.
            const vigente = contracts.length === 0 || esContratoVigente(contratoActivo);
            if (filtros.vigencia === "vigente" ? !vigente : vigente)
                continue;
        }
        if (filtros.tipoContrato && String(contratoActivo?.nombre_contrato ?? "") !== String(filtros.tipoContrato))
            continue;
        if (filtros.reemplazo) {
            // Igual que la columna Reemplazo: el contrato marca que la persona reemplaza a otra.
            const esReemplazo = !!contratoActivo?.reemplazo;
            if (filtros.reemplazo === "con" ? !esReemplazo : esReemplazo)
                continue;
        }
        if (filtros.estadoContrato && estadoCanonico(String(contratoActivo?.nombre_estado_empleado ?? "")) !== estadoCanonico(String(filtros.estadoContrato)))
            continue;
        if (filtros.areaTurno) {
            // Área/turno del miembro: teamConfig + lo que coordina (si es coordinador).
            const keys = new Set();
            for (const asa of configByUser.get(String(member._id))?.areaShiftAssignments || []) {
                const areaId = asa?.areaId?._id || asa?.areaId;
                if (!areaId)
                    continue;
                for (const sid of asa?.shiftIds || []) {
                    const shiftId = sid?._id || sid;
                    if (shiftId)
                        keys.add(`${areaId}::${shiftId}`);
                }
            }
            if (esCoordinador(member)) {
                for (const asm of project.coordinatorAssignments || []) {
                    if (String(asm?.userId) !== String(member._id))
                        continue;
                    const areaId = asm?.areaId?._id || asm?.areaId;
                    const shiftId = asm?.shiftId?._id || asm?.shiftId;
                    if (areaId && shiftId)
                        keys.add(`${areaId}::${shiftId}`);
                }
            }
            if (filtros.areaTurno === "__none__") {
                if (keys.size > 0)
                    continue;
            }
            else if (!keys.has(String(filtros.areaTurno))) {
                continue;
            }
        }
        ids.push(member._id);
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
const normalizarRolesFrame = (metadata) => {
    if (!metadata || typeof metadata !== "object")
        return;
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
router.get("/count", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const { isActive } = req.query;
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        const filter = isSuperAdmin ? {} : { tenantId: req.tenantObjectId };
        if (isActive !== undefined) {
            filter["metadata.activo"] = isActive === "true";
        }
        if (req.query.metadataActivo !== undefined) {
            filter["metadata.activo"] = req.query.metadataActivo === "true";
        }
        const count = await User.countDocuments(filter);
        res.json({ count });
    }
    catch (error) {
        console.error("Count users error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /users - Listar usuarios
router.get("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const { page = 1, limit = 50, email, isActive, areaId } = req.query;
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        const andConditions = [];
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
        }
        else if (req.query.isSolicitud === undefined) {
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
        // Filtro por NOMBRE de rol (ej. "mobile-coordinador"). Se resuelve acá porque el cliente no puede
        // listar /roles sin el permiso admin_roles:view. El separador es flexible: "Mobile-Coordinador",
        // "Mobile Coordinador" y "mobile_coordinador" matchean igual (match exacto sobre el nombre completo).
        if (req.query.roleName) {
            const parts = String(req.query.roleName)
                .toLowerCase()
                .split(/[^a-z0-9]+/i)
                .filter(Boolean);
            if (parts.length > 0) {
                const roleFilter = { name: { $regex: `^${parts.join("[^a-z0-9]*")}$`, $options: "i" } };
                if (!isSuperAdmin)
                    roleFilter.tenantId = req.tenantObjectId;
                const roleIds = await Role.find(roleFilter).distinct("_id");
                andConditions.push({ roles: { $in: roleIds } }); // sin roles que matcheen → 0 resultados
            }
        }
        // Filtros del equipo que dependen del último contrato o del área/turno del miembro. Resolverlos
        // acá (y no en el front sobre la página cargada) es lo que hace que la paginación sea correlativa.
        const teamFilters = {
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
        const projectsPopulate = slimProjects
            ? {
                path: "metadata.projects",
                model: UserProject,
                select: "projectId nombre_rol_frame nombre_proyecto nombre_sede",
            }
            : {
                path: "metadata.projects",
                model: UserProject,
                select: "projectId positionId levelId areaId nombre_rol_frame nombre_proyecto contracts",
                populate: [
                    { path: "positionId", select: "name", model: Position },
                    { path: "levelId", select: "name", model: Level },
                    { path: "areaId", select: "name", model: Area },
                    // NOTA: no traer teamConfig/coordinatorAssignments aquí: son arrays
                    // potencialmente enormes que no se usan en esta lista y disparan timeouts.
                    { path: "projectId", select: "name status clientId", model: Project },
                ],
            };
        let query = lightweight
            ? User.find(filter).select("firstName lastName email metadata.id metadata.activo metadata.isSolicitud roles").populate({ path: "roles", select: "name", model: Role })
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
        const sortDir = req.query.order === "desc" ? -1 : 1;
        // Columnas que salen directo del documento del usuario.
        const CAMPOS_ORDENABLES = {
            name: ["firstName", "lastName"],
            email: ["email"],
            cuit: ["metadata.cuit"],
            documento: ["metadata.documento"],
            estado: ["metadata.activo"],
        };
        // Columnas calculadas (dependen de otra colección). Se resuelven con una agregación liviana que
        // solo devuelve los _id de la página ya ordenados; el populate pesado de arriba corre después
        // sobre esos pocos documentos, no sobre los ~1500 del tenant.
        let idsOrdenados = null;
        if (sortKey === "contratos" || sortKey === "roles") {
            const pipeline = [{ $match: filter }];
            if (sortKey === "contratos") {
                pipeline.push({
                    $lookup: {
                        // Ojo: la colección no es la pluralización por defecto, está fijada en el modelo.
                        from: UserProject.collection.name,
                        localField: "metadata.projects",
                        foreignField: "_id",
                        as: "_ups",
                        pipeline: [{ $project: { n: { $size: { $ifNull: ["$contracts", []] } } } }],
                    },
                }, { $addFields: { _orden: { $sum: "$_ups.n" } } });
            }
            else {
                pipeline.push({
                    $lookup: {
                        from: Role.collection.name,
                        localField: "roles",
                        foreignField: "_id",
                        as: "_roles",
                        pipeline: [{ $project: { name: 1 } }],
                    },
                }, 
                // Con varios roles ordena por el primero alfabéticamente, que es el que la tabla muestra primero.
                { $addFields: { _orden: { $min: "$_roles.name" } } });
            }
            pipeline.push({ $sort: { _orden: sortDir, _id: 1 } }, { $skip: skip }, { $limit: limitNum }, { $project: { _id: 1 } });
            const ordenados = await User.aggregate(pipeline).collation({ locale: "es", strength: 1 }).exec();
            idsOrdenados = ordenados.map((d) => d._id);
        }
        if (idsOrdenados) {
            // La agregación ya paginó: acá solo se hidratan esos _id (el orden se reaplica más abajo).
            query = query.find({ _id: { $in: idsOrdenados } });
        }
        else if (CAMPOS_ORDENABLES[sortKey]) {
            const spec = {};
            for (const campo of CAMPOS_ORDENABLES[sortKey])
                spec[campo] = sortDir;
            // Desempate estable: sin esto dos usuarios con el mismo valor pueden repetirse o saltearse
            // entre páginas, porque Mongo no garantiza un orden para los empates.
            spec._id = 1;
            query = query.collation({ locale: "es", strength: 1 }).sort(spec).skip(skip).limit(limitNum);
        }
        else {
            query = query.sort({ _id: -1 }).skip(skip).limit(limitNum);
        }
        query = query.lean();
        const [users, total] = await Promise.all([query.exec(), User.countDocuments(filter).exec()]);
        // `find({_id: {$in: [...]}})` no respeta el orden del array: hay que reaplicarlo.
        if (idsOrdenados) {
            const posicion = new Map(idsOrdenados.map((id, i) => [String(id), i]));
            users.sort((a, b) => (posicion.get(String(a._id)) ?? 0) - (posicion.get(String(b._id)) ?? 0));
        }
        // Filter out projects that no longer exist for each user
        const cleanedUsers = users.map((u) => {
            if (u.metadata?.projects && Array.isArray(u.metadata.projects)) {
                u.metadata.projects = u.metadata.projects.filter((up) => up && up.projectId);
            }
            return u;
        });
        // Fast enrichment using populated data
        const enrichedUsers = cleanedUsers.map((userObj) => {
            const userSedeNames = new Set();
            const userRolFrameNames = new Set();
            if (userObj.metadata?.projects && Array.isArray(userObj.metadata.projects)) {
                for (const up of userObj.metadata.projects) {
                    if (!up || typeof up !== "object")
                        continue;
                    // Priority 1: Top level names (Fastest)
                    if (up.nombre_rol_frame)
                        userRolFrameNames.add(up.nombre_rol_frame);
                    if (up.nombre_sede)
                        userSedeNames.add(up.nombre_sede);
                    // Priority 2: From contracts (Only if needed or to ensure we have all history)
                    // We limit this to avoid heavy processing if contracts is large
                    if (Array.isArray(up.contracts)) {
                        for (const c of up.contracts) {
                            if (c.nombre_sede)
                                userSedeNames.add(c.nombre_sede);
                            if (c.nombre_rol_frame)
                                userRolFrameNames.add(c.nombre_rol_frame);
                        }
                    }
                }
            }
            // Priority 3: Roles frame propios del usuario (metadata.roles_frame, populado desde RoleFrame)
            if (Array.isArray(userObj.metadata?.roles_frame)) {
                for (const rf of userObj.metadata.roles_frame) {
                    if (rf?.name)
                        userRolFrameNames.add(rf.name);
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
        const idsPagina = enrichedUsers.map((u) => u._id).filter(Boolean);
        const solicitudesPorUsuario = new Map();
        if (idsPagina.length > 0) {
            const pendientes = await User.find({
                "metadata.isSolicitud": true,
                "metadata.solicitudStatus": "pendiente",
                "metadata.solicitudUserId": { $in: idsPagina },
            })
                .select("metadata.solicitudUserId metadata.projectIds metadata.startDate metadata.dueDate createdAt")
                .populate({ path: "metadata.projectIds", select: "name", model: Project })
                .lean();
            pendientes.forEach((s) => {
                const dueño = String(s.metadata?.solicitudUserId || "");
                if (!dueño)
                    return;
                const lista = solicitudesPorUsuario.get(dueño) || [];
                lista.push({
                    _id: String(s._id),
                    proyectos: (s.metadata?.projectIds || []).map((p) => ({ _id: String(p?._id || p), name: p?.name || "" })).filter((p) => p.name),
                    startDate: s.metadata?.startDate || "",
                    dueDate: s.metadata?.dueDate || "",
                    createdAt: s.createdAt,
                });
                solicitudesPorUsuario.set(dueño, lista);
            });
        }
        res.json({
            users: enrichedUsers.map((u) => ({ ...u, solicitudesPendientes: solicitudesPorUsuario.get(String(u._id)) || [] })),
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit)),
            },
        });
    }
    catch (error) {
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
router.get("/contracts-overview", requireTenant, authenticateToken, requirePermission("admin_contracts:view"), async (req, res) => {
    try {
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        const projectFilter = isSuperAdmin ? {} : { tenantId: req.tenantObjectId };
        if (req.query.clientId)
            projectFilter.clientId = req.query.clientId;
        if (req.query.projectId)
            projectFilter._id = req.query.projectId;
        // Se traen los proyectos con sus empresas (contrato/release) para poder ofrecer la descarga por
        // empresa en la tabla (igual que /all-contracts), no solo sus ids.
        const projectsList = await Project.find(projectFilter).select("_id name clientId contratoEmpresas releaseEmpresas").lean();
        if (projectsList.length === 0) {
            res.json({ rows: [], total: 0, page: 1, totalPages: 1 });
            return;
        }
        const projectIds = projectsList.map((p) => p._id);
        // Empresas por proyecto, con fallback a todas las del ABM cuando el proyecto no tiene ninguna
        // configurada (mismo criterio que GET /:id/all-contracts, si no no habría con qué generar el PDF).
        const companies = await Company.find({}).select("razonSocial").lean();
        const companyMap = new Map(companies.map((c) => [String(c._id), c.razonSocial]));
        const allEmpresas = companies.map((c) => ({ id: String(c._id), label: c.razonSocial || "" })).filter((e) => e.label);
        const toEmpresas = (ids = []) => {
            const fromProject = (ids || []).map((id) => ({ id: String(id), label: companyMap.get(String(id)) || "" })).filter((e) => e.label);
            return fromProject.length > 0 ? fromProject : allEmpresas;
        };
        const empresasPorProyecto = new Map();
        projectsList.forEach((p) => empresasPorProyecto.set(String(p._id), { contratoEmpresas: toEmpresas(p.contratoEmpresas), releaseEmpresas: toEmpresas(p.releaseEmpresas) }));
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
        const camposContrato = { a: "$$x.fecha_alta_contrato", b: "$$x.fecha_baja_contrato", g: "$$x.fecha_carga" };
        if (necesitaNombreContrato)
            camposContrato.n = "$$x.nombre_contrato";
        if (necesitaEstado)
            camposContrato.e = "$$x.nombre_estado_empleado";
        if (necesitaReemplazo)
            camposContrato.m = "$$x.reemplazo";
        const membershipsRaw = await UserProject.aggregate([
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
        const memberships = membershipsRaw.map((d) => ({
            _id: d._id,
            projectId: d.p,
            userId: d.u,
            nombre_rol_frame: d.r,
            contracts: (d.c || []).map((c) => ({ fecha_alta_contrato: c.a, fecha_baja_contrato: c.b, fecha_carga: c.g, nombre_contrato: c.n, nombre_estado_empleado: c.e, reemplazo: c.m })),
        }));
        const msFase1 = Date.now() - tFase1;
        // Usuario, roles y cliente se resuelven con tres consultas en bloque en vez de con populate por
        // membership (el populate de `metadata` completo traía 40+ campos por persona, incluido el array
        // de proyectos, para usar cuatro).
        // Hay memberships viejos sin userId: si se cuelan, el $in revienta al castear a ObjectId.
        const userIds = [...new Set(memberships.map((m) => String(m.userId || "")))].filter((id) => Types.ObjectId.isValid(id));
        const [usersList, clientsList] = await Promise.all([
            User.find({ _id: { $in: userIds } })
                .select("firstName lastName email roles metadata.activo metadata.id metadata.cuit metadata.sinCuit metadata.osId")
                .populate({ path: "roles", select: "name", model: Role })
                .lean(),
            Client.find({ _id: { $in: [...new Set(projectsList.map((p) => String(p.clientId?._id || p.clientId || "")))].filter((id) => Types.ObjectId.isValid(id)) } })
                .select("name")
                .lean(),
        ]);
        const userMap = new Map(usersList.map((u) => [String(u._id), u]));
        const clientNameById = new Map(clientsList.map((c) => [String(c._id), c.name]));
        const projectMap = new Map(projectsList.map((p) => [String(p._id), p]));
        const search = req.query.search ? String(req.query.search) : "";
        const fuzzySearch = search ? createFuzzySearchRegex(search) : "";
        const searchRegex = fuzzySearch ? new RegExp(fuzzySearch, "i") : null;
        const metadataActivo = req.query.metadataActivo !== undefined ? req.query.metadataActivo === "true" : undefined;
        const vigencia = req.query.vigencia ? String(req.query.vigencia) : undefined;
        const tipoContrato = req.query.tipoContrato ? String(req.query.tipoContrato) : undefined;
        const estadoContrato = req.query.estadoContrato ? String(req.query.estadoContrato) : undefined;
        const reemplazo = req.query.reemplazo ? String(req.query.reemplazo) : undefined;
        const roleNameParts = req.query.roleName
            ? String(req.query.roleName)
                .toLowerCase()
                .split(/[^a-z0-9]+/i)
                .filter(Boolean)
            : [];
        const roleFilterRegex = roleNameParts.length > 0 ? new RegExp(`^${roleNameParts.join("[^a-z0-9]*")}$`, "i") : null;
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
        const rows = [];
        for (const m of memberships) {
            const user = userMap.get(String(m.userId));
            const project = projectMap.get(String(m.projectId));
            if (!user || !project)
                continue;
            const contratos = m.contracts || [];
            const contratoActivo = getContratoActivo(contratos);
            if (!contratoActivo)
                continue;
            if (metadataActivo !== undefined && !!user.metadata?.activo !== metadataActivo)
                continue;
            if (vigencia) {
                const vigente = esContratoVigente(contratoActivo);
                if (vigencia === "vigente" ? !vigente : vigente)
                    continue;
            }
            if (tipoContrato && String(contratoActivo.nombre_contrato ?? "") !== tipoContrato)
                continue;
            if (estadoContrato && estadoCanonico(String(contratoActivo.nombre_estado_empleado ?? "")) !== estadoCanonico(estadoContrato))
                continue;
            if (estadosFiltro.length > 0 && !estadosFiltro.includes(estadoCanonico(String(contratoActivo.nombre_estado_empleado ?? ""))))
                continue;
            if (reemplazo) {
                const esReemplazo = !!contratoActivo.reemplazo;
                if (reemplazo === "con" ? !esReemplazo : esReemplazo)
                    continue;
            }
            if (roleFilterRegex && !(user.roles || []).some((r) => roleFilterRegex.test(String(r?.name || ""))))
                continue;
            if (searchRegex) {
                const nombreCompleto = `${user.firstName || ""} ${user.lastName || ""}`.trim();
                const candidatos = [nombreCompleto, user.email, project.name, m.nombre_rol_frame, contratoActivo.nombre_contrato];
                if (!candidatos.some((c) => c && searchRegex.test(String(c))))
                    continue;
            }
            const clientId = project.clientId ? String(project.clientId?._id || project.clientId) : "";
            rows.push({
                _id: String(m._id),
                userId: String(user._id),
                userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email,
                userEmail: user.email,
                userActivo: !!user.metadata?.activo,
                userExternalId: user.metadata?.id ?? null,
                userRoles: (user.roles || []).map((r) => ({ _id: String(r._id), name: r.name })),
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
                osId: user.metadata?.osId ?? null,
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
        const contratoActivoPorMembership = new Map();
        if (pageRows.length > 0) {
            const ids = pageRows.map((r) => new Types.ObjectId(r._id));
            const docs = await UserProject.aggregate([
                { $match: { _id: { $in: ids } } },
                {
                    $project: {
                        c: {
                            $arrayElemAt: [
                                { $ifNull: ["$contracts", []] },
                                { $switch: { branches: pageRows.map((r) => ({ case: { $eq: ["$_id", new Types.ObjectId(r._id)] }, then: r.contractIndex })), default: 0 } },
                            ],
                        },
                    },
                },
            ]);
            docs.forEach((d) => contratoActivoPorMembership.set(String(d._id), d.c || {}));
        }
        const fullRows = pageRows.map((r) => {
            const c = contratoActivoPorMembership.get(r._id) || {};
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
                // Flujo "Sin CUIT": documentación de respaldo + OK manual (pestaña Sin CUIT de Contratos).
                sinCuitValidacion: c.sinCuitValidacion || null,
            };
        });
        // Deja a la vista dónde se va el tiempo (es la consulta más pesada de la app y depende del
        // ancho de banda contra Atlas, no del CPU): sin esto hay que adivinar si tarda por la fase 1 o la 2.
        console.log(`[contracts-overview] fase1 ${msFase1}ms (${memberships.length} memberships) · fase2 ${Date.now() - tFase2}ms (${pageRows.length} filas) · total ${total}`);
        res.json({ rows: fullRows, total, page, totalPages });
    }
    catch (error) {
        console.error("Get contracts overview error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /users - Crear usuario
router.post("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const data = createUserSchema.parse(req.body);
        normalizarRolesFrame(data.metadata);
        if (data.levelId === null) {
            data.levelId = undefined;
        }
        // Toda solicitud de alta nace "pendiente" (ciclo de vida tipo Pedido).
        if (data.metadata?.isSolicitud === true && !data.metadata.solicitudStatus) {
            data.metadata.solicitudStatus = "pendiente";
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
            }
            else {
                console.log(`[User Creation] Assigning default role: ${defaultRole.name} (${defaultRole._id})`);
            }
            rolesToAssign = defaultRole ? [defaultRole._id.toString()] : [];
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
    }
    catch (error) {
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
const directoryCache = new Map();
router.get("/directory", requireTenant, authenticateToken, async (req, res) => {
    try {
        const status = req.query.status;
        const cacheKey = `${req.tenantObjectId}:${status || "active"}`;
        const cached = directoryCache.get(cacheKey);
        if (cached && Date.now() - cached.at < DIRECTORY_CACHE_TTL_MS) {
            res.json(cached.data);
            return;
        }
        const filter = { tenantId: req.tenantObjectId };
        if (status === "inactive") {
            filter["metadata.activo"] = { $ne: true };
        }
        else if (status === "all") {
            // No filter on activo - return all users
        }
        else {
            // Default: active only
            filter["metadata.activo"] = true;
        }
        // Ningún consumidor de este directory (RequestsPage.tsx, mobile ActivityLogs.tsx) lee
        // positionId/levelId/areaId POBLADOS de metadata.projects (solo el areaId crudo, como id) —
        // ese sub-populate triple, multiplicado por cada proyecto de cada uno de los ~1500+ usuarios
        // del tenant, era puro costo sin uso. `/users` (el endpoint completo) sigue poblándolos para
        // quien sí los necesite.
        //
        // `contracts` también se acota a los campos que realmente se leen (vigencia + área/turno): hay
        // UserProject con hasta ~95 contratos históricos, cada uno con decenas de campos (sueldos, URLs
        // de PDFs, el JSON crudo de la consulta a AFIP, etc.) que nadie mira desde este directory — solo
        // infla el payload y fue lo que estaba causando timeouts. El historial completo sigue disponible
        // desde `/users` o `/users/:id` para quien sí lo necesite.
        const users = await User.find(filter)
            .select("firstName lastName email projectIds roles metadata")
            // `roles` (solo el nombre): mobile lo necesita para distinguir a los coordinadores al armar
            // el roster de novedades. Es un array chico de refs, cuesta bastante menos que lo de arriba.
            .populate({ path: "roles", select: "name", model: Role })
            .populate("projectIds", "name")
            .populate({
            path: "metadata.projects",
            model: UserProject,
            select: "projectId positionId levelId areaId nombre_proyecto nombre_rol_frame " +
                "contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.fecha_carga " +
                "contracts.hora_inicio contracts.hora_fin contracts.areaId contracts.shiftId contracts.areaShiftAssignments",
        })
            .sort({ firstName: 1, lastName: 1 })
            .lean();
        directoryCache.set(cacheKey, { at: Date.now(), data: users });
        res.json(users);
    }
    catch (error) {
        console.error("Get user directory error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /users/eligible-responsables - Listar usuarios elegibles como responsables de proyecto
// Busca roles que tengan el permiso "project_responsible:eligible" y devuelve los usuarios con esos roles
router.get("/eligible-responsables", requireTenant, authenticateToken, async (req, res) => {
    try {
        // 1. Encontrar todos los roles del tenant que incluyen el permiso o tienen "Responsable" en el nombre
        const eligibleRoles = await Role.find({
            tenantId: req.tenantObjectId,
            $or: [
                { permissions: "project_responsible:eligible" },
                { name: { $regex: /responsable/i } }
            ]
        }).select("_id");
        const eligibleRoleIds = eligibleRoles.map(r => r._id);
        // 2. Encontrar usuarios activos que tengan alguno de esos roles
        const users = await User.find({
            tenantId: req.tenantObjectId,
            "metadata.activo": true,
            roles: { $in: eligibleRoleIds },
        })
            .select("firstName lastName email metadata")
            .populate("roles", "name")
            .sort({ firstName: 1, lastName: 1 });
        res.json(users);
    }
    catch (error) {
        console.error("Get eligible responsables error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /users/:id - Obtener usuario específico
router.get("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
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
                { path: "positionId", select: "name description", model: Position },
                { path: "levelId", select: "name description", model: Level },
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
        const userObj = user;
        if (userObj.metadata && Array.isArray(userObj.metadata.projects)) {
            userObj.metadata.projects = userObj.metadata.projects.filter((up) => up && up.projectId);
        }
        res.json(userObj);
    }
    catch (error) {
        console.error("Get user error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /users/:id/all-contracts - Todos los contratos de la persona (cross-proyecto/cliente), enriquecidos
// con proyecto, cliente y empresas de cada proyecto para poder listarlos, filtrarlos y descargarlos.
router.get("/:id/all-contracts", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const userId = req.params.id;
        // Validar que el usuario pertenece al tenant (UserProject no guarda tenantId; el scope viene por el usuario).
        const user = await User.findOne({ _id: userId, tenantId: req.tenantObjectId }).select("_id").lean();
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        const ups = await UserProject.find({ userId }).lean();
        const projIds = [...new Set(ups.map((up) => String(up.projectId)).filter(Boolean))];
        const projects = await Project.find({ _id: { $in: projIds }, tenantId: req.tenantObjectId })
            .select("name clientId contratoEmpresas releaseEmpresas")
            .lean();
        const projMap = new Map(projects.map((p) => [String(p._id), p]));
        const clientIds = [...new Set(projects.map((p) => p.clientId).filter(Boolean).map(String))];
        const clients = await Client.find({ _id: { $in: clientIds }, tenantId: req.tenantObjectId }).select("name").lean();
        const clientMap = new Map(clients.map((c) => [String(c._id), c.name]));
        // Todas las empresas del ABM: sirven para resolver la razón social y, además, como fallback para los
        // proyectos que no tienen empresas configuradas (si no, no habría con qué generar el documento).
        const companies = await Company.find({}).select("razonSocial").lean();
        const companyMap = new Map(companies.map((c) => [String(c._id), c.razonSocial]));
        const allEmpresas = companies.map((c) => ({ id: String(c._id), label: c.razonSocial || "" })).filter((e) => e.label);
        const toEmpresas = (ids = []) => {
            const fromProject = ids.map((id) => ({ id: String(id), label: companyMap.get(String(id)) || "" })).filter((e) => e.label);
            return fromProject.length > 0 ? fromProject : allEmpresas;
        };
        const rows = [];
        for (const up of ups) {
            const proj = projMap.get(String(up.projectId));
            const projectName = proj?.name || up.nombre_proyecto || "";
            const clientId = proj?.clientId ? String(proj.clientId) : "";
            const clientName = clientId ? clientMap.get(clientId) || "" : "";
            const contratoEmpresas = toEmpresas(proj?.contratoEmpresas);
            const releaseEmpresas = toEmpresas(proj?.releaseEmpresas);
            (up.contracts || []).forEach((c, idx) => {
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
    }
    catch (error) {
        console.error("Get all contracts error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /users/:id - Actualizar usuario
router.patch("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const data = updateUserSchema.parse(req.body);
        normalizarRolesFrame(data.metadata);
        const userId = req.params.id;
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        // 1. Fetch Target User to identify tenant
        const query = { _id: userId };
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
        }
        // Preparar updateData
        const updateData = { $set: {} };
        const fieldsToUnset = [];
        // Si hay password, hashear antes de update
        if (data.password) {
            const salt = await bcrypt.genSalt(12);
            data.password = await bcrypt.hash(data.password, salt);
        }
        Object.keys(data).forEach((key) => {
            const value = data[key];
            if (value === null) {
                fieldsToUnset.push(key);
            }
            else if (value !== undefined) {
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
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Update user error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /users/:id/password - Cambiar contraseña
router.patch("/:id/password", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const { password } = updatePasswordSchema.parse(req.body);
        const userId = req.params.id;
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        const query = { _id: userId };
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
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: "Invalid data", details: error.errors });
            return;
        }
        console.error("Update password error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /users/:id/confirmar-cuenta-bancaria - Confirmar que la cuenta fue creada y los datos cargados
router.patch("/:id/confirmar-cuenta-bancaria", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const userId = req.params.id;
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        const query = { _id: userId };
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
        const meta = currentUser.metadata || {};
        if (!meta.bancoId && !meta.cbu) {
            res.status(400).json({ error: "Cargá primero los datos bancarios antes de confirmar." });
            return;
        }
        const user = await User.findOneAndUpdate({ _id: userId, tenantId: currentUser.tenantId }, { $set: { "metadata.cuentaBancariaConfirmada": true, "metadata.cuentaBancariaConfirmadaAt": new Date() } }, { new: true })
            .select("-password")
            .populate("roles", "name description permissions")
            .populate("clientIds", "name")
            .populate("projectIds", "name")
            .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame });
        res.json(user);
    }
    catch (error) {
        console.error("Confirm bank account error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /users/:id/confirmar-cambio-cuenta - Confirmar que el cambio de datos bancarios fue aplicado en el banco/FRAME
router.patch("/:id/confirmar-cambio-cuenta", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const userId = req.params.id;
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        const query = { _id: userId };
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
        const meta = currentUser.metadata || {};
        if (!meta.solicitaCambioCuenta) {
            res.status(400).json({ error: "No hay un cambio de datos bancarios pendiente para confirmar." });
            return;
        }
        const user = await User.findOneAndUpdate({ _id: userId, tenantId: currentUser.tenantId }, { $set: { "metadata.cambioCuentaConfirmada": true, "metadata.cambioCuentaConfirmadaAt": new Date() } }, { new: true })
            .select("-password")
            .populate("roles", "name description permissions")
            .populate("clientIds", "name")
            .populate("projectIds", "name")
            .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame });
        res.json(user);
    }
    catch (error) {
        console.error("Confirm bank change error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /users/:id/solicitud-status - Cambiar el estado de una solicitud SIN borrarla. Se permite
// volver a "pendiente" para deshacer un rechazo/cancelación hecho por error.
router.patch("/:id/solicitud-status", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
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
        const updated = await User.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, { $set: { "metadata.solicitudStatus": status } }, { new: true }).select("-password");
        res.json(updated);
    }
    catch (error) {
        console.error("Update solicitud status error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /users/:id/approve-solicitud - Aprobar solicitud de alta y convertir en miembro del equipo
router.put("/:id/approve-solicitud", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const userId = req.params.id;
        const { email, password, sueldo_jornada = 0, sueldo_mano = 0, nombre_contrato = "Tiempo Indeterminado", nombre_sede = "", observaciones = "", } = req.body;
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
        const userProjectRefs = [];
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
                        contractData.nombre_rol_frame = rf.name || "";
                    }
                }
                catch (e) { /* ignore */ }
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
            }
            else {
                userProject.contracts.push(contractData);
                await userProject.save();
            }
            userProjectRefs.push(userProject._id);
            // Add user to project assignedUsers
            await Project.findByIdAndUpdate(projId, { $addToSet: { assignedUsers: userId } });
        }
        // Hash the new password
        const bcryptModule = await import("bcryptjs");
        const salt = await bcryptModule.default.genSalt(12);
        const hashedPassword = await bcryptModule.default.hash(password, salt);
        // Update the user: activate, set real email/password, link projects
        const updatePayload = {
            email,
            password: hashedPassword,
            "metadata.activo": true,
            projectIds: projectIds.map((id) => new Types.ObjectId(id.toString())),
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
    }
    catch (error) {
        console.error("Approve solicitud error:", error);
        res.status(500).json({ error: "Error al aprobar la solicitud." });
    }
});
// DELETE /users/:id - Eliminar usuario
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const userId = req.params.id;
        const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
        const query = { _id: userId };
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
    }
    catch (error) {
        console.error("Delete user error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
const externalApi = new ExternalApiService();
// GET /users/import/config - Obtener configuración de auto-importación
router.get("/import/config", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
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
    }
    catch (error) {
        console.error("Get import config error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /users/import/config - Guardar configuración de auto-importación
router.post("/import/config", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
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
        }
        else if (!config.isEnabled) {
            config.nextRun = undefined;
        }
        await config.save();
        res.json(config);
    }
    catch (error) {
        console.error("Save import config error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /users/import/history - Obtener historial completo de importaciones
router.get("/import/history", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const history = await ImportHistory.find({ tenantId: req.tenantObjectId })
            .sort({ createdAt: -1 })
            .limit(100);
        res.json(history);
    }
    catch (error) {
        console.error("Get import history error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /users/import/history/latest - Obtener último registro de importación
router.get("/import/history/latest", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const latest = await ImportHistory.findOne({ tenantId: req.tenantObjectId })
            .sort({ createdAt: -1 });
        res.json(latest || null);
    }
    catch (error) {
        console.error("Get latest import history error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /users/import/last-added-details - Usuarios del último import con sus proyectos,
// rol frame y contratos (desde users_&_projects), para la tabla "Nuevos Usuarios".
router.get("/import/last-added-details", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
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
        const relByUser = new Map();
        for (const r of relations) {
            const key = r.userId.toString();
            if (!relByUser.has(key))
                relByUser.set(key, []);
            relByUser.get(key).push({
                nombre_proyecto: r.nombre_proyecto || "",
                nombre_rol_frame: r.nombre_rol_frame || "",
                contracts: (r.contracts || []).map((c) => ({
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
            projects: relByUser.get(u._id.toString()) || [],
        }));
        res.json(result);
    }
    catch (error) {
        console.error("Get last added details error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /users/import/check - Pre-chequear importación de usuarios
router.post("/import/check", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
    try {
        const { sinceDays } = req.body;
        if (sinceDays === undefined || isNaN(Number(sinceDays))) {
            res.status(400).json({ error: "sinceDays parameter is required and must be a number" });
            return;
        }
        const result = await externalApi.checkImportUsers(Number(sinceDays));
        res.json(result);
    }
    catch (error) {
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
router.post("/import/trigger", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req, res) => {
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
    }
    catch (error) {
        console.error("Trigger import error:", error);
        res.status(500).json({ error: error.message || "Failed to import users" });
    }
});
export { router as userRoutes };
