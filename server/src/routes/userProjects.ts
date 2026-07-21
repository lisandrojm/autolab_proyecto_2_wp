import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { Position } from "../models/Position.js";
import { Level } from "../models/Level.js";
import { Area } from "../models/Area.js";

const router = Router();

// GET /user-projects/contracts - Lista paginada de contratos (server-side).
// Los contratos viven embebidos en UserProject.contracts; se aplanan vía aggregation
// y se scopean al tenant por los proyectos del tenant (UserProject no tiene tenantId).
router.get("/contracts", requireTenant, authenticateToken, async (req: any, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    let limit = Number(req.query.limit) || 20;
    if (limit > 100) limit = 100;
    const skip = (page - 1) * limit;
    const q = req.query.q ? String(req.query.q).trim() : "";
    const projectId = req.query.projectId && req.query.projectId !== "all" ? String(req.query.projectId) : "";

    // Scope al tenant: solo UserProjects de proyectos del tenant.
    const tenantProjectIds = await Project.find({ tenantId: req.tenantObjectId }).distinct("_id");

    const matchStage: any = { projectId: { $in: tenantProjectIds } };
    if (projectId) {
      try {
        matchStage.projectId = new Types.ObjectId(projectId);
      } catch {
        /* projectId inválido: se ignora y queda el scope del tenant */
      }
    }

    const pipeline: any[] = [
      { $match: matchStage },
      { $unwind: "$contracts" },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: "$userId",
          userEmail: "$user.email",
          userFirstName: "$user.firstName",
          userLastName: "$user.lastName",
          projectName: { $ifNull: ["$nombre_proyecto", "$contracts.nombre_proyecto"] },
          nombre_contrato: "$contracts.nombre_contrato",
          nombre_sede: "$contracts.nombre_sede",
          nombre_rol_frame: "$contracts.nombre_rol_frame",
          fecha_alta_contrato: "$contracts.fecha_alta_contrato",
          fecha_baja_contrato: "$contracts.fecha_baja_contrato",
          sueldo_mano: "$contracts.sueldo_mano",
          nombre_estado_empleado: "$contracts.nombre_estado_empleado",
          cantidad_jornadas_laborales: "$contracts.cantidad_jornadas_laborales",
          tipo_contrato_id: "$contracts.tipo_contrato_id",
        },
      },
    ];

    if (q) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      pipeline.push({
        $match: {
          $or: [{ userEmail: rx }, { userFirstName: rx }, { userLastName: rx }, { projectName: rx }, { nombre_contrato: rx }],
        },
      });
    }

    pipeline.push({ $sort: { fecha_alta_contrato: -1 } });
    pipeline.push({
      $facet: {
        data: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    });

    const result = await UserProject.aggregate(pipeline).allowDiskUse(true);
    const data = result[0]?.data || [];
    const total = result[0]?.total?.[0]?.count || 0;

    res.json({
      contracts: data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("List contracts error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const updateUserProjectSchema = z.object({
  areaId: z.string().nullable().optional(),
  positionId: z.string().nullable().optional(),
  levelId: z.string().nullable().optional(),
});

// PATCH /user-projects/:id - Update project-specific metadata
router.patch("/:id", requireTenant, authenticateToken, async (req: any, res) => {
  try {
    const { id } = req.params;
    const data = updateUserProjectSchema.parse(req.body);

    const updateData: any = {};
    if (data.areaId !== undefined) updateData.areaId = data.areaId || null;
    if (data.positionId !== undefined) updateData.positionId = data.positionId || null;
    if (data.levelId !== undefined) updateData.levelId = data.levelId || null;

    const userProject = await UserProject.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    )
    .populate({ path: "positionId", select: "name description", model: Position })
    .populate({ path: "levelId", select: "name description", model: Level })
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
