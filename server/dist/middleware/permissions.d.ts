import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
/**
 * Middleware: Requiere que el usuario sea SuperAdmin.
 */
export declare const requireSuperAdmin: () => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>>>;
/**
 * Middleware: Requiere un permiso específico (por ejemplo: "posts:view").
 */
export declare const requirePermission: (perm: string) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Helper: Verifica si un usuario puede ver un documento.
 * (No hay más funciones para editar, eliminar o compartir)
 */
export declare const canViewDocument: (collection: string, docId: string, userId: string, userRoles: string[], tenantId: string) => Promise<boolean>;
