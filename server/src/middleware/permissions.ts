import { Request, Response, NextFunction } from "express";
import { Role } from "../models/Role.js";

import { Campaign } from "../models/Campaign.js";
import { Client } from "../models/Client.js";
import { Post } from "../models/Post.js";
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
 */
export const requirePermission = (perm: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;
      const tenantId = req.tenantObjectId!;
      const roleNames = user.roles || [];

      if (roleNames.length === 0) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      const roles = await Role.find({
        name: { $in: roleNames },
        tenantId,
      });

      const lowerRoleNames = roles.map((r) => r.name.toLowerCase());
      const permissions = new Set(roles.flatMap((r) => r.permissions));

      // ✅ SuperAdmin y Admin siempre tienen acceso total (excepto a tenants que es solo superadmin)
      if (lowerRoleNames.includes("superadmin")) {
        return next();
      }

      // Admin tiene acceso a todo excepto permisos específicos de superadmin (tenants)
      if (lowerRoleNames.includes("admin")) {
        const [module] = perm.split(":");
        // Admin NO puede acceder a tenants (solo superadmin)
        if (module === "tenants") {
          return res.status(403).json({ error: "Insufficient permissions" });
        }
        return next();
      }

      const [module, action] = perm.split(":");

      const hasViewPermission = permissions.has(`${module}:view`);
      const hasWildcard = permissions.has("*") || permissions.has(`${module}:*`);
      const hasSpecificPermission = permissions.has(perm);

      const allowed = hasWildcard || hasSpecificPermission || (action !== "view" && hasViewPermission);

      if (!allowed) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

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
  return Boolean(doc.usuarios?.some((u: any) => String(u.id ?? u.userId) === String(userId)));
};

/**
 * Retorna el modelo correspondiente según el nombre de la colección.
 */
function getModelByCollection(collection: string) {
  switch (collection) {
    case "campaigns":
      return Campaign;
    case "clients":
      return Client;
    case "posts":
      return Post;
    case "projects":
      return Project;

    default:
      return null;
  }
}
