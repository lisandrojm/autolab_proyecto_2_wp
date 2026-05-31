import { Router, Response } from "express";
import { z } from "zod";
import multer from "multer";
import xlsx from "xlsx";
import { Holiday } from "../models/Holiday.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { toObjectIdOrNull } from "../utils/mongoIds.js";
import { createFuzzySearchRegex } from "../utils/searchHelpers.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const createHolidaySchema = z.object({
  name: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "El formato debe ser AAAA-MM-DD"),
  type: z.enum(["Nacional", "Provincial", "Feriado Puente", "Otro"]).default("Nacional"),
  description: z.string().optional(),
});

const updateHolidaySchema = createHolidaySchema.partial();

// Helper para parsear fechas de Excel de forma robusta
function parseExcelDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    // Número de serie de Excel
    return new Date(Math.round((val - 25569) * 86400 * 1000));
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    // Probar AAAA-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return new Date(trimmed + "T00:00:00");
    }
    // Probar DD/MM/AAAA o DD-MM-AAAA
    const parts = trimmed.split(/[-/]/);
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (year > 1000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return new Date(year, month - 1, day, 0, 0, 0);
      }
      const y2 = parseInt(parts[0], 10);
      const m2 = parseInt(parts[1], 10);
      const d2 = parseInt(parts[2], 10);
      if (y2 > 1000 && m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31) {
        return new Date(y2, m2 - 1, d2, 0, 0, 0);
      }
    }
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }
  }
  return null;
}

// GET / - Listar feriados del tenant
router.get("/", requireTenant, authenticateToken, requirePermission("config_holidays:view"), async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    const { name, year } = req.query;
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) {
      res.status(400).json({ error: "ID de organización inválido" });
      return;
    }

    const filter: any = { tenantId };

    if (name) {
      filter.name = createFuzzySearchRegex(name as string);
    }

    if (year) {
      const y = parseInt(year as string, 10);
      if (!isNaN(y)) {
        filter.date = {
          $gte: new Date(y, 0, 1),
          $lte: new Date(y, 11, 31, 23, 59, 59, 999),
        };
      }
    }

    const holidays = await Holiday.find(filter).sort({ date: 1 });
    res.json({ holidays });
  } catch (error) {
    console.error("Get holidays error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// POST / - Crear un feriado individual
router.post("/", requireTenant, authenticateToken, requirePermission("config_holidays:view"), async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    const data = createHolidaySchema.parse(req.body);
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) {
      res.status(400).json({ error: "ID de organización inválido" });
      return;
    }

    const holidayDate = new Date(data.date + "T00:00:00");

    // Validar duplicado
    const existing = await Holiday.findOne({ tenantId, date: holidayDate });
    if (existing) {
      res.status(409).json({ error: "Ya existe un feriado registrado para esta fecha" });
      return;
    }

    const holiday = new Holiday({
      tenantId,
      date: holidayDate,
      name: data.name,
      type: data.type,
      description: data.description,
    });

    await holiday.save();
    res.status(201).json(holiday);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Create holiday error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// PUT /:id - Modificar feriado existente
router.put("/:id", requireTenant, authenticateToken, requirePermission("config_holidays:view"), async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    const data = updateHolidaySchema.parse(req.body);
    const holidayId = toObjectIdOrNull(req.params.id);
    const tenantId = toObjectIdOrNull(req.tenantObjectId);

    if (!holidayId || !tenantId) {
      res.status(400).json({ error: "Parámetros inválidos" });
      return;
    }

    const holiday = await Holiday.findOne({ _id: holidayId, tenantId });
    if (!holiday) {
      res.status(404).json({ error: "Feriado no encontrado" });
      return;
    }

    if (data.date) {
      const holidayDate = new Date(data.date + "T00:00:00");
      const existing = await Holiday.findOne({
        tenantId,
        date: holidayDate,
        _id: { $ne: holidayId },
      });
      if (existing) {
        res.status(409).json({ error: "Ya existe otro feriado registrado para esta fecha" });
        return;
      }
      holiday.date = holidayDate;
    }

    if (data.name !== undefined) holiday.name = data.name;
    if (data.type !== undefined) holiday.type = data.type;
    if (data.description !== undefined) holiday.description = data.description;

    await holiday.save();
    res.json(holiday);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Datos inválidos", details: error.errors });
      return;
    }
    console.error("Update holiday error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// DELETE /:id - Eliminar feriado
router.delete("/:id", requireTenant, authenticateToken, requirePermission("config_holidays:view"), async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    const holidayId = toObjectIdOrNull(req.params.id);
    const tenantId = toObjectIdOrNull(req.tenantObjectId);

    if (!holidayId || !tenantId) {
      res.status(400).json({ error: "Parámetros inválidos" });
      return;
    }

    const result = await Holiday.deleteOne({ _id: holidayId, tenantId });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: "Feriado no encontrado" });
      return;
    }

    res.json({ message: "Feriado eliminado correctamente" });
  } catch (error) {
    console.error("Delete holiday error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// GET /template - Descargar plantilla de Excel
router.get("/template", requireTenant, authenticateToken, requirePermission("config_holidays:view"), async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    const wsData = [
      ["Fecha", "Nombre", "Tipo", "Descripción"],
      ["2026-01-01", "Año Nuevo", "Nacional", "Inicio del año civil"],
      ["2026-03-24", "Día Nacional de la Memoria por la Verdad y la Justicia", "Nacional", "Feriado inamovible"],
      ["2026-04-02", "Día del Veterano y de los Caídos en la Guerra de Malvinas", "Nacional", ""],
      ["2026-05-01", "Día del Trabajador", "Nacional", ""],
      ["2026-11-20", "Día de la Soberanía Nacional", "Nacional", "Feriado trasladable"]
    ];

    const ws = xlsx.utils.aoa_to_sheet(wsData);
    
    // Ancho de columnas para visualización amigable
    ws["!cols"] = [
      { wch: 15 }, // Fecha
      { wch: 50 }, // Nombre
      { wch: 15 }, // Tipo
      { wch: 30 }  // Descripción
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Feriados");

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=plantilla_feriados.xlsx");
    res.send(buffer);
  } catch (error) {
    console.error("Download template error:", error);
    res.status(500).json({ error: "No se pudo generar la plantilla" });
  }
});

// POST /import - Importar feriados desde archivo Excel
router.post("/import", requireTenant, authenticateToken, requirePermission("config_holidays:view"), upload.single("file"), async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Debe subir un archivo de Excel" });
      return;
    }

    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) {
      res.status(400).json({ error: "ID de organización inválido" });
      return;
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convertir a JSON
    const rawRows = xlsx.utils.sheet_to_json<any>(worksheet);

    if (rawRows.length === 0) {
      res.status(400).json({ error: "El archivo de Excel está vacío" });
      return;
    }

    const parsedHolidays: Array<{
      date: Date;
      name: string;
      type: string;
      description?: string;
    }> = [];

    const errors: string[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rawDate = row["Fecha"] || row["fecha"] || row["DATE"] || row["Date"];
      const rawName = row["Nombre"] || row["nombre"] || row["NAME"] || row["Name"];
      const rawType = row["Tipo"] || row["tipo"] || row["TYPE"] || row["Type"] || "Nacional";
      const rawDesc = row["Descripción"] || row["descripcion"] || row["description"] || row["Description"] || "";

      const rowNum = i + 2; // Número de fila (encabezado es 1)

      if (!rawDate) {
        errors.push(`Fila ${rowNum}: La columna 'Fecha' es obligatoria.`);
        continue;
      }
      if (!rawName) {
        errors.push(`Fila ${rowNum}: La columna 'Nombre' es obligatoria.`);
        continue;
      }

      const parsedDate = parseExcelDate(rawDate);
      if (!parsedDate || isNaN(parsedDate.getTime())) {
        errors.push(`Fila ${rowNum}: Formato de fecha inválido para '${rawDate}'. Use AAAA-MM-DD o DD/MM/AAAA.`);
        continue;
      }

      // Normalizar la fecha a las 00:00:00 de ese día
      const normalizedDate = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0);

      parsedHolidays.push({
        date: normalizedDate,
        name: String(rawName).trim(),
        type: ["Nacional", "Provincial", "Feriado Puente", "Otro"].includes(String(rawType).trim()) 
          ? String(rawType).trim() 
          : "Nacional",
        description: rawDesc ? String(rawDesc).trim() : undefined,
      });
    }

    if (errors.length > 0) {
      res.status(400).json({ error: "Errores de validación en el archivo Excel", details: errors });
      return;
    }

    // Realizar operaciones de bulk upsert
    let processed = 0;
    const bulkOps = parsedHolidays.map((hol) => ({
      updateOne: {
        filter: { tenantId, date: hol.date },
        update: {
          $set: {
            name: hol.name,
            type: hol.type,
            description: hol.description,
          },
        },
        upsert: true,
      },
    }));

    if (bulkOps.length > 0) {
      const result = await Holiday.bulkWrite(bulkOps);
      processed = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }

    res.json({ message: "Importación masiva completada con éxito", count: processed });
  } catch (error) {
    console.error("Import holidays error:", error);
    res.status(500).json({ error: "Error interno al procesar el archivo Excel" });
  }
});

export { router as holidayRoutes };
