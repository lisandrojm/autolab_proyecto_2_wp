import { Router, Response } from "express";
import multer from "multer";
import xlsx from "xlsx";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const parseNum = (val: any): number => {
  if (val === undefined || val === null || val === "") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
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

// GET /template - plantilla Excel
router.get("/template", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const wsData = [
      ["ID Externo (opcional)", "Nombre", "Cantidad Jornadas", "Multiplicador Diario", "Ruta Archivo"],
      ["", "Jornada 2030 SRL", 1, 1.0, ""],
      ["", "Contrato Mensual", 22, 1.0, ""],
    ];
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 18 }, { wch: 40 }, { wch: 18 }, { wch: 20 }, { wch: 30 }];
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
    const parsed: Array<{ externalId: string; nombre: string; cantidadJornadas: number; multiplicadorDiario: number; rutaArchivo: string }> = [];

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
        rutaArchivo: String(row["Ruta Archivo"] ?? row["rutaArchivo"] ?? "").trim(),
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
              data: {
                id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined,
                nombre: item.nombre,
                rutaArchivo: item.rutaArchivo,
                cantidadJornadas: item.cantidadJornadas,
                multiplicadorDiario: item.multiplicadorDiario,
              },
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
    const { nombre, externalId, cantidadJornadas, multiplicadorDiario, rutaArchivo } = req.body;
    if (!nombre || !nombre.trim()) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }
    const idNum = externalId ? Number(externalId) : undefined;
    const created = await ContratoFrame.create({
      name: nombre.trim(),
      externalId: externalId ? String(externalId).trim() : "",
      data: {
        id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined,
        nombre: nombre.trim(),
        rutaArchivo: String(rutaArchivo || "").trim(),
        cantidadJornadas: parseNum(cantidadJornadas),
        multiplicadorDiario: parseNum(multiplicadorDiario),
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
    const { nombre, externalId, cantidadJornadas, multiplicadorDiario, rutaArchivo } = req.body;
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
    if (cantidadJornadas !== undefined) item.data.cantidadJornadas = parseNum(cantidadJornadas);
    if (multiplicadorDiario !== undefined) item.data.multiplicadorDiario = parseNum(multiplicadorDiario);
    if (rutaArchivo !== undefined) item.data.rutaArchivo = String(rutaArchivo).trim();
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
    const result = await ContratoFrame.deleteOne({ _id: req.params.id });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }
    res.json({ message: "Contrato eliminado correctamente" });
  } catch (error) {
    console.error("Delete ContratoFrame error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export { router as contratoFrameRoutes };
