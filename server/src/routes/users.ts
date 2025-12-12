import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Tenant } from "../models/Tenant.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdArray } from "../utils/mongoIds.js";

const router = Router();

const createUserSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(6),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    isActive: z.boolean().default(true),
    roles: z.array(z.string()).default([]),
    positionId: z.string().nullable().optional(),
    levelId: z.string().nullable().optional(),
    areaId: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      // Si hay levelId (y no es null), debe haber positionId (y no ser null)
      if (data.levelId && data.levelId !== null && (!data.positionId || data.positionId === null)) {
        return false;
      }
      return true;
    },
    {
      message: "No se puede asignar un nivel sin un cargo. Por favor, asigna un cargo primero.",
      path: ["levelId"],
    }
  );

const updateUserSchema = z
  .object({
    email: z.string().email().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    isActive: z.boolean().optional(),
    roles: z.array(z.string()).optional(),
    positionId: z.string().nullable().optional(),
    levelId: z.string().nullable().optional(),
    areaId: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      // Si hay levelId (y no es null), debe haber positionId (y no ser null)
      if (data.levelId && data.levelId !== null && (!data.positionId || data.positionId === null)) {
        return false;
      }
      return true;
    },
    {
      message: "No se puede asignar un nivel sin un cargo. Por favor, asigna un cargo primero.",
      path: ["levelId"],
    }
  );

const updatePasswordSchema = z.object({
  password: z.string().min(6),
});

// GET /users/count - Contar usuarios
router.get("/count", requireTenant, authenticateToken, requirePermission("users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { isActive } = req.query;
    const filter: any = { tenantId: req.tenantObjectId };

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    const count = await User.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count users error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users - Listar usuarios
router.get("/", requireTenant, authenticateToken, requirePermission("users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 20, email, isActive, areaId } = req.query;
    const filter: any = { tenantId: req.tenantObjectId };

    if (email) {
      filter.email = { $regex: email, $options: "i" };
    }

    if (areaId) {
      const oid = Types.ObjectId.isValid(areaId as string) ? new Types.ObjectId(areaId as string) : null;
      if (oid) {
        // Search for either string or ObjectId to cover potential data inconsistencies
        filter.$or = [{ areaId: areaId }, { areaId: oid }];
        // Note: Mix of $or with other fields in 'filter' works as explicit AND: { tenantId: ..., $or: [...] }
      } else {
        filter.areaId = areaId;
      }
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === "true";
    }

    console.log("[Users List] Filter:", JSON.stringify(filter, null, 2));
    console.log("[Users List] Query Params:", req.query);

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password") // Nunca devolver password
        .populate("roles", "name description permissions")
        .populate("clientIds", "name")
        .populate("positionId", "name description")
        .populate("levelId", "name description")
        .populate("areaId", "name description")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    res.json({
      users,
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
router.post("/", requireTenant, authenticateToken, requirePermission("users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createUserSchema.parse(req.body);

    // Si no hay positionId o es null, eliminar levelId automáticamente
    if (!data.positionId || data.positionId === null) {
      data.levelId = undefined;
      data.positionId = undefined;
    }
    // Si levelId es null, convertir a undefined
    if (data.levelId === null) {
      data.levelId = undefined;
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

    // Agregar usuario al array userIds del tenant
    await Tenant.findByIdAndUpdate(req.tenantObjectId, {
      $addToSet: { userIds: user._id },
      $inc: { "usage.users.current": 1 },
    });

    // Devolver usuario sin password y con roles poblados
    const userResponse = await User.findById(user._id).select("-password").populate("roles", "name description permissions").populate("clientIds", "name").populate("positionId", "name description").populate("levelId", "name description");

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

// GET /users/by-area/:areaId - Listar usuarios por área (Endpoint dedicado)
router.get("/by-area/:areaId", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { areaId } = req.params;
    console.log(`[Users By Area] Request for areaId: ${areaId} (Tenant: ${req.tenantObjectId})`);

    let query: any = {
      tenantId: req.tenantObjectId,
      isActive: true,
    };

    if (Types.ObjectId.isValid(areaId)) {
      query.$or = [{ areaId: areaId }, { areaId: new Types.ObjectId(areaId) }];
    } else {
      query.areaId = areaId;
    }

    const users = await User.find(query).select("firstName lastName email positionId levelId isActive").populate("positionId", "name").populate("levelId", "name").sort({ firstName: 1, lastName: 1 });

    console.log(`[Users By Area] Found ${users.length} users`);
    res.json(users);
  } catch (error) {
    console.error("Get users by area error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /users/:id - Obtener usuario específico
router.get("/:id", requireTenant, authenticateToken, requirePermission("users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    })
      .select("-password")
      .populate("roles", "name description permissions")
      .populate("positionId", "name description")
      .populate("levelId", "name description");

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /users/:id - Actualizar usuario
router.patch("/:id", requireTenant, authenticateToken, requirePermission("users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateUserSchema.parse(req.body);

    // Si se está cambiando el email, verificar unicidad
    if (data.email) {
      const existingUser = await User.findOne({
        email: data.email,
        tenantId: req.tenantObjectId,
        _id: { $ne: req.params.id },
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
        tenantId: req.tenantObjectId,
      });

      if (existingRoles.length !== data.roles.length) {
        res.status(400).json({ error: "Some roles do not exist in this tenant" });
        return;
      }

      data.roles = roleObjectIds.map((id) => id.toString());
    }

    // Si se elimina positionId, también eliminar levelId automáticamente
    if (data.positionId === null && data.levelId !== null) {
      data.levelId = null;
    }

    // Preparar updateData: usar $set para campos con valor y $unset para campos null
    const updateData: any = { $set: {} };
    const fieldsToUnset: string[] = [];

    Object.keys(data).forEach((key) => {
      const value = data[key];

      // null explícito significa "eliminar este campo"
      if (value === null) {
        fieldsToUnset.push(key);
      }
      // undefined significa "no tocar este campo" (no se incluye en la actualización)
      else if (value !== undefined) {
        // Tiene valor definido, actualizar
        updateData.$set[key] = value;
      }
    });

    // Si hay campos para eliminar, agregamos $unset
    if (fieldsToUnset.length > 0) {
      updateData.$unset = {};
      fieldsToUnset.forEach((field) => {
        updateData.$unset[field] = "";
      });
    }

    // Si no hay nada en $set, lo eliminamos
    if (Object.keys(updateData.$set).length === 0) {
      delete updateData.$set;
    }

    const user = await User.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, updateData, { new: true, runValidators: true }).select("-password").populate("roles", "name description permissions").populate("positionId", "name description").populate("levelId", "name description").populate("areaId", "name description");

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
router.patch("/:id/password", requireTenant, authenticateToken, requirePermission("users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { password } = updatePasswordSchema.parse(req.body);

    const user = await User.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

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

// DELETE /users/:id - Eliminar usuario
router.delete("/:id", requireTenant, authenticateToken, requirePermission("users:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const user = await User.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Remover usuario del array userIds del tenant
    await Tenant.findByIdAndUpdate(req.tenantObjectId, {
      $pull: { userIds: user._id },
      $inc: { "usage.users.current": -1 },
    });

    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as userRoutes };
