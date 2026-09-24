/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÓDIGO COMPARTIDO SERVER ↔ FRONTEND (`server/src/compartido/`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * El frontend importa este archivo tal cual (alias `@compartido` en `frontend/vite.config.ts` y
 * `frontend/tsconfig.json`): es la ÚNICA copia del cálculo de jornadas e importes, la que usan el alta
 * individual (en el navegador) y el alta masiva de plantillas de equipo (en el server). Por eso acá sólo
 * va código puro: nada de Node, Mongoose ni del DOM, y sin imports.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LAS JORNADAS DE UNA SOLICITUD: DE DÓNDE SALEN Y CUÁNDO SE PUEDEN PISAR
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Cantidad de jornadas convivía con cuatro datos que determinan lo mismo —fecha de inicio, de fin, días
 * por semana y días marcados— sin que nada validara que cerraran entre sí: se podía mandar un período
 * de tres semanas con 8 jornadas y ningún día marcado. Ahora hay una jerarquía:
 *
 *   Días FIJOS     las jornadas se CALCULAN: cuántas veces caen los días marcados en el período.
 *                  Se pueden pisar sólo a propósito («Editar manualmente») y con motivo, porque el
 *                  calendario no siempre es la producción: se extiende un rodaje, se cae un día por
 *                  lluvia, se trabaja un feriado. Alguien audita después por qué la liquidación no
 *                  coincide con el calendario, y el motivo es la respuesta.
 *   Días ROTATIVOS no hay patrón semanal del cual derivarlas: se cargan a mano y son la fuente de
 *                  verdad, con tope en los días corridos del período.
 */

export type MotivoAjusteJornadas = "extension_rodaje" | "jornada_caida" | "feriado_trabajado" | "franco_trabajado" | "alta_baja_parcial" | "reemplazo_parcial" | "otro";

export const MOTIVOS_AJUSTE_JORNADAS: { valor: MotivoAjusteJornadas; label: string }[] = [
  { valor: "extension_rodaje", label: "Jornada/s extra por extensión de rodaje" },
  { valor: "jornada_caida", label: "Jornada/s caída/s (clima, cancelación, fuerza mayor)" },
  { valor: "feriado_trabajado", label: "Feriado trabajado" },
  { valor: "franco_trabajado", label: "Franco trabajado" },
  { valor: "alta_baja_parcial", label: "Alta o baja parcial dentro del período" },
  { valor: "reemplazo_parcial", label: "Reemplazo parcial" },
  { valor: "otro", label: "Otro" },
];

/** Con «Otro» el motivo ES el texto, así que tiene que decir algo. */
export const NOTA_MINIMA_OTRO = 10;

/** "YYYY-MM-DD" → milisegundos UTC. En UTC y no en hora local: un cambio de horario no corre ningún día. */
const utc = (fecha?: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha || "");
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const DIA_MS = 86400000;

/**
 * EL PERÍODO CON EL QUE SE CUENTAN JORNADAS E IMPORTES.
 *
 * A plazo es el del contrato: desde → hasta. Uno de TIEMPO INDETERMINADO no tiene hasta, y sin período
 * no había jornadas ni meses: el importe por jornada quedaba en 0 y la diferencia diaria contra la
 * escala, negativa. Se toma entonces el MES CALENDARIO COMPLETO del alta: las jornadas son las de ese
 * mes, así que la jornada es el mensual ÷ sus días hábiles —la misma regla que un contrato a plazo de
 * un mes entero— y el total del contrato no existe.
 */
export const periodoDeCalculo = (desde: string | undefined, hasta: string | undefined, indeterminado: boolean): { desde: string; hasta: string } => {
  if (!indeterminado) return { desde: desde || "", hasta: hasta || "" };
  const m = /^(\d{4})-(\d{2})/.exec(desde || "");
  if (!m) return { desde: "", hasta: "" };
  const ultimoDia = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { desde: `${m[1]}-${m[2]}-01`, hasta: `${m[1]}-${m[2]}-${String(ultimoDia).padStart(2, "0")}` };
};

/** Cómo se explica el período de un contrato de tiempo indeterminado. `""` si no aplica. */
export const avisoIndeterminado = (desde: string | undefined, indeterminado: boolean): string => {
  const m = /^(\d{4})-(\d{2})/.exec(desde || "");
  if (!indeterminado || !m) return "";
  const mes = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
  return `Tiempo indeterminado: no hay fecha de baja, así que las jornadas son las de un mes completo —${mes}, el del alta— y el importe por jornada es el mensual ÷ esas jornadas.`;
};

/** Días corridos del período, ambos extremos inclusive. `null` si falta una fecha o el fin es anterior. */
export const diasCorridos = (desde?: string, hasta?: string): number | null => {
  const d1 = utc(desde);
  const d2 = utc(hasta);
  if (d1 === null || d2 === null || d2 < d1) return null;
  return Math.round((d2 - d1) / DIA_MS) + 1;
};

/**
 * Cuántas veces caen los días de semana marcados dentro del período, ambos extremos inclusive.
 *
 * Es una cuenta exacta —no `semanas × días`, que en una semana cortada al medio erra— y no sabe de
 * feriados: para eso está el ajuste con motivo. `null` si no hay período válido o no hay días marcados.
 */
export const jornadasDelCalendario = (desde: string | undefined, hasta: string | undefined, dias: number[]): number | null => {
  const total = diasCorridos(desde, hasta);
  if (total === null || dias.length === 0) return null;
  const marcados = new Set(dias);
  const inicio = utc(desde)!;
  let jornadas = 0;
  for (let i = 0; i < total; i++) {
    if (marcados.has(new Date(inicio + i * DIA_MS).getUTCDay())) jornadas++;
  }
  return jornadas;
};

export interface DatosJornadas {
  desde: string;
  hasta: string;
  diasPorSemana: string;
  dias: number[];
  rotativos: boolean;
  jornadas: string;
  calculadas: number | null;
  ajustado: boolean;
  motivo: string;
  nota: string;
}

/** Un mensaje por campo; campo ausente = está bien. Se muestran debajo de cada uno, no en un alert. */
export interface ErroresJornadas {
  fechas?: string;
  diasPorSemana?: string;
  dias?: string;
  jornadas?: string;
  motivo?: string;
  nota?: string;
}

/** Hay diferencia real entre lo cargado a mano y el calendario. Sin diferencia no hay nada que justificar. */
export const hayAjuste = (d: Pick<DatosJornadas, "rotativos" | "ajustado" | "calculadas" | "jornadas">): boolean =>
  !d.rotativos && d.ajustado && d.calculadas !== null && d.jornadas !== "" && Number(d.jornadas) !== d.calculadas;

/** Qué impide enviar. Vacío = se puede. */
export const erroresDeJornadas = (d: DatosJornadas): ErroresJornadas => {
  const e: ErroresJornadas = {};

  if (d.desde && d.hasta && diasCorridos(d.desde, d.hasta) === null) e.fechas = "La fecha de fin no puede ser anterior a la de inicio.";

  const porSemana = Number(d.diasPorSemana);
  if (!d.diasPorSemana || !Number.isInteger(porSemana) || porSemana < 1 || porSemana > 7) {
    e.diasPorSemana = "Ingresá cuántos días por semana trabaja: un número entero de 1 a 7.";
  } else if (!d.rotativos && d.dias.length !== porSemana) {
    // Con días rotativos los días marcados se conservan pero no cuentan: no se validan.
    e.dias = `Marcá exactamente ${porSemana} día(s): llevás ${d.dias.length}.`;
  }

  const n = Number(d.jornadas);
  if (d.rotativos) {
    const corridos = diasCorridos(d.desde, d.hasta);
    if (corridos === null) e.jornadas = "Cargá las fechas del período para poder cargar las jornadas.";
    else if (!d.jornadas || !Number.isInteger(n) || n < 1) e.jornadas = "Cargá cuántas jornadas trabaja: al menos 1.";
    else if (n > corridos) e.jornadas = `No puede superar los ${corridos} días del período.`;
    return e;
  }

  if (!d.jornadas || !(n > 0)) {
    e.jornadas = d.calculadas === null ? "Cargá las fechas y marcá los días para calcular las jornadas." : "Las jornadas tienen que ser más de 0.";
  } else if (hayAjuste(d)) {
    if (!d.motivo) e.motivo = "Elegí por qué las jornadas no coinciden con el calendario.";
    else if (d.motivo === "otro" && d.nota.trim().length < NOTA_MINIMA_OTRO) e.nota = `Contá el motivo en al menos ${NOTA_MINIMA_OTRO} caracteres.`;
  }
  return e;
};

/**
 * MESES EQUIVALENTES DEL PERÍODO: cuánto dura el contrato medido en meses, prorrateando cada mes que
 * toca por sus días hábiles.
 *
 *     Σ  jornadas del período en ese mes ÷ días hábiles de ese mes
 *
 * «Hábiles» son los días de la semana MARCADOS en el formulario, no un valor fijo: con Lu–Vi,
 * septiembre 2026 tiene 22 y febrero 2026 tiene 20. Por eso un mes calendario completo aporta
 * exactamente 1 y medio mes ~0,5, tenga los hábiles que tenga. Es lo que hace que un mes completo
 * totalice justo el importe mensual (ver `derivarImportes`).
 *
 * 0 si falta el período o no hay días marcados.
 */
export const mesesEquivalentes = (desde: string | undefined, hasta: string | undefined, dias: number[]): number => {
  const d1 = utc(desde);
  const d2 = utc(hasta);
  if (d1 === null || d2 === null || d2 < d1 || dias.length === 0) return 0;
  const marcados = new Set(dias);

  // Jornadas del período por mes. Un mes tocado sin jornadas en el período aporta 0: no se recorre.
  const enPeriodo = new Map<string, { anio: number; mes: number; jornadas: number }>();
  for (let t = d1; t <= d2; t += DIA_MS) {
    const d = new Date(t);
    if (!marcados.has(d.getUTCDay())) continue;
    const clave = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const actual = enPeriodo.get(clave) || { anio: d.getUTCFullYear(), mes: d.getUTCMonth(), jornadas: 0 };
    actual.jornadas++;
    enPeriodo.set(clave, actual);
  }

  let meses = 0;
  for (const { anio, mes, jornadas } of enPeriodo.values()) {
    const diasDelMes = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    let habiles = 0;
    for (let dia = 1; dia <= diasDelMes; dia++) if (marcados.has(new Date(Date.UTC(anio, mes, dia)).getUTCDay())) habiles++;
    if (habiles > 0) meses += jornadas / habiles;
  }
  return meses;
};

/** Qué importe quedó fijo: el último que se cargó entre mensual y total. Ver `derivarImportes`. */
export type AnclaImporte = { unidad: "mensual" | "total"; valor: number };

export interface Importes {
  jornada: number | null;
  semana: number | null;
  mensual: number | null;
  total: number | null;
}

/**
 * LOS CUATRO IMPORTES A PARTIR DEL ANCLA. El mensual (o el total, si fue lo último que se editó) es lo
 * fijo; la jornada es la DERIVADA y varía según los días hábiles del período, que es lo correcto:
 *
 *     total   = mensual × mesesEquivalentes        (o mensual = total ÷ mesesEquivalentes)
 *     jornada = total ÷ jornadas del contrato
 *     semana  = jornada × días por semana
 *
 * Sin ancla (todavía no hay con qué calcular el mensual) se parte de la jornada. Nunca divide por 0:
 * lo que no se puede calcular queda en `null`. Todo con precisión completa; se redondea al mostrar.
 */
export const derivarImportes = (p: { ancla: AnclaImporte | null; jornada: number | null; mesesEq: number; jornadas: number; diasSemana: number }): Importes => {
  const { ancla, mesesEq, jornadas, diasSemana } = p;
  let mensual: number | null = null;
  let total: number | null = null;
  let jornada: number | null = null;
  if (ancla) {
    if (ancla.unidad === "mensual") {
      mensual = ancla.valor;
      total = mesesEq > 0 ? ancla.valor * mesesEq : null;
    } else {
      total = ancla.valor;
      mensual = mesesEq > 0 ? ancla.valor / mesesEq : null;
    }
    jornada = total !== null && jornadas > 0 ? total / jornadas : null;
  } else if (p.jornada !== null && Number.isFinite(p.jornada)) {
    jornada = p.jornada;
    total = jornadas > 0 ? jornada * jornadas : null;
    mensual = total !== null && mesesEq > 0 ? total / mesesEq : null;
  }
  const semana = jornada !== null && diasSemana > 0 ? jornada * diasSemana : null;
  return { jornada, semana, mensual, total };
};

/** Editar la jornada deja como ancla el mensual que le corresponde. `null` si todavía no se puede calcular. */
export const anclaDesdeJornada = (jornada: number, jornadas: number, mesesEq: number): AnclaImporte | null =>
  jornadas > 0 && mesesEq > 0 ? { unidad: "mensual", valor: (jornada * jornadas) / mesesEq } : null;

/**
 * EL IMPORTE POR JORNADA DE UNA CATEGORÍA: su neto mensual ÷ 30, por el multiplicador del tipo de
 * contrato («Jornada» paga 1,5). Sin multiplicador cargado (0, vacío o ausente) se usa 1: es «sin
 * multiplicador», no «por cero». Se redondea a centavos DESPUÉS de multiplicar.
 */
export const importePorJornada = (neto: number | null | undefined, multiplicadorDiario?: number | null): number => {
  const multiplicador = Number(multiplicadorDiario) > 0 ? Number(multiplicadorDiario) : 1;
  return Number(((Number(neto ?? 0) / 30) * multiplicador).toFixed(2));
};
