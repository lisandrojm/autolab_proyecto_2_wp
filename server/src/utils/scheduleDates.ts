/**
 * Utilidades de fechas para el cálculo de "días esperados" de novedades.
 *
 * IMPORTANTE (timezone): las fechas de novedad se guardan como strings "YYYY-MM-DD".
 * NUNCA usar `new Date("YYYY-MM-DD")` para obtener el día de la semana (se parsea en UTC
 * y da off-by-one en zonas negativas como AR). Siempre construir la fecha en horario local
 * con `new Date(y, m-1, d)`, igual que hace el mobile (`day.getDay()`).
 */

export type ScheduleType = "daily" | "workdays" | "custom";

/** Comportamiento (decisión de producto): intersectar con los días del turno y excluir feriados. */
export const INTERSECT_SHIFT_DAYS = true;
export const EXCLUDE_HOLIDAYS = true;

/** Día de la semana (0=Dom .. 6=Sáb) de un "YYYY-MM-DD", sin drift de timezone. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** Suma `n` días a un "YYYY-MM-DD" y devuelve otro "YYYY-MM-DD". */
export function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Lista inclusiva de "YYYY-MM-DD" entre from..to (string-safe). */
export function eachDateStr(from: string, to: string): string[] {
  const out: string[] = [];
  if (!from || !to || from > to) return out;
  let cur = from;
  // guard para no colgar en rangos absurdos
  for (let i = 0; i < 1000 && cur <= to; i++) {
    out.push(cur);
    cur = addDaysStr(cur, 1);
  }
  return out;
}

/** Resuelve un schedule a los índices de día de semana permitidos. */
export function resolveScheduleDays(type?: ScheduleType, days?: number[]): number[] {
  if (Array.isArray(days) && days.length > 0) return days;
  if (type === "daily") return [0, 1, 2, 3, 4, 5, 6];
  if (type === "workdays") return [1, 2, 3, 4, 5];
  return []; // custom sin days => nada esperado
}

/** Normaliza un `Date` (o string) de feriado a "YYYY-MM-DD" (UTC slice, consistente). */
export function holidayToDateStr(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return new Date(d).toISOString().slice(0, 10);
}

export interface ExpandOptions {
  from: string;
  to: string;
  scheduleType?: ScheduleType;
  scheduleDays?: number[];
  /** Días del turno; si se provee y INTERSECT_SHIFT_DAYS, se intersecta con el schedule. */
  shiftDays?: number[];
  /** Set de "YYYY-MM-DD" a excluir (feriados). */
  holidays?: Set<string>;
  /** Excluir días futuros (default true). `today` inclusive. */
  excludeFuture?: boolean;
  /** "YYYY-MM-DD" de hoy (inyectable para tests). */
  today?: string;
}

/**
 * Expande el schedule (∩ shiftDays − feriados) a fechas concretas dentro de [from, to],
 * sin días futuros. Mirror server-side de `isDayInFrequency` del mobile.
 */
export function expandExpectedDates(opts: ExpandOptions): string[] {
  const { from, to, scheduleType, scheduleDays, shiftDays, holidays, excludeFuture = true, today } = opts;

  const scheduleSet = new Set(resolveScheduleDays(scheduleType, scheduleDays));
  if (scheduleSet.size === 0) return [];

  let allowed = scheduleSet;
  if (INTERSECT_SHIFT_DAYS && Array.isArray(shiftDays) && shiftDays.length > 0) {
    allowed = new Set([...scheduleSet].filter((d) => shiftDays.includes(d)));
  }
  if (allowed.size === 0) return [];

  const cutoff = excludeFuture ? (today || todayStr()) : to;
  const effectiveTo = to < cutoff ? to : cutoff;

  return eachDateStr(from, effectiveTo).filter((dateStr) => {
    if (!allowed.has(weekdayOf(dateStr))) return false;
    if (EXCLUDE_HOLIDAYS && holidays && holidays.has(dateStr)) return false;
    return true;
  });
}

/**
 * Ventana de carga: los últimos `allowedPastDays` días ESPERADOS (según el schedule del
 * proyecto) contando hacia atrás desde hoy (hoy inclusive si es día esperado).
 *
 * Réplica exacta del criterio del mobile (`isDayAllowedForReporting`): la ventana NO son
 * N días corridos, son los últimos N días de reporte activos.
 */
export function computeOpenWindow(opts: {
  scheduleType?: ScheduleType;
  scheduleDays?: number[];
  allowedPastDays: number;
  today?: string;
}): Set<string> {
  const { scheduleType, scheduleDays, allowedPastDays } = opts;
  const out = new Set<string>();
  const days = resolveScheduleDays(scheduleType, scheduleDays);
  if (days.length === 0 || !allowedPastDays || allowedPastDays <= 0) return out;

  let cur = opts.today || todayStr();
  const maxSearch = Math.max(30, allowedPastDays * 10);
  for (let i = 0; i < maxSearch && out.size < allowedPastDays; i++) {
    if (days.includes(weekdayOf(cur))) out.add(cur);
    cur = addDaysStr(cur, -1);
  }
  return out;
}

/** "YYYY-MM-DD" de hoy en horario local del server. */
export function todayStr(): string {
  const dt = new Date();
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
