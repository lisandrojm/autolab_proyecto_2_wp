import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
export interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        email: string;
        primaryRole?: string | null;
        role?: string | null;
        roles: string[];
        clientIds?: string[];
        tenantId: string;
        scopes?: string[];
    };
    tenantId?: string;
    tenantObjectId?: Types.ObjectId;
}
export declare function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
export declare function requireRole(allowedRoles: string[]): (req: AuthenticatedRequest, res: Response, next: NextFunction) => void;
