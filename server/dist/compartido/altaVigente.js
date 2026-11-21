/**
 * ═══════════════════════════════════════════════════════════════════════
 * ¿UN ALTA DE ARCA QUE YA TIENE OBLIGA A CONTRATAR POR SERVICIOS? (21/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Antes: cualquier contrato de ARCA que se cruzara con las fechas dejaba sólo Servicios. Un indeterminado
 * lo justifica, pero una jornada —o un plazo fijo que termina mañana— también trababa darle hoy otra
 * jornada. Ahora decide la MODALIDAD DE LIQUIDACIÓN del alta que ya tiene, y la empleadora:
 *
 *   Alta existente que se cruza          misma empleadora (CUIT)        otra empleadora
 *   ─────────────────────────────────    ───────────────────────────    ──────────────────
 *   MENSUAL (liquidación ≠ 8, o sin dato) sólo Servicios                 sólo Servicios
 *   JORNAL  (liquidación 8)               no otra alta esos días (*)     se puede (pluriempleo)
 *
 *   (*) ARCA admite UNA alta activa por persona y empleadora: con esa empresa, Servicios, otras fechas u
 *       otra empleadora.
 *
 * La modalidad de contrato no sirve para distinguir: la Jornada usa 022 (tiempo completo determinado),
 * la misma que un plazo fijo mensual. Lo que cambia es que se liquida por jornal.
 *
 * El dato del alta existente sale, en este orden, de la relación en ARCA (el espejo de Relaciones
 * Laborales: es la verdad) y del tipo de contrato (su código, con la cascada). Sin dato, MENSUAL: el lado
 * prudente, que es la regla de antes.
 *
 * Puro: las fechas ya vienen filtradas (lo que se cruza lo decide `contratoEnLasFechas`).
 */
/** Código de ARCA de la modalidad de liquidación «Jornal» (posición 73 del registro de alta). */
export const CODIGO_LIQUIDACION_JORNAL = "8";
/** Del código del tipo de contrato (ya resuelto con la cascada). Sin código, `null`: no se sabe. */
export function liquidacionDeCodigo(codigo) {
    const c = String(codigo ?? "").replace(/\D/g, "");
    if (!c)
        return null;
    return String(Number(c)) === CODIGO_LIQUIDACION_JORNAL ? "jornal" : "mensual";
}
/** Del texto del espejo de ARCA («MES», «JORNAL», «8 - Jornal»…). Vacío, `null`. */
export function liquidacionDeTextoArca(texto) {
    const t = String(texto ?? "").trim();
    if (!t)
        return null;
    if (/^0*8(\D|$)/.test(t) || /jornal|jornada/i.test(t))
        return "jornal";
    return "mensual";
}
/** ARCA primero; si no, el tipo; si ninguno dice nada, mensual. */
export function liquidacionDelAlta(deArca, delTipo) {
    const a = liquidacionDeTextoArca(deArca);
    if (a)
        return { liquidacion: a, origen: "arca" };
    const t = liquidacionDeCodigo(delTipo);
    if (t)
        return { liquidacion: t, origen: "tipo" };
    return { liquidacion: "mensual", origen: "sin_dato" };
}
/**
 * Qué impide un alta de ARCA nueva, dadas las altas de ARCA que ya tiene EN ESAS FECHAS. `empresaId`: la
 * empresa del contrato nuevo; sin ella no se puede saber si es la misma empleadora y esa parte no frena
 * (la vuelve a mirar quien la sepa: la aprobación).
 */
export function decidirAltaVigente(altasEnFechas, empresaId) {
    const soloServicios = altasEnFechas.find((a) => a.liquidacion === "mensual") || null;
    const empresa = String(empresaId || "");
    const mismaEmpleadora = empresa ? altasEnFechas.find((a) => a.liquidacion === "jornal" && String(a.empresaId || "") === empresa) || null : null;
    return { soloServicios, mismaEmpleadora };
}
const corta = (f) => {
    const [y, m, d] = (f || "").split("-");
    return y && m && d ? `${d}/${m}/${y}` : "—";
};
const periodo = (a) => a.hasta ? `del ${corta(a.desde)} al ${corta(a.hasta)}${a.bajaSegunArca ? " (baja según ARCA)" : ""}` : `desde el ${corta(a.desde)}, sin fecha de baja`;
/** El mensaje de «sólo Servicios», igual en el formulario y en el rechazo del server. */
export function mensajeSoloServicios(a) {
    return `Tiene un contrato de ARCA mensual en esas fechas (${a.proyectoNombre || "otro proyecto"}, ${periodo(a)}): sólo se puede contratar con un tipo de contrato de Servicios.`;
}
/** El mensaje de «misma empleadora». */
export function mensajeMismaEmpleadora(a) {
    return `Ya tiene un alta por jornada con ${a.empresaNombre || "esa empresa"} en esas fechas (${a.proyectoNombre || "otro proyecto"}, ${periodo(a)}): ARCA admite una sola alta activa por empleadora. Elegí otras fechas, otra empresa o un tipo de contrato de Servicios.`;
}
/** El aviso cuando todavía no hay fechas (el puesto de un equipo): no recorta, avisa qué va a pasar. */
export function avisoSinFechas(a) {
    const hasta = a.hasta ? `hasta el ${corta(a.hasta)}` : "sin fecha de baja";
    return a.liquidacion === "mensual"
        ? `Tiene un alta mensual de ARCA (${a.proyectoNombre || "otro proyecto"}, ${hasta}): si las fechas la pisan, sólo se va a poder contratar por Servicios.`
        : `Tiene un alta por jornada de ARCA (${a.proyectoNombre || "otro proyecto"}, ${hasta}): si las fechas la pisan, con esa misma empresa sólo por Servicios.`;
}
