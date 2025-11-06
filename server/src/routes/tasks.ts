import { Router } from "express";
import { z } from "zod";
import { WorkflowTask } from "../models/WorkflowTask.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyRole } from "../middleware/requireAnyRole.js";
import { Types } from "mongoose";

const router = Router();

/** Middleware base: tenant + token + que el usuario tenga algún rol (sin nombres hardcodeados) */
router.use(requireTenant, authenticateToken, requireAnyRole);

const createTaskSchema = z.object({
  campaignId: z.string().min(1),
  clientId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["design", "copy", "approval", "publish", "analysis", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  status: z.enum(["todo", "in_progress", "review", "done"]).default("todo"),
  assignedTo: z.array(z.string()).default([]),
  dueDate: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
  estimatedHours: z.number().optional(),
});

// GET /tasks/count - Contar tareas (propias o asignadas)
router.get("/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const filter: any = {
      tenantId: req.tenantObjectId,
      $or: [{ createdBy: userId }, { assignedTo: userId }],
    };

    const count = await WorkflowTask.countDocuments(filter);
    res.json({ count });
  } catch (error) {
    console.error("Count tasks error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tasks - Lista tareas (propias o asignadas) con filtros opcionales
router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    let filter: any = {
      tenantId: req.tenantObjectId,
      $or: [{ createdBy: userId }, { assignedTo: userId }],
    };

    // Filtros opcionales
    if (req.query.campaignId) {
      filter.campaignId = new Types.ObjectId(req.query.campaignId as string);
    }
    if (req.query.clientId) {
      filter.clientId = new Types.ObjectId(req.query.clientId as string);
    }
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.priority) {
      filter.priority = req.query.priority;
    }
    if (req.query.assignedTo) {
      filter.assignedTo = req.query.assignedTo;
    }

    const tasks = await WorkflowTask.find(filter).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (error) {
    console.error("Get tasks error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /tasks/:id - Ver tarea (solo creador o asignado)
router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const task = await WorkflowTask.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const hasAccess = task.createdBy === userId || task.assignedTo.includes(userId);
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json(task);
  } catch (error) {
    console.error("Get task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /tasks - Crear tarea
router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createTaskSchema.parse(req.body);

    const task = new WorkflowTask({
      ...data,
      tenantId: req.tenantObjectId,
      campaignId: new Types.ObjectId(data.campaignId),
      clientId: new Types.ObjectId(data.clientId),
      createdBy: req.user!.userId,
      attachments: [],
      comments: [],
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    });

    await task.save();
    res.status(201).json(task);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /tasks/:id - Actualizar tarea (solo creador o asignado)
router.put("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const task = await WorkflowTask.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const hasAccess = task.createdBy === userId || task.assignedTo.includes(userId);
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const updateData = req.body;
    delete updateData.tenantId;
    delete (updateData as any).createdBy;
    delete updateData._id;

    if (updateData.campaignId) {
      updateData.campaignId = new Types.ObjectId(updateData.campaignId);
    }
    if (updateData.clientId) {
      updateData.clientId = new Types.ObjectId(updateData.clientId);
    }
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }

    Object.assign(task, updateData);
    await task.save();

    res.json(task);
  } catch (error) {
    console.error("Update task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /tasks/:id - Borrar tarea (solo creador)
router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const task = await WorkflowTask.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    if (task.createdBy !== userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    await WorkflowTask.deleteOne({ _id: req.params.id });
    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Delete task error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /tasks/:id/comments - Comentar (solo creador o asignado)
router.post("/:id/comments", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { message } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "Message is required" });
      return;
    }

    const task = await WorkflowTask.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const hasAccess = task.createdBy === userId || task.assignedTo.includes(userId);
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    task.comments.push({
      userId,
      message: message.trim(),
      createdAt: new Date(),
    });

    await task.save();
    res.json(task);
  } catch (error) {
    console.error("Add comment error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as taskRoutes };
