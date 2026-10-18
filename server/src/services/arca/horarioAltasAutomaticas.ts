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

export interface ConfigAltasAutomaticas {
  hora: number;
  minuto: number;
  diasAntes: number;
}

export const CONFIG_POR_DEFECTO: ConfigAltasAutomaticas = { hora: 14, minuto: 0, diasAntes: 0 };
export const MAX_DIAS_ANTES = 30;
/** Hasta cuántos días atrás la corrida sigue tomando un alta pendiente cuya fecha ya pasó. */
export const DIAS_ATRAS_PENDIENTES = 30;

/**
 * UN CONTRATO QUE YA TERMINÓ NO SE DA DE ALTA (pedido del 11/10/2026): si la fecha de baja es anterior
 * a hoy, la relación laboral ya pasó entera y presentar el alta no tiene sentido. Queda fuera de la
 * automática y a la vista con ese motivo. Sin baja (relación abierta) no aplica.
 */
export const yaTermino = (fechaBaja: string, hoy: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(fechaBaja) && fechaBaja < hoy;

const entero = (v: unknown, min: number, max: number, porDefecto: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
};

/** Lo guardado (que puede faltar o venir viejo) a una configuración completa y válida. */
export const configDe = (guardado: any): ConfigAltasAutomaticas => ({
  hora: entero(guardado?.hora, 0, 23, CONFIG_POR_DEFECTO.hora),
  minuto: entero(guardado?.minuto, 0, 59, CONFIG_POR_DEFECTO.minuto),
  diasAntes: entero(guardado?.diasAntes, 0, MAX_DIAS_ANTES, CONFIG_POR_DEFECTO.diasAntes),
});

/** Lo que manda el cliente al guardar: cada campo se valida; el que falta no se toca. */
export function validarConfig(body: any): { ok: true; cambios: Partial<ConfigAltasAutomaticas> } | { ok: false; error: string } {
  const cambios: Partial<ConfigAltasAutomaticas> = {};
  if (body?.hora !== undefined) {
    const n = Number(body.hora);
    if (!Number.isInteger(n) || n < 0 || n > 23) return { ok: false, error: "La hora tiene que ser un entero entre 0 y 23." };
    cambios.hora = n;
  }
  if (body?.minuto !== undefined) {
    const n = Number(body.minuto);
    if (!Number.isInteger(n) || n < 0 || n > 59) return { ok: false, error: "Los minutos tienen que ser un entero entre 0 y 59." };
    cambios.minuto = n;
  }
  if (body?.diasAntes !== undefined) {
    const n = Number(body.diasAntes);
    if (!Number.isInteger(n) || n < 0 || n > MAX_DIAS_ANTES) return { ok: false, error: `Los días de anticipación tienen que ser un entero entre 0 y ${MAX_DIAS_ANTES}.` };
    cambios.diasAntes = n;
  }
  return { ok: true, cambios };
}

export const horaTexto = (cfg: ConfigAltasAutomaticas): string => `${String(cfg.hora).padStart(2, "0")}:${String(cfg.minuto).padStart(2, "0")}`;

/** "YYYY-MM-DD" ± n días. */
export const sumarDias = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** La corrida de ese día, en hora argentina. */
export const momentoDeCorrida = (fecha: string, cfg: ConfigAltasAutomaticas): Date => new Date(`${fecha}T${horaTexto(cfg)}:00-03:00`);

/** Minutos desde la medianoche argentina (0-1439), sin depender de la zona del servidor. */
export const minutosArgentina = (d: Date = new Date()): number => {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const hora = Number(partes.find((p) => p.type === "hour")?.value || 0) % 24;
  const minuto = Number(partes.find((p) => p.type === "minute")?.value || 0);
  return hora * 60 + minuto;
};

/** ¿Ya pasó la hora de la corrida de hoy? */
export const yaPasoLaHora = (cfg: ConfigAltasAutomaticas, d: Date = new Date()): boolean => minutosArgentina(d) >= cfg.hora * 60 + cfg.minuto;

/** Qué fechas de alta toma la corrida de `hoy`: las atrasadas (hasta `DIAS_ATRAS_PENDIENTES`) y hasta `diasAntes` días adelante. */
export const ventanaDeLaCorrida = (hoy: string, cfg: ConfigAltasAutomaticas): { desde: string; hasta: string } => ({ desde: sumarDias(hoy, -DIAS_ATRAS_PENDIENTES), hasta: sumarDias(hoy, cfg.diasAntes) });

/**
 * La PRÓXIMA corrida que presentaría un alta con esa fecha: la de hoy si todavía no corrió, si no la de
 * mañana; nunca antes de `fechaAlta - diasAntes`. Null sólo si el alta es más vieja que
 * `DIAS_ATRAS_PENDIENTES`: ahí la automática ya no la toma y se fuerza a mano.
 */
/**
 * CUÁNTAS VECES INSISTE LA AUTOMÁTICA CON UNA RECHAZADA (pedido del 18/10/2026). Una rechazada vuelve a
 * entrar en la corrida del día siguiente —el dato pudo corregirse, o ARCA pudo fallar—, pero no para
 * siempre: al tercer rechazo deja de presentarse sola y queda marcada para que alguien la revise o la
 * fuerce. Cuentan sólo los rechazos de corridas automáticas: forzarla a mano no gasta intentos. Los
 * rechazos definitivos del padrón (`rechazoDefinitivo.ts`) no llegan ni al segundo intento.
 */
export const MAX_INTENTOS_AUTOMATICOS = 3;
export const agotoLosIntentos = (intentos: unknown): boolean => Number(intentos || 0) >= MAX_INTENTOS_AUTOMATICOS;

/** Lo que mira la corrida de un candidato para decidir si entra solo o queda omitido con un motivo. */
export interface CandidatoParaCorrida {
  presentable: boolean;
  terminado: boolean;
  rechazoDefinitivo: string;
  agotado: boolean;
  intentos: number;
  /** ISO del primer rechazo de la automática; vacío si no hubo. */
  primerIntentoEl: string;
  motivo: string;
}

/** Entra solo en la corrida: completo, con la relación todavía en curso, y sin un rechazo que no vale la pena repetir. */
export const entraEnLaCorrida = (c: CandidatoParaCorrida): boolean => c.presentable && !c.terminado && !c.rechazoDefinitivo && !c.agotado;

/**
 * Por qué NO entró, para la lista «Sin presentar» de la corrida. `null` = no se lista: los terminados
 * (baja pasada) no son «sin presentar» de esta corrida y ya se ven aparte en la pantalla.
 */
export function motivoDeOmision(c: CandidatoParaCorrida): string | null {
  if (c.terminado) return null;
  if (c.rechazoDefinitivo) return `ARCA ya lo rechazó: ${c.rechazoDefinitivo} No se vuelve a presentar solo; revisalo o forzalo.`;
  if (c.agotado) {
    const desde = /^\d{4}-\d{2}-\d{2}/.test(c.primerIntentoEl) ? ` (la primera vez el ${c.primerIntentoEl.slice(8, 10)}/${c.primerIntentoEl.slice(5, 7)})` : "";
    return `ARCA la rechazó ${c.intentos} veces${desde}: la automática no insiste más; revisala o forzala.`;
  }
  if (!c.presentable) return c.motivo;
  return null;
}

export function proximaCorridaPara(fechaAlta: string, cfg: ConfigAltasAutomaticas, ahora: Date, hoy: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAlta)) return null;
  if (fechaAlta < sumarDias(hoy, -DIAS_ATRAS_PENDIENTES)) return null;
  // La próxima corrida en el tiempo: la de hoy si su hora no pasó, si no la de mañana.
  const proxima = momentoDeCorrida(hoy, cfg).getTime() > ahora.getTime() ? hoy : sumarDias(hoy, 1);
  const primerDia = sumarDias(fechaAlta, -cfg.diasAntes);
  return momentoDeCorrida(proxima > primerDia ? proxima : primerDia, cfg);
}
