/**
 * FECHAS DEL PLAN DE VACACIONES, puras y en "YYYY-MM-DD" (sin Date de por medio para no depender de la
 * zona horaria del servidor ni del navegador: un bloque «del 1 al 15» es del 1 al 15 en cualquier reloj).
 * Las comparten el server (el plan) y el front (la previsualización del reparto).
 */
export const esISO = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
/** "YYYY-MM-DD" ± n días. */
export function sumarDias(iso, n) {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
/** Días corridos entre dos fechas, ambas incluidas. 0 si `hasta` es anterior a `desde`. */
export function diasEntre(desde, hasta) {
    if (!esISO(desde) || !esISO(hasta) || hasta < desde)
        return 0;
    const a = Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, Number(desde.slice(8, 10)));
    const b = Date.UTC(Number(hasta.slice(0, 4)), Number(hasta.slice(5, 7)) - 1, Number(hasta.slice(8, 10)));
    return Math.round((b - a) / 86_400_000) + 1;
}
/** ¿Dos rangos comparten al menos un día? */
export const sePisan = (a, b) => a.desde <= b.hasta && b.desde <= a.hasta;
/** "YYYY-MM" de una fecha. */
export const mesDe = (iso) => iso.slice(0, 7);
/** Cuántos días tiene el mes "YYYY-MM". */
export function diasDelMes(mes) {
    const y = Number(mes.slice(0, 4));
    const m = Number(mes.slice(5, 7));
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** Primer y último día del mes "YYYY-MM". */
export const rangoDelMes = (mes) => ({ desde: `${mes}-01`, hasta: `${mes}-${String(diasDelMes(mes)).padStart(2, "0")}` });
/** Los meses "YYYY-MM" que toca una ventana, en orden. Vacío si la ventana está dada vuelta. */
export function mesesDeVentana(desde, hasta) {
    if (!esISO(desde) || !esISO(hasta) || hasta < desde)
        return [];
    const out = [];
    let y = Number(desde.slice(0, 4));
    let m = Number(desde.slice(5, 7));
    const fin = mesDe(hasta);
    for (let i = 0; i < 240; i++) {
        const mes = `${y}-${String(m).padStart(2, "0")}`;
        out.push(mes);
        if (mes === fin)
            break;
        m++;
        if (m > 12) {
            m = 1;
            y++;
        }
    }
    return out;
}
/** El mes recortado a la ventana (un plan que empieza el 15/12 reparte diciembre del 15 al 31). `null` si no se tocan. */
export function rangoDelMesEnVentana(mes, ventanaDesde, ventanaHasta) {
    const r = rangoDelMes(mes);
    const desde = r.desde < ventanaDesde ? ventanaDesde : r.desde;
    const hasta = r.hasta > ventanaHasta ? ventanaHasta : r.hasta;
    if (hasta < desde)
        return null;
    return { desde, hasta, dias: diasEntre(desde, hasta) };
}
/** "DD/MM/YYYY" para mostrar. */
export const fechaCorta = (iso) => (esISO(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «diciembre 2026» para un "YYYY-MM". */
export const nombreDeMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1] || mes} ${mes.slice(0, 4)}`;
