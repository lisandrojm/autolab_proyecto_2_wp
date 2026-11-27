/**
 * ═══════════════════════════════════════════════════════════════════════
 * LOS DOCUMENTOS DE UN TRÁMITE DE FIRMA: generar el contrato y los releases, borrarlos, y mandarlos a firmar
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Vivía adentro de las rutas de `routes/firmaDigital.ts` (los botones de Generar Documentos). Pasó a
 * servicio el 27/11/2026 para que la GENERACIÓN AUTOMÁTICA (`services/automatizacionesContratacion`)
 * haga exactamente lo mismo que los botones: las rutas validan el pedido y llaman acá; el reloj llama
 * acá directo. Los errores que son culpa del pedido (contrato que no existe, trámite ya enviado,
 * plantilla sin texto) salen como `ErrorDeTramite` con su status, y la ruta los devuelve tal cual.
 */
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { Tenant } from "../../models/Tenant.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { getTenantDropboxConfig, uploadFile } from "../dropboxService.js";
import { resolverCarpetaPorProposito } from "../../utils/estadoCarpetas.js";
import { ETIQUETA_TRAMITE } from "../../utils/employeeDocData.js";
import { nombreArchivoDocumento } from "../nomenclaturaService.js";
import { generarContratoPdf } from "../../routes/contratosFrame.js";
import { generarReleasePdf } from "../../routes/releases.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/** La raíz del server (`server/`): los PDF generados viven en `server/storage/<tenant>/<persona>/firma/`. */
const RAIZ = path.join(__dirname, "../../..");

export type TramiteImpositivo = "alta_temprana_afip" | "constancia_cuit";

/*
  YA ENVIADO = SOLO LECTURA (pedido del 13/10/2026). Antes, borrar el PDF de un trámite ya enviado
  dejaba `firmaEnviadaAt` en null y se podía generar y mandar otra vez: dos documentos distintos del
  mismo trámite en Dropbox Sign. Ahora, una vez enviado, no se genera, no se borra y no se edita el
  texto custom.
*/
export const YA_ENVIADO = "Este trámite ya se envió a firmar: sus documentos quedan como se enviaron.";

/** Un error que es del pedido, no del server: la ruta lo devuelve con su status. */
export class ErrorDeTramite extends Error {
  status: number;
  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.status = status;
  }
}

/** Errores de generarContratoPdf / generarReleasePdf que son culpa del pedido, no del server. */
export const statusDeErrorDePdf = (msg: string) => (/no encontrad/i.test(msg) ? 404 : /no tiene texto escrito|no tiene contenido redactado|no es custom|declara firma/i.test(msg) ? 400 : 500);

/** Lee un archivo guardado en disco local a partir de su URL pública `/storage/...`. */
export function leerArchivoStorage(urlStorage: string): Buffer {
  const rel = urlStorage.replace(/^\/storage\//, "storage/");
  return fs.readFileSync(path.join(RAIZ, rel));
}

/** Borra un archivo guardado en disco a partir de su URL pública `/storage/...` — no falla si ya no existe. */
export function borrarArchivoStorage(urlStorage?: string | null): void {
  if (!urlStorage) return;
  const rel = urlStorage.replace(/^\/storage\//, "storage/");
  fs.rm(path.join(RAIZ, rel), { force: true }, () => {});
}

export interface Tramite {
  projectId: string;
  userId: string;
  contractIndex: number;
}

/** El vínculo del trámite, con el contrato existente y sin enviar. Lanza 404 / 409. */
async function tramiteSinEnviar(t: Tramite) {
  const up = await UserProject.findOne({ projectId: t.projectId, userId: t.userId });
  if (!up || t.contractIndex < 0 || t.contractIndex >= up.contracts.length) throw new ErrorDeTramite(404, "Contrato no encontrado.");
  if ((up.contracts[t.contractIndex] as any).firmaEnviadaAt) throw new ErrorDeTramite(409, YA_ENVIADO);
  return up;
}

const carpetaDeFirma = (tenantId: string, userId: string) => {
  const dir = path.join(RAIZ, "storage", tenantId, userId, "firma");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** Al archivo que falla por la plantilla o el texto le corresponde el status de `statusDeErrorDePdf`. */
const comoErrorDeTramite = (e: any): never => {
  if (e instanceof ErrorDeTramite) throw e;
  const msg = String(e?.message || "");
  throw new ErrorDeTramite(statusDeErrorDePdf(msg), msg || "No se pudo generar el documento.");
};

/**
 * GENERAR EL CONTRATO del trámite: arma el PDF y lo guarda en disco local (mismo patrón que
 * `altaDocumentoUrl`) para poder revisarlo antes de mandarlo a firmar. Independiente de los releases.
 *
 * La etiqueta del trámite viaja por el PATRÓN del nombre, como `{{extra}}`: los DOS trámites se
 * etiquetan (antes sólo la constancia llevaba sufijo y las altas tempranas no se distinguían de un
 * contrato generado fuera de un trámite).
 */
export async function generarContratoDeTramite(opts: Tramite & { tenantId: string; contratoTemplateId: string; empresaContratoId?: string; tramite?: TramiteImpositivo }) {
  const { tenantId, projectId, userId, contractIndex, contratoTemplateId, empresaContratoId, tramite } = opts;
  const up = await tramiteSinEnviar(opts);
  const dir = carpetaDeFirma(tenantId, userId);
  const contratoPdf = await generarContratoPdf({ tenantId, templateId: contratoTemplateId, userId, projectId, contractIndex, empresaId: empresaContratoId, extra: tramite ? ETIQUETA_TRAMITE[tramite] : undefined }).catch(comoErrorDeTramite);
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
  return { firmaContratoUrl, firmaContratoNombre: contratoFilename, firmaGeneradoAt };
}

/** GENERAR EL/LOS RELEASE(S) del trámite: un PDF por release, en disco local. Independiente del contrato. */
export async function generarReleasesDeTramite(opts: Tramite & { tenantId: string; releaseIds: string[]; empresaReleaseId?: string; tramite?: TramiteImpositivo }) {
  const { tenantId, projectId, userId, contractIndex, releaseIds, empresaReleaseId, tramite } = opts;
  const up = await tramiteSinEnviar(opts);
  const dir = carpetaDeFirma(tenantId, userId);
  const firmaReleases: { releaseId: string; nombre: string; url: string }[] = [];
  for (const releaseId of releaseIds) {
    const releasePdf = await generarReleasePdf({ tenantId, releaseId, userId, projectId, contractIndex, empresaId: empresaReleaseId, extra: tramite ? ETIQUETA_TRAMITE[tramite] : undefined }).catch(comoErrorDeTramite);
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
  return { firmaReleases, firmaReleasesGeneradoAt };
}

/** Borra el PDF del contrato y limpia sus campos, para poder volver a generar (p. ej. con otra empresa). */
export async function eliminarContratoDeTramite(t: Tramite): Promise<void> {
  const up = await tramiteSinEnviar(t);
  const contract: any = up.contracts[t.contractIndex];
  borrarArchivoStorage(contract.firmaContratoUrl);
  up.contracts[t.contractIndex] = { ...contract.toObject(), firmaContratoUrl: null, firmaContratoNombre: null, firmaEmpresaContratoId: null, firmaGeneradoAt: null, firmaEnviadaAt: null } as any;
  up.markModified("contracts");
  await up.save();
}

/** Borra los PDF de los releases y limpia sus campos, para poder volver a generar. */
export async function eliminarReleasesDeTramite(t: Tramite): Promise<void> {
  const up = await tramiteSinEnviar(t);
  const contract: any = up.contracts[t.contractIndex];
  ((contract.firmaReleases || []) as { url: string }[]).forEach((r) => borrarArchivoStorage(r.url));
  up.contracts[t.contractIndex] = { ...contract.toObject(), firmaReleases: [], firmaEmpresaReleaseId: null, firmaReleasesGeneradoAt: null, firmaEnviadaAt: null } as any;
  up.markModified("contracts");
  await up.save();
}

export interface TargetDeEnvio extends Tramite {
  /** Determina si además del Contrato/Release hay que sumar el documento de Alta temprana de ARCA ya cargado. */
  tipoImpositivo?: TramiteImpositivo;
  /** «Se envía a firmar» del Tipo de Contrato: en false no se exige el Contrato generado ni se sube. */
  incluirContrato: boolean;
  /** «Se envía a firmar el release» / «…el alta de ARCA» del Tipo de Contrato. */
  incluirReleases: boolean;
  incluirAlta: boolean;
}

export interface ResultadoDeEnvio extends Tramite {
  ok: boolean;
  error?: string;
  archivosSubidos?: number;
}

/**
 * ENVIAR A FIRMAR: sube a la carpeta Outbox de Dropbox los documentos YA generados (nunca genera nada
 * acá) — Contrato + Release(s), y si el trámite fue «Alta temprana de ARCA» también el documento de
 * Alta ya cargado, renombrado con la nomenclatura del sistema (el escaneo matchea por CUIT en el
 * nombre). La Constancia de CUIT (el JSON) NUNCA se manda a firmar. El alta sale UNA sola vez
 * (`altaEnviadaAFirmarEl`): un reenvío del contrato no la vuelve a mandar.
 *
 * Sin Dropbox o sin Outbox no se puede enviar nada: `ErrorDeTramite` 400.
 */
export async function enviarAFirmar(opts: { tenantObjectId: any; targets: TargetDeEnvio[] }): Promise<{ resultados: ResultadoDeEnvio[]; enviados: number }> {
  const { tenantObjectId, targets } = opts;
  const tenant = await Tenant.findById(tenantObjectId).lean();
  const dropboxCfg = getTenantDropboxConfig(tenant);
  if (!dropboxCfg) throw new ErrorDeTramite(400, "Dropbox no está conectado para esta organización.");
  const outboxCarpeta = await resolverCarpetaPorProposito("outbox");
  if (!outboxCarpeta) throw new ErrorDeTramite(400, 'No se encontró ninguna carpeta de Dropbox configurada como "Outbox" en Documentos → Configurar transición automática.');

  const tenantId = String(tenantObjectId);
  const projectIds = [...new Set(targets.map((t) => t.projectId))];
  const userIds = [...new Set(targets.map((t) => t.userId))];
  const [projects, users] = await Promise.all([
    Project.find({ _id: { $in: projectIds }, tenantId: tenantObjectId }).select("_id").lean(),
    User.find({ _id: { $in: userIds }, tenantId: tenantObjectId }).select("_id firstName lastName email metadata.cuit").lean(),
  ]);
  const projectIdsValidos = new Set(projects.map((p: any) => String(p._id)));
  const userById = new Map(users.map((u: any) => [String(u._id), u]));

  const resultados: ResultadoDeEnvio[] = [];
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
        ...(t.incluirReleases ? ((contract.firmaReleases || []) as { nombre: string; url: string }[]).map((r) => ({ nombre: r.nombre, buffer: leerArchivoStorage(r.url) })) : []),
      ];
      const mandaAlta = !!(t.incluirAlta && t.tipoImpositivo === "alta_temprana_afip" && contract.altaDocumentoUrl && !contract.altaEnviadaAFirmarEl);
      if (mandaAlta) {
        const ext = (contract.altaDocumentoNombre || "").match(/\.[a-z0-9]+$/i)?.[0] || ".pdf";
        const nombreAlta = `${await nombreArchivoDocumento({ tenantId: tenantObjectId, tipo: "AltaAFIP", user, up, contract, docName: "AltaAFIP" })}${ext}`;
        archivos.push({ nombre: nombreAlta, buffer: leerArchivoStorage(contract.altaDocumentoUrl) });
      }
      // Después del alta: puede ser lo único que este tipo manda a firmar.
      if (archivos.length === 0) {
        resultados.push({ ...base, ok: false, error: "No hay ningún documento generado para enviar." });
        continue;
      }
      for (const archivo of archivos) {
        await uploadFile(tenantId, dropboxCfg, `${carpeta}/${archivo.nombre}`, archivo.buffer);
      }
      contract.firmaEnviadaAt = new Date();
      if (mandaAlta) contract.altaEnviadaAFirmarEl = new Date();
      up.markModified("contracts");
      await up.save();
      resultados.push({ ...base, ok: true, archivosSubidos: archivos.length });
    } catch (e: any) {
      const detalle = e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e);
      console.error(`Firma digital enviar error (CUIT/target ${t.userId}):`, detalle);
      resultados.push({ ...base, ok: false, error: detalle });
    }
  }
  return { resultados, enviados: resultados.filter((r) => r.ok).length };
}
