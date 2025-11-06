import { Router } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";

const router = Router();

router.get("/ping", requireTenant, authenticateToken, (_req, res) => {
  res.json({ ok: true });
});

export { router as secureRoutes };
