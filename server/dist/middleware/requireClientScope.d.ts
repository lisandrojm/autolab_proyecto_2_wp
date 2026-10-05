import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { TenantRequest } from "./tenant.js";
export interface ClientScopedRequest extends AuthenticatedRequest, TenantRequest {
    allowedClientIds?: string[];
}
export declare function requireClientScope(req: ClientScopedRequest, res: Response, next: NextFunction): void;
export declare function applyClientFilter(filter: any, allowedClientIds?: string[]): any;
