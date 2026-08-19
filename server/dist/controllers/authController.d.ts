import { Response } from "express";
import { TenantRequest } from "../middleware/tenant.js";
export declare const register: (req: TenantRequest, res: Response) => Promise<void>;
export declare const checkEmailAvailability: (req: TenantRequest, res: Response) => Promise<void>;
