import { deleteEntry, listFolder, moveEntry } from "./dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
import { describirPlan, planLimpiezaPendbox } from "../utils/limpiezaPendbox.js";
export async function limpiarPendbox(tenantId, cfg, opts) {
    const log = opts.log || (() => { });
    const vacio = { plan: { acciones: [], omitidos: [] }, renombrados: 0, borrados: 0, fallas: [] };
    const [pendbox, firmados] = await Promise.all([resolverCarpetaPorProposito("pendbox"), resolverCarpetaPorProposito("firmados")]);
    if (!pendbox || !firmados)
        return { ...vacio, salteada: "sin_carpetas" };
    const soloArchivos = (xs) => xs.filter((e) => e.tag === "file").map((e) => ({ name: e.name, path: e.path }));
    const enFirmados = soloArchivos((await listFolder(tenantId, cfg, firmados, true)).entries || []);
    if (enFirmados.length === 0)
        return { ...vacio, salteada: "firmados_vacia" };
    const enPendbox = soloArchivos((await listFolder(tenantId, cfg, pendbox, true)).entries || []);
    const plan = planLimpiezaPendbox(enFirmados, enPendbox);
    for (const l of describirPlan(plan))
        log(l);
    const r = { plan, renombrados: 0, borrados: 0, fallas: [] };
    if (opts.enSeco)
        return r;
    const carpetaFirmados = firmados.replace(/\/$/, "");
    for (const a of plan.acciones) {
        if (a.renombrarA) {
            try {
                await moveEntry(tenantId, cfg, a.firmado.path, `${carpetaFirmados}/${a.renombrarA}`);
                r.renombrados++;
            }
            catch (e) {
                // Sin el firmado con código no se borra nada: el original se queda hasta la próxima pasada.
                r.fallas.push({ firmado: a.firmado.name, paso: "renombrar", error: String(e?.message || e) });
                continue;
            }
        }
        try {
            await deleteEntry(tenantId, cfg, a.original.path);
            r.borrados++;
        }
        catch (e) {
            r.fallas.push({ firmado: a.firmado.name, paso: "borrar", error: String(e?.message || e) });
        }
    }
    return r;
}
