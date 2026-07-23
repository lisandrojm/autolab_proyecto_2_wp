import { Router, Response } from "express";
import multer from "multer";
import xlsx from "xlsx";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Company } from "../models/Company.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { buildEmployeeDocData, buildDocFileName } from "../utils/employeeDocData.js";
import { buildDocPdf, getDummyDocVariables } from "../utils/documentPdf.js";

const router = Router();
// Solo se usa para el import masivo por Excel (en memoria); el contrato ya no se sube como archivo.
const upload = multer({ storage: multer.memoryStorage() });

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

// GET /template - plantilla Excel para el import masivo
router.get("/template", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const wsData = [
      ["ID Externo (opcional)", "Nombre", "Cantidad Jornadas", "Multiplicador Diario"],
      ["", "Jornada 2030 SRL", 1, 1.0],
      ["", "Contrato Mensual", 22, 1.0],
    ];
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 18 }, { wch: 20 }];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Contratos");
    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=plantilla_contratos.xlsx");
    res.send(buffer);
  } catch (error) {
    console.error("Download contratos-frame template error:", error);
    res.status(500).json({ error: "No se pudo generar la plantilla" });
  }
});

// POST /preview — genera un PDF de ejemplo con el contenido del editor (sin guardar).
router.post("/preview", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const content = String(req.body?.content ?? "");
    if (!content.trim()) {
      res.status(400).json({ error: "El contenido es obligatorio" });
      return;
    }
    const buffer = await buildDocPdf(content, getDummyDocVariables());
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
    if (!item.content) {
      res.status(400).json({ error: "El contrato no tiene contenido redactado" });
      return;
    }
    const buffer = await buildDocPdf(item.content, getDummyDocVariables());
    sendPdf(res, buffer, `${item.name || "Contrato"}`);
  } catch (error) {
    console.error("Download ContratoFrame error:", error);
    res.status(500).json({ error: "Error al generar el archivo" });
  }
});

// GET /:id/download-filled?userId=&projectId=&contractIndex=
// Genera el PDF del contrato con las variables reemplazadas por los datos de la persona/contrato
// y de la empresa seteada en el proyecto (contratoEmpresa).
router.get("/:id/download-filled", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await ContratoFrame.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }
    if (!item.content) {
      res.status(400).json({ error: "El contrato no tiene contenido redactado" });
      return;
    }

    const { userId, projectId, contractIndex } = req.query as { userId?: string; projectId?: string; contractIndex?: string };

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

    // Empresa/Productora seteada en el PROYECTO (contratoEmpresa) → variables empresa* en la plantilla
    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).lean();
    const empresaId = (project as any)?.contratoEmpresa;
    const empresa = empresaId ? await Company.findById(empresaId).lean() : null;
    const data = await buildEmployeeDocData(user, up, contract, empresa);

    const buffer = await buildDocPdf(item.content, data);
    const baseName = buildDocFileName({ tipo: "Contrato", user, up, contract });
    sendPdf(res, buffer, baseName);
  } catch (error) {
    console.error("Download filled ContratoFrame error:", error);
    res.status(500).json({ error: "No se pudo generar el contrato con los datos." });
  }
});

// POST /import - importar desde Excel
router.post("/import", authenticateToken, upload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Debe subir un archivo de Excel" });
      return;
    }
    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = xlsx.utils.sheet_to_json<any>(worksheet);
    if (rawRows.length === 0) {
      res.status(400).json({ error: "El archivo de Excel está vacío" });
      return;
    }

    const errors: string[] = [];
    const parsed: Array<{ externalId: string; nombre: string; cantidadJornadas: number; multiplicadorDiario: number }> = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2;
      const nombre = row["Nombre"] ?? row["nombre"];
      if (!nombre || String(nombre).trim() === "") {
        errors.push(`Fila ${rowNum}: La columna 'Nombre' es obligatoria.`);
        continue;
      }
      parsed.push({
        externalId: String(row["ID Externo (opcional)"] ?? row["ID Externo"] ?? row["externalId"] ?? "").trim(),
        nombre: String(nombre).trim(),
        cantidadJornadas: parseNum(row["Cantidad Jornadas"] ?? row["cantidadJornadas"] ?? row["Cantidad de Jornadas"]),
        multiplicadorDiario: parseNum(row["Multiplicador Diario"] ?? row["multiplicadorDiario"]),
      });
    }

    if (errors.length > 0) {
      res.status(400).json({ error: "Errores de validación en el archivo Excel", details: errors });
      return;
    }

    const bulkOps = parsed.map((item) => {
      const idNum = item.externalId ? Number(item.externalId) : undefined;
      return {
        updateOne: {
          filter: item.externalId ? { externalId: item.externalId } : { name: item.nombre },
          update: {
            $set: {
              name: item.nombre,
              externalId: item.externalId,
              // Ojo: no se pisa `content` (se redacta en la plataforma, no viene del Excel).
              "data.id": idNum !== undefined && !isNaN(idNum) ? idNum : undefined,
              "data.nombre": item.nombre,
              "data.cantidadJornadas": item.cantidadJornadas,
              "data.multiplicadorDiario": item.multiplicadorDiario,
            },
          },
          upsert: true,
        },
      };
    });

    let processed = 0;
    if (bulkOps.length > 0) {
      const result = await ContratoFrame.bulkWrite(bulkOps);
      processed = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }
    res.json({ message: "Importación masiva completada con éxito", count: processed });
  } catch (error) {
    console.error("Import contratos-frame error:", error);
    res.status(500).json({ error: "Error interno al procesar el archivo Excel" });
  }
});

// POST / - crear
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { nombre, externalId, content, cantidadJornadas, multiplicadorDiario, esTiempoIndeterminado } = req.body;
    if (!nombre || !String(nombre).trim()) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }
    const idNum = externalId ? Number(externalId) : undefined;
    const created = await ContratoFrame.create({
      name: String(nombre).trim(),
      externalId: externalId ? String(externalId).trim() : "",
      content: content ? String(content) : "",
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
    const { nombre, externalId, content, cantidadJornadas, multiplicadorDiario, esTiempoIndeterminado } = req.body;
    const item = await ContratoFrame.findById(id);
    if (!item) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }
    if (nombre !== undefined) {
      item.name = String(nombre).trim();
      item.data.nombre = String(nombre).trim();
    }
    if (externalId !== undefined) {
      item.externalId = String(externalId).trim();
      const idNum = Number(externalId);
      if (!isNaN(idNum)) item.data.id = idNum;
    }
    if (content !== undefined) item.content = String(content);
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
