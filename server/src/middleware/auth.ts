import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { Types } from "mongoose";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    primaryRole?: string | null;
    role?: string | null; // Alias para compatibilidad
    roles: string[];
    clientIds?: string[];
    tenantId: string;
    scopes?: string[];
  };
  tenantId?: string;
  tenantObjectId?: Types.ObjectId;
}

type JWTPayload = {
  sub: string;
  email: string;
  primaryRole?: string | null;
  roles: string[];
  clientIds?: string[];
  tenantId: string;
  scopes?: string[];
  iat?: number;
  exp?: number;
};

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const h = req.header("Authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    req.user = {
      userId: payload.sub,
      email: payload.email,
      primaryRole: payload.primaryRole || null,
      role: payload.primaryRole || null, // Alias para compatibilidad
      roles: payload.roles || [],
      clientIds: payload.clientIds || [],
      tenantId: payload.tenantId,
      scopes: payload.scopes ?? [],
    };
    // Agregar tenantObjectId para queries de MongoDB
    req.tenantId = payload.tenantId;
    req.tenantObjectId = new Types.ObjectId(payload.tenantId);
    next();
    return;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    // Check if user has any of the allowed roles
    const hasRole = req.user.roles.some(role => allowedRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
