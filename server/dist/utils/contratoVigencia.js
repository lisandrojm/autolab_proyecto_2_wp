/**
 * Vigencia de contratos: mismo criterio que usa el front (`frontend/src/utils/contratoVigencia.ts`).
 *
 * Un contrato de TIEMPO INDETERMINADO se guarda con `fecha_baja_contrato` vacía, así que la
 * ausencia de fecha de baja es lo que lo identifica como vigente. El punto importante es CUÁL
 * contrato se evalúa: tomar siempre el último del array daba NO VIGENTE a quien tenía un
 * indeterminado abierto seguido de un contrato viejo ya vencido.
 *
 * El flag `esTiempoIndeterminado` del tipo de contrato no se usa acá: si un contrato indeterminado
 * tiene fecha de baja cargada, esa baja es real y se respeta.
 */
/** "Hoy" en hora de Argentina (el VPS puede correr en UTC), como "YYYY-MM-DD". */
export function hoyArgentina() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
/**
 * Normaliza "YYYY-MM-DD...", "DD/MM/YYYY" y "DD-MM-YYYY" a "YYYY-MM-DD". "" si no se puede.
 * OJO: en la base hay contratos con la fecha de baja guardada como el STRING "null" (no el valor
 * null), así que hay que tratarla explícitamente como vacía: un `if (!baja)` la daría por válida.
 */
export function fechaISO(valor) {
    if (!valor)
        return "";
    const texto = String(valor).trim();
    if (!texto || ["null", "undefined", "-", "—"].includes(texto.toLowerCase()))
        return "";
    if (/^\d{4}-\d{2}-\d{2}/.test(texto))
        return texto.substring(0, 10);
    const partes = texto.split(/[-/]/);
    if (partes.length === 3 && partes[2].length === 4) {
        return `${partes[2]}-${partes[1].padStart(2, "0")}-${partes[0].padStart(2, "0")}`;
    }
    return "";
}
/** Vigente = sin fecha de baja (tiempo indeterminado) o con baja de hoy en adelante. */
export function esContratoVigente(contrato, hoy = hoyArgentina()) {
    if (!contrato)
        return false;
    const baja = fechaISO(contrato.fecha_baja_contrato);
    return !baja || baja >= hoy;
}
/** Igual que `esContratoVigente`, recibiendo solo la fecha de baja. */
export function esFechaBajaVigente(fechaBaja, hoy = hoyArgentina()) {
    const baja = fechaISO(fechaBaja);
    return !baja || baja >= hoy;
}
/** Un contrato es de tiempo indeterminado cuando no tiene fecha de baja: no vence. */
export function esTiempoIndeterminado(contrato) {
    return !!contrato && !fechaISO(contrato.fecha_baja_contrato);
}
/**
 * Contrato que representa la situación actual, por orden de prioridad:
 *
 *  1. TIEMPO INDETERMINADO: si tiene uno (sin fecha de baja) ese es el que rige, aunque después
 *     figuren cargados contratos a plazo. Un contrato sin fecha de fin sigue abierto.
 *  2. Si no hay indeterminado, el vigente de alta más reciente.
 *  3. Si no hay ninguno vigente, el último cargado (para seguir mostrando el histórico).
 */
export function getContratoActivo(contratos, hoy = hoyArgentina()) {
    if (!Array.isArray(contratos) || contratos.length === 0)
        return null;
    // A igual fecha de alta (o sin fecha) gana el último cargado, por eso el >=.
    const masReciente = (lista) => lista.reduce((mejor, actual) => (fechaISO(actual.fecha_alta_contrato) >= fechaISO(mejor.fecha_alta_contrato) ? actual : mejor));
    const indeterminados = contratos.filter((c) => esTiempoIndeterminado(c));
    if (indeterminados.length > 0)
        return masReciente(indeterminados);
    const vigentes = contratos.filter((c) => esContratoVigente(c, hoy));
    if (vigentes.length > 0)
        return masReciente(vigentes);
    return contratos[contratos.length - 1];
}
