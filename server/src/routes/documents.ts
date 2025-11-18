import { Router } from "express";
import { HRDocument } from "../models/Document.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const router = Router();

router.use(requireTenant, authenticateToken);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const documents = await HRDocument.find({
      tenantId: req.tenantObjectId,
      userId,
      isVisibleToEmployee: true,
    })
      .sort({ uploadedAt: -1 })
      .populate({
        path: "uploadedBy",
        select: "firstName lastName email",
        options: { strictPopulate: false }
      })
      .lean();

    res.json(documents || []);
  } catch (error) {
    console.error("Get documents error:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.get("/filter", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;
    const { type } = req.query;

    const filter: any = {
      tenantId: req.tenantObjectId,
      userId,
      isVisibleToEmployee: true,
    };

    if (type && ["contract", "payroll", "certificate", "other"].includes(type as string)) {
      filter.type = type;
    }

    const documents = await HRDocument.find(filter)
      .sort({ uploadedAt: -1 })
      .populate({
        path: "uploadedBy",
        select: "firstName lastName email",
        options: { strictPopulate: false }
      })
      .lean();

    res.json(documents || []);
  } catch (error) {
    console.error("Filter documents error:", error);
    res.status(500).json({ error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const document = await HRDocument.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
      isVisibleToEmployee: true,
    }).populate("uploadedBy", "firstName lastName email");

    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    res.json(document);
  } catch (error) {
    console.error("Get document error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/download/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const userId = req.user!.userId;

    const document = await HRDocument.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
      userId,
      isVisibleToEmployee: true,
    });

    if (!document) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    if (document.fileUrl) {
      res.redirect(document.fileUrl);
      return;
    }

    if (document.filePath) {
      const fullPath = path.resolve(__dirname, "../../", document.filePath);
      res.download(fullPath);
      return;
    }

    res.status(404).json({ error: "Document file not found" });
  } catch (error) {
    console.error("Download document error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as documentRoutes };
