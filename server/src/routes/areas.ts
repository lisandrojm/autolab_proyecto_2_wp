import { Router } from "express";
import { z } from "zod";
import { Area } from "../models/Area.js";
import { User } from "../models/User.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { Types } from "mongoose";

const router = Router();

router.use(requireTenant, authenticateToken);

const createAreaSchema = z.object({
  name: z.string().min(1).trim(),
  description: z.string().optional(),
  supervisorId: z.string().optional(),
  employeeIds: z.array(z.string()).optional().default([]),
});

const updateAreaSchema = z.object({
  name: z.string().min(1).trim().optional(),
  description: z.string().optional(),
  supervisorId: z.string().optional().nullable(),
  employeeIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { includeInactive } = req.query;
    const filter: any = { tenantId: req.tenantObjectId };

    if (includeInactive !== "true") {
      filter.isActive = true;
    }

    const areas = await Area.find(filter)
      .sort({ name: 1 })
      .populate("supervisorId", "firstName lastName email")
      .populate("employeeIds", "firstName lastName email");

    res.json(areas);
  } catch (error) {
    console.error("Get areas error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const area = await Area.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    })
      .populate("supervisorId", "firstName lastName email")
      .populate("employeeIds", "firstName lastName email");

    if (!area) {
      res.status(404).json({ error: "Area not found" });
      return;
    }

    res.json(area);
  } catch (error) {
    console.error("Get area error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createAreaSchema.parse(req.body);

    const existingArea = await Area.findOne({
      tenantId: req.tenantObjectId,
      name: data.name,
    });

    if (existingArea) {
      res.status(400).json({ error: "Area with this name already exists" });
      return;
    }

    if (data.supervisorId) {
      const supervisor = await User.findOne({
        _id: data.supervisorId,
        tenantId: req.tenantObjectId,
      });

      if (!supervisor) {
        res.status(400).json({ error: "Supervisor not found" });
        return;
      }
    }

    if (data.employeeIds && data.employeeIds.length > 0) {
      const employees = await User.find({
        _id: { $in: data.employeeIds },
        tenantId: req.tenantObjectId,
      });

      if (employees.length !== data.employeeIds.length) {
        res.status(400).json({ error: "One or more employees not found" });
        return;
      }
    }

    const area = new Area({
      tenantId: req.tenantObjectId,
      ...data,
    });

    await area.save();

    const populatedArea = await Area.findById(area._id)
      .populate("supervisorId", "firstName lastName email")
      .populate("employeeIds", "firstName lastName email");

    res.status(201).json(populatedArea);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create area error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateAreaSchema.parse(req.body);

    const area = await Area.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!area) {
      res.status(404).json({ error: "Area not found" });
      return;
    }

    if (data.name) {
      const existingArea = await Area.findOne({
        tenantId: req.tenantObjectId,
        name: data.name,
        _id: { $ne: area._id },
      });

      if (existingArea) {
        res.status(400).json({ error: "Area with this name already exists" });
        return;
      }
    }

    if (data.supervisorId !== undefined) {
      if (data.supervisorId === null) {
        area.supervisorId = undefined;
      } else {
        const supervisor = await User.findOne({
          _id: data.supervisorId,
          tenantId: req.tenantObjectId,
        });

        if (!supervisor) {
          res.status(400).json({ error: "Supervisor not found" });
          return;
        }
        area.supervisorId = new Types.ObjectId(data.supervisorId);
      }
    }

    if (data.employeeIds) {
      if (data.employeeIds.length > 0) {
        const employees = await User.find({
          _id: { $in: data.employeeIds },
          tenantId: req.tenantObjectId,
        });

        if (employees.length !== data.employeeIds.length) {
          res.status(400).json({ error: "One or more employees not found" });
          return;
        }
      }
      area.employeeIds = data.employeeIds.map((id) => new Types.ObjectId(id));
    }

    if (data.name !== undefined) area.name = data.name;
    if (data.description !== undefined) area.description = data.description;
    if (data.isActive !== undefined) area.isActive = data.isActive;

    await area.save();

    const populatedArea = await Area.findById(area._id)
      .populate("supervisorId", "firstName lastName email")
      .populate("employeeIds", "firstName lastName email");

    res.json(populatedArea);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update area error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const area = await Area.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!area) {
      res.status(404).json({ error: "Area not found" });
      return;
    }

    area.isActive = false;
    await area.save();

    res.json({ message: "Area deactivated successfully" });
  } catch (error) {
    console.error("Delete area error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as areaRoutes };
