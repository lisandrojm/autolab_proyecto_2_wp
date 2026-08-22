import { Router } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { getTenantDropboxConfig, uploadFile } from "../services/dropboxService.js";
import { resolverCarpetaPorPatron, resolverEstadoPorCarpetas } from "../utils/estadoCarpetas.js";
import { ETIQUETA_TRAMITE } from "../utils/employeeDocData.js";
import { nombreArchivoDocumento } from "../services/nomenclaturaService.js";
import { generarContratoPdf } from "./contratosFrame.js";
import { generarReleasePdf } from "./releases.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();
router.use(requireTenant, authenticateToken);

// Mismos patrones de nombre de carpeta que ya usa el resto de la integración AFIP/Dropbox (ver
// resolverCarpetaConstanciaCuit en routes/afip.ts) — acá generalizados para no repetir estados.
const PATRON_ENVIO_ALTA_AFIP = [/alta/i, /temprana|afip/i];
const PATRON_ENVIO_CONSTANCIA_CUIT = [/constancia/i, /cuit/i];
const PATRON_OUTBOX = [/outbox/i];
// "Requested signatures": donde Dropbox Sign deja los contratos ya firmados.
const PATRON_FIRMADOS = [/requested/i, /signature/i];
// "Pendbox": carpeta intermedia (hermana de Outbox). El contrato ya se envió a firmar y espera la
// firma del destinatario. Se puebla moviendo el archivo desde Outbox — así Outbox queda solo con lo
// que todavía no se envió y no se puede mandar dos veces por error.
const PATRON_PENDIENTE_FIRMA = [/pendbox/i];

// GET /firma-digital/config - qué estado alimenta la bandeja "Firma Digital" (el que ya se dispara
// automáticamente al llegar un archivo a "Alta temprana de Afip" o "Constancia de cuit") y a qué
// carpeta de Dropbox hay que subir cuando se manda a firmar ("Outbox", la que ya vigila el estado
// siguiente). No hardcodea nombres de estado — los resuelve por la config real de cada tenant.
router.get("/config", async (_req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const [estadoEnvioDocNombre, outboxCarpeta, pendienteFirmaCarpeta, firmadosCarpeta] = await Promise.all([
      resolverEstadoPorCarpetas([PATRON_ENVIO_ALTA_AFIP, PATRON_ENVIO_CONSTANCIA_CUIT]),
      resolverCarpetaPorPatron(PATRON_OUTBOX),
      resolverCarpetaPorPatron(PATRON_PENDIENTE_FIRMA),
      resolverCarpetaPorPatron(PATRON_FIRMADOS),
    ]);
    res.json({ estadoEnvioDocNombre, outboxCarpeta, pendienteFirmaCarpeta, firmadosCarpeta });
  } catch (error) {
    console.error("Firma digital config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const generarContratoSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  contractIndex: z.number().int().min(0),
  contratoTemplateId: z.string().min(1),
  empresaContratoId: z.string().optional(),
  // Trámite de origen del contrato (ya lo calcula el frontend con estadoImpositivoDelContrato) — si es
  // "constancia_cuit" se etiqueta el nombre del archivo para identificar el trámite en Dropbox.
  tramite: z.enum(["alta_temprana_afip", "constancia_cuit"]).optional(),
});

// POST /firma-digital/generar-contrato - botón "Generar" de la columna Contrato: arma el PDF del
// Contrato y lo guarda en disco local (mismo patrón que altaDocumentoUrl) para poder revisarlo (ícono
// de PDF) ANTES de mandarlo a firmar. Independiente de "generar-release" — cada documento se genera
// por separado, y recién cuando ambos están listos la fila se puede seleccionar para "Enviar a firmar".
router.post("/generar-contrato", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const parsed = generarContratoSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos para generar el contrato." });
      return;
    }
    const { projectId, userId, contractIndex, contratoTemplateId, empresaContratoId, tramite } = parsed.data;
    const tenantId = String(req.tenantObjectId);
    // Los DOS trámites se etiquetan: antes solo la constancia llevaba sufijo y las altas tempranas
    // quedaban sin nada, así que no se distinguían de un contrato generado fuera de un trámite.
    /*
     * La etiqueta del trámite viaja por el PATRÓN, como `{{extra}}`.
     *
     * Antes se concatenaba acá, después del render. Eso tenía dos consecuencias: `{{extra}}` rendía
     * vacío en los archivos reales —así que el ABM mostraba una previsualización que no existía— y
     * la etiqueta caía siempre al final sin importar dónde el patrón la hubiera puesto. Además
     * quedaba FUERA del presupuesto de `recortarNombre`, que es lo que garantiza que el nombre entre
     * en el tope de Dropbox.
     */
    const etiquetaTramite = tramite ? ETIQUETA_TRAMITE[tramite] : undefined;

    const up = await UserProject.findOne({ projectId, userId });
    if (!up || contractIndex < 0 || contractIndex >= up.contracts.length) {
      res.status(404).json({ error: "Contrato no encontrado." });
      return;
    }

    const dir = path.join(__dirname, "../../storage", tenantId, userId, "firma");
    fs.mkdirSync(dir, { recursive: true });

    const contratoPdf = await generarContratoPdf({ tenantId, templateId: contratoTemplateId, userId, projectId, contractIndex, empresaId: empresaContratoId, extra: etiquetaTramite });
    const contratoFilename = `${contratoPdf.filename}.pdf`;
    fs.writeFileSync(path.join(dir, contratoFilename), contratoPdf.buffer);

    const firmaContratoUrl = `/storage/${tenantId}/${userId}/firma/${contratoFilename}`;
    const firmaGeneradoAt = new Date();
    up.contracts[contractIndex] = {
      ...(up.contracts[contractIndex] as any).toObject(),
      firmaContratoUrl,
      firmaContratoNombre: contratoFilename,
      firmaEmpresaContratoId: empresaContratoId || null,
      firmaGeneradoAt,
      firmaEnviadaAt: null,
    } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ firmaContratoUrl, firmaContratoNombre: contratoFilename, firmaGeneradoAt });
  } catch (error: any) {
    console.error("Firma digital generar-contrato error:", error);
    res.status(500).json({ error: error?.message || "No se pudo generar el contrato." });
  }
});

const generarReleaseSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  contractIndex: z.number().int().min(0),
  releaseIds: z.array(z.string().min(1)).min(1),
  empresaReleaseId: z.string().optional(),
  tramite: z.enum(["alta_temprana_afip", "constancia_cuit"]).optional(),
});

// POST /firma-digital/generar-release - botón "Generar" de la columna Release: arma el PDF de cada
// release activo y lo guarda en disco local. Independiente de "generar-contrato" (ver arriba).
router.post("/generar-release", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const parsed = generarReleaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos para generar el/los release(s)." });
      return;
    }
    const { projectId, userId, contractIndex, releaseIds, empresaReleaseId, tramite } = parsed.data;
    const tenantId = String(req.tenantObjectId);
    // Los DOS trámites se etiquetan: antes solo la constancia llevaba sufijo y las altas tempranas
    // quedaban sin nada, así que no se distinguían de un contrato generado fuera de un trámite.
    /*
     * La etiqueta del trámite viaja por el PATRÓN, como `{{extra}}`.
     *
     * Antes se concatenaba acá, después del render. Eso tenía dos consecuencias: `{{extra}}` rendía
     * vacío en los archivos reales —así que el ABM mostraba una previsualización que no existía— y
     * la etiqueta caía siempre al final sin importar dónde el patrón la hubiera puesto. Además
     * quedaba FUERA del presupuesto de `recortarNombre`, que es lo que garantiza que el nombre entre
     * en el tope de Dropbox.
     */
    const etiquetaTramite = tramite ? ETIQUETA_TRAMITE[tramite] : undefined;

    const up = await UserProject.findOne({ projectId, userId });
    if (!up || contractIndex < 0 || contractIndex >= up.contracts.length) {
      res.status(404).json({ error: "Contrato no encontrado." });
      return;
    }

    const dir = path.join(__dirname, "../../storage", tenantId, userId, "firma");
    fs.mkdirSync(dir, { recursive: true });

    const firmaReleases: { releaseId: string; nombre: string; url: string }[] = [];
    for (const releaseId of releaseIds) {
      const releasePdf = await generarReleasePdf({ tenantId, releaseId, userId, projectId, contractIndex, empresaId: empresaReleaseId, extra: etiquetaTramite });
      const releaseFilename = `${releasePdf.filename}.pdf`;
      fs.writeFileSync(path.join(dir, releaseFilename), releasePdf.buffer);
      firmaReleases.push({ releaseId, nombre: releaseFilename, url: `/storage/${tenantId}/${userId}/firma/${releaseFilename}` });
    }

    const firmaReleasesGeneradoAt = new Date();
    up.contracts[contractIndex] = {
      ...(up.contracts[contractIndex] as any).toObject(),
      firmaReleases,
      firmaEmpresaReleaseId: empresaReleaseId || null,
      firmaReleasesGeneradoAt,
      firmaEnviadaAt: null,
    } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ firmaReleases, firmaReleasesGeneradoAt });
  } catch (error: any) {
    console.error("Firma digital generar-release error:", error);
    res.status(500).json({ error: error?.message || "No se pudieron generar los release(s)." });
  }
});

/** Borra un archivo guardado en disco a partir de su URL pública `/storage/...` — no falla si ya no existe. */
function borrarArchivoStorage(urlStorage?: string): void {
  if (!urlStorage) return;
  const rel = urlStorage.replace(/^\/storage\//, "storage/");
  fs.rm(path.join(__dirname, "../..", rel), { force: true }, () => {});
}

const eliminarSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  contractIndex: z.number().int().min(0),
});

// POST /firma-digital/eliminar-contrato - ícono de tacho junto al Contrato ya generado: borra el PDF
// y limpia los campos, para poder volver a "Generar" (p. ej. si se eligió mal la empresa).
router.post("/eliminar-contrato", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const parsed = eliminarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos." });
      return;
    }
    const { projectId, userId, contractIndex } = parsed.data;
    const up = await UserProject.findOne({ projectId, userId });
    const contract: any = up?.contracts?.[contractIndex];
    if (!up || !contract) {
      res.status(404).json({ error: "Contrato no encontrado." });
      return;
    }

    borrarArchivoStorage(contract.firmaContratoUrl);
    up.contracts[contractIndex] = {
      ...contract.toObject(),
      firmaContratoUrl: null,
      firmaContratoNombre: null,
      firmaEmpresaContratoId: null,
      firmaGeneradoAt: null,
      firmaEnviadaAt: null,
    } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ ok: true });
  } catch (error: any) {
    console.error("Firma digital eliminar-contrato error:", error);
    res.status(500).json({ error: error?.message || "No se pudo eliminar el contrato." });
  }
});

// POST /firma-digital/eliminar-release - ícono de tacho junto al/los Release(s) ya generados: borra
// los PDFs y limpia los campos, para poder volver a "Generar".
router.post("/eliminar-release", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const parsed = eliminarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos." });
      return;
    }
    const { projectId, userId, contractIndex } = parsed.data;
    const up = await UserProject.findOne({ projectId, userId });
    const contract: any = up?.contracts?.[contractIndex];
    if (!up || !contract) {
      res.status(404).json({ error: "Contrato no encontrado." });
      return;
    }

    ((contract.firmaReleases || []) as { url: string }[]).forEach((r) => borrarArchivoStorage(r.url));
    up.contracts[contractIndex] = {
      ...contract.toObject(),
      firmaReleases: [],
      firmaEmpresaReleaseId: null,
      firmaReleasesGeneradoAt: null,
      firmaEnviadaAt: null,
    } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ ok: true });
  } catch (error: any) {
    console.error("Firma digital eliminar-release error:", error);
    res.status(500).json({ error: error?.message || "No se pudieron eliminar los release(s)." });
  }
});

const enviarTargetSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  contractIndex: z.number().int().min(0),
  // Ya calculado por el frontend (estadoImpositivoDelContrato) — determina si además del
  // Contrato/Release hay que sumar el documento de Alta temprana de AFIP ya cargado.
  tipoImpositivo: z.enum(["alta_temprana_afip", "constancia_cuit"]).optional(),
  // Si el Contrato de este trámite tiene tildado "Se envía a firmar" (default true) — ya lo calcula
  // el frontend con el Tipo de Contrato. Cuando es false no se exige el Contrato generado ni se sube.
  incluirContrato: z.boolean().optional().default(true),
});

/** Lee un archivo guardado en disco local a partir de su URL pública `/storage/...`. */
function leerArchivoStorage(urlStorage: string): Buffer {
  const rel = urlStorage.replace(/^\/storage\//, "storage/");
  return fs.readFileSync(path.join(__dirname, "../..", rel));
}

// POST /firma-digital/enviar { targets: [...] } - paso 2: sube a la carpeta Outbox de Dropbox los
// documentos YA generados en el paso 1 (nunca genera nada acá) — Contrato + Release(s) siempre, y si
// el trámite de origen fue "Alta temprana de AFIP" también el documento de Alta ya cargado. La
// Constancia de CUIT (el JSON) NUNCA se manda a firmar.
router.post("/enviar", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    let targets: z.infer<typeof enviarTargetSchema>[];
    try {
      targets = z.array(enviarTargetSchema).min(1).max(200).parse(req.body?.targets);
    } catch {
      res.status(400).json({ error: "El listado de contratos (targets) es inválido." });
      return;
    }

    const tenant = await Tenant.findById(req.tenantObjectId).lean();
    const dropboxCfg = getTenantDropboxConfig(tenant);
    if (!dropboxCfg) {
      res.status(400).json({ error: "Dropbox no está conectado para esta organización." });
      return;
    }
    const outboxCarpeta = await resolverCarpetaPorPatron(PATRON_OUTBOX);
    if (!outboxCarpeta) {
      res.status(400).json({ error: 'No se encontró ninguna carpeta de Dropbox configurada como "Outbox" en Documentos → Configurar transición automática.' });
      return;
    }

    const tenantId = String(req.tenantObjectId);
    const projectIds = [...new Set(targets.map((t) => t.projectId))];
    const userIds = [...new Set(targets.map((t) => t.userId))];
    const [projects, users] = await Promise.all([
      Project.find({ _id: { $in: projectIds }, tenantId: req.tenantObjectId }).select("_id").lean(),
      User.find({ _id: { $in: userIds }, tenantId: req.tenantObjectId }).select("_id firstName lastName email metadata.cuit").lean(),
    ]);
    const projectIdsValidos = new Set(projects.map((p: any) => String(p._id)));
    const userById = new Map(users.map((u: any) => [String(u._id), u]));

    const resultados: { projectId: string; userId: string; contractIndex: number; ok: boolean; error?: string; archivosSubidos?: number }[] = [];

    for (const t of targets) {
      const base = { projectId: t.projectId, userId: t.userId, contractIndex: t.contractIndex };
      if (!projectIdsValidos.has(t.projectId) || !userById.has(t.userId)) {
        resultados.push({ ...base, ok: false, error: "Contrato no encontrado." });
        continue;
      }
      try {
        const up = await UserProject.findOne({ projectId: t.projectId, userId: t.userId });
        const contract: any = up?.contracts?.[t.contractIndex];
        if (!up || !contract) {
          resultados.push({ ...base, ok: false, error: "Contrato no encontrado." });
          continue;
        }
        if (t.incluirContrato && (!contract.firmaGeneradoAt || !contract.firmaContratoUrl)) {
          resultados.push({ ...base, ok: false, error: 'Todavía no se generó el Contrato — usá "Generar" primero.' });
          continue;
        }

        const user = userById.get(t.userId);
        const carpeta = outboxCarpeta.replace(/\/$/, "");
        const archivos: { nombre: string; buffer: Buffer }[] = [
          ...(t.incluirContrato && contract.firmaContratoUrl ? [{ nombre: contract.firmaContratoNombre || "Contrato.pdf", buffer: leerArchivoStorage(contract.firmaContratoUrl) }] : []),
          ...((contract.firmaReleases || []) as { nombre: string; url: string }[]).map((r) => ({ nombre: r.nombre, buffer: leerArchivoStorage(r.url) })),
        ];

        if (archivos.length === 0) {
          resultados.push({ ...base, ok: false, error: "No hay ningún documento generado para enviar." });
          continue;
        }

        // Alta temprana de AFIP: el documento ya cargado (altaDocumentoUrl) se suma, pero renombrado
        // con la nomenclatura del sistema — el nombre original que le puso quien lo subió a mano no
        // necesariamente lo trae, y el cron de estadoDropboxCronService.ts matchea por CUIT en el nombre.
        if (t.tipoImpositivo === "alta_temprana_afip" && contract.altaDocumentoUrl) {
          const ext = (contract.altaDocumentoNombre || "").match(/\.[a-z0-9]+$/i)?.[0] || ".pdf";
          const nombreAlta = `${await nombreArchivoDocumento({ tenantId: req.tenantObjectId, tipo: "AltaAFIP", user, up, contract, docName: "AltaAFIP" })}${ext}`;
          archivos.push({ nombre: nombreAlta, buffer: leerArchivoStorage(contract.altaDocumentoUrl) });
        }

        for (const archivo of archivos) {
          await uploadFile(tenantId, dropboxCfg, `${carpeta}/${archivo.nombre}`, archivo.buffer);
        }

        contract.firmaEnviadaAt = new Date();
        up.markModified("contracts");
        await up.save();

        resultados.push({ ...base, ok: true, archivosSubidos: archivos.length });
      } catch (e: any) {
        const detalle = e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e);
        console.error(`Firma digital enviar error (CUIT/target ${t.userId}):`, detalle);
        resultados.push({ ...base, ok: false, error: detalle });
      }
    }

    res.json({ resultados, enviados: resultados.filter((r) => r.ok).length });
  } catch (error) {
    console.error("Firma digital enviar error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as firmaDigitalRoutes };
