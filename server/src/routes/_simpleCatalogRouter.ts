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
  /**
   * Campos string extra (además de name/externalId) a persistir en create/update/import.
   * Solo lo usan los catálogos que lo requieren (ej. Bancos → tipoEntidad); el resto no se ve afectado.
   */
  extraStringFields?: Array<{ key: string; excelHeader?: string; aliases?: string[] }>;
  /**
   * Campos numéricos extra a persistir en create/update (ej. Convenios → `obraSocialDefaultId`).
   *
   * Van aparte de `extraStringFields` porque el cliente los manda como string —el formulario genérico
   * serializa todo a texto— y guardarlos así rompería las comparaciones con `data.id`, que es número.
   * El vacío se guarda como `null` y no como `0`: "sin elegir" no es el RNOS 0.
   *
   * NO participan del import de Excel: estos catálogos se siembran desde el nomenclador de ARCA, que
   * no trae este dato.
   */
  extraNumberFields?: Array<{ key: string }>;
  /**
   * Encabezado de columna del Excel (plantilla + import) para "ID Externo", por si en este catálogo
   * ese id tiene otro nombre de dominio (ej. Obras Sociales → "RNOS"). Default: "ID Externo (opcional)".
   * Los alias de import siempre incluyen además "ID Externo (opcional)"/"ID Externo"/"externalId"/"Id"/"ID".
   */
  externalIdExcelHeader?: string;
  /** Encabezados adicionales aceptados al importar, más allá de los genéricos y `externalIdExcelHeader`. */
  externalIdExcelAliases?: string[];
  /**
   * Encabezado de la columna "Nombre" en la plantilla, por si en este catálogo el nombre tiene otro
   * nombre de dominio (ej. Convenios → "Actividad"). Default: "Nombre". Al importar se aceptan
   * siempre además "Nombre"/"nombre"/"Name"/"NAME".
   */
  nombreExcelHeader?: string;
  /** Encabezados adicionales aceptados para el nombre al importar. */
  nombreExcelAliases?: string[];
  /**
   * Normaliza `externalId` antes de guardarlo (create/update/import), ej. sacarle los guiones de
   * visualización del RNOS para que `data.id` (usado para vincular con FRAME) siga siendo un número
   * válido. Por defecto no se transforma: el resto de los catálogos no se ve afectado.
   */
  sanitizeExternalId?: (value: string) => string;
}

/**
 * Convierte a número lo que llega de un formulario. Devuelve `undefined` para "sin valor" —vacío,
 * null o no numérico—, que NO es lo mismo que 0: el RNOS 0 no existe, pero 0 es un número válido y
 * un `Number("")` lo produciría en silencio.
 */
const aNumeroOpcional = (v: unknown): number | undefined => {
  if (v === undefined || v === null || String(v).trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

interface SimpleCatalogDoc {
  externalId?: string;
  name: string;
  data?: { id?: number; nombre?: string };
  [key: string]: unknown;
}

export function createSimpleCatalogRouter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  config: SimpleCatalogConfig
): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage() });

  /**
   * Las operaciones de upsert de una carga masiva. La usan el import de Excel y el de lote JSON: son
   * la misma semántica y separarlas es garantizar que en algún momento se comporten distinto.
   *
   * Se setean las claves de `data` una por una en lugar de reemplazar el objeto: si se pisara entero,
   * reimportar borraría los campos que no vienen en la carga (ej. la marca de obra social por defecto).
   */
  const construirUpserts = (parsed: Array<{ externalId: string; nombre: string; extras: Record<string, string> }>) =>
    parsed.map((item) => {
      const idNum = item.externalId ? Number(item.externalId) : undefined;
      const set: Record<string, unknown> = {
        name: item.nombre,
        externalId: item.externalId,
        "data.nombre": item.nombre,
        ...item.extras,
      };
      if (idNum !== undefined && !isNaN(idNum)) set["data.id"] = idNum;
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
      const extraHeaders = (config.extraStringFields || []).map((f) => f.excelHeader || f.key);
      const externalIdHeader = config.externalIdExcelHeader || "ID Externo (opcional)";
      const wsData: (string | number)[][] = [
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
      const parsed: Array<{ externalId: string; nombre: string; extras: Record<string, string> }> = [];

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        const rowNum = i + 2;
        const nombreCandidates = [config.nombreExcelHeader, "Nombre", "nombre", "NAME", "Name", ...(config.nombreExcelAliases || [])].filter(Boolean) as string[];
        let nombre: unknown;
        for (const h of nombreCandidates) {
          if (row[h] !== undefined) {
            nombre = row[h];
            break;
          }
        }
        const externalIdCandidates = [config.externalIdExcelHeader, "ID Externo (opcional)", "ID Externo", "externalId", "Id", "ID", ...(config.externalIdExcelAliases || [])].filter(Boolean) as string[];
        let externalId: unknown = "";
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

        const extras: Record<string, string> = {};
        for (const f of config.extraStringFields || []) {
          const candidates = [f.excelHeader, f.key, ...(f.aliases || [])].filter(Boolean) as string[];
          let val: unknown;
          for (const h of candidates) {
            if (row[h] !== undefined) {
              val = row[h];
              break;
            }
          }
          if (val !== undefined && val !== null && String(val).trim() !== "") extras[f.key] = String(val).trim();
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
    } catch (error) {
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
  router.post("/bulk", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { items } = req.body as { items?: Array<Record<string, unknown>> };
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

      const errores: string[] = [];
      const parsed: Array<{ externalId: string; nombre: string; extras: Record<string, string> }> = [];

      items.forEach((item, i) => {
        // Se aceptan los dos vocabularios: el del catálogo (`nombre`/`externalId`) y el del dominio
        // de ARCA (`descripcion`/`codigo`), que es como vienen los CSV extraídos del organismo.
        const nombre = String(item.nombre ?? item.name ?? item.descripcion ?? "").trim();
        const rawExternalId = String(item.externalId ?? item.codigo ?? "").trim();
        if (!nombre) {
          errores.push(`Registro ${i + 1}: falta el nombre.`);
          return;
        }
        const extras: Record<string, string> = {};
        for (const f of config.extraStringFields || []) {
          const val = item[f.key];
          if (val !== undefined && val !== null && String(val).trim() !== "") extras[f.key] = String(val).trim();
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
    } catch (error) {
      console.error(`Bulk ${config.sheetName} error:`, error);
      res.status(500).json({ error: "Error interno al procesar la carga masiva" });
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
      const cleanExternalId = externalId ? (config.sanitizeExternalId ? config.sanitizeExternalId(String(externalId).trim()) : String(externalId).trim()) : "";
      const idNum = cleanExternalId ? Number(cleanExternalId) : undefined;
      const newItem: SimpleCatalogDoc = {
        name: nombre.trim(),
        externalId: cleanExternalId,
        data: { id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined, nombre: nombre.trim() },
      };
      for (const f of config.extraStringFields || []) {
        const v = (req.body as Record<string, unknown>)[f.key];
        if (v !== undefined && v !== null) newItem[f.key] = String(v).trim();
      }
      for (const f of config.extraNumberFields || []) {
        const n = aNumeroOpcional((req.body as Record<string, unknown>)[f.key]);
        if (n !== undefined) newItem[f.key] = n;
      }
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
        const cleanExternalId = config.sanitizeExternalId ? config.sanitizeExternalId(String(externalId).trim()) : String(externalId).trim();
        item.externalId = cleanExternalId;
        const idNum = Number(cleanExternalId);
        item.data = item.data || {};
        item.data.id = !isNaN(idNum) ? idNum : item.data.id;
      }
      for (const f of config.extraStringFields || []) {
        const v = (req.body as Record<string, unknown>)[f.key];
        if (v !== undefined) item[f.key] = v === null ? "" : String(v).trim();
      }
      for (const f of config.extraNumberFields || []) {
        const bruto = (req.body as Record<string, unknown>)[f.key];
        // `undefined` = el cliente no lo mandó (no se toca). Vacío/null = se limpia a `null`.
        if (bruto !== undefined) item[f.key] = aNumeroOpcional(bruto) ?? null;
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
