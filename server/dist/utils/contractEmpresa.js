import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { Company } from "../models/Company.js";
/** Un contrato está vigente si no tiene fecha de baja o su baja es hoy o futura. */
function isVigente(baja) {
    if (!baja)
        return true;
    const iso = String(baja).substring(0, 10);
    const parts = iso.split("-");
    let bajaDate = null;
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        bajaDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    else {
        const d = new Date(baja);
        if (!isNaN(d.getTime()))
            bajaDate = d;
    }
    if (!bajaDate)
        return true;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    bajaDate.setHours(0, 0, 0, 0);
    return bajaDate.getTime() >= today.getTime();
}
function altaTime(c) {
    const d = new Date(c?.fecha_alta_contrato || 0);
    return isNaN(d.getTime()) ? 0 : d.getTime();
}
/**
 * Encuentra el último contrato activo del usuario (más reciente por fecha de alta; si ninguno
 * está vigente, toma el último contrato existente) y resuelve la empresa de membrete.
 */
export async function resolveContractEmpresa(userId, empresaIdOverride) {
    const empty = { empresa: null, contractEmpresaId: "", projectEmpresas: [], projectId: "" };
    if (!userId)
        return empty;
    const ups = await UserProject.find({ userId }).lean();
    let best = null;
    let fallback = null;
    for (const up of ups) {
        for (const c of up.contracts || []) {
            // fallback = el contrato más reciente sin importar vigencia
            if (!fallback || altaTime(c) >= altaTime(fallback.contract))
                fallback = { contract: c, projectId: up.projectId };
            // best = el contrato vigente más reciente
            if (isVigente(c.fecha_baja_contrato)) {
                if (!best || altaTime(c) >= altaTime(best.contract))
                    best = { contract: c, projectId: up.projectId };
            }
        }
    }
    const chosen = best || fallback;
    // Proyecto de referencia para las empresas de membrete: el del contrato elegido. Si el usuario NO
    // tiene contratos (p. ej. un responsable/coordinador que igual pide vacaciones o cambios de datos),
    // caemos al proyecto en el que está asignado — el primero que tenga empresas cargadas; si ninguno
    // tiene, el primero disponible. Así el PDF puede tomar la empresa del proyecto igualmente.
    let projectId = chosen ? String(chosen.projectId || "") : "";
    if (!projectId && ups.length) {
        for (const up of ups) {
            if (!up.projectId)
                continue;
            const p = await Project.findById(up.projectId).lean();
            if (p && (p.contratoEmpresas || []).length > 0) {
                projectId = String(up.projectId);
                break;
            }
        }
        if (!projectId)
            projectId = String(ups.find((u) => u.projectId)?.projectId || "");
    }
    if (!projectId)
        return empty;
    const project = await Project.findById(projectId).lean();
    const projectEmpresaIds = (project?.contratoEmpresas || []).map((e) => String(e));
    const companies = projectEmpresaIds.length ? await Company.find({ _id: { $in: projectEmpresaIds } }).lean() : [];
    const projectEmpresas = projectEmpresaIds
        .map((id) => ({ id, label: companies.find((c) => String(c._id) === id)?.razonSocial || "" }))
        .filter((e) => e.label);
    const contractEmpresaId = chosen?.contract?.empresaContratoId ? String(chosen.contract.empresaContratoId) : "";
    const overrideValid = empresaIdOverride && projectEmpresaIds.includes(String(empresaIdOverride)) ? String(empresaIdOverride) : "";
    const chosenId = overrideValid || contractEmpresaId || projectEmpresaIds[0] || "";
    const empresa = chosenId ? await Company.findById(chosenId).lean() : null;
    return { empresa, contractEmpresaId, projectEmpresas, projectId };
}
