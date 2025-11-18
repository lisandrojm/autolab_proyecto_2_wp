// src/middleware/requireAnyRole.ts
import { Request, Response, NextFunction } from "express";

export function requireAnyRole(req: Request & { user?: any }, res: Response, next: NextFunction) {
  // roles puede venir como string único o array; normalizamos
  const rolesRaw = req.user?.roles ?? (req.user?.role ? [req.user.role] : []);
  const roles = Array.isArray(rolesRaw) ? rolesRaw.filter(Boolean) : [];

  if (roles.length === 0) {
    return res.status(403).json({ error: "Acceso restringido: usuario sin rol asignado" });
  }

  next();
}
