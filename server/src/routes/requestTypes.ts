import { Router } from "express";
import { z } from "zod";
import { RequestType } from "../models/RequestType.js";
import { authenticateToken, AuthenticatedRequest, requireRole } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.use(requireTenant, authenticateToken, requireRole(["admin", "manager", "superadmin"]));

const createRequestTypeSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  key: z.string().min(1, "Key is required").max(50).regex(/^[a-z0-9_]+$/, "Key must be lowercase alphanumeric with underscores"),
  description: z.string().optional(),
});

const updateRequestTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { includeInactive } = req.query;

    const filter: any = { tenantId: req.tenantObjectId };
    if (!includeInactive || includeInactive !== "true") {
      filter.isActive = true;
    }

    const requestTypes = await RequestType.find(filter).sort({ isSystem: -1, name: 1 });

    res.json(requestTypes);
  } catch (error) {
    console.error("Get request types error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const requestType = await RequestType.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!requestType) {
      res.status(404).json({ error: "Request type not found" });
      return;
    }

    res.json(requestType);
  } catch (error) {
    console.error("Get request type error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createRequestTypeSchema.parse(req.body);

    const existing = await RequestType.findOne({
      tenantId: req.tenantObjectId,
      key: data.key,
    });

    if (existing) {
      res.status(400).json({ error: "A request type with this key already exists" });
      return;
    }

    const requestType = new RequestType({
      tenantId: req.tenantObjectId,
      ...data,
      isSystem: false,
      isDeletable: true,
      isActive: true,
    });

    await requestType.save();

    res.status(201).json(requestType);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Create request type error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = updateRequestTypeSchema.parse(req.body);

    const requestType = await RequestType.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!requestType) {
      res.status(404).json({ error: "Request type not found" });
      return;
    }

    if (requestType.key === "vacation" && data.name) {
      res.status(400).json({ error: "Cannot modify the vacation request type name" });
      return;
    }

    if (data.name) requestType.name = data.name;
    if (data.description !== undefined) requestType.description = data.description;
    if (data.isActive !== undefined) requestType.isActive = data.isActive;

    await requestType.save();

    res.json(requestType);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Update request type error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const requestType = await RequestType.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!requestType) {
      res.status(404).json({ error: "Request type not found" });
      return;
    }

    if (!requestType.isDeletable) {
      res.status(400).json({ error: "This request type cannot be deleted" });
      return;
    }

    if (requestType.key === "vacation") {
      res.status(400).json({ error: "Cannot delete the vacation request type" });
      return;
    }

    await requestType.deleteOne();

    res.json({ message: "Request type deleted successfully" });
  } catch (error) {
    console.error("Delete request type error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as requestTypeRoutes };
