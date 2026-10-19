/**
 * EL HORARIO DE LAS ALTAS AUTOMÁTICAS, puro (sin base): cuándo corre y qué altas toma cada corrida.
 *
 * Se configura por tenant (Configuración → ARCA → Altas Automáticas):
 *   · `hora` y `minuto`: a qué hora argentina corre la corrida DEL DÍA, todos los días.
 *   · `diasAntes`: con cuánta anticipación. 0 = el mismo día del alta; 2 = hasta dos días antes.
 *   · `modo` (pedido del 19/10/2026):
 *       - "diaria": sólo la corrida del día, una vez por día.
 *       - "frecuente": además, cada `cadaMinutos` corre la COLA: lo que ya tuvo su turno y no salió
 *         (atrasadas, rechazadas, cargadas tarde). La corrida del día sigue siendo a la hora fija.
 *
 * EL TURNO DE UN ALTA es la corrida del día de `fechaAlta - diasAntes`. Antes de su turno no sale; desde
 * su turno, queda en la cola hasta que se presente.
 *
 * LA CORRIDA DEL DÍA PRIORIZA LAS DE ESE DÍA: presenta primero, en corridas propias, las altas cuyo
 * turno es hoy, y recién después la cola de atrasadas. Si algo de la cola falla (un lote rechazado
 * entero, ARCA que no responde), las del día ya salieron. En modo frecuente, una corrida de la cola que
 * está en curso cuando llega la hora del día corta entre lotes para dejarle el paso.
 *
 * NADA QUEDA FUERA DE LA AUTOMÁTICA (pedido del 19/10/2026): ni los contratos ya terminados, ni las
 * altas de más de 30 días, ni las rechazadas varias veces o con un rechazo del padrón. Todas siguen en
 * la cola hasta que se presenten. Lo único que se pide es aire: una rechazada en una corrida no se
 * vuelve a intentar hasta el día siguiente, para no golpear ARCA cada pocos minutos con lo mismo.
 *
 * Argentina no tiene horario de verano: el desfase es siempre -03:00.
 */

export type ModoAltasAutomaticas = "diaria" | "frecuente";

export interface ConfigAltasAutomaticas {
  hora: number;
  minuto: number;
  diasAntes: number;
  modo: ModoAltasAutomaticas;
  /** Modo frecuente: cada cuántos minutos corre la cola. */
  cadaMinutos: number;
}

/** Lo que mira el reloj: la hora de la corrida del día. */
export type HoraDelDia = Pick<ConfigAltasAutomaticas, "hora" | "minuto">;

/** Las frecuencias que ofrece la configuración, en minutos. */
export const FRECUENCIAS_MINUTOS = [15, 30, 60, 120, 180, 240, 360] as const;

export const CONFIG_POR_DEFECTO: ConfigAltasAutomaticas = { hora: 14, minuto: 0, diasAntes: 0, modo: "diaria", cadaMinutos: 60 };
export const MAX_DIAS_ANTES = 30;

/** Un contrato cuya fecha de baja es anterior a hoy: la relación ya pasó entera. Sólo informativo: igual se presenta. */
export const yaTermino = (fechaBaja: string, hoy: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(fechaBaja) && fechaBaja < hoy;

const entero = (v: unknown, min: number, max: number, porDefecto: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
};
const esFrecuencia = (n: number) => (FRECUENCIAS_MINUTOS as readonly number[]).includes(n);

/** Lo guardado (que puede faltar o venir viejo) a una configuración completa y válida. */
export const configDe = (guardado: any): ConfigAltasAutomaticas => ({
  hora: entero(guardado?.hora, 0, 23, CONFIG_POR_DEFECTO.hora),
  minuto: entero(guardado?.minuto, 0, 59, CONFIG_POR_DEFECTO.minuto),
  diasAntes: entero(guardado?.diasAntes, 0, MAX_DIAS_ANTES, CONFIG_POR_DEFECTO.diasAntes),
  modo: guardado?.modo === "frecuente" ? "frecuente" : "diaria",
  cadaMinutos: esFrecuencia(Number(guardado?.cadaMinutos)) ? Number(guardado.cadaMinutos) : CONFIG_POR_DEFECTO.cadaMinutos,
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
  if (body?.modo !== undefined) {
    if (body.modo !== "diaria" && body.modo !== "frecuente") return { ok: false, error: "El modo tiene que ser «diaria» o «frecuente»." };
    cambios.modo = body.modo;
  }
  if (body?.cadaMinutos !== undefined) {
    const n = Number(body.cadaMinutos);
    if (!esFrecuencia(n)) return { ok: false, error: `La frecuencia tiene que ser una de: ${FRECUENCIAS_MINUTOS.join(", ")} minutos.` };
    cambios.cadaMinutos = n;
  }
  return { ok: true, cambios };
}

export const horaTexto = (cfg: HoraDelDia): string => `${String(cfg.hora).padStart(2, "0")}:${String(cfg.minuto).padStart(2, "0")}`;

/** "YYYY-MM-DD" ± n días. */
export const sumarDias = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** La corrida de ese día, en hora argentina. */
export const momentoDeCorrida = (fecha: string, cfg: HoraDelDia): Date => new Date(`${fecha}T${horaTexto(cfg)}:00-03:00`);

/** Minutos desde la medianoche argentina (0-1439), sin depender de la zona del servidor. */
export const minutosArgentina = (d: Date = new Date()): number => {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const hora = Number(partes.find((p) => p.type === "hour")?.value || 0) % 24;
  const minuto = Number(partes.find((p) => p.type === "minute")?.value || 0);
  return hora * 60 + minuto;
};

/** El día argentino ("YYYY-MM-DD") de un instante. */
export const diaArgentina = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(d);

/** ¿Ya pasó la hora de la corrida de hoy? */
export const yaPasoLaHora = (cfg: HoraDelDia, d: Date = new Date()): boolean => minutosArgentina(d) >= cfg.hora * 60 + cfg.minuto;

/** El día del turno de un alta: el de su corrida del día. */
export const diaDelTurno = (fechaAlta: string, cfg: ConfigAltasAutomaticas): string => sumarDias(fechaAlta, -cfg.diasAntes);

/**
 * Hasta qué fecha de alta toma una corrida de `hoy` (sin piso: las atrasadas entran todas).
 *   · La del día: hasta `hoy + diasAntes`.
 *   · La de la cola: sólo lo que ya tuvo su turno. Antes de la hora del día, el turno de hoy todavía no
 *     llegó (lo presenta la corrida del día, con prioridad); después, sí.
 */
export const hastaDeLaCorrida = (hoy: string, cfg: ConfigAltasAutomaticas, tipo: "dia" | "cola", ahora: Date = new Date()): string =>
  sumarDias(hoy, tipo === "dia" || yaPasoLaHora(cfg, ahora) ? cfg.diasAntes : cfg.diasAntes - 1);

/** En la corrida del día, van primero (y aparte) las que todavía no están atrasadas: las de su día. */
export const esDelDia = (fechaAlta: string, hoy: string): boolean => fechaAlta >= hoy;

/**
 * Cuántas veces ARCA ya rechazó un alta en corridas automáticas. Ya no corta nada (pedido del
 * 19/10/2026: todas siguen en la cola); queda para mostrarlo.
 */
export const MAX_INTENTOS_AUTOMATICOS = 3;

/** Lo que mira la corrida de un candidato para decidir si entra o queda omitido con un motivo. */
export interface CandidatoParaCorrida {
  presentable: boolean;
  /** ISO del último rechazo de ARCA; vacío si no está rechazada. */
  rechazadaEl: string;
  motivo: string;
}

/** Rechazada hoy: espera al día siguiente para volver a intentarse. */
export const rechazadaHoy = (c: Pick<CandidatoParaCorrida, "rechazadaEl">, hoy: string): boolean => !!c.rechazadaEl && diaArgentina(new Date(c.rechazadaEl)) === hoy;

/** Entra en la corrida: completo, y sin un rechazo de hoy mismo. */
export const entraEnLaCorrida = (c: CandidatoParaCorrida, hoy: string): boolean => c.presentable && !rechazadaHoy(c, hoy);

/** Por qué NO entró, para la lista «Sin presentar» de la corrida. `null` = entró. */
export function motivoDeOmision(c: CandidatoParaCorrida, hoy: string): string | null {
  if (!c.presentable) return c.motivo || "No se puede presentar.";
  if (rechazadaHoy(c, hoy)) return "ARCA la rechazó hoy: vuelve a intentarse mañana.";
  return null;
}

/** La próxima corrida de la cola (modo frecuente): `cadaMinutos` después de la última, y nunca antes de ahora. */
export const proximaDeLaCola = (cfg: ConfigAltasAutomaticas, ultimaCola: string | undefined, ahora: Date): Date => {
  const ultima = ultimaCola ? Date.parse(ultimaCola) : NaN;
  const t = Number.isFinite(ultima) ? ultima + cfg.cadaMinutos * 60_000 : ahora.getTime();
  return new Date(Math.max(t, ahora.getTime()));
};

/** ¿Le toca correr a la cola? */
export const leTocaALaCola = (cfg: ConfigAltasAutomaticas, ultimaCola: string | undefined, ahora: Date = new Date()): boolean =>
  cfg.modo === "frecuente" && proximaDeLaCola(cfg, ultimaCola, ahora).getTime() <= ahora.getTime();

/**
 * La PRÓXIMA corrida que presentaría un alta con esa fecha. Nunca null: nada queda fuera.
 *   · Antes de su turno: la corrida del día de su turno.
 *   · Desde su turno (en la cola): la próxima corrida que pase, sea la del día o la de la cola.
 *   · Rechazada hoy: la primera de mañana.
 */
export function proximaCorridaPara(
  fechaAlta: string,
  cfg: ConfigAltasAutomaticas,
  ahora: Date,
  hoy: string,
  o: { ultimaCola?: string; rechazadaHoy?: boolean } = {},
): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaAlta)) return null;
  const manana = sumarDias(hoy, 1);
  const delDiaDeManana = momentoDeCorrida(manana, cfg);
  if (o.rechazadaHoy) return cfg.modo === "frecuente" ? new Date(`${manana}T00:00:00-03:00`) : delDiaDeManana;
  const turno = momentoDeCorrida(diaDelTurno(fechaAlta, cfg), cfg);
  if (turno.getTime() > ahora.getTime()) return turno;
  const delDiaDeHoy = momentoDeCorrida(hoy, cfg);
  const proximaDelDia = delDiaDeHoy.getTime() > ahora.getTime() ? delDiaDeHoy : delDiaDeManana;
  if (cfg.modo !== "frecuente") return proximaDelDia;
  const cola = proximaDeLaCola(cfg, o.ultimaCola, ahora);
  return cola.getTime() < proximaDelDia.getTime() ? cola : proximaDelDia;
}
