import { diasEntre, esISO, sumarDias } from "./planVacaciones/fechas.js";

/**
 * LA VENTANA ANUAL DE GOCE DE VACACIONES (10/11/2026): el tramo del año en el que se pueden tomar,
 * p. ej. del 1/11 al 30/4. Se repite todas las temporadas, así que se guarda SIN año, como "MM-DD".
 *
 * Reglas puras, compartidas por el server (que es el que frena) y las pantallas (que avisan antes):
 *  · Si `inicio` es mayor que `fin` como "MM-DD", la ventana ENVUELVE el 1/1: "11-01" → "04-30" incluye
 *    diciembre y enero.
 *  · Un rango es válido si TODOS sus días caen adentro (no alcanza con que empiece adentro: del 28/4
 *    al 5/5 no entra en una ventana que termina el 30/4).
 *  · Todo en strings "YYYY-MM-DD": un `Date` de por medio corre el día según la zona horaria.
 *
 * La configuración es global por tenant, con la misma excepción por Proyecto o Área que el
 * fraccionamiento y los días corridos (`vacationConfig.useGlobalConfig === false`). La que rige para
 * una persona la resuelve `ventanaEfectiva`.
 */

/** Un tramo del año, con las dos puntas incluidas. */
export interface TramoDeVentana {
  /** "MM-DD" */
  inicio: string;
  /** "MM-DD" */
  fin: string;
}

/** La ventana como se configura (global, o la propia de un proyecto o un área). */
export interface VentanaGoce extends TramoDeVentana {
  enabled: boolean;
}

/**
 * La ventana que RIGE para una persona o un proyecto, ya resuelta. Casi siempre es un solo tramo; son
 * varios sólo cuando la persona está en proyectos con ventanas que no se tocan entre sí (ver `unirVentanas`).
 */
export interface VentanaEfectiva {
  enabled: boolean;
  tramos: TramoDeVentana[];
}

/** Apagada por defecto: quien no la configuró sigue pidiendo vacaciones en cualquier fecha, como siempre. */
export const VENTANA_POR_DEFECTO: VentanaGoce = { enabled: false, inicio: "11-01", fin: "04-30" };
export const SIN_VENTANA: VentanaEfectiva = { enabled: false, tramos: [] };

/** Febrero con 29: la ventana no tiene año, así que el 29/2 es una fecha posible. */
const DIAS_POR_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** ¿Es un "MM-DD" que existe? (mes 1–12 y un día que ese mes tiene) */
export function esMesDia(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{2}-\d{2}$/.test(v)) return false;
  const mes = Number(v.slice(0, 2));
  const dia = Number(v.slice(3, 5));
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= DIAS_POR_MES[mes - 1];
}

/** Cuántos días tiene el mes (1–12) para elegir en un selector sin año. */
export const diasDelMesSinAnio = (mes: number): number => DIAS_POR_MES[mes - 1] || 31;

const enTramo = (mesDia: string, inicio: string, fin: string): boolean => (inicio <= fin ? mesDia >= inicio && mesDia <= fin : mesDia >= inicio || mesDia <= fin);

/** ¿La fecha "YYYY-MM-DD" cae dentro de la ventana `inicio`–`fin` ("MM-DD")? */
export function dentroDeVentana(fecha: string, inicio: string, fin: string): boolean {
  if (!esISO(fecha) || !esMesDia(inicio) || !esMesDia(fin)) return false;
  return enTramo(fecha.slice(5), inicio, fin);
}

/** ¿TODOS los días del rango caen dentro de la ventana? `false` si el rango está dado vuelta o no es válido. */
export function rangoDentroDeVentana(desde: string, hasta: string, inicio: string, fin: string): boolean {
  return rangoPermitido(desde, hasta, { enabled: true, tramos: [{ inicio, fin }] });
}

/** ¿Se puede tomar ese día? Sin ventana (apagada), cualquiera. */
export function fechaPermitida(fecha: string, ventana: VentanaEfectiva | null | undefined): boolean {
  if (!ventana || !ventana.enabled) return true;
  return ventana.tramos.some((t) => dentroDeVentana(fecha, t.inicio, t.fin));
}

/** ¿Se puede tomar el rango entero? Sin ventana (apagada), cualquiera. */
export function rangoPermitido(desde: string, hasta: string, ventana: VentanaEfectiva | null | undefined): boolean {
  if (!ventana || !ventana.enabled) return true;
  const dias = diasEntre(desde, hasta);
  if (dias <= 0) return false;
  // Con 366 días seguidos ya pasaron todos los "MM-DD" que existen: un rango más largo no agrega nada.
  const aRecorrer = Math.min(dias, 366);
  for (let i = 0; i < aRecorrer; i++) if (!fechaPermitida(sumarDias(desde, i), ventana)) return false;
  return true;
}

/** Lee una ventana guardada tolerando lo que falte o venga mal: cada dato inválido cae al de `base`. */
export function normalizarVentana(v: unknown, base: VentanaGoce = VENTANA_POR_DEFECTO): VentanaGoce {
  const o = (v || {}) as Partial<VentanaGoce>;
  return { enabled: typeof o.enabled === "boolean" ? o.enabled : base.enabled, inicio: esMesDia(o.inicio) ? o.inicio : base.inicio, fin: esMesDia(o.fin) ? o.fin : base.fin };
}

/** El `vacationConfig` embebido de un Proyecto o un Área, en lo que toca a la ventana. */
export interface ConfigDeEntidad {
  useGlobalConfig?: boolean;
  ventanaGoceEnabled?: boolean | null;
  ventanaGoceInicio?: string | null;
  ventanaGoceFin?: string | null;
}

/**
 * La ventana de un proyecto o un área. Usa la global salvo que la entidad tenga configuración propia
 * (`useGlobalConfig === false`); y aun así, lo que la entidad no definió sale de la global: los
 * proyectos que ya tenían configuración propia por el fraccionamiento no cambian de ventana solos.
 */
export function ventanaDeEntidad(config: ConfigDeEntidad | null | undefined, global: VentanaGoce): VentanaGoce {
  if (!config || config.useGlobalConfig !== false) return global;
  return {
    enabled: typeof config.ventanaGoceEnabled === "boolean" ? config.ventanaGoceEnabled : global.enabled,
    inicio: esMesDia(config.ventanaGoceInicio) ? config.ventanaGoceInicio : global.inicio,
    fin: esMesDia(config.ventanaGoceFin) ? config.ventanaGoceFin : global.fin,
  };
}

/** Todos los "MM-DD" del año, en orden (366: con el 29/2). */
const CALENDARIO: string[] = DIAS_POR_MES.flatMap((dias, m) => Array.from({ length: dias }, (_x, d) => `${String(m + 1).padStart(2, "0")}-${String(d + 1).padStart(2, "0")}`));

/**
 * LA MÁS FLEXIBLE ENTRE VARIAS (la regla de siempre para quien está en más de un proyecto): si ALGUNA
 * está apagada, no hay ventana; si todas la tienen, vale la UNIÓN. Con ventanas que se tocan, la unión
 * es un solo tramo —el inicio más temprano y el fin más tardío—; con ventanas separadas (una de verano
 * y otra de invierno) quedan los dos tramos, en vez de un tramo grande que habilitaría los meses del
 * medio que ningún proyecto permite.
 */
export function unirVentanas(ventanas: VentanaGoce[]): VentanaEfectiva {
  if (ventanas.length === 0 || ventanas.some((v) => !v.enabled)) return SIN_VENTANA;
  const adentro = CALENDARIO.map((md) => ventanas.some((v) => enTramo(md, v.inicio, v.fin)));
  const n = CALENDARIO.length;
  if (adentro.every(Boolean)) return { enabled: true, tramos: [{ inicio: "01-01", fin: "12-31" }] };
  const tramos: TramoDeVentana[] = [];
  for (let i = 0; i < n; i++) {
    // Un tramo empieza donde el día está adentro y el anterior (dando la vuelta al año) no.
    if (!adentro[i] || adentro[(i - 1 + n) % n]) continue;
    let j = i;
    while (adentro[(j + 1) % n]) j = (j + 1) % n;
    tramos.push({ inicio: CALENDARIO[i], fin: CALENDARIO[j] });
  }
  return { enabled: true, tramos: tramos.sort((a, b) => a.inicio.localeCompare(b.inicio)) };
}

/**
 * LA VENTANA QUE RIGE PARA UNA PERSONA. Misma jerarquía que el resto de las reglas de vacaciones:
 * el Área con configuración propia manda; si no, sus Proyectos (la más flexible entre todos, cada uno
 * con la suya o la global); sin proyectos, la global.
 */
export function ventanaEfectiva(o: { global: VentanaGoce; area?: ConfigDeEntidad | null; proyectos?: Array<ConfigDeEntidad | null | undefined> }): VentanaEfectiva {
  if (o.area && o.area.useGlobalConfig === false) return unirVentanas([ventanaDeEntidad(o.area, o.global)]);
  if (o.proyectos && o.proyectos.length > 0) return unirVentanas(o.proyectos.map((p) => ventanaDeEntidad(p, o.global)));
  return unirVentanas([o.global]);
}

/** "MM-DD" → «1/11» (sin ceros, como se dice). */
export const mesDiaCorto = (mesDia: string): string => (esMesDia(mesDia) ? `${Number(mesDia.slice(3, 5))}/${Number(mesDia.slice(0, 2))}` : mesDia || "—");

/** «1/11 – 30/4», para el chip «Efectivo:». «Sin ventana» si está apagada. */
export function resumenDeVentana(ventana: VentanaEfectiva | null | undefined): string {
  if (!ventana || !ventana.enabled || ventana.tramos.length === 0) return "Sin ventana";
  return ventana.tramos.map((t) => `${mesDiaCorto(t.inicio)} – ${mesDiaCorto(t.fin)}`).join(" y ");
}

/** «entre el 1/11 y el 30/4», para armar las frases. Vacío si está apagada. */
export function textoDeVentana(ventana: VentanaEfectiva | null | undefined): string {
  if (!ventana || !ventana.enabled || ventana.tramos.length === 0) return "";
  return ventana.tramos.map((t) => `entre el ${mesDiaCorto(t.inicio)} y el ${mesDiaCorto(t.fin)}`).join(" o ");
}

/** Qué tiene de malo una ventana que se quiere guardar; `null` si está bien. */
export function errorDeVentana(v: unknown): string | null {
  if (!v || typeof v !== "object") return "La ventana de goce no es válida.";
  const o = v as Partial<VentanaGoce>;
  if (typeof o.enabled !== "boolean") return "Falta indicar si la ventana de goce está habilitada.";
  if (!esMesDia(o.inicio)) return "El inicio de la ventana de goce tiene que ser un día y mes que exista (MM-DD).";
  if (!esMesDia(o.fin)) return "El fin de la ventana de goce tiene que ser un día y mes que exista (MM-DD).";
  return null;
}
