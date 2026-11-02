/**
 * HASTA CUÁNDO UN ALTA PRESENTADA TRABA A LA PERSONA (pedido del 02/11/2026: «que no se superpongan los
 * días»). Puro, compartido: lo usan el servidor (`secuenciaPorPersona.ts`, que decide si la próxima alta
 * puede salir) y la pantalla (el aviso de «Forzar alta»), para que digan exactamente lo mismo.
 *
 * LA REGLA DE ARCA: una persona tiene UNA relación activa por vez con cada empleadora, y activa = sin la
 * baja procesada. ARCA procesa el vencimiento la noche del último día, así que un alta presentada queda
 * vigente hasta el mayor entre su baja y el día en que se presentó, y la siguiente alta de esa persona con
 * esa empleadora recién se puede presentar desde las 00:00 del día siguiente. Sin baja (tiempo
 * indeterminado) no se libera sola: alguien tiene que informar la baja.
 *
 * Ejemplo del pedido: un alta del 01/12 forzada el 01/11 queda vigente hasta el 01/12, y hasta el 02/12 a
 * las 00:00 no se puede presentar ninguna otra alta de esa persona con esa empleadora.
 */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** "YYYY-MM-DD" + n días, sin husos horarios. */
export function sumarDiasIso(iso, n) {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return t.toISOString().slice(0, 10);
}
/** El último día en que el alta sigue vigente para ARCA; "" si no tiene baja (queda abierta). */
export function venceAltaPresentada(baja, diaPresentada) {
    if (!ISO.test(baja || ""))
        return "";
    return ISO.test(diaPresentada || "") && diaPresentada > baja ? diaPresentada : baja;
}
/** Desde qué día (a las 00:00) se puede presentar otra alta de la persona con esa empleadora; "" si no se libera sola. */
export const libreDesdeTrasAlta = (baja, diaPresentada) => {
    const vence = venceAltaPresentada(baja, diaPresentada);
    return vence ? sumarDiasIso(vence, 1) : "";
};
const fecha = (iso) => (ISO.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);
/**
 * EL AVISO DE «FORZAR ALTA»: que es inmediato y qué traba. `otras` son las demás altas PENDIENTES de esa
 * persona con esa empleadora: las que empiezan antes de que ésta se libere no van a poder salir hasta
 * entonces, y las que empezaban antes van a salir atrasadas.
 */
export function avisoForzarAlta(o) {
    const { alta, hoy } = o;
    const libreDesde = libreDesdeTrasAlta(alta.baja, hoy);
    const parrafos = [`Se presenta YA en ARCA, a nombre de ${o.empresa || "su empleadora"}: no espera a la corrida automática y no se deshace.`];
    if (ISO.test(alta.alta) && alta.alta > hoy)
        parrafos.push(`Su alta es el ${fecha(alta.alta)}: ARCA la registra hoy, con esa fecha.`);
    parrafos.push(libreDesde
        ? `Mientras esté vigente, ARCA no acepta otra alta de ${o.nombre} con esta empleadora: hasta el ${fecha(libreDesde)} a las 00:00 no se va a poder presentar ninguna.`
        : `Es por tiempo indeterminado: hasta que se informe su baja no se va a poder presentar ninguna otra alta de ${o.nombre} con esta empleadora.`);
    const trabadas = o.otras
        .filter((x) => ISO.test(x.alta) && (!libreDesde || x.alta < libreDesde))
        .sort((a, b) => a.alta.localeCompare(b.alta))
        .map((x) => ({ ...x, atrasada: x.alta < (libreDesde || "9999-12-31") }));
    if (trabadas.length > 0) {
        const lista = trabadas.map((x) => `${fecha(x.alta)}${x.tipoContrato ? ` (${x.tipoContrato})` : ""}`).join(", ");
        parrafos.push(`Tiene ${trabadas.length === 1 ? "otra alta pendiente que queda trabada" : `${trabadas.length} altas pendientes que quedan trabadas`}: ${lista}. ${trabadas.length === 1 ? "Va a salir" : "Van a salir"} ${libreDesde ? `recién desde el ${fecha(libreDesde)}, con su fecha ya pasada (atrasadas)` : "recién cuando se informe la baja de ésta"}.`);
    }
    return { titulo: `Forzar el alta de ${o.nombre}`, parrafos, trabadas, libreDesde };
}
