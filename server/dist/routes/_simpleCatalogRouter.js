import { Router } from "express";
import multer from "multer";
import xlsx from "xlsx";
import { authenticateToken } from "../middleware/auth.js";
/**
 * Convierte a número lo que llega de un formulario. Devuelve `undefined` para "sin valor" —vacío,
 * null o no numérico—, que NO es lo mismo que 0: el RNOS 0 no existe, pero 0 es un número válido y
 * un `Number("")` lo produciría en silencio.
 */
const aNumeroOpcional = (v) => {
    if (v === undefined || v === null || String(v).trim() === "")
        return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};
export function createSimpleCatalogRouter(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
model, config) {
    const router = Router();
    const upload = multer({ storage: multer.memoryStorage() });
    /**
     * Las operaciones de upsert de una carga masiva. La usan el import de Excel y el de lote JSON: son
     * la misma semántica y separarlas es garantizar que en algún momento se comporten distinto.
     *
     * Se setean las claves de `data` una por una en lugar de reemplazar el objeto: si se pisara entero,
     * reimportar borraría los campos que no vienen en la carga (ej. la marca de obra social por defecto).
     */
    const construirUpserts = (parsed) => parsed.map((item) => {
        const idNum = item.externalId ? Number(item.externalId) : undefined;
        const set = {
            name: item.nombre,
            externalId: item.externalId,
            "data.nombre": item.nombre,
            ...item.extras,
        };
        if (idNum !== undefined && !isNaN(idNum))
            set["data.id"] = idNum;
        return {
            updateOne: {
                // Por `externalId` cuando lo hay: es la identidad del registro en el nomenclador y lo que
                // hace que reimportar sea idempotente en vez de duplicar todo.
                filter: item.externalId ? { externalId: item.externalId } : { name: item.nombre },
                update: { $set: set },
                upsert: true,
            },
        };
    });
    // GET / - listar
    router.get("/", authenticateToken, async (_req, res) => {
        try {
            const items = await model.find().sort({ name: 1 }).lean();
            res.json(items);
        }
        catch (error) {
            console.error(`Get ${config.sheetName} error:`, error);
            res.status(500).json({ error: "Internal server error" });
        }
    });
    // GET /template - descargar plantilla Excel
    router.get("/template", authenticateToken, async (_req, res) => {
        try {
            const samples = config.sampleNames && config.sampleNames.length > 0 ? config.sampleNames : ["Ejemplo 1", "Ejemplo 2"];
            const extraHeaders = (config.extraStringFields || []).map((f) => f.excelHeader || f.key);
            const externalIdHeader = config.externalIdExcelHeader || "ID Externo (opcional)";
            const wsData = [
                [externalIdHeader, config.nombreExcelHeader || "Nombre", ...extraHeaders],
                ...samples.map((n) => ["", n, ...extraHeaders.map(() => "")]),
            ];
            const ws = xlsx.utils.aoa_to_sheet(wsData);
            ws["!cols"] = [{ wch: 18 }, { wch: 45 }, ...extraHeaders.map(() => ({ wch: 22 }))];
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, config.sheetName);
            const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", `attachment; filename=${config.templateFilename}`);
            res.send(buffer);
        }
        catch (error) {
            console.error(`Download ${config.sheetName} template error:`, error);
            res.status(500).json({ error: "No se pudo generar la plantilla" });
        }
    });
    // POST /import - importar desde Excel (upsert por externalId, si no por name)
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
            const errors = [];
            const parsed = [];
            for (let i = 0; i < rawRows.length; i++) {
                const row = rawRows[i];
                const rowNum = i + 2;
                const nombreCandidates = [config.nombreExcelHeader, "Nombre", "nombre", "NAME", "Name", ...(config.nombreExcelAliases || [])].filter(Boolean);
                let nombre;
                for (const h of nombreCandidates) {
                    if (row[h] !== undefined) {
                        nombre = row[h];
                        break;
                    }
                }
                const externalIdCandidates = [config.externalIdExcelHeader, "ID Externo (opcional)", "ID Externo", "externalId", "Id", "ID", ...(config.externalIdExcelAliases || [])].filter(Boolean);
                let externalId = "";
                for (const h of externalIdCandidates) {
                    if (row[h] !== undefined) {
                        externalId = row[h];
                        break;
                    }
                }
                if (!nombre || String(nombre).trim() === "") {
                    errors.push(`Fila ${rowNum}: La columna '${config.nombreExcelHeader || "Nombre"}' es obligatoria.`);
                    continue;
                }
                const extras = {};
                for (const f of config.extraStringFields || []) {
                    const candidates = [f.excelHeader, f.key, ...(f.aliases || [])].filter(Boolean);
                    let val;
                    for (const h of candidates) {
                        if (row[h] !== undefined) {
                            val = row[h];
                            break;
                        }
                    }
                    if (val !== undefined && val !== null && String(val).trim() !== "")
                        extras[f.key] = String(val).trim();
                }
                const rawExternalId = String(externalId ?? "").trim();
                parsed.push({ externalId: config.sanitizeExternalId ? config.sanitizeExternalId(rawExternalId) : rawExternalId, nombre: String(nombre).trim(), extras });
            }
            if (errors.length > 0) {
                res.status(400).json({ error: "Errores de validación en el archivo Excel", details: errors });
                return;
            }
            const bulkOps = construirUpserts(parsed);
            let processed = 0;
            if (bulkOps.length > 0) {
                const result = await model.bulkWrite(bulkOps);
                processed = (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0);
            }
            res.json({ message: "Importación masiva completada con éxito", count: processed });
        }
        catch (error) {
            console.error(`Import ${config.sheetName} error:`, error);
            res.status(500).json({ error: "Error interno al procesar el archivo Excel" });
        }
    });
    /**
     * POST /bulk — carga masiva en UN request, sin Excel.
     *
     * Existe porque cargar un catálogo entero de a un POST no es viable: son 2.350 requests contra un
     * rate limiter de 200/minuto, así que la carga se corta a mitad de camino con un 429 y queda a
     * medias. Con un solo request no hay ventana que agotar, la operación es atómica desde el punto de
     * vista del operador y se puede repetir sin pensar.
     *
     * IDEMPOTENTE: upsert por `externalId` (o por nombre si no lo hay), igual que el import de Excel —
     * comparten el mismo armado de operaciones para que no puedan divergir. Correrlo dos veces deja el
     * mismo estado, que es lo que hace falta cuando se siembra el nomenclador y además el padrón lo
     * autoalimenta.
     *
     * Body: `{ items: [{ nombre, externalId?, ...extras }] }`.
     */
    router.post("/bulk", authenticateToken, async (req, res) => {
        try {
            const { items } = req.body;
            if (!Array.isArray(items)) {
                res.status(400).json({ error: "Se espera { items: [...] }" });
                return;
            }
            if (items.length === 0) {
                res.status(400).json({ error: "No hay registros para cargar" });
                return;
            }
            // Tope defensivo: el límite del body ya corta antes, pero un número explícito da un error que
            // se entiende, en vez de un 413 sin contexto.
            if (items.length > 20000) {
                res.status(400).json({ error: `Demasiados registros (${items.length}). Partilo en lotes de hasta 20.000.` });
                return;
            }
            const errores = [];
            const parsed = [];
            items.forEach((item, i) => {
                // Se aceptan los dos vocabularios: el del catálogo (`nombre`/`externalId`) y el del dominio
                // de ARCA (`descripcion`/`codigo`), que es como vienen los CSV extraídos del organismo.
                const nombre = String(item.nombre ?? item.name ?? item.descripcion ?? "").trim();
                const rawExternalId = String(item.externalId ?? item.codigo ?? "").trim();
                if (!nombre) {
                    errores.push(`Registro ${i + 1}: falta el nombre.`);
                    return;
                }
                const extras = {};
                for (const f of config.extraStringFields || []) {
                    const val = item[f.key];
                    if (val !== undefined && val !== null && String(val).trim() !== "")
                        extras[f.key] = String(val).trim();
                }
                parsed.push({ externalId: config.sanitizeExternalId ? config.sanitizeExternalId(rawExternalId) : rawExternalId, nombre, extras });
            });
            if (errores.length > 0) {
                res.status(400).json({ error: "Errores de validación", details: errores.slice(0, 20) });
                return;
            }
            const result = await model.bulkWrite(construirUpserts(parsed));
            res.json({
                message: "Carga masiva completada",
                count: (result.upsertedCount || 0) + (result.modifiedCount || 0) + (result.matchedCount || 0),
                creados: result.upsertedCount || 0,
                actualizados: result.modifiedCount || 0,
                sinCambios: (result.matchedCount || 0) - (result.modifiedCount || 0),
            });
        }
        catch (error) {
            console.error(`Bulk ${config.sheetName} error:`, error);
            res.status(500).json({ error: "Error interno al procesar la carga masiva" });
        }
    });
    // POST / - crear manualmente
    router.post("/", authenticateToken, async (req, res) => {
        try {
            const { nombre, externalId } = req.body;
            if (!nombre || !nombre.trim()) {
                res.status(400).json({ error: "El nombre es obligatorio" });
                return;
            }
            const cleanExternalId = externalId ? (config.sanitizeExternalId ? config.sanitizeExternalId(String(externalId).trim()) : String(externalId).trim()) : "";
            const idNum = cleanExternalId ? Number(cleanExternalId) : undefined;
            const newItem = {
                name: nombre.trim(),
                externalId: cleanExternalId,
                data: { id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined, nombre: nombre.trim() },
            };
            for (const f of config.extraStringFields || []) {
                const v = req.body[f.key];
                if (v !== undefined && v !== null)
                    newItem[f.key] = String(v).trim();
            }
            for (const f of config.extraNumberFields || []) {
                const n = aNumeroOpcional(req.body[f.key]);
                if (n !== undefined)
                    newItem[f.key] = n;
            }
            const created = await model.create(newItem);
            res.status(201).json(created);
        }
        catch (error) {
            console.error(`Create ${config.entityLabel} error:`, error);
            res.status(500).json({ error: "Error interno del servidor" });
        }
    });
    // PUT /:id - actualizar
    router.put("/:id", authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            const { nombre, externalId } = req.body;
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
                const cleanExternalId = config.sanitizeExternalId ? config.sanitizeExternalId(String(externalId).trim()) : String(externalId).trim();
                item.externalId = cleanExternalId;
                const idNum = Number(cleanExternalId);
                item.data = item.data || {};
                item.data.id = !isNaN(idNum) ? idNum : item.data.id;
            }
            for (const f of config.extraStringFields || []) {
                const v = req.body[f.key];
                if (v !== undefined)
                    item[f.key] = v === null ? "" : String(v).trim();
            }
            for (const f of config.extraNumberFields || []) {
                const bruto = req.body[f.key];
                // `undefined` = el cliente no lo mandó (no se toca). Vacío/null = se limpia a `null`.
                if (bruto !== undefined)
                    item[f.key] = aNumeroOpcional(bruto) ?? null;
            }
            await item.save();
            res.json(item);
        }
        catch (error) {
            console.error(`Update ${config.entityLabel} error:`, error);
            res.status(500).json({ error: "Error interno del servidor" });
        }
    });
    // DELETE /:id - eliminar
    router.delete("/:id", authenticateToken, async (req, res) => {
        try {
            const { id } = req.params;
            const result = await model.deleteOne({ _id: id });
            if (result.deletedCount === 0) {
                res.status(404).json({ error: `${config.entityLabel} no encontrado` });
                return;
            }
            res.json({ message: `${config.entityLabel} eliminado correctamente` });
        }
        catch (error) {
            console.error(`Delete ${config.entityLabel} error:`, error);
            res.status(500).json({ error: "Error interno del servidor" });
        }
    });
    return router;
}
