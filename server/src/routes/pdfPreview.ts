import { Router } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { generatePreviewPDF } from "../utils/pdfGenerator.js";
import { z } from "zod";

const router = Router();

const previewSchema = z.object({
  content: z.string().optional(),
  code: z.string().optional(),
  isGlobalPreview: z.boolean().optional(),
  title: z.string().optional(),
  pdfText: z.string().optional(),
  usaMembrete: z.boolean().optional(),
});

router.post("/preview", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { content, code, isGlobalPreview, title, pdfText, usaMembrete } = previewSchema.parse(req.body);

    const pdfBuffer = await generatePreviewPDF(content || "", code || "dinero", req.tenantObjectId.toString(), isGlobalPreview, title, pdfText, usaMembrete);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=preview.pdf");
    res.send(pdfBuffer);
  } catch (error) {
    console.error("Preview PDF error:", error);
    res.status(500).json({ error: "Error al generar vista previa" });
  }
});

export { router as pdfTemplatePreviewRoutes };
