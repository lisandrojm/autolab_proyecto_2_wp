import { diasEntre, esISO, sumarDias } from "./planVacaciones/fechas.js";
/** Apagada por defecto: quien no la configuró sigue pidiendo vacaciones en cualquier fecha, como siempre. */
export const VENTANA_POR_DEFECTO = { enabled: false, inicio: "11-01", fin: "04-30" };
export const SIN_VENTANA = { enabled: false, tramos: [] };
/** Febrero con 29: la ventana no tiene año, así que el 29/2 es una fecha posible. */
const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** ¿Es un "MM-DD" que existe? (mes 1–12 y un día que ese mes tiene) */
export function esMesDia(v) {
    if (typeof v !== "string" || !/^\d{2}-\d{2}$/.test(v))
        return false;
    const mes = Number(v.slice(0, 2));
    const dia = Number(v.slice(3, 5));
    return mes >= 1 && mes <= 12 && dia >= 1 && dia <= DIAS_POR_MES[mes - 1];
}
/** Cuántos días tiene el mes (1–12) para elegir en un selector sin año. */
export const diasDelMesSinAnio = (mes) => DIAS_POR_MES[mes - 1] || 31;
const enTramo = (mesDia, inicio, fin) => (inicio <= fin ? mesDia >= inicio && mesDia <= fin : mesDia >= inicio || mesDia <= fin);
/** ¿La fecha "YYYY-MM-DD" cae dentro de la ventana `inicio`–`fin` ("MM-DD")? */
export function dentroDeVentana(fecha, inicio, fin) {
    if (!esISO(fecha) || !esMesDia(inicio) || !esMesDia(fin))
        return false;
    return enTramo(fecha.slice(5), inicio, fin);
}
/** ¿TODOS los días del rango caen dentro de la ventana? `false` si el rango está dado vuelta o no es válido. */
export function rangoDentroDeVentana(desde, hasta, inicio, fin) {
    return rangoPermitido(desde, hasta, { enabled: true, tramos: [{ inicio, fin }] });
}
/** ¿Se puede tomar ese día? Sin ventana (apagada), cualquiera. */
export function fechaPermitida(fecha, ventana) {
    if (!ventana || !ventana.enabled)
        return true;
    return ventana.tramos.some((t) => dentroDeVentana(fecha, t.inicio, t.fin));
}
/** ¿Se puede tomar el rango entero? Sin ventana (apagada), cualquiera. */
export function rangoPermitido(desde, hasta, ventana) {
    if (!ventana || !ventana.enabled)
        return true;
    const dias = diasEntre(desde, hasta);
    if (dias <= 0)
        return false;
    // Con 366 días seguidos ya pasaron todos los "MM-DD" que existen: un rango más largo no agrega nada.
    const aRecorrer = Math.min(dias, 366);
    for (let i = 0; i < aRecorrer; i++)
        if (!fechaPermitida(sumarDias(desde, i), ventana))
            return false;
    return true;
}
/** Lee una ventana guardada tolerando lo que falte o venga mal: cada dato inválido cae al de `base`. */
export function normalizarVentana(v, base = VENTANA_POR_DEFECTO) {
    const o = (v || {});
    return { enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled, inicio: esMesDia(o.inicio) ? o.inicio : base.inicio, fin: esMesDia(o.fin) ? o.fin : base.fin };
}
/**
 * La ventana de un proyecto o un área. Usa la global salvo que la entidad tenga configuración propia
 * (`useGlobalConfig === false`); y aun así, lo que la entidad no definió sale de la global: los
 * proyectos que ya tenían configuración propia por el fraccionamiento no cambian de ventana solos.
 */
export function ventanaDeEntidad(config, global) {
    if (!config || config.useGlobalConfig !== false)
        return global;
    return {
        enabled: typeof config.ventanaGoceEnabled === "boolean" ? config.ventanaGoceEnabled : global.enabled,
        inicio: esMesDia(config.ventanaGoceInicio) ? config.ventanaGoceInicio : global.inicio,
        fin: esMesDia(config.ventanaGoceFin) ? config.ventanaGoceFin : global.fin,
    };
}
/** Todos los "MM-DD" del año, en orden (366: con el 29/2). */
const CALENDARIO = DIAS_POR_MES.flatMap((dias, m) => Array.from({ length: dias }, (_x, d) => `${String(m + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`));
/**
 * LA MÁS FLEXIBLE ENTRE VARIAS (la regla de siempre para quien está en más de un proyecto): si ALGUNA
 * está apagada, no hay ventana; si todas la tienen, vale la UNIÓN. Con ventanas que se tocan, la unión
 * es un solo tramo —el inicio más temprano y el fin más tardío—; con ventanas separadas (una de verano
 * y otra de invierno) quedan los dos tramos, en vez de un tramo grande que habilitaría los meses del
 * medio que ningún proyecto permite.
 */
export function unirVentanas(ventanas) {
    if (ventanas.length === 0 || ventanas.some((v) => !v.enabled))
        return SIN_VENTANA;
    const adentro = CALENDARIO.map((md) => ventanas.some((v) => enTramo(md, v.inicio, v.fin)));
    const n = CALENDARIO.length;
    if (adentro.every(Boolean))
        return { enabled: true, tramos: [{ inicio: "01-01", fin: "12-31" }] };
    const tramos = [];
    for (let i = 0; i < n; i++) {
        // Un tramo empieza donde el día está adentro y el anterior (dando la vuelta al año) no.
        if (!adentro[i] || adentro[(i - 1 + n) % n])
            continue;
        let j = i;
        while (adentro[(j + 1) % n])
            j = (j + 1) % n;
        tramos.push({ inicio: CALENDARIO[i], fin: CALENDARIO[j] });
    }
    return { enabled: true, tramos: tramos.sort((a, b) => a.inicio.localeCompare(b.inicio)) };
}
/**
 * LA VENTANA QUE RIGE PARA UNA PERSONA. Misma jerarquía que el resto de las reglas de vacaciones:
 * el Área con configuración propia manda; si no, sus Proyectos (la más flexible entre todos, cada uno
 * con la suya o la global); sin proyectos, la global.
 */
export function ventanaEfectiva(o) {
    if (o.area && o.area.useGlobalConfig === false)
        return unirVentanas([ventanaDeEntidad(o.area, o.global)]);
    if (o.proyectos && o.proyectos.length > 0)
        return unirVentanas(o.proyectos.map((p) => ventanaDeEntidad(p, o.global)));
    return unirVentanas([o.global]);
}
/** "MM-DD" → «1/11» (sin ceros, como se dice). */
export const mesDiaCorto = (mesDia) => (esMesDia(mesDia) ? `${Number(mesDia.slice(3, 5))}/${Number(mesDia.slice(0, 2))}` : mesDia || "—");
/** «1/11 – 30/4», para el chip «Efectivo:». «Sin ventana» si está apagada. */
export function resumenDeVentana(ventana) {
    if (!ventana || !ventana.enabled || ventana.tramos.length === 0)
        return "Sin ventana";
    return ventana.tramos.map((t) => `${mesDiaCorto(t.inicio)} – ${mesDiaCorto(t.fin)}`).join(" y ");
}
/** «entre el 1/11 y el 30/4», para armar las frases. Vacío si está apagada. */
export function textoDeVentana(ventana) {
    if (!ventana || !ventana.enabled || ventana.tramos.length === 0)
        return "";
    return ventana.tramos.map((t) => `entre el ${mesDiaCorto(t.inicio)} y el ${mesDiaCorto(t.fin)}`).join(" o ");
}
/** Qué tiene de malo una ventana que se quiere guardar; `null` si está bien. */
export function errorDeVentana(v) {
    if (!v || typeof v !== "object")
        return "La ventana de goce no es válida.";
    const o = v;
    if (typeof o.enabled !== "boolean")
        return "Falta indicar si la ventana de goce está habilitada.";
    if (!esMesDia(o.inicio))
        return "El inicio de la ventana de goce tiene que ser un día y mes que exista (MM-DD).";
    if (!esMesDia(o.fin))
        return "El fin de la ventana de goce tiene que ser un día y mes que exista (MM-DD).";
    return null;
}
/*
  EL PLAN DE VACACIONES Y LA VENTANA ANUAL ESTÁN ATADOS (11/11/2026): la temporada de un plan
  (`ventanaDesde`–`ventanaHasta`, con año) es la ventana anual de su proyecto («MM-DD», sin año) puesta
  en un año. Cambiar una cambia la otra; la cuenta de ida y vuelta vive acá.
*/
/** La ventana («MM-DD») que dice la temporada de un plan. */
export const ventanaDeTemporada = (desde, hasta) => ({ inicio: desde.slice(5, 10), fin: hasta.slice(5, 10) });
const esBisiesto = (anio) => (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
/** «MM-DD» en un año; el 29/2 de un año que no lo tiene cae en el 28. */
const enAnio = (anio, mesDia) => `${anio}-${mesDia === "02-29" && !esBisiesto(anio) ? "02-28" : mesDia}`;
/**
 * La temporada de un plan con la ventana nueva, en el MISMO año en que empieza la de ahora. Si la
 * ventana envuelve el 1/1 (1/11 → 30/4), el fin cae en el año siguiente.
 */
export function temporadaConVentana(desdeActual, tramo) {
    const anio = Number(desdeActual.slice(0, 4));
    return { desde: enAnio(anio, tramo.inicio), hasta: enAnio(tramo.inicio <= tramo.fin ? anio : anio + 1, tramo.fin) };
}
