import { Request } from "express";
import { Types } from "mongoose";

declare module "express-serve-static-core" {
    interface Request {
        tenantId?: string;
        tenantObjectId?: Types.ObjectId;
        assetId?: string;
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
    }
}
