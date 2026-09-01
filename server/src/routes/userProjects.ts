import { Router } from "express";
import { z } from "zod";
import UserProject from "../models/UserProject.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { Area } from "../models/Area.js";

const router = Router();

const updateUserProjectSchema = z.object({
  areaId: z.string().nullable().optional(),
});

// PATCH /user-projects/:id - Update project-specific metadata
router.patch("/:id", requireTenant, authenticateToken, async (req: any, res) => {
  try {
    const { id } = req.params;
    const data = updateUserProjectSchema.parse(req.body);

    const updateData: any = {};
    if (data.areaId !== undefined) updateData.areaId = data.areaId || null;

    const userProject = await UserProject.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
    .populate({ path: "areaId", select: "name description", model: Area });

    if (!userProject) {
      return res.status(404).json({ error: "UserProject assignment not found" });
    }

    res.json(userProject);
  } catch (error) {
    console.error("Update UserProject error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as userProjectRoutes };
