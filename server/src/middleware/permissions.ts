import { Request, Response, NextFunction } from "express";
import { Role } from "../models/Role.js";

import { Client } from "../models/Client.js";
import { Project } from "../models/Project.js";

import { AuthenticatedRequest } from "./auth.js";

/**
 * Middleware: Requiere que el usuario sea SuperAdmin.
 */
export const requireSuperAdmin = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const tenantId = req.tenantObjectId!;

      const roleNames = user.roles || [];

      if (roleNames.length === 0) {
        return res.status(403).json({ error: "SuperAdmin access required" });
      }

      const roles = await Role.find({ name: { $in: roleNames }, tenantId });

      const isSuperAdmin = roles.some((role) => role.name.toLowerCase() === "superadmin");

      if (!isSuperAdmin) {
        return res.status(403).json({ error: "SuperAdmin access required" });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware: Requiere un permiso específico (por ejemplo: "posts:view").
 * Admite varios: en ese caso alcanza con tener uno (ver `requireAnyPermission`).
 */
export const requirePermission = (perm: string | string[]) => {
  const perms = Array.isArray(perm) ? perm : [perm];
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const tenantId = req.tenantObjectId!;
      const roleNames = user.roles || [];

      // Debug
      // console.log(`[Permission Check] User: ${user.email}, Permission: ${perm}, Roles: ${roleNames.join(", ")}`);

      if (roleNames.length === 0) {
        console.warn(`[Permission Check] No roles for user ${user.email}`);
        return res.status(403).json({ error: "Insufficient permissions (No roles)" });
      }

      // Búsqueda case-insensitive de roles
      const regexRoles = roleNames.map((name) => new RegExp(`^${name}$`, "i"));
      const roles = await Role.find({
        name: { $in: regexRoles },
        tenantId,
      });

      const lowerRoleNames = roles.map((r) => r.name.toLowerCase());
      const permissions = new Set(roles.flatMap((r) => r.permissions));
      const primaryRole = user.primaryRole?.toLowerCase();

      // ✅ SuperAdmin siempre tiene acceso total
      if (lowerRoleNames.includes("superadmin") || primaryRole === "superadmin") {
        return next();
      }

      // ✅ Admin tiene acceso a todo excepto tenants
      if (lowerRoleNames.includes("admin") || primaryRole === "admin") {
        const [module] = perms[0].split(":");
        if (module === "tenants") {
          console.warn(`[Permission Check] Admin tried to access tenants module`);
          return res.status(403).json({ error: "Insufficient permissions" });
        }
        return next();
      }

      // ✅ Sistema Simplificado: Si tienes "Ver", tienes todo.
      // Se comprueba cualquiera de los permisos pedidos, su versión :view, o el comodín *
      const allowed =
        permissions.has("*") ||
        perms.some((p) => {
          const [module] = p.split(":");
          return permissions.has(p) || permissions.has(`${module}:view`) || permissions.has(`${module}:*`);
        });

      if (!allowed) {
        console.warn(`[Permission Check] Access denied for ${user.email}. Req: ${perms.join(" | ")}. Has: ${Array.from(permissions).join(", ")}`);
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      next();
    } catch (error) {
      console.error("[Permission Error]", error);
      next(error);
    }
  };
};

/**
 * Igual que `requirePermission`, pero alcanza con tener UNO de los permisos.
 *
 * Nació con los permisos granulares del móvil: el listado de usuarios lo miran dos pantallas muy
 * distintas —la de administración (`admin_users:view`) y la tarjeta «Usuarios» de la app
 * (`mobile_users:view`)— y hasta ahora la segunda pedía el permiso de la primera, con lo cual
 * respondía 403 a todo el que no fuera Admin: la tarjeta estaba rota justo para quien la tenía.
 */
export const requireAnyPermission = (...perms: string[]) => requirePermission(perms);

/**
 * Helper: Verifica si un usuario puede ver un documento.
 * (No hay más funciones para editar, eliminar o compartir)
 */
export const canViewDocument = async (collection: string, docId: string, userId: string, userRoles: string[], tenantId: string): Promise<boolean> => {
  // ✅ SuperAdmin puede ver todo
  const roleNames = (userRoles || []).map((r) => String(r).toLowerCase());
  if (roleNames.includes("superadmin")) {
    return true;
  }

  const Model: any = getModelByCollection(collection);
  if (!Model) return false;

  const doc = await Model.findOne({ _id: docId, tenantId });
  if (!doc) return false;

  // ✅ Creador del documento puede verlo
  if (String(doc.createdBy) === String(userId)) return true;

  // ✅ Usuario asignado puede verlo
  return Boolean(doc.assignedUsers?.some((id: any) => String(id) === String(userId)));
};

/**
 * Retorna el modelo correspondiente según el nombre de la colección.
 */
function getModelByCollection(collection: string) {
  switch (collection) {
    case "clients":
      return Client;
    case "projects":
      return Project;

    default:
      return null;
  }
}
