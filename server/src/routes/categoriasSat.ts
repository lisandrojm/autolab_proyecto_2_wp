import { Router, Response } from "express";
import multer from "multer";
import xlsx from "xlsx";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * GET /api/v1/categorias-sat
 */
router.get("/", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const items = await CategoriaSat.find().sort({ name: 1 }).lean();
    res.json(items);
  } catch (error) {
    console.error("Get categorias-sat error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/v1/categorias-sat/template
 * Descargar plantilla de Excel para Categorías SAT
 */
router.get("/template", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const wsData = [
      ["Nº Categoría", "Nombre", "Sueldo Básico", "Sueldo Adicional", "Sueldo Bruto", "Sueldo Bruto Letras", "Presentismo", "Neto", "Sueldo Neto Letras", "Código AFIP", "Fecha Actualización"],
      [1, "Director de Programas", 1034550.34, 646593.96, 1849258.73, "UN MILLÓN OCHOCIENTOS...", 168114.43, 1497899.57, "UN MILLÓN CUATROCIENTOS...", 35283, "2026-07-01"],
      [2, "Camarógrafo Realizador", 979439.26, 479925.24, 1605300.95, "UN MILLÓN SEISCIENTOS...", 145936.45, 1300293.77, "UN MILLÓN TRESCIENTOS...", 35286, "2026-07-01"],
    ];

    const ws = xlsx.utils.aoa_to_sheet(wsData);

    ws["!cols"] = [
      { wch: 14 },  // Nº Categoría
      { wch: 40 },  // Nombre
      { wch: 16 },  // Sueldo Básico
      { wch: 16 },  // Sueldo Adicional
      { wch: 16 },  // Sueldo Bruto
      { wch: 35 },  // Sueldo Bruto Letras
      { wch: 14 },  // Presentismo
      { wch: 16 },  // Neto
      { wch: 35 },  // Sueldo Neto Letras
      { wch: 14 },  // Código AFIP
      { wch: 20 },  // Fecha Actualización
    ];

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "CategoriasSAT");

    const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=plantilla_categorias_sat.xlsx");
    res.send(buffer);
  } catch (error) {
    console.error("Download categorias-sat template error:", error);
    res.status(500).json({ error: "No se pudo generar la plantilla" });
  }
});

/**
 * POST /api/v1/categorias-sat/import
 * Importar categorías SAT desde archivo Excel
 */
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

    const parsedItems: Array<{
      numeroCategoria: number;
      nombre: string;
      sueldoBasico: number;
      sueldoAdicional: number;
      sueldoBruto: number;
      sueldoBrutoLetras: string;
      presentismo: number;
      neto: number;
      sueldoNetoLetras: string;
      codigoAfip: number;
      fechaActualizacion: string;
    }> = [];

    const errors: string[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2;

      const numCat = row["Nº Categoría"] ?? row["Nro Categoría"] ?? row["N° Categoría"] ?? row["numeroCategoria"] ?? row["Numero Categoria"];
      const nombre = row["Nombre"] ?? row["nombre"] ?? row["NAME"] ?? row["Name"];

      if (numCat === undefined || numCat === null || numCat === "") {
        errors.push(`Fila ${rowNum}: La columna 'Nº Categoría' es obligatoria.`);
        continue;
      }
      if (!nombre) {
        errors.push(`Fila ${rowNum}: La columna 'Nombre' es obligatoria.`);
        continue;
      }

      const parseNum = (val: any): number => {
        if (val === undefined || val === null || val === "") return 0;
        const n = Number(val);
        return isNaN(n) ? 0 : n;
      };

      parsedItems.push({
        numeroCategoria: parseNum(numCat),
        nombre: String(nombre).trim(),
        sueldoBasico: parseNum(row["Sueldo Básico"] ?? row["sueldoBasico"] ?? row["Sueldo Basico"]),
        sueldoAdicional: parseNum(row["Sueldo Adicional"] ?? row["sueldoAdicional"]),
        sueldoBruto: parseNum(row["Sueldo Bruto"] ?? row["sueldoBruto"]),
        sueldoBrutoLetras: String(row["Sueldo Bruto Letras"] ?? row["sueldoBrutoLetras"] ?? "").trim(),
        presentismo: parseNum(row["Presentismo"] ?? row["presentismo"]),
        neto: parseNum(row["Neto"] ?? row["neto"]),
        sueldoNetoLetras: String(row["Sueldo Neto Letras"] ?? row["sueldoNetoLetras"] ?? "").trim(),
        codigoAfip: parseNum(row["Código AFIP"] ?? row["codigoAfip"] ?? row["Codigo AFIP"]),
        fechaActualizacion: String(row["Fecha Actualización"] ?? row["fechaActualizacion"] ?? row["Fecha Actualizacion"] ?? "").trim(),
      });
    }

    if (errors.length > 0) {
      res.status(400).json({ error: "Errores de validación en el archivo Excel", details: errors });
      return;
    }

    const bulkOps = parsedItems.map((item) => ({
      updateOne: {
        filter: { "data.numeroCategoria": item.numeroCategoria },
        update: {
          $set: {
            name: item.nombre,
            externalId: String(item.codigoAfip || item.numeroCategoria),
            data: {
              id: item.numeroCategoria,
              numeroCategoria: item.numeroCategoria,
              nombre: item.nombre,
              sueldoBasico: item.sueldoBasico,
              sueldoAdicional: item.sueldoAdicional,
              sueldoBruto: item.sueldoBruto,
              sueldoBrutoLetras: item.sueldoBrutoLetras,
              presentismo: item.presentismo,
              neto: item.neto,
              sueldoNetoLetras: item.sueldoNetoLetras,
              codigoAfip: item.codigoAfip,
              fechaActualizacion: item.fechaActualizacion,
            },
          },
        },
        upsert: true,
      },
    }));

    let processed = 0;
    if (bulkOps.length > 0) {
      const result = await CategoriaSat.bulkWrite(bulkOps);
      processed = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
    }

    res.json({ message: "Importación masiva completada con éxito", count: processed });
  } catch (error) {
    console.error("Import categorias-sat error:", error);
    res.status(500).json({ error: "Error interno al procesar el archivo Excel" });
  }
});

/**
 * POST /api/v1/categorias-sat
 * Crear una nueva categoría SAT manualmente
 */
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const {
      numeroCategoria,
      nombre,
      sueldoBasico,
      sueldoAdicional,
      sueldoBruto,
      sueldoBrutoLetras,
      presentismo,
      neto,
      sueldoNetoLetras,
      codigoAfip,
      fechaActualizacion,
    } = req.body;

    if (numeroCategoria === undefined || numeroCategoria === null) {
      return res.status(400).json({ error: "El Nº de categoría es obligatorio" });
    }
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    const newItem = new CategoriaSat({
      name: nombre.trim(),
      externalId: String(codigoAfip || numeroCategoria),
      data: {
        id: Number(numeroCategoria),
        numeroCategoria: Number(numeroCategoria),
        nombre: nombre.trim(),
        sueldoBasico: Number(sueldoBasico || 0),
        sueldoAdicional: Number(sueldoAdicional || 0),
        sueldoBruto: Number(sueldoBruto || 0),
        sueldoBrutoLetras: String(sueldoBrutoLetras || "").trim(),
        presentismo: Number(presentismo || 0),
        neto: Number(neto || 0),
        sueldoNetoLetras: String(sueldoNetoLetras || "").trim(),
        codigoAfip: Number(codigoAfip || 0),
        fechaActualizacion: fechaActualizacion || new Date().toISOString().split("T")[0],
      },
    });

    await newItem.save();
    res.status(201).json(newItem);
  } catch (error) {
    console.error("Create CategoriaSat error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * PUT /api/v1/categorias-sat/:id
 * Modificar una categoría SAT existente
 */
router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const {
      numeroCategoria,
      nombre,
      sueldoBasico,
      sueldoAdicional,
      sueldoBruto,
      sueldoBrutoLetras,
      presentismo,
      neto,
      sueldoNetoLetras,
      codigoAfip,
      fechaActualizacion,
    } = req.body;

    const item = await CategoriaSat.findById(id);
    if (!item) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }

    if (nombre !== undefined) {
      item.name = nombre.trim();
      item.data.nombre = nombre.trim();
    }
    if (numeroCategoria !== undefined) {
      item.data.numeroCategoria = Number(numeroCategoria);
      item.data.id = Number(numeroCategoria);
    }
    if (sueldoBasico !== undefined) item.data.sueldoBasico = Number(sueldoBasico);
    if (sueldoAdicional !== undefined) item.data.sueldoAdicional = Number(sueldoAdicional);
    if (sueldoBruto !== undefined) item.data.sueldoBruto = Number(sueldoBruto);
    if (sueldoBrutoLetras !== undefined) item.data.sueldoBrutoLetras = String(sueldoBrutoLetras).trim();
    if (presentismo !== undefined) item.data.presentismo = Number(presentismo);
    if (neto !== undefined) item.data.neto = Number(neto);
    if (sueldoNetoLetras !== undefined) item.data.sueldoNetoLetras = String(sueldoNetoLetras).trim();
    if (codigoAfip !== undefined) {
      item.data.codigoAfip = Number(codigoAfip);
      item.externalId = String(codigoAfip || item.data.numeroCategoria);
    }
    if (fechaActualizacion !== undefined) item.data.fechaActualizacion = fechaActualizacion;

    await item.save();
    res.json(item);
  } catch (error) {
    console.error("Update CategoriaSat error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/**
 * DELETE /api/v1/categorias-sat/:id
 * Eliminar una categoría SAT
 */
router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const result = await CategoriaSat.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Categoría no encontrada" });
    }
    res.json({ message: "Categoría eliminada correctamente" });
  } catch (error) {
    console.error("Delete CategoriaSat error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export { router as categoriasSatRoutes };
