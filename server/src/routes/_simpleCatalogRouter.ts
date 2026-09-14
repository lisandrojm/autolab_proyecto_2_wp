import { Router, Response } from "express";
import multer from "multer";
import xlsx from "xlsx";
import mongoose, { Model } from "mongoose";
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
   * Campos que son una REFERENCIA a otro documento (ej. Convenios → `sindicatoId`).
   *
   * Aparte de los numéricos porque el modo de fallar es otro: `Number("x")` da NaN y se descarta,
   * pero un ObjectId mal formado hace estallar el `save` con un CastError que llega al cliente como
   * un 500 sin causa. Acá se valida antes y se contesta 400 diciendo cuál es el campo.
   *
   * `null` es un valor que se GUARDA (desvincular), distinto de `undefined` = "no vino en el body,
   * no se toca". Sin esa diferencia no habría forma de sacarle el sindicato a un convenio.
   *
   * NO participan del import de Excel: una planilla trae texto, y resolver ese texto a un documento
   * es exactamente lo que no se puede automatizar sobre este dominio.
   */
  extraRefFields?: Array<{ key: string }>;
  /**
   * Campos sí/no a persistir en create/update/bulk (ej. Bancos → `activo`).
   *
   * Aparte de los de texto porque el cliente puede mandarlos como `true`, `"true"` o `"false"`, y
   * guardar el string `"false"` lo haría verdadero en cualquier `if`. No participan del import de
   * Excel: una planilla no es donde se decide si algo se ofrece o no.
   */
  extraBooleanFields?: Array<{ key: string }>;
  /**
   * Qué popular en el listado, para que el front no resuelva las refs con un pedido por fila.
   * Ej. Convenios → `{ path: "sindicatoId", select: "_id name sigla" }`.
   */
  populate?: Array<{ path: string; select: string }>;
  /**
   * Query params por los que se puede filtrar el listado. Lista blanca explícita: pasar `req.query`
   * como filtro dejaría armar consultas arbitrarias sobre la colección.
   *
   * El valor `"null"` (texto) filtra por ausencia — los convenios sin gremio son un subconjunto que
   * se consulta como cualquier otro.
   */
  filtrosPermitidos?: string[];
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

/** `true`/`"true"` → true, `false`/`"false"` → false; cualquier otra cosa → undefined (no se toca). */
const aBooleanoOpcional = (v: unknown): boolean | undefined => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined);

/**
 * Una referencia parseada desde el body, o el motivo por el que no se pudo.
 *
 * Se devuelve el motivo en vez de lanzar porque el que llama tiene que poder decir QUÉ campo estaba
 * mal: "sindicatoId inválido" se corrige solo, "500" no.
 */
type RefParseada = { valor?: mongoose.Types.ObjectId | null; motivo?: string };

/**
 * Tres resultados y no dos:
 *   `undefined` → no vino en el body: el campo no se toca.
 *   `null`      → vino vacío a propósito: se desvincula.
 *   ObjectId    → se vincula.
 *
 * Un id mal formado NO se convierte a `null`: eso es la misma clase de bug que descartar un campo
 * desconocido y contestar 200 —el cliente pidió una cosa, pasó otra, y nadie se enteró—.
 */
const parsearRef = (campo: string, v: unknown): RefParseada => {
  if (v === undefined) return {}; // no vino: `valor` queda undefined y el campo no se toca
  const s = v === null ? "" : String(v).trim();
  if (s === "" || s === "null") return { valor: null }; // desvincular: `null` NO es `undefined`
  if (!mongoose.Types.ObjectId.isValid(s)) return { motivo: `${campo}: "${s}" no es un id válido.` };
  return { valor: new mongoose.Types.ObjectId(s) };
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
  const CLAVES_ACEPTADAS = new Set<string>([
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
  const clavesDeMas = (body: unknown): string[] => (body && typeof body === "object" ? Object.keys(body as Record<string, unknown>).filter((k) => !CLAVES_ACEPTADAS.has(k)) : []);

  /**
   * Las operaciones de upsert de una carga masiva. La usan el import de Excel y el de lote JSON: son
   * la misma semántica y separarlas es garantizar que en algún momento se comporten distinto.
   *
   * Se setean las claves de `data` una por una en lugar de reemplazar el objeto: si se pisara entero,
   * reimportar borraría los campos que no vienen en la carga (ej. la marca de obra social por defecto).
   */
  const construirUpserts = (parsed: Array<{ externalId: string; nombre: string; extras: Record<string, unknown> }>) =>
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
  router.get("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Solo los declarados en `filtrosPermitidos`; el resto de la query se ignora. Un catálogo sin
      // esa lista se comporta exactamente como antes.
      const filtro: Record<string, unknown> = {};
      for (const campo of config.filtrosPermitidos || []) {
        const valor = req.query[campo];
        if (valor === undefined) continue;
        filtro[campo] = valor === "null" || valor === "" ? null : valor;
      }
      let consulta = model.find(filtro).sort({ name: 1 });
      for (const p of config.populate || []) consulta = consulta.populate(p.path, p.select);
      const items = await consulta.lean();
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
      const parsed: Array<{ externalId: string; nombre: string; extras: Record<string, unknown> }> = [];

      items.forEach((item, i) => {
        // Se aceptan los dos vocabularios: el del catálogo (`nombre`/`externalId`) y el del dominio
        // de ARCA (`descripcion`/`codigo`), que es como vienen los CSV extraídos del organismo.
        const nombre = String(item.nombre ?? item.name ?? item.descripcion ?? "").trim();
        const rawExternalId = String(item.externalId ?? item.codigo ?? "").trim();
        if (!nombre) {
          errores.push(`Registro ${i + 1}: falta el nombre.`);
          return;
        }
        const extras: Record<string, unknown> = {};
        for (const f of config.extraStringFields || []) {
          const val = item[f.key];
          if (val !== undefined && val !== null && String(val).trim() !== "") extras[f.key] = String(val).trim();
        }
        for (const f of config.extraRefFields || []) {
          const ref = parsearRef(f.key, item[f.key]);
          if (ref.motivo) {
            errores.push(`Registro ${i + 1}: ${ref.motivo}`);
            return;
          }
          if (ref.valor !== undefined) extras[f.key] = ref.valor;
        }
        for (const f of config.extraBooleanFields || []) {
          const b = aBooleanoOpcional(item[f.key]);
          if (b !== undefined) extras[f.key] = b;
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
      const sobran = clavesDeMas(req.body);
      if (sobran.length > 0) {
        res.status(400).json({ error: `Campos no reconocidos para ${config.entityLabel}: ${sobran.join(", ")}`, campos: sobran });
        return;
      }
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
      for (const f of config.extraRefFields || []) {
        const ref = parsearRef(f.key, (req.body as Record<string, unknown>)[f.key]);
        if (ref.motivo) {
          res.status(400).json({ error: ref.motivo });
          return;
        }
        if (ref.valor !== undefined) newItem[f.key] = ref.valor;
      }
      for (const f of config.extraBooleanFields || []) {
        const b = aBooleanoOpcional((req.body as Record<string, unknown>)[f.key]);
        if (b !== undefined) newItem[f.key] = b;
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
      const sobran = clavesDeMas(req.body);
      if (sobran.length > 0) {
        res.status(400).json({ error: `Campos no reconocidos para ${config.entityLabel}: ${sobran.join(", ")}`, campos: sobran });
        return;
      }
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
      for (const f of config.extraRefFields || []) {
        const ref = parsearRef(f.key, (req.body as Record<string, unknown>)[f.key]);
        if (ref.motivo) {
          res.status(400).json({ error: ref.motivo });
          return;
        }
        if (ref.valor !== undefined) item[f.key] = ref.valor;
      }
      for (const f of config.extraBooleanFields || []) {
        const b = aBooleanoOpcional((req.body as Record<string, unknown>)[f.key]);
        if (b !== undefined) item[f.key] = b;
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
