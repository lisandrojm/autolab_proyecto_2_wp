import { leerAnclas } from "./anclasNombre.js";
const esDocumento = (e) => !/\.json$/i.test(e.name);
/** Código → primer archivo que lo trae, de una carpeta. */
export function codigosDe(archivos) {
    const m = new Map();
    for (const a of archivos.filter(esDocumento)) {
        const c = leerAnclas(a.name).codigo;
        if (c && !m.has(c))
            m.set(c, a.name);
    }
    return m;
}
export function planConciliacionOutbox(outbox, pendbox, firmados) {
    const enPendbox = codigosDe(pendbox);
    const enFirmados = codigosDe(firmados);
    const plan = { mover: [], quedan: [] };
    for (const archivo of outbox.filter(esDocumento)) {
        const codigo = leerAnclas(archivo.name).codigo;
        if (!codigo)
            plan.quedan.push({ archivo, motivo: "sin_codigo" });
        else if (enFirmados.has(codigo))
            plan.mover.push({ archivo, codigo, estado: "firmado", prueba: enFirmados.get(codigo) });
        else if (enPendbox.has(codigo))
            plan.mover.push({ archivo, codigo, estado: "esperando_firma", prueba: enPendbox.get(codigo) });
        else
            plan.quedan.push({ archivo, motivo: "sin_rastro" });
    }
    return plan;
}
/** Si el código ya está en Pendbox o Firmados, cuál de los dos (la red de la corrida de envío). */
export function yaEnviadoPorCarpeta(codigo, carpetas) {
    if (!codigo)
        return null;
    if (carpetas.firmados.has(codigo))
        return "firmado";
    if (carpetas.pendbox.has(codigo))
        return "esperando_firma";
    return null;
}
export const TEXTO_ESTADO = { firmado: "firmado", esperando_firma: "esperando firma" };
/** El resumen del modo seco: totales y una línea por archivo que se movería. */
export function describirConciliacion(plan, enSeco) {
    const firmados = plan.mover.filter((m) => m.estado === "firmado").length;
    const sinRastro = plan.quedan.filter((q) => q.motivo === "sin_rastro").length;
    const sinCodigo = plan.quedan.filter((q) => q.motivo === "sin_codigo").length;
    const lineas = [
        `Conciliación Outbox ↔ Pendbox/Firmados${enSeco ? " — EN SECO" : ""}`,
        "",
        `  ${plan.mover.length + plan.quedan.length} archivos en Outbox`,
        `  ${plan.mover.length} ya enviados (${firmados} firmados · ${plan.mover.length - firmados} esperando firma)  → ${enSeco ? "se moverían" : "se mueven"}`,
        `  ${sinRastro} sin rastro en Pendbox ni Firmados  → se quedan`,
        ...(sinCodigo ? [`  ${sinCodigo} sin código ID-NNNNNN en el nombre  → se quedan (no se matchea por persona)`] : []),
        "",
    ];
    for (const m of [...plan.mover].sort((a, b) => a.codigo.localeCompare(b.codigo)))
        lineas.push(`  ${m.codigo}  ${TEXTO_ESTADO[m.estado].padEnd(16)} ${m.archivo.name}`);
    return lineas;
}
