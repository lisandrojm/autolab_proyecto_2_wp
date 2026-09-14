import { Router } from "express";
import multer from "multer";
import xlsx from "xlsx";
import mongoose from "mongoose";
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
/** `true`/`"true"` → true, `false`/`"false"` → false; cualquier otra cosa → undefined (no se toca). */
const aBooleanoOpcional = (v) => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined);
/**
 * Tres resultados y no dos:
 *   `undefined` → no vino en el body: el campo no se toca.
 *   `null`      → vino vacío a propósito: se desvincula.
 *   ObjectId    → se vincula.
 *
 * Un id mal formado NO se convierte a `null`: eso es la misma clase de bug que descartar un campo
 * desconocido y contestar 200 —el cliente pidió una cosa, pasó otra, y nadie se enteró—.
 */
const parsearRef = (campo, v) => {
    if (v === undefined)
        return {}; // no vino: `valor` queda undefined y el campo no se toca
    const s = v === null ? "" : String(v).trim();
    if (s === "" || s === "null")
        return { valor: null }; // desvincular: `null` NO es `undefined`
    if (!mongoose.Types.ObjectId.isValid(s))
        return { motivo: `${campo}: "${s}" no es un id válido.` };
    return { valor: new mongoose.Types.ObjectId(s) };
};
export function createSimpleCatalogRouter(
// eslint-disable-next-line @typescript-eslint/no-explicit-any
model, config) {
    const router = Router();
    const upload = multer({ storage: multer.memoryStorage() });
    /**
     * Las claves que este catálogo sabe guardar. Todo lo demás es un error del cliente.
     *
     * El schema de Mongoose es `strict` por defecto, así que un campo que no está declarado se
     * DESCARTA EN SILENCIO y la respuesta vuelve 200: quien mandó el update cree que guardó algo que
     * no se guardó, y lo descubre recién cuando recarga. Un update que no guarda nada no puede
     * contestar OK, así que se corta antes con un 400 que dice qué clave sobra.
     *
     * El nombre y el id externo entran con sus tres vocabularios porque el cliente usa cualquiera de
     * ellos: el del catálogo (`nombre`/`externalId`) y el de ARCA (`descripcion`/`codigo`).
     */
    const CLAVES_ACEPTADAS = new Set([
        "nombre",
        "name",
        "descripcion",
        "externalId",
        "codigo",
        ...(config.extraStringFields || []).map((f) => f.key),
        ...(config.extraNumberFields || []).map((f) => f.key),
        ...(config.extraRefFields || []).map((f) => f.key),
        ...(config.extraBooleanFields || []).map((f) => f.key),
    ]);
    /** Las claves del body que este catálogo no sabe guardar. Vacío = todo bien. */
    const clavesDeMas = (body) => (body && typeof body === "object" ? Object.keys(body).filter((k) => !CLAVES_ACEPTADAS.has(k)) : []);
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
    router.get("/", authenticateToken, async (req, res) => {
        try {
            // Solo los declarados en `filtrosPermitidos`; el resto de la query se ignora. Un catálogo sin
            // esa lista se comporta exactamente como antes.
            const filtro = {};
            for (const campo of config.filtrosPermitidos || []) {
                const valor = req.query[campo];
                if (valor === undefined)
                    continue;
                filtro[campo] = valor === "null" || valor === "" ? null : valor;
            }
            let consulta = model.find(filtro).sort({ name: 1 });
            for (const p of config.populate || [])
                consulta = consulta.populate(p.path, p.select);
            const items = await consulta.lean();
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
                for (const f of config.extraRefFields || []) {
                    const ref = parsearRef(f.key, item[f.key]);
                    if (ref.motivo) {
                        errores.push(`Registro ${i + 1}: ${ref.motivo}`);
                        return;
                    }
                    if (ref.valor !== undefined)
                        extras[f.key] = ref.valor;
                }
                for (const f of config.extraBooleanFields || []) {
                    const b = aBooleanoOpcional(item[f.key]);
                    if (b !== undefined)
                        extras[f.key] = b;
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
            const sobran = clavesDeMas(req.body);
            if (sobran.length > 0) {
                res.status(400).json({ error: `Campos no reconocidos para ${config.entityLabel}: ${sobran.join(", ")}`, campos: sobran });
                return;
            }
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
            for (const f of config.extraRefFields || []) {
                const ref = parsearRef(f.key, req.body[f.key]);
                if (ref.motivo) {
                    res.status(400).json({ error: ref.motivo });
                    return;
                }
                if (ref.valor !== undefined)
                    newItem[f.key] = ref.valor;
            }
            for (const f of config.extraBooleanFields || []) {
                const b = aBooleanoOpcional(req.body[f.key]);
                if (b !== undefined)
                    newItem[f.key] = b;
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
            const sobran = clavesDeMas(req.body);
            if (sobran.length > 0) {
                res.status(400).json({ error: `Campos no reconocidos para ${config.entityLabel}: ${sobran.join(", ")}`, campos: sobran });
                return;
            }
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
            for (const f of config.extraRefFields || []) {
                const ref = parsearRef(f.key, req.body[f.key]);
                if (ref.motivo) {
                    res.status(400).json({ error: ref.motivo });
                    return;
                }
                if (ref.valor !== undefined)
                    item[f.key] = ref.valor;
            }
            for (const f of config.extraBooleanFields || []) {
                const b = aBooleanoOpcional(req.body[f.key]);
                if (b !== undefined)
                    item[f.key] = b;
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
