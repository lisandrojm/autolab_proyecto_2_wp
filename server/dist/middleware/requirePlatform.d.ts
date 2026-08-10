import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
export declare const requirePlatform: () => (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void>;
