import { Tenant } from "../../models/Tenant.js";
import { Project } from "../../models/Project.js";
import { Company } from "../../models/Company.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { ContratoFrame } from "../../models/ContratoFrame.js";
import { Contrato } from "../../models/Contrato.js";
import { Release } from "../../models/Release.js";
import { ReleaseTipo } from "../../models/ReleaseTipo.js";
import { resolverCarpetaPorProposito, resolverEstadoPorPropositos } from "../../utils/estadoCarpetas.js";
import { claveEstado } from "../../utils/estadoClave.js";
import { sigueElCircuito } from "../../utils/circuitoContrato.js";
import { getTenantDropboxConfig } from "../dropboxService.js";
import { lectorDeTramites } from "../superposicion.js";
import { pendienteDeFirma, releaseRequiereFirma } from "../../compartido/pendienteDeFirma.js";
import { eliminarReleasesDeTramite, enviarAFirmar, generarContratoDeTramite, generarReleasesDeTramite } from "../firmaDigital/documentos.js";
const nombreDe = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || "Persona";
export async function correrGeneracionDocumentos(tenantObjectId, log = () => { }) {
    const resumen = { fecha: new Date(), revisados: 0, generados: 0, enviados: 0, sinNadaQueFirmar: 0, paraResolver: [], errores: [] };
    const tenantId = String(tenantObjectId);
    // Sin dónde dejar los documentos no se puede enviar nada: se dice de entrada, no contrato por contrato.
    const [tenant, estadoEnvio, outbox] = await Promise.all([Tenant.findById(tenantObjectId).lean(), resolverEstadoPorPropositos(["alta_temprana", "constancia_cuit"]), resolverCarpetaPorProposito("outbox")]);
    if (!getTenantDropboxConfig(tenant))
        throw new Error("Dropbox no está conectado para esta organización.");
    if (!estadoEnvio)
        throw new Error("No hay un estado «Envío de documentación» configurado (Documentos → Configurar transición automática).");
    if (!outbox)
        throw new Error('No se encontró ninguna carpeta de Dropbox configurada como "Outbox" (Documentos → Configurar transición automática).');
    const projects = await Project.find({ tenantId: tenantObjectId }).select("_id name contratoEmpresas releaseEmpresas").lean();
    if (projects.length === 0)
        return resumen;
    const projectIds = projects.map((p) => p._id);
    // Las empresas que ofrece cada proyecto, con el mismo fallback del listado (`contracts-overview`):
    // sin ninguna configurada, todas las del ABM.
    const companies = await Company.find({}).select("razonSocial").lean();
    const todas = companies.map((c) => ({ id: String(c._id), label: String(c.razonSocial || "") })).filter((e) => e.label);
    const labelDe = new Map(todas.map((e) => [e.id, e.label]));
    const toEmpresas = (ids = []) => {
        const propias = (ids || []).map((id) => ({ id: String(id), label: labelDe.get(String(id)) || "" })).filter((e) => e.label);
        return propias.length > 0 ? propias : todas;
    };
    const empresasDe = new Map(projects.map((p) => [String(p._id), { contratoEmpresas: toEmpresas(p.contratoEmpresas), releaseEmpresas: toEmpresas(p.releaseEmpresas), nombre: String(p.name || "") }]));
    // Los contratos en «Envío de documentación»: por el nombre crudo guardado, comparado con la clave del estado.
    const clave = claveEstado(estadoEnvio);
    const crudos = await UserProject.distinct("contracts.nombre_estado_empleado", { projectId: { $in: projectIds } });
    const nombres = crudos.map((n) => String(n ?? "")).filter((n) => n && claveEstado(n) === clave);
    if (nombres.length === 0)
        return resumen;
    const ups = await UserProject.find({ projectId: { $in: projectIds }, "contracts.nombre_estado_empleado": { $in: nombres } }).lean();
    const [plantillas, releases, tramiteDe, users] = await Promise.all([
        ContratoFrame.find().populate({ path: "contratoId", model: Contrato, select: "name isActive data.requiereFirma data.requiereFirmaRelease data.requiereFirmaAlta" }).lean(),
        Release.find({ tenantId: tenantObjectId, isActive: true }).populate({ path: "releaseTipoId", model: ReleaseTipo, select: "name requiereFirma isActive" }).lean(),
        lectorDeTramites(),
        User.find({ _id: { $in: [...new Set(ups.map((u) => u.userId))] } }).select("firstName lastName").lean(),
    ]);
    const releasesQueFirman = releases.filter(releaseRequiereFirma);
    const personaDe = new Map(users.map((u) => [String(u._id), nombreDe(u)]));
    const filaDe = (c, projectId) => ({ ...c, tipoContratoId: c.contrato_id, contratoEmpresas: empresasDe.get(projectId)?.contratoEmpresas, releaseEmpresas: empresasDe.get(projectId)?.releaseEmpresas });
    for (const up of ups) {
        const projectId = String(up.projectId);
        const userId = String(up.userId);
        const persona = personaDe.get(userId) || "Persona";
        const proyecto = empresasDe.get(projectId)?.nombre || "";
        const contratos = up.contracts || [];
        for (let idx = 0; idx < contratos.length; idx++) {
            const c = contratos[idx];
            if (!c || c.estadoContrato === "ANULADO" || c.firmaEnviadaAt)
                continue;
            if (claveEstado(String(c.nombre_estado_empleado || "")) !== clave)
                continue;
            // Sólo lo que nació en WeProdu (aprobado desde Solicitudes o «Agregar miembro»), como el listado de la bandeja.
            if (!sigueElCircuito(c))
                continue;
            resumen.revisados++;
            const tipo = (tramiteDe({ nombre_contrato: c.nombre_contrato, tipo_contrato_id: c.tipo_contrato_id, contrato_id: c.contrato_id }) || null);
            const pen = pendienteDeFirma(filaDe(c, projectId), plantillas, releasesQueFirman, tipo, releases);
            if (!pen.algoAplica) {
                resumen.sinNadaQueFirmar++;
                continue;
            }
            if (pen.motivo) {
                resumen.paraResolver.push({ persona, proyecto, motivo: pen.motivo });
                continue;
            }
            const tramite = { projectId, userId, contractIndex: idx };
            try {
                if (pen.faltaContrato) {
                    log(`${persona} (${proyecto}): generando el contrato`);
                    await generarContratoDeTramite({ ...tramite, tenantId, contratoTemplateId: String(pen.template._id), empresaContratoId: pen.empresaContrato, tramite: tipo || undefined });
                }
                if (pen.faltaRelease) {
                    // Un grupo generado a medias (se le sumó un release después) se rehace entero.
                    if ((c.firmaReleases || []).length > 0)
                        await eliminarReleasesDeTramite(tramite);
                    log(`${persona} (${proyecto}): generando ${pen.releasesAplicables.length} release(s)`);
                    await generarReleasesDeTramite({ ...tramite, tenantId, releaseIds: pen.releasesAplicables.map((r) => String(r._id)), empresaReleaseId: pen.empresaRelease, tramite: tipo || undefined });
                }
                if (pen.faltaContrato || pen.faltaRelease)
                    resumen.generados++;
                // Se vuelve a leer: lo que se acaba de generar es lo que decide si ya se puede enviar.
                const fresco = await UserProject.findById(up._id).lean();
                const c2 = fresco?.contracts?.[idx];
                const listo = c2 ? pendienteDeFirma(filaDe(c2, projectId), plantillas, releasesQueFirman, tipo, releases) : null;
                if (!listo?.enviable) {
                    resumen.errores.push({ persona, proyecto, motivo: listo?.motivo || "Quedó algo sin generar." });
                    continue;
                }
                const envio = await enviarAFirmar({ tenantObjectId, targets: [{ ...tramite, tipoImpositivo: tipo || undefined, ...listo.envio }] });
                if (envio.enviados > 0) {
                    resumen.enviados++;
                    log(`${persona} (${proyecto}): enviado a firmar`);
                }
                else
                    resumen.errores.push({ persona, proyecto, motivo: envio.resultados[0]?.error || "No se pudo enviar a firmar." });
            }
            catch (e) {
                resumen.errores.push({ persona, proyecto, motivo: e?.message || String(e) });
                log(`${persona} (${proyecto}): ${e?.message || e}`);
            }
        }
    }
    return resumen;
}
