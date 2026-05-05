import { Router } from "express";
import { Info } from "../models/Info.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
/**
 * GET /api/v1/info
 * Query: ?type=sede
 */
router.get("/", requireTenant, authenticateToken, async (req, res) => {
    try {
        const { type } = req.query;
        const filter = {};
        if (type) {
            filter.type = type;
        }
        const items = await Info.find(filter).sort({ name: 1 }).lean();
        res.json(items);
    }
    catch (error) {
        console.error("Get info error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as infoRoutes };
