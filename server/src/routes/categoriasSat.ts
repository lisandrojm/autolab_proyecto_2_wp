import { Router } from "express";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

/**
 * GET /api/v1/categorias-sat
 */
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const items = await CategoriaSat.find().sort({ name: 1 }).lean();
    res.json(items);
  } catch (error) {
    console.error("Get categorias-sat error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as categoriasSatRoutes };
