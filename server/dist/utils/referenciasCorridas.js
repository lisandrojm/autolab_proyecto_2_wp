import { huellaNoCoincide } from "./identidadContrato.js";
const logDe = (c) => String(c?.altaArcaPresentada?.logId || "");
/** La huella que se puede usar en ESTE vínculo: el `logId` sólo si algún contrato lo tiene. */
export function huellaUtil(lista, h) {
    const out = {};
    if (h.alta)
        out.alta = h.alta;
    if (h.baja)
        out.baja = h.baja;
    if (h.empresaId)
        out.empresaId = h.empresaId;
    if (h.logId && lista.some((c) => logDe(c) === String(h.logId)))
        out.logId = h.logId;
    return out;
}
export function fuerzaDe(campos) {
    if (campos.includes("logId") || (campos.includes("alta") && campos.includes("empresaId")))
        return "fuerte";
    return campos.length ? "debil" : "ninguna";
}
/** La huella completa contra un contrato: la de `identidadContrato` más el log. */
export function noCoincide(c, h) {
    const m = huellaNoCoincide(c, h);
    if (m)
        return m;
    if (h.logId && logDe(c) !== String(h.logId))
        return `presentado por otro log (${logDe(c).slice(-6) || "ninguno"} ≠ ${String(h.logId).slice(-6)})`;
    return null;
}
export function clasificarReferencia(lista, ref) {
    const h = huellaUtil(lista, ref.huella);
    const evidencia = ["logId", "alta", "baja", "empresaId"].filter((k) => !!h[k]);
    const fuerza = fuerzaDe(evidencia);
    // Candidatos sólo con algo que distinga contratos (la empleadora sola no: casi todos la comparten).
    const candidatos = () => (h.alta || h.baja || h.logId ? lista.flatMap((c, i) => (c?.estadoContrato !== "ANULADO" && noCoincide(c, h) === null ? [i] : [])) : []);
    const n = Number(ref.indice);
    if (ref.indice == null || !Number.isInteger(n) || n < 0 || n >= lista.length)
        return { tipo: "fuera", evidencia, fuerza, motivo: `posición ${ref.indice ?? "sin guardar"} fuera de los ${lista.length} contratos`, candidatos: candidatos() };
    const c = lista[n];
    // La lápida no guarda alta/baja/empleadora/log (están en `contratos_anulados`): se acepta.
    if (c?.estadoContrato === "ANULADO")
        return { tipo: "lapida", evidencia, fuerza };
    const motivo = noCoincide(c, h);
    if (motivo)
        return { tipo: "corrida", evidencia, fuerza, motivo, candidatos: candidatos() };
    return { tipo: evidencia.length ? "consistente" : "sin_huella", evidencia, fuerza };
}
