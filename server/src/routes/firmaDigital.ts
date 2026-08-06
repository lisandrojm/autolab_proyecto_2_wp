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
import { buildDocFileName } from "../utils/employeeDocData.js";
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

// GET /firma-digital/config - qué estado alimenta la bandeja "Firma Digital" (el que ya se dispara
// automáticamente al llegar un archivo a "Alta temprana de Afip" o "Constancia de cuit") y a qué
// carpeta de Dropbox hay que subir cuando se manda a firmar ("Outbox", la que ya vigila el estado
// siguiente). No hardcodea nombres de estado — los resuelve por la config real de cada tenant.
router.get("/config", async (_req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const [estadoEnvioDocNombre, outboxCarpeta] = await Promise.all([resolverEstadoPorCarpetas([PATRON_ENVIO_ALTA_AFIP, PATRON_ENVIO_CONSTANCIA_CUIT]), resolverCarpetaPorPatron(PATRON_OUTBOX)]);
    res.json({ estadoEnvioDocNombre, outboxCarpeta });
  } catch (error) {
    console.error("Firma digital config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const generarSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  contractIndex: z.number().int().min(0),
  contratoTemplateId: z.string().min(1),
  releaseIds: z.array(z.string().min(1)).default([]),
  empresaContratoId: z.string().optional(),
  empresaReleaseId: z.string().optional(),
  // Trámite de origen del contrato (ya lo calcula el frontend con estadoImpositivoDelContrato) — si es
  // "constancia_cuit" se etiqueta el nombre del archivo para identificar el trámite en Dropbox.
  tramite: z.enum(["alta_temprana_afip", "constancia_cuit"]).optional(),
});

// POST /firma-digital/generar - paso 1: arma el PDF del Contrato + los Release(s) elegidos y los
// guarda en disco local (mismo patrón que altaDocumentoUrl) para poder revisarlos (ícono de ojito)
// ANTES de mandarlos a firmar — separado a propósito de "enviar" (paso 2).
router.post("/generar", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const parsed = generarSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Datos inválidos para generar los documentos." });
      return;
    }
    const { projectId, userId, contractIndex, contratoTemplateId, releaseIds, empresaContratoId, empresaReleaseId, tramite } = parsed.data;
    const tenantId = String(req.tenantObjectId);
    const sufijoTramite = tramite === "constancia_cuit" ? "_Constancia_de_Cuit" : "";

    const up = await UserProject.findOne({ projectId, userId });
    if (!up || contractIndex < 0 || contractIndex >= up.contracts.length) {
      res.status(404).json({ error: "Contrato no encontrado." });
      return;
    }

    const dir = path.join(__dirname, "../../storage", tenantId, userId, "firma");
    fs.mkdirSync(dir, { recursive: true });

    const contratoPdf = await generarContratoPdf({ tenantId, templateId: contratoTemplateId, userId, projectId, contractIndex, empresaId: empresaContratoId });
    const contratoFilename = `${contratoPdf.filename}${sufijoTramite}.pdf`;
    fs.writeFileSync(path.join(dir, contratoFilename), contratoPdf.buffer);

    const firmaReleases: { releaseId: string; nombre: string; url: string }[] = [];
    for (const releaseId of releaseIds) {
      const releasePdf = await generarReleasePdf({ tenantId, releaseId, userId, projectId, contractIndex, empresaId: empresaReleaseId });
      const releaseFilename = `${releasePdf.filename}${sufijoTramite}.pdf`;
      fs.writeFileSync(path.join(dir, releaseFilename), releasePdf.buffer);
      firmaReleases.push({ releaseId, nombre: releaseFilename, url: `/storage/${tenantId}/${userId}/firma/${releaseFilename}` });
    }

    const generadoAt = new Date();
    up.contracts[contractIndex] = {
      ...(up.contracts[contractIndex] as any).toObject(),
      firmaContratoUrl: `/storage/${tenantId}/${userId}/firma/${contratoFilename}`,
      firmaContratoNombre: contratoFilename,
      firmaReleases,
      firmaEmpresaContratoId: empresaContratoId || null,
      firmaEmpresaReleaseId: empresaReleaseId || null,
      firmaGeneradoAt: generadoAt,
      firmaEnviadaAt: null,
    } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ firmaContratoUrl: `/storage/${tenantId}/${userId}/firma/${contratoFilename}`, firmaContratoNombre: contratoFilename, firmaReleases, firmaGeneradoAt: generadoAt });
  } catch (error: any) {
    console.error("Firma digital generar error:", error);
    res.status(500).json({ error: error?.message || "No se pudieron generar los documentos." });
  }
});

const enviarTargetSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  contractIndex: z.number().int().min(0),
  // Ya calculado por el frontend (estadoImpositivoDelContrato) — determina si además del
  // Contrato/Release hay que sumar el documento de Alta temprana de AFIP ya cargado.
  tipoImpositivo: z.enum(["alta_temprana_afip", "constancia_cuit"]).optional(),
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
      User.find({ _id: { $in: userIds }, tenantId: req.tenantObjectId }).select("_id firstName lastName metadata.cuit").lean(),
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
        if (!contract.firmaGeneradoAt || !contract.firmaContratoUrl) {
          resultados.push({ ...base, ok: false, error: 'Todavía no se generaron los documentos — usá "Generar" primero.' });
          continue;
        }

        const user = userById.get(t.userId);
        const carpeta = outboxCarpeta.replace(/\/$/, "");
        const archivos: { nombre: string; buffer: Buffer }[] = [
          { nombre: contract.firmaContratoNombre || "Contrato.pdf", buffer: leerArchivoStorage(contract.firmaContratoUrl) },
          ...((contract.firmaReleases || []) as { nombre: string; url: string }[]).map((r) => ({ nombre: r.nombre, buffer: leerArchivoStorage(r.url) })),
        ];

        // Alta temprana de AFIP: el documento ya cargado (altaDocumentoUrl) se suma, pero renombrado
        // con el CUIT (buildDocFileName) — el nombre original que le puso quien lo subió a mano no
        // necesariamente lo trae, y el cron de estadoDropboxCronService.ts matchea por CUIT en el nombre.
        if (t.tipoImpositivo === "alta_temprana_afip" && contract.altaDocumentoUrl) {
          const ext = (contract.altaDocumentoNombre || "").match(/\.[a-z0-9]+$/i)?.[0] || ".pdf";
          const nombreAlta = `${buildDocFileName({ tipo: "AltaAFIP", user, up, contract, docName: "AltaAFIP" })}${ext}`;
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
