/**
 * LA ANTIGÜEDAD DE UNA PERSONA A PARTIR DE SUS RELACIONES LABORALES EN ARCA. Cálculo puro: recibe
 * las relaciones de UN CUIL (de una empleadora o de todas) y «hoy», y devuelve las métricas que se
 * guardan en `AntiguedadArca`. Sin Mongo, sin reloj: todo entra por parámetro.
 *
 * Se devuelven LAS DOS medidas porque las dos se usan:
 *  - `antiguedadDesdePrimeraAlta`: días corridos entre la primera alta y hoy, con huecos y todo.
 *  - `diasTrabajados`: los días de cada relación (fin − inicio + 1), FUSIONANDO las que se solapan
 *    para no contar un día dos veces. Una relación abierta cuenta hasta hoy; una que termina después
 *    de hoy, también hasta hoy (lo que falta no se trabajó todavía).
 *
 * Fechas como "YYYY-MM-DD"; los días se cuentan en UTC para que ningún cambio de hora reste uno.
 */

export interface RelacionParaAntiguedad {
  /** 11 dígitos. */
  empleadoraCuit: string;
  /** ISO YYYY-MM-DD. */
  fechaInicio: string;
  /** ISO, o `null` si sigue abierta. */
  fechaFin: string | null;
  apellidoNombre?: string;
}

export interface MetricasAntiguedad {
  apellidoNombre: string;
  primeraAlta: string;
  /** La mayor fecha de fin; si hay una relación abierta, hoy. */
  ultimaFecha: string;
  antiguedadDesdePrimeraAlta: { dias: number; anios: number };
  diasTrabajados: number;
  aniosTrabajados: number;
  cantidadContratos: number;
  tieneRelacionAbierta: boolean;
  /** Los CUIT que aportan, ordenados. */
  empresas: string[];
}

export interface Tramo {
  desde: string;
  hasta: string;
}

const MS_DIA = 86_400_000;
const utc = (iso: string): number => Date.parse(`${iso}T00:00:00.000Z`);

/** Días corridos de `a` a `b` (b − a). Negativo si `b` es anterior. */
export const diasEntre = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / MS_DIA);

/** Años con dos decimales, a 365,25 días el año. */
export const aniosDe = (dias: number): number => Math.round((dias / 365.25) * 100) / 100;

/**
 * Une los tramos que se tocan o se solapan. Dos relaciones 10→20 y 15→25 son un solo tramo 10→25;
 * 10→20 y 21→25 también (son días consecutivos). 10→20 y 22→25 quedan como dos.
 */
export function fusionarTramos(tramos: Tramo[]): Tramo[] {
  const ordenados = [...tramos].filter((t) => t.hasta >= t.desde).sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
  const out: Tramo[] = [];
  for (const t of ordenados) {
    const ultimo = out[out.length - 1];
    if (ultimo && diasEntre(ultimo.hasta, t.desde) <= 1) {
      if (t.hasta > ultimo.hasta) ultimo.hasta = t.hasta;
    } else {
      out.push({ ...t });
    }
  }
  return out;
}

/** Días de un tramo, inclusive de las dos puntas (10→10 es un día). */
export const diasDeTramo = (t: Tramo): number => diasEntre(t.desde, t.hasta) + 1;

/**
 * El tramo efectivamente trabajado de una relación al día de hoy: hasta el fin, o hasta hoy si está
 * abierta o si el fin es futuro. `null` si todavía no empezó.
 */
export function tramoTrabajado(r: RelacionParaAntiguedad, hoy: string): Tramo | null {
  if (r.fechaInicio > hoy) return null;
  const hasta = r.fechaFin === null || r.fechaFin > hoy ? hoy : r.fechaFin;
  return { desde: r.fechaInicio, hasta: hasta < r.fechaInicio ? r.fechaInicio : hasta };
}

/** Las métricas de un CUIL. `null` si no hay relaciones. */
export function antiguedadDe(relaciones: RelacionParaAntiguedad[], hoy: string): MetricasAntiguedad | null {
  if (relaciones.length === 0) return null;
  const porInicio = [...relaciones].sort((a, b) => (a.fechaInicio < b.fechaInicio ? -1 : a.fechaInicio > b.fechaInicio ? 1 : 0));
  const primeraAlta = porInicio[0].fechaInicio;
  const tieneRelacionAbierta = relaciones.some((r) => r.fechaFin === null);
  const mayorFin = relaciones.reduce<string | null>((m, r) => (r.fechaFin !== null && (m === null || r.fechaFin > m) ? r.fechaFin : m), null);
  const ultimaFecha = tieneRelacionAbierta || mayorFin === null ? hoy : mayorFin;
  const tramos = fusionarTramos(relaciones.map((r) => tramoTrabajado(r, hoy)).filter((t): t is Tramo => t !== null));
  const diasTrabajados = tramos.reduce((s, t) => s + diasDeTramo(t), 0);
  const dias = Math.max(0, diasEntre(primeraAlta, hoy));
  // El nombre más reciente: el de la relación que empezó última (ARCA puede haberlo corregido).
  const masReciente = porInicio[porInicio.length - 1];
  return {
    apellidoNombre: masReciente.apellidoNombre || relaciones.find((r) => r.apellidoNombre)?.apellidoNombre || "",
    primeraAlta,
    ultimaFecha,
    antiguedadDesdePrimeraAlta: { dias, anios: aniosDe(dias) },
    diasTrabajados,
    aniosTrabajados: aniosDe(diasTrabajados),
    cantidadContratos: relaciones.length,
    tieneRelacionAbierta,
    empresas: [...new Set(relaciones.map((r) => r.empleadoraCuit))].sort(),
  };
}

/**
 * Las filas que van a `AntiguedadArca` para un CUIL: una por empleadora y la global (todas juntas,
 * `empleadoraCuit: null`). Si la persona tiene una sola empleadora, la global es igual a la de ella
 * y se guarda también: la pantalla lee siempre la global para el total.
 */
export function antiguedadesDe(relaciones: RelacionParaAntiguedad[], hoy: string): Array<{ empleadoraCuit: string | null; metricas: MetricasAntiguedad }> {
  const global = antiguedadDe(relaciones, hoy);
  if (!global) return [];
  const out: Array<{ empleadoraCuit: string | null; metricas: MetricasAntiguedad }> = [{ empleadoraCuit: null, metricas: global }];
  for (const cuit of global.empresas) out.push({ empleadoraCuit: cuit, metricas: antiguedadDe(relaciones.filter((r) => r.empleadoraCuit === cuit), hoy)! });
  return out;
}
