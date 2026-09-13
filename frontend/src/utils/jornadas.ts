/**
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
