import { Router } from "express";
import { z } from "zod";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdArray, toObjectIdOrNull } from "../utils/mongoIds.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";
import { PermisosEnDesarrollo, permisosEnDesarrollo } from "../models/PermisosEnDesarrollo.js";

const router = Router();

const esSuperAdmin = (req: AuthenticatedRequest) => !!req.user?.roles.some((r) => r.toLowerCase() === "superadmin");

/**
 * Qué permisos EN DESARROLLO cambiaría este guardado. Vacío = no toca ninguno.
 *
 * Un permiso en desarrollo no se agrega ni se saca: el rol que ya lo tenía lo conserva y el que no, no
 * lo recibe. El SuperAdmin sí puede (es quien desarrolla y prueba); para él no se llama a esto.
 */
async function cambiosEnPermisosEnDesarrollo(antes: string[], despues: string[]): Promise<string[]> {
  const bloqueados = await permisosEnDesarrollo();
  return bloqueados.filter((p) => antes.includes(p) !== despues.includes(p));
}

const createRoleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
});

const updateRoleSchema = createRoleSchema.partial();

// GET /roles/count - Contar roles
router.get("/count", requireTenant, authenticateToken, requirePermission("admin_roles:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    let filter: any = {};

    if (!isSuperAdmin) {
      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      filter.tenantId = tenantId;
    }

    const count = await Role.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count roles error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /roles - Listar roles
router.get("/", requireTenant, authenticateToken, requirePermission("admin_roles:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { page = 1, limit = 1000, name, _id } = req.query;
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    let filter: any = {};

    if (!isSuperAdmin) {
      // Sanitizar tenantId
      const tenantId = toObjectIdOrNull(req.tenantObjectId);
      if (!tenantId) {
        console.warn("[roles GET] Invalid tenantId:", req.tenantObjectId);
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      filter.tenantId = tenantId;
    }

    if (name) {
      filter.name = { $regex: createFuzzySearchRegex(String(name)), $options: "i" };
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
            pages: 0,
          },
        });
        return;
      }

      filter._id = { $in: validIds };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [roles, total] = await Promise.all([Role.find(filter).populate("tenantId", "name slug").sort({ createdAt: -1 }).skip(skip).limit(Number(limit)), Role.countDocuments(filter)]);

    res.json({
      roles,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Get roles error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /roles - Crear rol
router.post("/", requireTenant, authenticateToken, requirePermission("admin_roles:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createRoleSchema.parse(req.body);

    if (!esSuperAdmin(req)) {
      const tocados = await cambiosEnPermisosEnDesarrollo([], data.permissions);
      if (tocados.length > 0) {
        res.status(400).json({ error: `Hay permisos en desarrollo que todavía no se pueden asignar: ${tocados.join(", ")}` });
        return;
      }
    }

    // Verificar que no existe un rol con el mismo nombre en el tenant
    const existingRole = await Role.findOne({
      name: data.name,
      tenantId: req.tenantObjectId,
    });

    if (existingRole) {
      res.status(409).json({ error: "Role name already exists in this tenant" });
      return;
    }

    // Si se marca como isDefault, desmarcar cualquier otro rol por defecto
    if (data.isDefault) {
      await Role.updateMany({ tenantId: req.tenantObjectId, isDefault: true }, { $set: { isDefault: false } });
    }

    const role = new Role({
      ...data,
      tenantId: req.tenantObjectId,
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
});

// GET /roles/permisos-en-desarrollo - Los permisos visibles pero bloqueados en el editor de roles.
// Va ANTES de `/:id`, que si no lo tomaría como un id.
router.get("/permisos-en-desarrollo", requireTenant, authenticateToken, requirePermission("admin_roles:view"), async (_req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    res.json({ permisos: await permisosEnDesarrollo() });
  } catch (error) {
    console.error("Get permisos en desarrollo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /roles/permisos-en-desarrollo - Sólo SuperAdmin: es de plataforma, no de un tenant.
router.put("/permisos-en-desarrollo", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!esSuperAdmin(req)) {
      res.status(403).json({ error: "Sólo el SuperAdmin puede marcar permisos en desarrollo" });
      return;
    }
    const { permisos } = z.object({ permisos: z.array(z.string()) }).parse(req.body);
    const doc = await PermisosEnDesarrollo.findOneAndUpdate({ clave: "global" }, { $set: { permisos: [...new Set(permisos)] } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    res.json({ permisos: doc.permisos });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update permisos en desarrollo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /roles/:id - Obtener rol específico
router.get("/:id", requireTenant, authenticateToken, requirePermission("admin_roles:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const roleId = toObjectIdOrNull(req.params.id);
    const isSuperAdmin = req.user?.roles.some((r) => r.toLowerCase() === "superadmin");
    const tenantId = toObjectIdOrNull(req.tenantObjectId);

    if (!roleId) {
      console.warn("[roles GET :id] Invalid roleId:", req.params.id);
      res.status(400).json({ error: "Invalid role ID" });
      return;
    }

    const query: any = { _id: roleId };

    if (!isSuperAdmin) {
      if (!tenantId) {
        console.warn("[roles GET :id] Invalid tenantId:", req.tenantObjectId);
        res.status(400).json({ error: "Invalid tenant ID" });
        return;
      }
      query.tenantId = tenantId;
    }

    const role = await Role.findOne(query);

    if (!role) {
      res.status(404).json({ error: "Role not found" });
      return;
    }

    res.json(role);
  } catch (error) {
    console.error("Get role error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /roles/:id - Actualizar rol
router.patch("/:id", requireTenant, authenticateToken, requirePermission("admin_roles:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
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
        _id: { $ne: roleId },
      });

      if (existingRole) {
        res.status(409).json({ error: "Role name already exists in this tenant" });
        return;
      }
    }

    // Los permisos en desarrollo quedan como estaban: ni se agregan ni se sacan (salvo el SuperAdmin).
    if (data.permissions && !esSuperAdmin(req)) {
      const actual = await Role.findOne({ _id: roleId, tenantId: req.tenantObjectId }).select("permissions").lean();
      const tocados = await cambiosEnPermisosEnDesarrollo(actual?.permissions || [], data.permissions);
      if (tocados.length > 0) {
        res.status(400).json({ error: `Hay permisos en desarrollo que todavía no se pueden cambiar: ${tocados.join(", ")}` });
        return;
      }
    }

    // Si se marca como isDefault, desmarcar cualquier otro rol por defecto
    if (data.isDefault === true) {
      await Role.updateMany({ tenantId: req.tenantObjectId, isDefault: true, _id: { $ne: roleId } }, { $set: { isDefault: false } });
    }

    const role = await Role.findOneAndUpdate({ _id: roleId, tenantId: req.tenantObjectId }, data, { new: true, runValidators: true });

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
});

// DELETE /roles/:id - Eliminar rol
router.delete("/:id", requireTenant, authenticateToken, requirePermission("admin_roles:view"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    // Validar roleId
    const roleId = toObjectIdOrNull(req.params.id);
    if (!roleId) {
      res.status(400).json({ error: "Invalid role ID" });
      return;
    }

    // No permitir eliminar roles de sistema
    const existingRole = await Role.findOne({ _id: roleId, tenantId: req.tenantObjectId });
    if (existingRole?.isSystem) {
      res.status(403).json({ error: "Cannot delete a system role" });
      return;
    }

    // Verificar si el rol está asignado a usuarios
    const usersWithRole = await User.countDocuments({
      roles: roleId,
      tenantId: req.tenantObjectId,
    });

    const force = req.query.force === "true";

    if (usersWithRole > 0 && !force) {
      res.status(409).json({
        error: "Cannot delete role: it is assigned to users",
        usersCount: usersWithRole,
        code: "ROLE_ASSIGNED_TO_USERS",
      });
      return;
    }

    // Si es force delete y hay usuarios, desasignar el rol primero
    if (force && usersWithRole > 0) {
      console.log(`[DELETE Role] Force deleting role ${roleId} - Unassigning from ${usersWithRole} users`);
      await User.updateMany({ roles: roleId, tenantId: req.tenantObjectId }, { $pull: { roles: roleId } });
    }

    const role = await Role.findOneAndDelete({
      _id: roleId,
      tenantId: req.tenantObjectId,
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
});

export { router as roleRoutes };
