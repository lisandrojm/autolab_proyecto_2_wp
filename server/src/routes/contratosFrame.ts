import { Router, Response } from "express";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { buildEmployeeDocData, buildDocFileName } from "../utils/employeeDocData.js";
import { buildDocPdf, getDummyDocVariables, htmlHasText, empresaToMembrete } from "../utils/documentPdf.js";

const router = Router();

const parseNum = (val: any): number => {
  if (val === undefined || val === null || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const sendPdf = (res: Response, buffer: Buffer, baseName: string) => {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.pdf"`);
  res.send(buffer);
};

// GET / - listar
router.get("/", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await ContratoFrame.find().sort({ name: 1 }).lean();
    res.json(items);
  } catch (error) {
    console.error("Get contratos-frame error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Membrete de EJEMPLO para previews/descargas sin persona: usa una empresa real con membrete
// cargado (logo/firma) si existe; si no, datos de ejemplo. Solo cuando la plantilla lleva membrete.
async function getExampleMembrete(usaMembrete: boolean) {
  if (!usaMembrete) return undefined;
  const empresa =
    (await Company.findOne({ $or: [{ logoUrl: { $nin: [null, ""] } }, { signatureUrl: { $nin: [null, ""] } }] }).lean()) ||
    (await Company.findOne().lean());
  if (empresa) return empresaToMembrete(empresa);
  return { razonSocial: "2030 S.R.L.", cuit: "30-71234567-9", domicilio: "Av. Corrientes 1234, Piso 5, CABA, Buenos Aires", firmanteNombre: "María González", firmanteCargo: "Apoderada" };
}

// POST /preview — genera un PDF de ejemplo con el contenido del editor (sin guardar).
router.post("/preview", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const content = String(req.body?.content ?? "");
    if (!content.trim()) {
      res.status(400).json({ error: "El contenido es obligatorio" });
      return;
    }
    const membrete = await getExampleMembrete(req.body?.usaMembrete === true || req.body?.usaMembrete === "true");
    const buffer = await buildDocPdf(content, getDummyDocVariables(), membrete);
    sendPdf(res, buffer, "Preview_Contrato");
  } catch (error) {
    console.error("Preview contrato error:", error);
    res.status(500).json({ error: "No se pudo generar la previsualización" });
  }
});

// GET /:id/download - PDF del contrato con valores de ejemplo (sin persona asociada)
router.get("/:id/download", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await ContratoFrame.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }
    if (!htmlHasText(item.content)) {
      res.status(400).json({ error: "El contrato no tiene contenido redactado" });
      return;
    }
    const membrete = await getExampleMembrete(!!item.usaMembrete);
    const buffer = await buildDocPdf(item.content, getDummyDocVariables(), membrete);
    sendPdf(res, buffer, `${item.name || "Contrato"}`);
  } catch (error) {
    console.error("Download ContratoFrame error:", error);
    res.status(500).json({ error: "Error al generar el archivo" });
  }
});

// GET /:id/download-filled?userId=&projectId=&contractIndex=
// Genera el PDF del contrato con las variables reemplazadas por los datos de la persona/contrato
// y de la empresa seteada en el proyecto (contratoEmpresas).
router.get("/:id/download-filled", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await ContratoFrame.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }
    if (!htmlHasText(item.content)) {
      res.status(400).json({ error: "El contrato no tiene contenido redactado" });
      return;
    }

    const { userId, projectId, contractIndex, empresaId } = req.query as { userId?: string; projectId?: string; contractIndex?: string; empresaId?: string };

    const user = await User.findOne({ _id: userId, tenantId: req.tenantObjectId }).populate({ path: "metadata.projects", model: UserProject }).lean();
    if (!user) {
      res.status(404).json({ error: "Empleado no encontrado" });
      return;
    }

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

    // Empresa/Productora del PROYECTO (contratoEmpresas) → variables empresa* en la plantilla.
    // El cliente elige con cuál descargar (empresaId); si no llega o no pertenece al proyecto, se usa la primera.
    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).lean();
    const empresas: any[] = (project as any)?.contratoEmpresas || [];
    const empresasIds = empresas.map((e) => String(e));
    const chosenId = empresaId && empresasIds.includes(String(empresaId)) ? empresaId : empresasIds[0];
    const empresa = chosenId ? await Company.findById(chosenId).lean() : null;
    const data = await buildEmployeeDocData(user, up, contract, empresa);

    // Si la plantilla lleva membrete, se encabeza/firma con la empresa elegida al descargar.
    const membrete = item.usaMembrete && empresa ? empresaToMembrete(empresa) : undefined;
    const buffer = await buildDocPdf(item.content, data, membrete);
    const baseName = buildDocFileName({ tipo: "Contrato", user, up, contract });
    sendPdf(res, buffer, baseName);
  } catch (error) {
    console.error("Download filled ContratoFrame error:", error);
    res.status(500).json({ error: "No se pudo generar el contrato con los datos." });
  }
});

// POST / - crear
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { nombre, externalId, content, cantidadJornadas, multiplicadorDiario, esTiempoIndeterminado, usaMembrete, isActive } = req.body;
    if (!nombre || !String(nombre).trim()) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }
    const idNum = externalId ? Number(externalId) : undefined;
    const created = await ContratoFrame.create({
      name: String(nombre).trim(),
      externalId: externalId ? String(externalId).trim() : "",
      content: htmlHasText(content) ? String(content) : "",
      usaMembrete: usaMembrete === "true" || usaMembrete === true,
      isActive: isActive === undefined ? true : isActive === "true" || isActive === true,
      data: {
        id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined,
        nombre: String(nombre).trim(),
        cantidadJornadas: parseNum(cantidadJornadas),
        multiplicadorDiario: parseNum(multiplicadorDiario),
        esTiempoIndeterminado: esTiempoIndeterminado === "true" || esTiempoIndeterminado === true,
      },
    });
    res.status(201).json(created);
  } catch (error) {
    console.error("Create ContratoFrame error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /:id - actualizar
router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { nombre, externalId, content, cantidadJornadas, multiplicadorDiario, esTiempoIndeterminado, usaMembrete, isActive } = req.body;
    const item = await ContratoFrame.findById(id);
    if (!item) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }
    if (usaMembrete !== undefined) item.usaMembrete = usaMembrete === "true" || usaMembrete === true;
    if (isActive !== undefined) item.isActive = isActive === "true" || isActive === true;
    if (nombre !== undefined) {
      item.name = String(nombre).trim();
      item.data.nombre = String(nombre).trim();
    }
    if (externalId !== undefined) {
      item.externalId = String(externalId).trim();
      const idNum = Number(externalId);
      if (!isNaN(idNum)) item.data.id = idNum;
    }
    if (content !== undefined) item.content = htmlHasText(content) ? String(content) : "";
    if (cantidadJornadas !== undefined) item.data.cantidadJornadas = parseNum(cantidadJornadas);
    if (multiplicadorDiario !== undefined) item.data.multiplicadorDiario = parseNum(multiplicadorDiario);
    if (esTiempoIndeterminado !== undefined) item.data.esTiempoIndeterminado = esTiempoIndeterminado === "true" || esTiempoIndeterminado === true;

    item.markModified("data");
    await item.save();
    res.json(item);
  } catch (error) {
    console.error("Update ContratoFrame error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE /:id - eliminar
router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await ContratoFrame.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }
    await item.deleteOne();
    res.json({ message: "Contrato eliminado correctamente" });
  } catch (error) {
    console.error("Delete ContratoFrame error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export { router as contratoFrameRoutes };
