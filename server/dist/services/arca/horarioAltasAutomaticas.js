/**
 * EL HORARIO DE LAS ALTAS AUTOMÁTICAS, puro (sin base): cuándo corre y qué altas toma cada corrida.
 *
 * Se configura por tenant (Configuración → ARCA → Altas Automáticas):
 *   · `hora` y `minuto`: a qué hora argentina corre, todos los días.
 *   · `diasAntes`: con cuánta anticipación. 0 = el mismo día del alta; 2 = hasta dos días antes.
 *
 * CON ANTICIPACIÓN SE TOMA UNA VENTANA, NO UN SOLO DÍA. Con `diasAntes = 2` la corrida de hoy presenta
 * las altas que empiezan hoy, mañana o pasado. Si fuera «exactamente dos días antes», un contrato
 * cargado ayer para mañana ya habría perdido su turno y no saldría nunca. Con la ventana, cada alta
 * sale en la primera corrida que la alcanza.
 *
 * LAS ATRASADAS TAMBIÉN ENTRAN (pedido del 11/10/2026). Un alta cuya fecha ya pasó —porque la corrida
 * falló, o porque el contrato se cargó después de su fecha de inicio— no queda para subir a mano: entra
 * en la corrida siguiente, y en todas las que vengan, hasta que se presente. El límite es
 * `DIAS_ATRAS_PENDIENTES`: más viejas que eso ya no se presentan solas (y se fuerzan a mano).
 *
 * Argentina no tiene horario de verano: el desfase es siempre -03:00.
 */
export const CONFIG_POR_DEFECTO = { hora: 14, minuto: 0, diasAntes: 0 };
export const MAX_DIAS_ANTES = 30;
/** Hasta cuántos días atrás la corrida sigue tomando un alta pendiente cuya fecha ya pasó. */
export const DIAS_ATRAS_PENDIENTES = 30;
/**
 * UN CONTRATO QUE YA TERMINÓ NO SE DA DE ALTA (pedido del 11/10/2026): si la fecha de baja es anterior
 * a hoy, la relación laboral ya pasó entera y presentar el alta no tiene sentido. Queda fuera de la
 * automática y a la vista con ese motivo. Sin baja (relación abierta) no aplica.
 */
export const yaTermino = (fechaBaja, hoy) => /^\d{4}-\d{2}-\d{2}$/.test(fechaBaja) && fechaBaja < hoy;
const entero = (v, min, max, porDefecto) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
};
/** Lo guardado (que puede faltar o venir viejo) a una configuración completa y válida. */
export const configDe = (guardado) => ({
    hora: entero(guardado?.hora, 0, 23, CONFIG_POR_DEFECTO.hora),
    minuto: entero(guardado?.minuto, 0, 59, CONFIG_POR_DEFECTO.minuto),
    diasAntes: entero(guardado?.diasAntes, 0, MAX_DIAS_ANTES, CONFIG_POR_DEFECTO.diasAntes),
});
/** Lo que manda el cliente al guardar: cada campo se valida; el que falta no se toca. */
export function validarConfig(body) {
    const cambios = {};
    if (body?.hora !== undefined) {
        const n = Number(body.hora);
        if (!Number.isInteger(n) || n < 0 || n > 23)
            return { ok: false, error: "La hora tiene que ser un entero entre 0 y 23." };
        cambios.hora = n;
    }
    if (body?.minuto !== undefined) {
        const n = Number(body.minuto);
        if (!Number.isInteger(n) || n < 0 || n > 59)
            return { ok: false, error: "Los minutos tienen que ser un entero entre 0 y 59." };
        cambios.minuto = n;
    }
    if (body?.diasAntes !== undefined) {
        const n = Number(body.diasAntes);
        if (!Number.isInteger(n) || n < 0 || n > MAX_DIAS_ANTES)
            return { ok: false, error: `Los días de anticipación tienen que ser un entero entre 0 y ${MAX_DIAS_ANTES}.` };
        cambios.diasAntes = n;
    }
    return { ok: true, cambios };
}
export const horaTexto = (cfg) => `${String(cfg.hora).padStart(2, "0")}:${String(cfg.minuto).padStart(2, "0")}`;
/** "YYYY-MM-DD" ± n días. */
export const sumarDias = (iso, n) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};
/** La corrida de ese día, en hora argentina. */
export const momentoDeCorrida = (fecha, cfg) => new Date(`${fecha}T${horaTexto(cfg)}:00-03:00`);
/** Minutos desde la medianoche argentina (0-1439), sin depender de la zona del servidor. */
export const minutosArgentina = (d = new Date()) => {
    const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
    const hora = Number(partes.find((p) => p.type === "hour")?.value || 0) % 24;
    const minuto = Number(partes.find((p) => p.type === "minute")?.value || 0);
    return hora * 60 + minuto;
};
/** ¿Ya pasó la hora de la corrida de hoy? */
export const yaPasoLaHora = (cfg, d = new Date()) => minutosArgentina(d) >= cfg.hora * 60 + cfg.minuto;
/** Qué fechas de alta toma la corrida de `hoy`: las atrasadas (hasta `DIAS_ATRAS_PENDIENTES`) y hasta `diasAntes` días adelante. */
export const ventanaDeLaCorrida = (hoy, cfg) => ({ desde: sumarDias(hoy, -DIAS_ATRAS_PENDIENTES), hasta: sumarDias(hoy, cfg.diasAntes) });
/**
 * La PRÓXIMA corrida que presentaría un alta con esa fecha: la de hoy si todavía no corrió, si no la de
 * mañana; nunca antes de `fechaAlta - diasAntes`. Null sólo si el alta es más vieja que
 * `DIAS_ATRAS_PENDIENTES`: ahí la automática ya no la toma y se fuerza a mano.
 */
export function proximaCorridaPara(fechaAlta, cfg, ahora, hoy) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAlta))
        return null;
    if (fechaAlta < sumarDias(hoy, -DIAS_ATRAS_PENDIENTES))
        return null;
    // La próxima corrida en el tiempo: la de hoy si su hora no pasó, si no la de mañana.
    const proxima = momentoDeCorrida(hoy, cfg).getTime() > ahora.getTime() ? hoy : sumarDias(hoy, 1);
    const primerDia = sumarDias(fechaAlta, -cfg.diasAntes);
    return momentoDeCorrida(proxima > primerDia ? proxima : primerDia, cfg);
}
