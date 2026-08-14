import { Router } from "express";
import multer from "multer";
import xlsx from "xlsx";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { authenticateToken } from "../middleware/auth.js";
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
/**
 * GET /api/v1/categorias-sat
 */
router.get("/", authenticateToken, async (req, res) => {
    try {
        const items = await CategoriaSat.find().sort({ name: 1 }).lean();
        res.json(items);
    }
    catch (error) {
        console.error("Get categorias-sat error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/**
 * GET /api/v1/categorias-sat/template
 * Descargar plantilla de Excel para Categorías SAT
 */
router.get("/template", authenticateToken, async (req, res) => {
    try {
        const wsData = [
            ["numeroCategoria", "sueldoBasico", "sueldoAdicional", "presentismo", "sueldoBruto", "sueldoBrutoLetras", "neto", "sueldoNetoLetras"],
            [1, 1187208.59, 742005.37, 192921.40, 2122135.35, "DOS MILLONES CIENTO VEINTIDÓS MIL CIENTO TREINTA Y CINCO CON 35/100", 1718929.63, "UN MILLÓN SETECIENTOS DIECIOCHO MIL NOVECIENTOS VEINTINUEVE CON 63/100"],
            [2, 1123965.32, 550743.01, 167470.83, 1842179.16, "UN MILLÓN OCHOCIENTOS CUARENTA Y DOS MIL CIENTO SETENTA Y NUEVE CON 16/100", 1492165.11, "UN MILLÓN CUATROCIENTOS NOVENTA Y DOS MIL CIENTO SESENTA Y CINCO CON 11/100"],
        ];
        const ws = xlsx.utils.aoa_to_sheet(wsData);
        ws["!cols"] = [
            { wch: 16 }, // numeroCategoria
            { wch: 16 }, // sueldoBasico
            { wch: 16 }, // sueldoAdicional
            { wch: 14 }, // presentismo
            { wch: 16 }, // sueldoBruto
            { wch: 45 }, // sueldoBrutoLetras
            { wch: 16 }, // neto
            { wch: 45 }, // sueldoNetoLetras
        ];
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "CategoriasSAT");
        const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=plantilla_categorias_sat.xlsx");
        res.send(buffer);
    }
    catch (error) {
        console.error("Download categorias-sat template error:", error);
        res.status(500).json({ error: "No se pudo generar la plantilla" });
    }
});
/**
 * POST /api/v1/categorias-sat/import
 * Importar categorías SAT desde archivo Excel
 */
router.post("/import", authenticateToken, upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "Debe subir un archivo de Excel" });
            return;
        }
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = xlsx.utils.sheet_to_json(worksheet);
        if (rawRows.length === 0) {
            res.status(400).json({ error: "El archivo de Excel está vacío" });
            return;
        }
        const parsedItems = [];
        const errors = [];
        for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i];
            const rowNum = i + 2;
            const numCat = row["numeroCategoria"] ?? row["Nº Categoría"] ?? row["Nro Categoría"] ?? row["N° Categoría"] ?? row["Numero Categoria"];
            if (numCat === undefined || numCat === null || numCat === "") {
                errors.push(`Fila ${rowNum}: La columna 'numeroCategoria' es obligatoria.`);
                continue;
            }
            const parseNum = (val) => {
                if (val === undefined || val === null || val === "")
                    return 0;
                const n = Number(val);
                return isNaN(n) ? 0 : n;
            };
            parsedItems.push({
                numeroCategoria: parseNum(numCat),
                sueldoBasico: parseNum(row["sueldoBasico"] ?? row["Sueldo Básico"] ?? row["Sueldo Basico"]),
                sueldoAdicional: parseNum(row["sueldoAdicional"] ?? row["Sueldo Adicional"]),
                presentismo: parseNum(row["presentismo"] ?? row["Presentismo"]),
                sueldoBruto: parseNum(row["sueldoBruto"] ?? row["Sueldo Bruto"]),
                sueldoBrutoLetras: String(row["sueldoBrutoLetras"] ?? row["Sueldo Bruto Letras"] ?? "").trim(),
                neto: parseNum(row["neto"] ?? row["Neto"]),
                sueldoNetoLetras: String(row["sueldoNetoLetras"] ?? row["Sueldo Neto Letras"] ?? "").trim(),
            });
        }
        if (errors.length > 0) {
            res.status(400).json({ error: "Errores de validación en el archivo Excel", details: errors });
            return;
        }
        // Solo actualiza los valores salariales de las categorías existentes (agrupadas por numeroCategoria).
        // No crea, no elimina, ni modifica el ABM (nombre, código AFIP, etc.).
        const fechaActualizacion = new Date().toISOString().split("T")[0];
        let categoriasActualizadas = 0;
        let itemsActualizados = 0;
        const noEncontradas = [];
        for (const item of parsedItems) {
            const result = await CategoriaSat.updateMany({ "data.numeroCategoria": item.numeroCategoria }, {
                $set: {
                    "data.sueldoBasico": item.sueldoBasico,
                    "data.sueldoAdicional": item.sueldoAdicional,
                    "data.presentismo": item.presentismo,
                    "data.sueldoBruto": item.sueldoBruto,
                    "data.sueldoBrutoLetras": item.sueldoBrutoLetras,
                    "data.neto": item.neto,
                    "data.sueldoNetoLetras": item.sueldoNetoLetras,
                    "data.fechaActualizacion": fechaActualizacion,
                },
            });
            if (result.matchedCount > 0) {
                categoriasActualizadas++;
                itemsActualizados += result.matchedCount;
            }
            else {
                noEncontradas.push(item.numeroCategoria);
            }
        }
        const message = noEncontradas.length > 0
            ? `Se actualizaron ${categoriasActualizadas} categorías (${itemsActualizados} ítems). No se encontraron las categorías: ${noEncontradas.join(", ")}.`
            : `Actualización masiva completada: ${categoriasActualizadas} categorías (${itemsActualizados} ítems).`;
        res.json({ message, count: categoriasActualizadas });
    }
    catch (error) {
        console.error("Import categorias-sat error:", error);
        res.status(500).json({ error: "Error interno al procesar el archivo Excel" });
    }
});
/**
 * POST /api/v1/categorias-sat
 * Crear una nueva categoría SAT manualmente
 */
router.post("/", authenticateToken, async (req, res) => {
    try {
        const { numeroCategoria, nombre, sueldoBasico, sueldoAdicional, sueldoBruto, sueldoBrutoLetras, presentismo, neto, sueldoNetoLetras, codigoAfip, convenio, fechaActualizacion, } = req.body;
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
                convenio: String(convenio || "").trim(),
                fechaActualizacion: fechaActualizacion || new Date().toISOString().split("T")[0],
            },
        });
        await newItem.save();
        res.status(201).json(newItem);
    }
    catch (error) {
        console.error("Create CategoriaSat error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * PUT /api/v1/categorias-sat/global/:numeroCategoria
 * Actualizar los valores salariales de todos los ítems con un número de categoría específico
 */
router.put("/global/:numeroCategoria", authenticateToken, async (req, res) => {
    try {
        const { numeroCategoria } = req.params;
        const { sueldoBasico, sueldoAdicional, sueldoBruto, sueldoBrutoLetras, presentismo, neto, sueldoNetoLetras, fechaActualizacion, } = req.body;
        const num = Number(numeroCategoria);
        if (isNaN(num)) {
            return res.status(400).json({ error: "Número de categoría inválido" });
        }
        const updateData = {};
        if (sueldoBasico !== undefined)
            updateData["data.sueldoBasico"] = Number(sueldoBasico);
        if (sueldoAdicional !== undefined)
            updateData["data.sueldoAdicional"] = Number(sueldoAdicional);
        if (sueldoBruto !== undefined)
            updateData["data.sueldoBruto"] = Number(sueldoBruto);
        if (sueldoBrutoLetras !== undefined)
            updateData["data.sueldoBrutoLetras"] = String(sueldoBrutoLetras).trim();
        if (presentismo !== undefined)
            updateData["data.presentismo"] = Number(presentismo);
        if (neto !== undefined)
            updateData["data.neto"] = Number(neto);
        if (sueldoNetoLetras !== undefined)
            updateData["data.sueldoNetoLetras"] = String(sueldoNetoLetras).trim();
        if (fechaActualizacion !== undefined)
            updateData["data.fechaActualizacion"] = fechaActualizacion;
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: "No se proporcionaron valores para actualizar" });
        }
        const result = await CategoriaSat.updateMany({ "data.numeroCategoria": num }, { $set: updateData });
        res.json({
            message: `Categoría ${num} actualizada globalmente.`,
            modifiedCount: result.modifiedCount
        });
    }
    catch (error) {
        console.error("Update global CategoriaSat error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * PUT /api/v1/categorias-sat/:id
 * Modificar una categoría SAT existente
 */
router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { numeroCategoria, nombre, sueldoBasico, sueldoAdicional, sueldoBruto, sueldoBrutoLetras, presentismo, neto, sueldoNetoLetras, codigoAfip, convenio, fechaActualizacion, } = req.body;
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
        if (sueldoBasico !== undefined)
            item.data.sueldoBasico = Number(sueldoBasico);
        if (sueldoAdicional !== undefined)
            item.data.sueldoAdicional = Number(sueldoAdicional);
        if (sueldoBruto !== undefined)
            item.data.sueldoBruto = Number(sueldoBruto);
        if (sueldoBrutoLetras !== undefined)
            item.data.sueldoBrutoLetras = String(sueldoBrutoLetras).trim();
        if (presentismo !== undefined)
            item.data.presentismo = Number(presentismo);
        if (neto !== undefined)
            item.data.neto = Number(neto);
        if (sueldoNetoLetras !== undefined)
            item.data.sueldoNetoLetras = String(sueldoNetoLetras).trim();
        if (codigoAfip !== undefined) {
            item.data.codigoAfip = Number(codigoAfip);
            item.externalId = String(codigoAfip || item.data.numeroCategoria);
        }
        if (convenio !== undefined)
            item.data.convenio = String(convenio || "").trim();
        if (fechaActualizacion !== undefined)
            item.data.fechaActualizacion = fechaActualizacion;
        await item.save();
        // Actualizar de manera global todos los ítems que compartan el mismo Nº de categoría
        if (item.data.numeroCategoria !== undefined && item.data.numeroCategoria !== null) {
            await CategoriaSat.updateMany({
                "data.numeroCategoria": item.data.numeroCategoria,
                _id: { $ne: item._id }
            }, {
                $set: {
                    "data.sueldoBasico": item.data.sueldoBasico,
                    "data.sueldoAdicional": item.data.sueldoAdicional,
                    "data.sueldoBruto": item.data.sueldoBruto,
                    "data.sueldoBrutoLetras": item.data.sueldoBrutoLetras,
                    "data.presentismo": item.data.presentismo,
                    "data.neto": item.data.neto,
                    "data.sueldoNetoLetras": item.data.sueldoNetoLetras,
                    "data.fechaActualizacion": item.data.fechaActualizacion,
                }
            });
        }
        res.json(item);
    }
    catch (error) {
        console.error("Update CategoriaSat error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * DELETE /api/v1/categorias-sat/:id
 * Eliminar una categoría SAT
 */
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await CategoriaSat.deleteOne({ _id: id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Categoría no encontrada" });
        }
        res.json({ message: "Categoría eliminada correctamente" });
    }
    catch (error) {
        console.error("Delete CategoriaSat error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
export { router as categoriasSatRoutes };
