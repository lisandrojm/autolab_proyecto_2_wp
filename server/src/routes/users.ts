import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Project } from "../models/Project.js";
import { Tenant } from "../models/Tenant.js";
import { Info } from "../models/Info.js";
import { RoleFrame } from "../models/RoleFrame.js";
import UserProject from "../models/UserProject.js"; // This registers the model
import { Position } from "../models/Position.js";
import { Level } from "../models/Level.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { Client } from "../models/Client.js";
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

import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdArray } from "../utils/mongoIds.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";

const router = Router();

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

// GET /users - Listar usuarios
router.get("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
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

    const filter = andConditions.length > 0 ? { $and: andConditions } : {};


    const limitNum = Number(limit) || 50;
    const skip = (Number(page) - 1) * limitNum;

    // Debug model names if needed
    // console.log("Registered models:", mongoose.modelNames());

    const query = User.find(filter)
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
      .populate({
        path: "metadata.projects",
        model: UserProject,
        select: "projectId positionId levelId areaId nombre_rol_frame nombre_proyecto contracts", 
        populate: [
          { path: "positionId", select: "name", model: Position },
          { path: "levelId", select: "name", model: Level },
          { path: "areaId", select: "name", model: Area },
          { path: "projectId", select: "name status", model: Project },
        ],
      })
      .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame })
      .sort({ _id: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    const [users, total] = await Promise.all([query.exec(), User.countDocuments(filter).exec()]);

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

      return {
        ...userObj,
        externalInfo: {
          sedes: Array.from(userSedeNames),
          rolFrames: Array.from(userRolFrameNames),
        },
      };
    });

    res.json({
      users: enrichedUsers,
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

// POST /users - Crear usuario
router.post("/", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createUserSchema.parse(req.body);

    if ((data as any).levelId === null) {
      (data as any).levelId = undefined;
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
router.get("/directory", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const filter: any = { tenantId: req.tenantObjectId };
    const status = req.query.status as string | undefined;

    if (status === "inactive") {
      filter["metadata.activo"] = { $ne: true };
    } else if (status === "all") {
      // No filter on activo - return all users
    } else {
      // Default: active only
      filter["metadata.activo"] = true;
    }

    const users = await User.find(filter)
      .select("firstName lastName email projectIds metadata")
      .populate("projectIds", "name")
      .populate({
        path: "metadata.projects",
        model: UserProject,
        select: "projectId positionId levelId areaId nombre_proyecto nombre_rol_frame contracts", 
        populate: [
          { path: "positionId", select: "name", model: Position },
          { path: "levelId", select: "name", model: Level },
          { path: "areaId", select: "name", model: Area },
        ],
      })
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    res.json(users);
  } catch (error) {
    console.error("Get user directory error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/eligible-responsables - Listar usuarios elegibles como responsables de proyecto
// Busca roles que tengan el permiso "project_responsible:eligible" y devuelve los usuarios con esos roles
router.get("/eligible-responsables", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
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
          { path: "positionId", select: "name description", model: Position },
          { path: "levelId", select: "name description", model: Level },
          { path: "areaId", select: "name description", model: Area },
          { path: "projectId", select: "name status", model: "Project" },
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

// PATCH /users/:id - Actualizar usuario
router.patch("/:id", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateUserSchema.parse(req.body);
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
router.post("/import/trigger", requireTenant, authenticateToken, requirePermission("admin_users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { syncProjects, sinceDays } = req.body;
    const limitDays = sinceDays !== undefined && !isNaN(Number(sinceDays)) ? Number(sinceDays) : undefined;
    
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const stats = await externalApi.importUsers(
      req.tenantObjectId.toString(),
      new Types.ObjectId(userId),
      syncProjects === true,
      limitDays
    );

    // Fetch the latest history record created by the sync to return addedUsers and addedProjects
    const latestRun = await ImportHistory.findOne({
      tenantId: req.tenantObjectId,
      status: "success"
    }).sort({ createdAt: -1 });

    res.json({
      message: "Import completed successfully",
      stats,
      addedUsers: latestRun?.addedUsers || [],
      addedProjects: latestRun?.addedProjects || []
    });
  } catch (error: any) {
    console.error("Trigger import error:", error);
    res.status(500).json({ error: error.message || "Failed to import users" });
  }
});

export { router as userRoutes };
