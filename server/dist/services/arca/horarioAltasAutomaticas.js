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
 * sale en la primera corrida que la alcanza, y a más tardar en la de su propio día.
 *
 * Argentina no tiene horario de verano: el desfase es siempre -03:00.
 */
export const CONFIG_POR_DEFECTO = { hora: 14, minuto: 0, diasAntes: 0 };
export const MAX_DIAS_ANTES = 30;
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
/** Qué fechas de alta toma la corrida de `hoy`: desde hoy hasta `diasAntes` días adelante. */
export const ventanaDeLaCorrida = (hoy, cfg) => ({ desde: hoy, hasta: sumarDias(hoy, cfg.diasAntes) });
/**
 * La PRÓXIMA corrida que presentaría un alta con esa fecha, o null si ya no hay ninguna (su día pasó,
 * o es hoy y la hora ya pasó): entonces queda «sin presentar» y se fuerza a mano.
 *
 * La primera corrida que la alcanza es la de `fechaAlta - diasAntes`, o la de hoy si esa ya pasó; si
 * la de ese día ya corrió y todavía no es el día del alta, la siguiente.
 */
export function proximaCorridaPara(fechaAlta, cfg, ahora, hoy) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAlta) || fechaAlta < hoy)
        return null;
    let dia = sumarDias(fechaAlta, -cfg.diasAntes);
    if (dia < hoy)
        dia = hoy;
    let m = momentoDeCorrida(dia, cfg);
    if (m.getTime() <= ahora.getTime()) {
        if (dia >= fechaAlta)
            return null;
        dia = sumarDias(dia, 1);
        m = momentoDeCorrida(dia, cfg);
    }
    return m;
}
