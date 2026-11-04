import { Types } from "mongoose";
import { Company } from "../../models/Company.js";
import { RelacionLaboralArca } from "../../models/RelacionLaboralArca.js";
import { ArcaModalidadContratacion } from "../../models/ArcaModalidadContratacion.js";
import { candidatosDeAlta } from "./presentacionAutomatica.js";
import { aplicador, itemDe } from "./verificacionAltas.js";
import { decidirAltaExterna } from "./decisionAltaExterna.js";
import { fechaCorta } from "./altasVigentes.js";
import { NOVEDAD_ALTA_ARCA_EXTERNA, notificar, responsablesDeProyectos } from "../novedadesNotificaciones.js";
const clave = (x) => `${x.userProjectId}:${x.contractIndex}`;
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");
export async function adoptarAltasExternas(o) {
    const t0 = Date.now();
    const solo = o.soloContratos ? new Set(o.soloContratos.map(clave)) : null;
    const todos = o.candidatos || (await candidatosDeAlta(o.tenantObjectId));
    const candidatos = todos.filter((c) => (!solo || solo.has(clave(c))) && (!o.empresaId || c.empresa?._id === o.empresaId) && c.cuil.length === 11 && c.empresa?._id && c.fechaAlta);
    if (candidatos.length === 0)
        return [];
    // Las empleadoras, por su CUIT (la relación de ARCA se guarda por CUIT, el contrato por empresa).
    const idsEmpresas = [...new Set(candidatos.map((c) => c.empresa._id))].filter((id) => Types.ObjectId.isValid(id));
    const empresas = await Company.find({ _id: { $in: idsEmpresas } }).select("cuit razonSocial").lean();
    const cuitDe = new Map(empresas.map((e) => [String(e._id), String(e.cuit || "").replace(/\D/g, "")]));
    // Sólo lo que empieza desde la primera alta pendiente: lo anterior no puede ser ninguna de estas altas.
    const desde = candidatos.map((c) => c.fechaAlta).sort()[0];
    const [relaciones, modalidades] = await Promise.all([
        RelacionLaboralArca.find({ tenantId: o.tenantObjectId, cuil: { $in: [...new Set(candidatos.map((c) => c.cuil))] }, fechaInicio: { $gte: new Date(`${desde}T00:00:00.000Z`) } })
            .select("-_id cuil empleadoraCuit fechaInicio fechaFin modalidadContrato")
            .lean(),
        ArcaModalidadContratacion.find().select("externalId name").lean(),
    ]);
    const nombreModalidad = new Map(modalidades.map((m) => [String(m.externalId || "").padStart(3, "0"), String(m.name || "")]));
    const relacionesDe = new Map();
    for (const r of relaciones) {
        const k = `${r.cuil}:${r.empleadoraCuit}`;
        relacionesDe.set(k, [...(relacionesDe.get(k) || []), { inicio: iso(r.fechaInicio), fin: iso(r.fechaFin), modalidad: String(r.modalidadContrato || "").trim() }]);
    }
    // Qué decide cada alta. Las que no tienen nada en ARCA que empiece durante el contrato no son asunto de esto.
    const decididas = [];
    for (const c of candidatos) {
        const cuit = cuitDe.get(c.empresa._id) || "";
        if (cuit.length !== 11)
            continue;
        const codigo = c.modalidadCodigo ? c.modalidadCodigo.replace(/\D/g, "").padStart(3, "0") : "";
        const d = decidirAltaExterna({ alta: c.fechaAlta, baja: c.fechaBaja, modalidadCodigo: codigo, modalidadNombre: nombreModalidad.get(codigo) || "", otroContratoMismoDia: c.otroContratoMismoDia }, relacionesDe.get(`${c.cuil}:${cuit}`) || []);
        if (d)
            decididas.push({ c, d });
    }
    if (decididas.length === 0)
        return [];
    // Se aplican por empleadora: el registro de la pestaña Presentadas es uno por empleadora y corrida.
    const resultados = [];
    const porEmpresa = new Map();
    for (const x of decididas)
        porEmpresa.set(x.c.empresa._id, [...(porEmpresa.get(x.c.empresa._id) || []), x]);
    for (const [empresaId, lista] of porEmpresa) {
        const aplicar = aplicador({
            tenantObjectId: o.tenantObjectId,
            automatica: o.detectadaPor !== "manual" && o.detectadaPor !== "presentacion_masiva",
            usuarioId: o.usuarioId,
            enSeco: o.enSeco,
            empresaId,
            empresaRazonSocial: lista[0].c.empresa.razonSocial,
            empresaCuit: cuitDe.get(empresaId) || "",
            via: "externa",
            detectadaPor: o.detectadaPor,
            noRepetirManual: true,
        });
        for (const { c, d } of lista) {
            const decision = { accion: d.accion === "adoptar" ? "presentada" : "revision_manual", motivo: d.motivo, relacion: d.relacion ? { ...d.relacion, baja: "" } : undefined, ladoALado: { esperado: d.esperado, encontradas: d.encontradas } };
            const consulta = { ok: true, relaciones: d.encontradas.map((r) => ({ ...r, baja: "" })), encontrada: true };
            let accion;
            try {
                accion = await aplicar(itemDe(c), decision, consulta);
            }
            catch (e) {
                accion = "error";
                console.error(`[altas-externas] ${c.nombre} (${c.cuil}): no se pudo aplicar:`, e?.message || e);
            }
            resultados.push({ userProjectId: c.userProjectId, contractIndex: c.contractIndex, nombre: c.nombre, cuil: c.cuil, empresa: c.empresa.razonSocial, alta: c.fechaAlta, baja: c.fechaBaja, decision: d.accion, accion, motivo: d.motivo });
            if (accion === "marcada_presentada")
                await avisarAdopcion(o.tenantObjectId, c);
        }
    }
    const adoptadas = resultados.filter((r) => r.accion === "marcada_presentada" || (r.accion === "en_seco" && r.decision === "adoptar")).length;
    const manuales = resultados.filter((r) => r.accion === "revision_manual").length;
    if (adoptadas + manuales > 0 || Date.now() - t0 > 2000)
        console.log(`[altas-externas] ${o.detectadaPor}${o.enSeco ? " (en seco)" : ""}: ${adoptadas} adoptada(s), ${manuales} a revisión manual, de ${candidatos.length} pendiente(s), en ${Date.now() - t0} ms`);
    return resultados;
}
/** La novedad al coordinador del proyecto. No lanza: un aviso perdido no deshace la adopción. */
async function avisarAdopcion(tenantId, c) {
    const destinatarios = await responsablesDeProyectos(tenantId, [c.projectId]);
    await notificar({
        tenantId,
        destinatarios,
        type: NOVEDAD_ALTA_ARCA_EXTERNA,
        title: "Alta externa adoptada",
        message: `El alta de ${c.nombre} (${c.proyecto}, desde el ${fechaCorta(c.fechaAlta)}) ya estaba hecha a mano en ARCA: se tomó como presentada y sigue el circuito.`,
        refId: c.userId,
    });
}
