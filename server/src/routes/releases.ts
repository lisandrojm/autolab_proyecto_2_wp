import { Router } from "express";
import { z } from "zod";
import { Release } from "../models/Release.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { buildEmployeeDocData, buildDocFileName } from "../utils/employeeDocData.js";
import { buildDocPdf, getDummyDocVariables, htmlHasText } from "../utils/documentPdf.js";

const router = Router();

// El release se redacta en la plataforma (editor con formato) y se guarda como HTML en `content`.
// El PDF se genera al descargar, reemplazando las variables `{{variable}}`.
const ReleaseSchema = z.object({
  name: z.string().min(1).max(150),
  version: z.string().min(1).max(50),
  description: z.string().max(2000).optional(),
  content: z.string().max(200000).optional(),
  isActive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (typeof v === "string" ? v === "true" : v)),
});

const sendPdf = (res: any, buffer: Buffer, baseName: string) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.pdf"`);
  res.send(buffer);
};

router.get("/", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const releases = await Release.find({
      tenantId: req.tenantObjectId,
    }).sort({ createdAt: -1 });

    res.json(releases);
  } catch (error) {
    console.error("Get releases error:", error);
    res.status(500).json({ error: "Error al obtener releases" });
  }
});

// POST /releases/preview — genera un PDF de ejemplo con el contenido del editor (sin guardar).
router.post("/preview", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { content } = z.object({ content: z.string().max(200000) }).parse(req.body);
    const buffer = await buildDocPdf(content, getDummyDocVariables());
    sendPdf(res, buffer, "Preview_Release");
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Preview release error:", error);
    res.status(500).json({ error: "No se pudo generar la previsualización" });
  }
});

router.get("/:id", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const release = await Release.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!release) {
      res.status(404).json({ error: "Release no encontrado" });
      return;
    }

    res.json(release);
  } catch (error) {
    console.error("Get release error:", error);
    res.status(500).json({ error: "Error al obtener release" });
  }
});

// GET /releases/:id/download — PDF del release con valores de ejemplo (sin persona asociada).
router.get("/:id/download", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const release = await Release.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!release) {
      res.status(404).json({ error: "Release no encontrado" });
      return;
    }
    if (!htmlHasText(release.content)) {
      res.status(400).json({ error: "El release no tiene contenido redactado" });
      return;
    }

    const buffer = await buildDocPdf(release.content, getDummyDocVariables());
    sendPdf(res, buffer, `${release.name || "Release"}`);
  } catch (error) {
    console.error("Download release error:", error);
    res.status(500).json({ error: "Error al generar el archivo" });
  }
});

// GET /releases/:id/download-filled?userId=&projectId=&contractIndex=
// Genera el PDF del release con las variables reemplazadas por los datos de la persona/contrato
// y de la empresa seteada en el proyecto (releaseEmpresa).
router.get("/:id/download-filled", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const release = await Release.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!release) {
      res.status(404).json({ error: "Release no encontrado" });
      return;
    }
    if (!htmlHasText(release.content)) {
      res.status(400).json({ error: "El release no tiene contenido redactado" });
      return;
    }

    const { userId, projectId, contractIndex } = req.query as { userId?: string; projectId?: string; contractIndex?: string };

    const user = await User.findOne({ _id: userId, tenantId: req.tenantObjectId }).populate({ path: "metadata.projects", model: UserProject }).lean();
    if (!user) {
      res.status(404).json({ error: "Empleado no encontrado" });
      return;
    }

    // Buscar el UserProject del proyecto y el contrato correspondiente
    const projects: any[] = (user as any).metadata?.projects || [];
    const up = projects.find((p) => {
      const pId = p?.projectId;
      const idToCheck = typeof pId === "object" && pId ? pId._id : pId;
      return String(idToCheck) === String(projectId);
    });
    const contracts: any[] = up?.contracts || [];
    let idx = Number(contractIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= contracts.length) idx = contracts.length - 1;
    const contract: any = contracts[idx] || {};

    // Empresa/Productora seteada en el PROYECTO (releaseEmpresa) → variables empresa* en la plantilla
    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).lean();
    const empresaId = (project as any)?.releaseEmpresa;
    const empresa = empresaId ? await Company.findById(empresaId).lean() : null;
    const data = await buildEmployeeDocData(user, up, contract, empresa);

    const buffer = await buildDocPdf(release.content, data);
    const baseName = buildDocFileName({ tipo: "Release", user, up, contract, docName: release.name });
    sendPdf(res, buffer, baseName);
  } catch (error) {
    console.error("Download filled release error:", error);
    res.status(500).json({ error: "No se pudo generar el release con los datos." });
  }
});

router.post("/", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const validatedData = ReleaseSchema.parse(req.body);

    const release = new Release({
      ...validatedData,
      content: htmlHasText(validatedData.content) ? validatedData.content : "",
      tenantId: req.tenantObjectId,
    });

    await release.save();
    res.status(201).json(release);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Create release error:", error);
    res.status(500).json({ error: "Error al crear release" });
  }
});

router.put("/:id", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const validatedData = ReleaseSchema.parse(req.body);

    const release = await Release.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!release) {
      res.status(404).json({ error: "Release no encontrado" });
      return;
    }

    release.name = validatedData.name;
    release.version = validatedData.version;
    if (validatedData.description !== undefined) release.description = validatedData.description;
    if (validatedData.content !== undefined) release.content = htmlHasText(validatedData.content) ? validatedData.content : "";
    if (validatedData.isActive !== undefined) release.isActive = validatedData.isActive;

    await release.save();
    res.json(release);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Update release error:", error);
    res.status(500).json({ error: "Error al actualizar release" });
  }
});

router.delete("/:id", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const release = await Release.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!release) {
      res.status(404).json({ error: "Release no encontrado" });
      return;
    }

    await release.deleteOne();
    res.json({ message: "Release eliminado correctamente" });
  } catch (error) {
    console.error("Delete release error:", error);
    res.status(500).json({ error: "Error al eliminar release" });
  }
});

export { router as ReleaseRoutes };
