import { Router } from "express";
import { RoleFrame } from "../models/RoleFrame.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.get("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const roles = await RoleFrame.find().sort({ name: 1 }).lean();
    res.json(roles);
  } catch (error) {
    console.error("Get role frames error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as roleFrameRoutes };
