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
export declare const INTERSECT_SHIFT_DAYS = true;
export declare const EXCLUDE_HOLIDAYS = true;
/** Día de la semana (0=Dom .. 6=Sáb) de un "YYYY-MM-DD", sin drift de timezone. */
export declare function weekdayOf(dateStr: string): number;
/** Suma `n` días a un "YYYY-MM-DD" y devuelve otro "YYYY-MM-DD". */
export declare function addDaysStr(dateStr: string, n: number): string;
/** Lista inclusiva de "YYYY-MM-DD" entre from..to (string-safe). */
export declare function eachDateStr(from: string, to: string): string[];
/** Resuelve un schedule a los índices de día de semana permitidos. */
export declare function resolveScheduleDays(type?: ScheduleType, days?: number[]): number[];
/** Normaliza un `Date` (o string) de feriado a "YYYY-MM-DD" (UTC slice, consistente). */
export declare function holidayToDateStr(d: Date | string): string;
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
export declare function expandExpectedDates(opts: ExpandOptions): string[];
/**
 * Ventana de carga: los últimos `allowedPastDays` días ESPERADOS (según el schedule del
 * proyecto) contando hacia atrás desde hoy (hoy inclusive si es día esperado).
 *
 * Réplica exacta del criterio del mobile (`isDayAllowedForReporting`): la ventana NO son
 * N días corridos, son los últimos N días de reporte activos.
 */
export declare function computeOpenWindow(opts: {
    scheduleType?: ScheduleType;
    scheduleDays?: number[];
    allowedPastDays: number;
    today?: string;
}): Set<string>;
/** "YYYY-MM-DD" de hoy en horario local del server. */
export declare function todayStr(): string;
