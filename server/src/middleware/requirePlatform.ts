import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth.js";
import { Tenant } from "../models/Tenant.js";

export const requirePlatform = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;

      if (!user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      const tenantId = user.tenantId || req.tenantObjectId;

      if (!tenantId) {
        res.status(403).json({ error: "Forbidden: No tenant context" });
        return;
      }

      const tenant = await Tenant.findById(tenantId);

      if (!tenant) {
        res.status(403).json({ error: "Forbidden: Tenant not found" });
        return;
      }

      if (!tenant.isSystem) {
        res.status(403).json({ error: "Forbidden: Platform access required" });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
