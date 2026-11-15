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
 * `empleadoraCuit: null`). Si la persona tiene una sola empleadora, la global es igual a la de ella.
 * Desde el 15/11/2026 la global queda para auditar: las vacaciones toman la antigüedad de UNA
 * empleadora (`empresaDeComputo`), no la suma de todas.
 */
export function antiguedadesDe(relaciones: RelacionParaAntiguedad[], hoy: string): Array<{ empleadoraCuit: string | null; metricas: MetricasAntiguedad }> {
  const global = antiguedadDe(relaciones, hoy);
  if (!global) return [];
  const out: Array<{ empleadoraCuit: string | null; metricas: MetricasAntiguedad }> = [{ empleadoraCuit: null, metricas: global }];
  for (const cuit of global.empresas) out.push({ empleadoraCuit: cuit, metricas: antiguedadDe(relaciones.filter((r) => r.empleadoraCuit === cuit), hoy)! });
  return out;
}

/*
  ─── DE QUÉ EMPLEADORA SE TOMA LA ANTIGÜEDAD PARA LAS VACACIONES (15/11/2026) ───

  Se sumaban los días de todas las empleadoras del tenant (la fila global). Ya no: la antigüedad es la
  de UNA empresa. Quien pasó de FZERO (vieja) a 2030 (nueva) arranca en 2030 de cero; no arrastra lo
  de FZERO. Sirve para N empresas, identificadas por CUIT (nada fijo en el código).

  Regla (`empresaVigenteDe`): gana la empleadora con la relación vigente —abierta, o con fin después de
  hoy—; entre varias vigentes, o si no hay ninguna, la de `ultimaFecha` mayor (la más reciente); si
  empatan, la de `primeraAlta` mayor (la que empezó después, o sea la nueva). Con precedencia manual,
  la primera de la lista que la persona tenga; si no tiene ninguna de la lista, la vigente.
*/

/** Lo mínimo de cada empleadora para elegir: sale de las filas de `AntiguedadArca` o de los contratos de WeProdu. */
export interface FilaEmpresaParaComputo {
  /** CUIT de 11 dígitos (o el id de la empresa si no tiene CUIT cargado). */
  empleadoraCuit: string;
  tieneRelacionAbierta: boolean;
  /** ISO YYYY-MM-DD: el último día de la relación (hoy si está abierta). */
  ultimaFecha: string;
  /** ISO YYYY-MM-DD: la primera alta con esa empleadora. */
  primeraAlta: string;
}

/** Fecha guardada (Date o string) a "YYYY-MM-DD"; "" si no hay. */
export const isoDia = (v: unknown): string => {
  if (!v) return "";
  if (typeof v === "string") return v.slice(0, 10);
  const d = new Date(v as any);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

/** Vigente hoy: relación abierta, o una que termina hoy o después. */
const esVigente = (f: FilaEmpresaParaComputo, hoy: string) => f.tieneRelacionAbierta || (!!f.ultimaFecha && f.ultimaFecha >= hoy);

/** La empleadora vigente (ver la regla arriba). `null` si no hay filas. */
export function empresaVigenteDe<T extends FilaEmpresaParaComputo>(filas: T[], hoy: string): T | null {
  if (filas.length === 0) return null;
  const orden = [...filas].sort((a, b) => {
    const va = esVigente(a, hoy) ? 1 : 0;
    const vb = esVigente(b, hoy) ? 1 : 0;
    if (va !== vb) return vb - va;
    if (a.ultimaFecha !== b.ultimaFecha) return a.ultimaFecha < b.ultimaFecha ? 1 : -1;
    if (a.primeraAlta !== b.primeraAlta) return a.primeraAlta < b.primeraAlta ? 1 : -1;
    return a.empleadoraCuit.localeCompare(b.empleadoraCuit);
  });
  return orden[0];
}

export type ModoComputoAntiguedad = "empresaVigente" | "precedenciaManual";
export type MotivoEmpresaComputo = "vigente" | "unica" | "precedencia";

/**
 * La empleadora cuya antigüedad cuenta y por qué. `precedencia`: CUITs en orden, la primera presente
 * gana (sólo en modo manual). Una sola empleadora es «unica» sea cual sea el modo.
 */
export function empresaDeComputo<T extends FilaEmpresaParaComputo>(filas: T[], hoy: string, config: { modo?: ModoComputoAntiguedad; precedencia?: string[] } = {}): { fila: T; motivo: MotivoEmpresaComputo } | null {
  if (filas.length === 0) return null;
  if (new Set(filas.map((f) => f.empleadoraCuit)).size === 1) return { fila: filas[0], motivo: "unica" };
  if (config.modo === "precedenciaManual") {
    for (const cuit of config.precedencia || []) {
      const fila = filas.find((f) => f.empleadoraCuit === cuit);
      if (fila) return { fila, motivo: "precedencia" };
    }
  }
  const fila = empresaVigenteDe(filas, hoy);
  return fila ? { fila, motivo: "vigente" } : null;
}

/** Una empleadora con sus días: fila de ARCA por empleadora, o los contratos de WeProdu agrupados. */
export type FilaEmpresaConDias = FilaEmpresaParaComputo & { dias: number };

/**
 * LA BASE DE ANTIGÜEDAD DE LAS VACACIONES (la usa `services/vacaciones/saldos.ts`). Devuelve los días que
 * cuentan y de qué empleadora salen:
 *  - Si hay que sumar (`motivoSuma`: la config lo pide o el período ya cerró): los días de siempre
 *    (`diasSumados`: la fila global de ARCA o la suma de contratos) y ninguna empresa.
 *  - Con ARCA: la fila de la empresa de cómputo. Sin ARCA: el grupo de contratos de esa empresa
 *    (`porContratos` es `null` cuando algún contrato no tiene empresa: no se puede repartir).
 *  - Si no hay de dónde elegir: los días de siempre.
 */
export function baseDeAntiguedad(a: {
  diasSumados: number;
  hayArca: boolean;
  porArca: FilaEmpresaConDias[];
  porContratos: FilaEmpresaConDias[] | null;
  motivoSuma: "config" | "periodoCerrado" | null;
  modo?: ModoComputoAntiguedad;
  precedencia?: string[];
  hoy: string;
}): { dias: number; elegida: { fila: FilaEmpresaConDias; motivo: MotivoEmpresaComputo; fuente: "arca" | "contratos"; consideradas: FilaEmpresaConDias[] } | null } {
  if (a.motivoSuma) return { dias: a.diasSumados, elegida: null };
  const filas = a.hayArca ? a.porArca : a.porContratos || [];
  const r = empresaDeComputo(filas, a.hoy, { modo: a.modo, precedencia: a.precedencia });
  if (!r) return { dias: a.diasSumados, elegida: null };
  return { dias: r.fila.dias, elegida: { fila: r.fila, motivo: r.motivo, fuente: a.hayArca ? "arca" : "contratos", consideradas: filas } };
}

/**
 * El CUIT de la empleadora cuya antigüedad cuenta (la forma corta de `empresaDeComputo`): con precedencia
 * manual, la primera de `precedenciaCuits` que la persona tenga; si no, la vigente (abierta → última
 * fecha → primera alta). `null` si no hay filas. `hoy` por defecto, el día UTC.
 */
export function empresaVigenteCuit(filasPorEmpresa: FilaEmpresaParaComputo[], modo: ModoComputoAntiguedad = "empresaVigente", precedenciaCuits: string[] = [], hoy: string = new Date().toISOString().slice(0, 10)): string | null {
  return empresaDeComputo(filasPorEmpresa, hoy, { modo, precedencia: precedenciaCuits })?.fila.empleadoraCuit ?? null;
}
