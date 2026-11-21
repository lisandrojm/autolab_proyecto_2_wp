/**
 * PERÍODOS DE LIQUIDACIÓN (20/11/2026): del 21 de un mes al 20 del siguiente.
 *
 * Las opciones dicen el RANGO LITERAL («21/09/2026 al 20/10/2026») y no un nombre de mes: «Noviembre 2026»
 * significó dos cosas distintas en la misma conversación (la planilla de liquidación llama «11-2026» a las
 * novedades del 21/09 al 20/10, el sueldo de octubre). Cuando liquidaciones confirme cómo lo llama, la
 * etiqueta se agrega AL LADO del rango, no en su lugar.
 */
export interface PeriodoLiquidacion {
  /** «AAAA-MM-DD». */
  desde: string;
  hasta: string;
  /** «21/09/2026 al 20/10/2026». */
  etiqueta: string;
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const ddmmaaaa = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;

/** El período 21→20 que termina el 20 del mes dado (1-12). */
export function periodoQueCierra(anio: number, mes: number): PeriodoLiquidacion {
  const mesAnterior = mes === 1 ? 12 : mes - 1, anioAnterior = mes === 1 ? anio - 1 : anio;
  const desde = iso(anioAnterior, mesAnterior, 21), hasta = iso(anio, mes, 20);
  return { desde, hasta, etiqueta: `${ddmmaaaa(desde)} al ${ddmmaaaa(hasta)}` };
}

/**
 * Los últimos períodos, del más reciente al más viejo. El primero es el que cierra el 20 de este mes si hoy ya
 * pasó el 20, o el que cerró el mes pasado si todavía no (lo que se puede liquidar).
 */
export function periodosDeLiquidacion(hoy: Date, cantidad = 14): PeriodoLiquidacion[] {
  let y = hoy.getFullYear(), m = hoy.getMonth() + 1;
  if (hoy.getDate() <= 20) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  const out: PeriodoLiquidacion[] = [];
  for (let i = 0; i < cantidad; i++) {
    out.push(periodoQueCierra(y, m));
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}
