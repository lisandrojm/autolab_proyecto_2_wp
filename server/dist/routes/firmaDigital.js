import { Router } from "express";
import { z } from "zod";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { resolverCarpetaPorProposito, resolverEstadoPorPropositos } from "../utils/estadoCarpetas.js";
import { generarContratoPdf } from "./contratosFrame.js";
import { generarReleasePdf } from "./releases.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Release } from "../models/Release.js";
import { textoCustomUsable } from "../compartido/textoCustom.js";
import { CLAVES, TITULO, validarCambios, BASE as BASE_AUTOMATIZACIONES } from "../services/automatizacionesContratacion/config.js";
import { correrAhora, estadoDe } from "../services/automatizacionesContratacion/cronService.js";
import { eliminarContratoDeTramite, eliminarReleasesDeTramite, enviarAFirmar, ErrorDeTramite, generarContratoDeTramite, generarReleasesDeTramite, statusDeErrorDePdf, YA_ENVIADO } from "../services/firmaDigital/documentos.js";
const router = Router();
router.use(requireTenant, authenticateToken);
// Mismos patrones de nombre de carpeta que ya usa el resto de la integración AFIP/Dropbox (ver
// resolverCarpetaConstanciaCuit en routes/afip.ts) — acá generalizados para no repetir estados.
const PATRON_ENVIO_ALTA_AFIP = [/alta/i, /temprana|afip/i];
const PATRON_ENVIO_CONSTANCIA_CUIT = [/constancia/i, /cuit/i];
/*
  Los propósitos reemplazaron a los patrones.

  Antes acá vivían `PATRON_OUTBOX`, `PATRON_FIRMADOS`, etc. — listas de regex que buscaban el
  nombre de la carpeta. Ahora se pide el propósito y el nombre deja de importar; los patrones
  quedaron en `utils/propositosCarpeta.ts` solo como red de contención, y su uso se registra.
*/
// "Requested signatures": donde Dropbox Sign deja los contratos ya firmados.
const PATRON_FIRMADOS = [/requested/i, /signature/i];
// "Pendbox": carpeta intermedia (hermana de Outbox). El contrato ya se envió a firmar y espera la
// firma del destinatario. Se puebla moviendo el archivo desde Outbox — así Outbox queda solo con lo
// que todavía no se envió y no se puede mandar dos veces por error.
const PATRON_PENDIENTE_FIRMA = [/pendbox/i];
// GET /firma-digital/config - qué estado alimenta la bandeja "Firma Digital" (el que ya se dispara
// automáticamente al llegar un archivo a "Alta temprana de Arca" o "Constancia de cuit") y a qué
// carpeta de Dropbox hay que subir cuando se manda a firmar ("Outbox", la que ya vigila el estado
// siguiente). No hardcodea nombres de estado — los resuelve por la config real de cada tenant.
router.get("/config", async (_req, res) => {
    try {
        const [estadoEnvioDocNombre, outboxCarpeta, pendienteFirmaCarpeta, firmadosCarpeta, estadoContratadoNombre] = await Promise.all([
            resolverEstadoPorPropositos(["alta_temprana", "constancia_cuit"]),
            resolverCarpetaPorProposito("outbox"),
            resolverCarpetaPorProposito("pendbox"),
            resolverCarpetaPorProposito("firmados"),
            // Paso 6 «Contratados»: el estado al que llegan los firmados (y, directo, los tipos sin firma ni alta).
            resolverEstadoPorPropositos(["firmados"]),
        ]);
        res.json({ estadoEnvioDocNombre, outboxCarpeta, pendienteFirmaCarpeta, firmadosCarpeta, estadoContratadoNombre });
    }
    catch (error) {
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
router.post("/generar-contrato", async (req, res) => {
    try {
        const parsed = generarContratoSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Datos inválidos para generar el contrato." });
            return;
        }
        // Generar vive en `services/firmaDigital/documentos.ts` (27/11/2026): es lo mismo que hace la generación automática.
        const { projectId, userId, contractIndex, contratoTemplateId, empresaContratoId, tramite } = parsed.data;
        res.json(await generarContratoDeTramite({ tenantId: String(req.tenantObjectId), projectId: String(projectId), userId: String(userId), contractIndex: Number(contractIndex), contratoTemplateId: String(contratoTemplateId), empresaContratoId, tramite }));
    }
    catch (error) {
        console.error("Firma digital generar-contrato error:", error);
        // Plantilla sin contenido o contrato custom sin texto: es un 400 (lo que falta lo tiene que poner
        // quien genera), no una falla del server.
        res.status(error instanceof ErrorDeTramite ? error.status : 500).json({ error: error?.message || "No se pudo generar el contrato." });
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
router.post("/generar-release", async (req, res) => {
    try {
        const parsed = generarReleaseSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Datos inválidos para generar el/los release(s)." });
            return;
        }
        const { projectId, userId, contractIndex, releaseIds, empresaReleaseId, tramite } = parsed.data;
        res.json(await generarReleasesDeTramite({ tenantId: String(req.tenantObjectId), projectId: String(projectId), userId: String(userId), contractIndex: Number(contractIndex), releaseIds: (releaseIds || []).map(String), empresaReleaseId, tramite }));
    }
    catch (error) {
        console.error("Firma digital generar-release error:", error);
        res.status(error instanceof ErrorDeTramite ? error.status : 500).json({ error: error?.message || "No se pudieron generar los release(s)." });
    }
});
const eliminarSchema = z.object({
    projectId: z.string().min(1),
    userId: z.string().min(1),
    contractIndex: z.number().int().min(0),
});
// POST /firma-digital/eliminar-contrato - ícono de tacho junto al Contrato ya generado: borra el PDF
// y limpia los campos, para poder volver a "Generar" (p. ej. si se eligió mal la empresa).
router.post("/eliminar-contrato", async (req, res) => {
    try {
        const parsed = eliminarSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Datos inválidos." });
            return;
        }
        await eliminarContratoDeTramite({ projectId: String(parsed.data.projectId), userId: String(parsed.data.userId), contractIndex: Number(parsed.data.contractIndex) });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Firma digital eliminar-contrato error:", error);
        res.status(error instanceof ErrorDeTramite ? error.status : 500).json({ error: error?.message || "No se pudo eliminar el contrato." });
    }
});
// POST /firma-digital/eliminar-release - ícono de tacho junto al/los Release(s) ya generados: borra
// los PDFs y limpia los campos, para poder volver a "Generar".
router.post("/eliminar-release", async (req, res) => {
    try {
        const parsed = eliminarSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Datos inválidos." });
            return;
        }
        await eliminarReleasesDeTramite({ projectId: String(parsed.data.projectId), userId: String(parsed.data.userId), contractIndex: Number(parsed.data.contractIndex) });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Firma digital eliminar-release error:", error);
        res.status(error instanceof ErrorDeTramite ? error.status : 500).json({ error: error?.message || "No se pudieron eliminar los release(s)." });
    }
});
/*
  TEXTO CUSTOM (Contrato custom / Release custom, ver `compartido/textoCustom.ts`).

  El texto se escribe en Firma digital y se guarda en el trámite, no en la plantilla. Guardar el
  borrador no genera nada; «Guardar y generar» del modal guarda y después llama a generar-contrato /
  generar-release como siempre. La vista previa arma el PDF con los datos REALES del trámite y lo que
  está en el editor, sin guardarlo.

  A diferencia de generar/eliminar (que vienen de antes y confían en el par proyecto-persona), estos
  verifican que el proyecto y la persona sean del tenant, como /enviar.
*/
const tramiteSchema = z.object({
    projectId: z.string().min(1),
    userId: z.string().min(1),
    contractIndex: z.number().int().min(0),
});
const contenidoSchema = z.string().max(200000);
/** El UserProject del trámite si el proyecto y la persona son de este tenant y el contrato existe. */
async function cargarTramite(tenantObjectId, projectId, userId, contractIndex) {
    const [project, user] = await Promise.all([
        Project.exists({ _id: projectId, tenantId: tenantObjectId }),
        User.exists({ _id: userId, tenantId: tenantObjectId }),
    ]);
    if (!project || !user)
        return null;
    const up = await UserProject.findOne({ projectId, userId });
    if (!up || contractIndex >= up.contracts.length)
        return null;
    return up;
}
// POST /firma-digital/contenido-custom-contrato - «Guardar borrador» del modal del Contrato custom.
router.post("/contenido-custom-contrato", async (req, res) => {
    try {
        const parsed = tramiteSchema.extend({ content: contenidoSchema }).safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Datos inválidos para guardar el texto del contrato." });
            return;
        }
        const { projectId, userId, contractIndex, content } = parsed.data;
        const up = await cargarTramite(req.tenantObjectId, projectId, userId, contractIndex);
        if (!up) {
            res.status(404).json({ error: "Contrato no encontrado." });
            return;
        }
        const contract = up.contracts[contractIndex];
        if (contract.firmaEnviadaAt) {
            res.status(409).json({ error: YA_ENVIADO });
            return;
        }
        const contenidoCustomEditadoEl = new Date();
        up.contracts[contractIndex] = {
            ...contract.toObject(),
            contenidoCustomContrato: content,
            contenidoCustomEditadoPor: req.user?.userId || null,
            contenidoCustomEditadoEl,
        };
        up.markModified("contracts");
        await up.save();
        res.json({ contenidoCustomContrato: content, contenidoCustomEditadoEl });
    }
    catch (error) {
        console.error("Firma digital contenido-custom-contrato error:", error);
        res.status(500).json({ error: error?.message || "No se pudo guardar el texto del contrato." });
    }
});
// POST /firma-digital/contenido-custom-release - «Guardar borrador» del modal de un Release custom.
router.post("/contenido-custom-release", async (req, res) => {
    try {
        const parsed = tramiteSchema.extend({ releaseId: z.string().min(1), content: contenidoSchema }).safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Datos inválidos para guardar el texto del release." });
            return;
        }
        const { projectId, userId, contractIndex, releaseId, content } = parsed.data;
        const release = await Release.findOne({ _id: releaseId, tenantId: req.tenantObjectId }).select("esCustom").lean();
        if (!release) {
            res.status(404).json({ error: "Release no encontrado." });
            return;
        }
        if (!release.esCustom) {
            res.status(400).json({ error: "Ese release no es custom: su texto sale de la plantilla." });
            return;
        }
        const up = await cargarTramite(req.tenantObjectId, projectId, userId, contractIndex);
        if (!up) {
            res.status(404).json({ error: "Contrato no encontrado." });
            return;
        }
        const contract = up.contracts[contractIndex];
        if (contract.firmaEnviadaAt) {
            res.status(409).json({ error: YA_ENVIADO });
            return;
        }
        // Un texto por release: se reemplaza el que había. Si se vacía, se quita (el release custom es
        // opcional por trámite: sin texto —o con el placeholder—, la fila no lo lleva).
        const otros = (contract.contenidoCustomReleases || [])
            .map((c) => ({ releaseId: String(c.releaseId), content: c.content }))
            .filter((c) => c.releaseId !== releaseId);
        const contenidoCustomReleases = textoCustomUsable(content) ? [...otros, { releaseId, content }] : otros;
        const contenidoCustomEditadoEl = new Date();
        up.contracts[contractIndex] = {
            ...contract.toObject(),
            contenidoCustomReleases,
            contenidoCustomEditadoPor: req.user?.userId || null,
            contenidoCustomEditadoEl,
        };
        up.markModified("contracts");
        await up.save();
        res.json({ contenidoCustomReleases, contenidoCustomEditadoEl });
    }
    catch (error) {
        console.error("Firma digital contenido-custom-release error:", error);
        res.status(500).json({ error: error?.message || "No se pudo guardar el texto del release." });
    }
});
const previewSchema = tramiteSchema.extend({ content: contenidoSchema, empresaId: z.string().optional() });
function enviarPdfEnLinea(res, buffer, nombre) {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(nombre)}.pdf`);
    res.send(buffer);
}
// POST /firma-digital/preview-contrato-custom - «Vista previa» del modal: el PDF con los datos reales
// del trámite y el texto del editor, sin guardar nada.
router.post("/preview-contrato-custom", async (req, res) => {
    try {
        const parsed = previewSchema.extend({ contratoTemplateId: z.string().min(1) }).safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Datos inválidos para la vista previa." });
            return;
        }
        const { projectId, userId, contractIndex, content, empresaId, contratoTemplateId } = parsed.data;
        if (!(await cargarTramite(req.tenantObjectId, projectId, userId, contractIndex))) {
            res.status(404).json({ error: "Contrato no encontrado." });
            return;
        }
        const plantilla = await ContratoFrame.findById(contratoTemplateId).select("esCustom").lean();
        if (!plantilla?.esCustom) {
            res.status(400).json({ error: "La plantilla no es custom." });
            return;
        }
        const pdf = await generarContratoPdf({ tenantId: String(req.tenantObjectId), templateId: contratoTemplateId, userId, projectId, contractIndex, empresaId, contenidoCustom: content });
        enviarPdfEnLinea(res, pdf.buffer, `Vista_previa_${pdf.filename}`);
    }
    catch (error) {
        const msg = String(error?.message || "");
        console.error("Firma digital preview-contrato-custom error:", error);
        res.status(statusDeErrorDePdf(msg)).json({ error: msg || "No se pudo armar la vista previa." });
    }
});
// POST /firma-digital/preview-release-custom - ídem, para un Release custom.
router.post("/preview-release-custom", async (req, res) => {
    try {
        const parsed = previewSchema.extend({ releaseId: z.string().min(1) }).safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: "Datos inválidos para la vista previa." });
            return;
        }
        const { projectId, userId, contractIndex, content, empresaId, releaseId } = parsed.data;
        if (!(await cargarTramite(req.tenantObjectId, projectId, userId, contractIndex))) {
            res.status(404).json({ error: "Contrato no encontrado." });
            return;
        }
        const release = await Release.findOne({ _id: releaseId, tenantId: req.tenantObjectId }).select("esCustom").lean();
        if (!release?.esCustom) {
            res.status(400).json({ error: "El release no es custom." });
            return;
        }
        const pdf = await generarReleasePdf({ tenantId: String(req.tenantObjectId), releaseId, userId, projectId, contractIndex, empresaId, contenidoCustom: content });
        enviarPdfEnLinea(res, pdf.buffer, `Vista_previa_${pdf.filename}`);
    }
    catch (error) {
        const msg = String(error?.message || "");
        console.error("Firma digital preview-release-custom error:", error);
        res.status(statusDeErrorDePdf(msg)).json({ error: msg || "No se pudo armar la vista previa." });
    }
});
const enviarTargetSchema = z.object({
    projectId: z.string().min(1),
    userId: z.string().min(1),
    contractIndex: z.number().int().min(0),
    // Ya calculado por el frontend (estadoImpositivoDelContrato) — determina si además del
    // Contrato/Release hay que sumar el documento de Alta temprana de ARCA ya cargado.
    tipoImpositivo: z.enum(["alta_temprana_afip", "constancia_cuit"]).optional(),
    // Si el Contrato de este trámite tiene tildado "Se envía a firmar" (default true) — ya lo calcula
    // el frontend con el Tipo de Contrato. Cuando es false no se exige el Contrato generado ni se sube.
    incluirContrato: z.boolean().optional().default(true),
    // «Se envía a firmar el release» / «…el alta de ARCA» del Tipo de Contrato (default true: así se
    // comportaba antes de que existieran). Los calcula el frontend con el tipo, igual que el anterior.
    incluirReleases: z.boolean().optional().default(true),
    incluirAlta: z.boolean().optional().default(true),
});
// POST /firma-digital/enviar { targets: [...] } - paso 2: sube a la carpeta Outbox de Dropbox los
// documentos YA generados en el paso 1 (nunca genera nada acá) — Contrato + Release(s) siempre, y si
// el trámite de origen fue "Alta temprana de ARCA" también el documento de Alta ya cargado. La
// Constancia de CUIT (el JSON) NUNCA se manda a firmar.
router.post("/enviar", async (req, res) => {
    try {
        let targets;
        try {
            targets = z.array(enviarTargetSchema).min(1).max(200).parse(req.body?.targets);
        }
        catch {
            res.status(400).json({ error: "El listado de contratos (targets) es inválido." });
            return;
        }
        // El envío vive en `services/firmaDigital/documentos.ts` (27/11/2026): es lo mismo que hace la generación automática.
        res.json(await enviarAFirmar({ tenantObjectId: req.tenantObjectId, targets: targets.map((t) => ({ projectId: String(t.projectId), userId: String(t.userId), contractIndex: Number(t.contractIndex), tipoImpositivo: t.tipoImpositivo, incluirContrato: t.incluirContrato !== false, incluirReleases: t.incluirReleases !== false, incluirAlta: t.incluirAlta !== false })) }));
    }
    catch (error) {
        if (error instanceof ErrorDeTramite) {
            res.status(error.status).json({ error: error.message });
            return;
        }
        console.error("Firma digital enviar error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/*
  LAS AUTOMATIZACIONES DE CONTRATACIÓN (27/11/2026, ver `services/automatizacionesContratacion/`): la
  generación y envío de documentos (bandeja Generar Documentos) y la validación del CUIT en ARCA (Trámite
  impositivo › Constancia de CUIT). Cada bandeja muestra la suya: prender/apagar, cada cuánto, la última
  corrida y «Correr ahora». Cambiarlas es de administrador, como las credenciales de ARCA.
*/
const esAdmin = (req) => (req.user?.roles || []).some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));
const claveDe = (x) => (CLAVES.includes(x) ? x : null);
router.get("/automatizacion", async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.tenantObjectId).select(`_id ${BASE_AUTOMATIZACIONES}`).lean();
        res.json(Object.fromEntries(CLAVES.map((c) => [c, { ...estadoDe(tenant, c), titulo: TITULO[c] }])));
    }
    catch (error) {
        console.error("Firma digital automatizacion error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.post("/automatizacion", async (req, res) => {
    try {
        if (!esAdmin(req)) {
            res.status(403).json({ error: "Solo un administrador puede cambiar las automatizaciones." });
            return;
        }
        const clave = claveDe(req.body?.clave);
        if (!clave) {
            res.status(400).json({ error: "Falta decir qué automatización se cambia (clave)." });
            return;
        }
        const v = validarCambios(req.body);
        if (v.ok === false) {
            res.status(400).json({ error: v.error });
            return;
        }
        const set = {};
        if (v.cambios.activa !== undefined)
            set[`${BASE_AUTOMATIZACIONES}.${clave}.activa`] = v.cambios.activa;
        if (v.cambios.cadaMinutos !== undefined)
            set[`${BASE_AUTOMATIZACIONES}.${clave}.cadaMinutos`] = v.cambios.cadaMinutos;
        if (Object.keys(set).length)
            await Tenant.updateOne({ _id: req.tenantObjectId }, { $set: set });
        const tenant = await Tenant.findById(req.tenantObjectId).select(`_id ${BASE_AUTOMATIZACIONES}`).lean();
        res.json({ ...estadoDe(tenant, clave), titulo: TITULO[clave] });
    }
    catch (error) {
        console.error("Firma digital automatizacion save error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// «Correr ahora»: la misma corrida que haría el reloj, ya. Espera a que termine y devuelve el resumen.
router.post("/automatizacion/correr", async (req, res) => {
    try {
        if (!esAdmin(req)) {
            res.status(403).json({ error: "Solo un administrador puede correr una automatización a mano." });
            return;
        }
        const clave = claveDe(req.body?.clave);
        if (!clave) {
            res.status(400).json({ error: "Falta decir qué automatización se corre (clave)." });
            return;
        }
        let resumen = null;
        let error = "";
        try {
            resumen = await correrAhora(req.tenantObjectId, clave);
        }
        catch (e) {
            error = e?.message || String(e);
        }
        const tenant = await Tenant.findById(req.tenantObjectId).select(`_id ${BASE_AUTOMATIZACIONES}`).lean();
        res.json({ ...estadoDe(tenant, clave), titulo: TITULO[clave], resumen, error });
    }
    catch (error) {
        console.error("Firma digital automatizacion correr error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as firmaDigitalRoutes };
