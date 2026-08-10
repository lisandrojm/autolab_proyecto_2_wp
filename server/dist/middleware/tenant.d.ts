import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
export interface TenantRequest extends Request {
    tenantId?: string;
    tenantObjectId?: Types.ObjectId;
}
export declare function requireTenant(req: TenantRequest, res: Response, next: NextFunction): void;
export declare function resolveTenant(req: TenantRequest, res: Response, next: NextFunction): Promise<void>;
