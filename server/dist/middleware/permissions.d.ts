import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
/**
 * Middleware: Requiere que el usuario sea SuperAdmin.
 */
export declare const requireSuperAdmin: () => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>>>;
/**
 * Middleware: Requiere un permiso específico (por ejemplo: "posts:view").
 * Admite varios: en ese caso alcanza con tener uno (ver `requireAnyPermission`).
 */
export declare const requirePermission: (perm: string | string[]) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Igual que `requirePermission`, pero alcanza con tener UNO de los permisos.
 *
 * Nació con los permisos granulares del móvil: el listado de usuarios lo miran dos pantallas muy
 * distintas —la de administración (`admin_users:view`) y la tarjeta «Usuarios» de la app
 * (`mobile_users:view`)— y hasta ahora la segunda pedía el permiso de la primera, con lo cual
 * respondía 403 a todo el que no fuera Admin: la tarjeta estaba rota justo para quien la tenía.
 */
export declare const requireAnyPermission: (...perms: string[]) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Helper: Verifica si un usuario puede ver un documento.
 * (No hay más funciones para editar, eliminar o compartir)
 */
export declare const canViewDocument: (collection: string, docId: string, userId: string, userRoles: string[], tenantId: string) => Promise<boolean>;
