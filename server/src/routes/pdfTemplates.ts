import { Router } from "express";
import { z } from "zod";
import { PdfTemplate } from "../models/PdfTemplate.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

const pdfTemplateSchema = z.object({
  code: z.enum(["dinero", "fechaRango", "fechaUnica", "vacaciones"]),
  name: z.string().min(1).max(100),
  content: z.string().min(10).max(50000),
  variablesHint: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

router.get("/", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const templates = await PdfTemplate.find({
      tenantId: req.tenantObjectId,
    }).sort({ createdAt: -1 });

    res.json(templates);
  } catch (error) {
    console.error("Get PDF templates error:", error);
    res.status(500).json({ error: "Error al obtener plantillas" });
  }
});

router.get("/:id", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const template = await PdfTemplate.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!template) {
      res.status(404).json({ error: "Plantilla no encontrada" });
      return;
    }

    res.json(template);
  } catch (error) {
    console.error("Get PDF template error:", error);
    res.status(500).json({ error: "Error al obtener plantilla" });
  }
});

router.post("/", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const validatedData = pdfTemplateSchema.parse(req.body);

    const existingTemplate = await PdfTemplate.findOne({
      tenantId: req.tenantObjectId,
      code: validatedData.code,
    });

    if (existingTemplate) {
      res.status(400).json({ error: `Ya existe una plantilla con el código '${validatedData.code}'` });
      return;
    }

    const template = await PdfTemplate.create({
      ...validatedData,
      tenantId: req.tenantObjectId,
    });

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Create PDF template error:", error);
    res.status(500).json({ error: "Error al crear plantilla" });
  }
});

router.put("/:id", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const validatedData = pdfTemplateSchema.parse(req.body);

    const template = await PdfTemplate.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!template) {
      res.status(404).json({ error: "Plantilla no encontrada" });
      return;
    }

    if (template.code !== validatedData.code) {
      const existingTemplate = await PdfTemplate.findOne({
        tenantId: req.tenantObjectId,
        code: validatedData.code,
        _id: { $ne: template._id },
      });

      if (existingTemplate) {
        res.status(400).json({ error: `Ya existe otra plantilla con el código '${validatedData.code}'` });
        return;
      }
    }

    Object.assign(template, validatedData);
    await template.save();

    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Update PDF template error:", error);
    res.status(500).json({ error: "Error al actualizar plantilla" });
  }
});

router.delete("/:id", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const template = await PdfTemplate.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!template) {
      res.status(404).json({ error: "Plantilla no encontrada" });
      return;
    }

    await template.deleteOne();

    res.json({ message: "Plantilla eliminada correctamente" });
  } catch (error) {
    console.error("Delete PDF template error:", error);
    res.status(500).json({ error: "Error al eliminar plantilla" });
  }
});

export { router as pdfTemplateRoutes };
