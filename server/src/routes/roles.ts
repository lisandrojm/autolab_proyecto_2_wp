import { Router } from "express";
import { z } from "zod";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdArray, toObjectIdOrNull } from "../utils/mongoIds.js";

const router = Router();

const createRoleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
});

const updateRoleSchema = createRoleSchema.partial();

// GET /roles/count - Contar roles
router.get("/count",
  requireTenant,
  authenticateToken,
  requirePermission('roles:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }

      const count = await Role.countDocuments({ tenantId });
      res.json({ count });
    } catch (error) {
      console.error("Count roles error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /roles - Listar roles
router.get("/",
  requireTenant,
  authenticateToken,
  requirePermission('roles:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const { page = 1, limit = 20, name, _id } = req.query;

      // Sanitizar tenantId
      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        console.warn("[roles GET] Invalid tenantId:", req.tenantObjectId);
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }

      const filter: any = { tenantId };

      if (name) {
        filter.name = { $regex: name, $options: 'i' };
      }

      // Si se proporciona _id, validar que sea un ObjectId válido
      if (_id) {
        const roleIds = Array.isArray(_id) ? _id : [_id];
        const validIds = toObjectIdArray(roleIds);

        if (validIds.length === 0) {
          // Si no hay IDs válidos, retornar vacío
          res.json({
            roles: [],
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: 0,
              pages: 0
            }
          });
          return;
        }

        filter._id = { $in: validIds };
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [roles, total] = await Promise.all([
        Role.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit)),
        Role.countDocuments(filter)
      ]);

      res.json({
        roles,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error("Get roles error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// POST /roles - Crear rol
router.post("/",
  requireTenant,
  authenticateToken,
  requirePermission('roles:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const data = createRoleSchema.parse(req.body);

      // Verificar que no existe un rol con el mismo nombre en el tenant
      const existingRole = await Role.findOne({
        name: data.name,
        tenantId: req.tenantObjectId
      });

      if (existingRole) {
        res.status(409).json({ error: "Role name already exists in this tenant" });
        return;
      }

      // Si se marca como isDefault, desmarcar cualquier otro rol por defecto
      if (data.isDefault) {
        await Role.updateMany(
          { tenantId: req.tenantObjectId, isDefault: true },
          { $set: { isDefault: false } }
        );
      }

      const role = new Role({
        ...data,
        tenantId: req.tenantObjectId
      });

      await role.save();
      res.status(201).json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
        return;
      }
      console.error("Create role error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// GET /roles/:id - Obtener rol específico
router.get("/:id",
  requireTenant,
  authenticateToken,
  requirePermission('roles:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const roleId = toObjectIdOrNull(req.params.id);
      const tenantId = toObjectIdOrNull(req.tenantObjectId);

      if (!roleId) {
        console.warn("[roles GET :id] Invalid roleId:", req.params.id);
        res.status(400).json({ error: "Invalid role ID" });
        return;
      }

      if (!tenantId) {
        console.warn("[roles GET :id] Invalid tenantId:", req.tenantObjectId);
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }

      const role = await Role.findOne({
        _id: roleId,
        tenantId
      });

      if (!role) {
        res.status(404).json({ error: "Role not found" });
        return;
      }

      res.json(role);
    } catch (error) {
      console.error("Get role error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// PATCH /roles/:id - Actualizar rol
router.patch("/:id",
  requireTenant,
  authenticateToken,
  requirePermission('roles:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      const data = updateRoleSchema.parse(req.body);

      // Validar roleId
      const roleId = toObjectIdOrNull(req.params.id);
      if (!roleId) {
        res.status(400).json({ error: "Invalid role ID" });
        return;
      }

      // Si se está cambiando el nombre, verificar unicidad
      if (data.name) {
        const existingRole = await Role.findOne({
          name: data.name,
          tenantId: req.tenantObjectId,
          _id: { $ne: roleId }
        });

        if (existingRole) {
          res.status(409).json({ error: "Role name already exists in this tenant" });
          return;
        }
      }

      // Si se marca como isDefault, desmarcar cualquier otro rol por defecto
      if (data.isDefault === true) {
        await Role.updateMany(
          { tenantId: req.tenantObjectId, isDefault: true, _id: { $ne: roleId } },
          { $set: { isDefault: false } }
        );
      }

      const role = await Role.findOneAndUpdate(
        { _id: roleId, tenantId: req.tenantObjectId },
        data,
        { new: true, runValidators: true }
      );

      if (!role) {
        res.status(404).json({ error: "Role not found" });
        return;
      }

      res.json(role);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Invalid data", details: error.errors });
        return;
      }
      console.error("Update role error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// DELETE /roles/:id - Eliminar rol
router.delete("/:id",
  requireTenant,
  authenticateToken,
  requirePermission('roles:view'),
  async (req: AuthenticatedRequest & TenantRequest, res) => {
    try {
      // Validar roleId
      const roleId = toObjectIdOrNull(req.params.id);
      if (!roleId) {
        res.status(400).json({ error: "Invalid role ID" });
        return;
      }

      // Verificar si el rol está asignado a usuarios
      const usersWithRole = await User.countDocuments({
        roles: roleId,
        tenantId: req.tenantObjectId
      });
      
      if (usersWithRole > 0) {
        res.status(409).json({ 
          error: "Cannot delete role: it is assigned to users",
          usersCount: usersWithRole
        });
        return;
      }

      const role = await Role.findOneAndDelete({
        _id: roleId,
        tenantId: req.tenantObjectId
      });
      
      if (!role) {
        res.status(404).json({ error: "Role not found" });
        return;
      }

      res.json({ message: "Role deleted successfully" });
    } catch (error) {
      console.error("Delete role error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export { router as roleRoutes };