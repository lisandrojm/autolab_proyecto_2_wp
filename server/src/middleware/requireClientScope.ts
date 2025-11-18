import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { TenantRequest } from "./tenant.js";
import { Role } from "../models/Role.js";

export interface ClientScopedRequest extends AuthenticatedRequest, TenantRequest {
  allowedClientIds?: string[];
}

export function requireClientScope(req: ClientScopedRequest, res: Response, next: NextFunction): void {
  const user = req.user;

  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  // Determinar rol principal del usuario basado en los roles del array
  // Los roles en el JWT son nombres (strings), no ObjectIds
  const roleNames = (user.roles || []).map(r => String(r).toLowerCase());

  Promise.resolve().then(() => {

    // Admin, User y Manager tienen acceso completo
    if (roleNames.includes('admin') || roleNames.includes('user') || roleNames.includes('manager') || roleNames.includes('superadmin')) {
      req.allowedClientIds = undefined; // Sin restricciones
      next();
      return;
    }

    // Cliente: solo puede acceder a sus clientes
    if (roleNames.includes('client')) {
      const clientIds = user.clientIds || [];
      if (!clientIds || clientIds.length === 0) {
        res.status(403).json({ error: "No client access configured" });
        return;
      }

      req.allowedClientIds = clientIds.map((id: any) => id.toString());
      next();
      return;
    }

    // Otros roles: sin acceso a clientes específicos
    req.allowedClientIds = [];
    next();
  }).catch((error) => {
    console.error('requireClientScope error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });
}

export function applyClientFilter(filter: any, allowedClientIds?: string[]): any {
  if (!allowedClientIds) {
    return filter; // Sin restricciones (admin/manager)
  }

  if (allowedClientIds.length === 0) {
    // Sin acceso a ningún cliente
    return { ...filter, _id: { $in: [] } };
  }

  // Filtrar por clientes permitidos
  return {
    ...filter,
    $or: [
      { clientId: { $in: allowedClientIds } },
      { _id: { $in: allowedClientIds } }, // Para endpoints de clientes directos
    ]
  };
}