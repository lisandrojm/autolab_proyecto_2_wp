import { Router, Response } from "express";
import multer from "multer";
import xlsx from "xlsx";
import { Model } from "mongoose";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

/**
 * Factory de router CRUD para catálogos simples de FRAME con forma
 * `{ externalId, name, data: { id, nombre } }` (Bancos, Obras Sociales,
 * Centros de Costos, etc). Mismo patrón global que Categorías SAT:
 * sin tenantId, solo `authenticateToken`, con plantilla + import Excel.
 */
export interface SimpleCatalogConfig {
  /** Etiqueta singular para mensajes de error, ej. "Banco". */
  entityLabel: string;
  /** Nombre de la hoja del Excel, ej. "Bancos". */
  sheetName: string;
  /** Nombre del archivo de plantilla, ej. "plantilla_bancos.xlsx". */
  templateFilename: string;
  /** Ejemplos para la plantilla (solo nombres). */
  sampleNames?: string[];
}

interface SimpleCatalogDoc {
  externalId?: string;
  name: string;
  data?: { id?: number; nombre?: string };
}

export function createSimpleCatalogRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  config: SimpleCatalogConfig
): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage() });

  // GET / - listar
  router.get("/", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const items = await model.find().sort({ name: 1 }).lean();
      res.json(items);
    } catch (error) {
      console.error(`Get ${config.sheetName} error:`, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /template - descargar plantilla Excel
  router.get("/template", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const samples = config.sampleNames && config.sampleNames.length > 0 ? config.sampleNames : ["Ejemplo 1", "Ejemplo 2"];
      const wsData: (string | number)[][] = [["ID Externo (opcional)", "Nombre"], ...samples.map((n) => ["", n])];

      const ws = xlsx.utils.aoa_to_sheet(wsData);
      ws["!cols"] = [{ wch: 18 }, { wch: 45 }];

      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, config.sheetName);
      const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=${config.templateFilename}`);
      res.send(buffer);
    } catch (error) {
      console.error(`Download ${config.sheetName} template error:`, error);
      res.status(500).json({ error: "No se pudo generar la plantilla" });
    }
  });

  // POST /import - importar desde Excel (upsert por externalId, si no por name)
  router.post("/import", authenticateToken, upload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "Debe subir un archivo de Excel" });
        return;
      }

      const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rawRows = xlsx.utils.sheet_to_json<any>(worksheet);

      if (rawRows.length === 0) {
        res.status(400).json({ error: "El archivo de Excel está vacío" });
        return;
      }

      const errors: string[] = [];
      const parsed: Array<{ externalId: string; nombre: string }> = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2;
        const nombre = row["Nombre"] ?? row["nombre"] ?? row["NAME"] ?? row["Name"];
        const externalId = row["ID Externo (opcional)"] ?? row["ID Externo"] ?? row["externalId"] ?? row["Id"] ?? row["ID"] ?? "";

        if (!nombre || String(nombre).trim() === "") {
          errors.push(`Fila ${rowNum}: La columna 'Nombre' es obligatoria.`);
          continue;
        }
        parsed.push({ externalId: String(externalId ?? "").trim(), nombre: String(nombre).trim() });
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
                data: { id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined, nombre: item.nombre },
              },
            },
            upsert: true,
          },
        };
      });

      let processed = 0;
      if (bulkOps.length > 0) {
        const result = await model.bulkWrite(bulkOps);
        processed = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
      }

      res.json({ message: "Importación masiva completada con éxito", count: processed });
    } catch (error) {
      console.error(`Import ${config.sheetName} error:`, error);
      res.status(500).json({ error: "Error interno al procesar el archivo Excel" });
    }
  });

  // POST / - crear manualmente
  router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { nombre, externalId } = req.body as { nombre?: string; externalId?: string };
      if (!nombre || !nombre.trim()) {
        res.status(400).json({ error: "El nombre es obligatorio" });
        return;
      }
      const idNum = externalId ? Number(externalId) : undefined;
      const newItem: SimpleCatalogDoc = {
        name: nombre.trim(),
        externalId: externalId ? String(externalId).trim() : "",
        data: { id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined, nombre: nombre.trim() },
      };
      const created = await model.create(newItem);
      res.status(201).json(created);
    } catch (error) {
      console.error(`Create ${config.entityLabel} error:`, error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  });

  // PUT /:id - actualizar
  router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { nombre, externalId } = req.body as { nombre?: string; externalId?: string };

      const item = await model.findById(id);
      if (!item) {
        res.status(404).json({ error: `${config.entityLabel} no encontrado` });
        return;
      }

      if (nombre !== undefined) {
        item.name = String(nombre).trim();
        item.data = item.data || {};
        item.data.nombre = String(nombre).trim();
      }
      if (externalId !== undefined) {
        item.externalId = String(externalId).trim();
        const idNum = Number(externalId);
        item.data = item.data || {};
        item.data.id = !isNaN(idNum) ? idNum : item.data.id;
      }

      await item.save();
      res.json(item);
    } catch (error) {
      console.error(`Update ${config.entityLabel} error:`, error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  });

  // DELETE /:id - eliminar
  router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { id } = req.params;
      const result = await model.deleteOne({ _id: id });
      if (result.deletedCount === 0) {
        res.status(404).json({ error: `${config.entityLabel} no encontrado` });
        return;
      }
      res.json({ message: `${config.entityLabel} eliminado correctamente` });
    } catch (error) {
      console.error(`Delete ${config.entityLabel} error:`, error);
      res.status(500).json({ error: "Error interno del servidor" });
    }
  });

  return router;
}
