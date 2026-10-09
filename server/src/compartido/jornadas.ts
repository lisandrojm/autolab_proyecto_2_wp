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

/**
 * LAS JORNADAS QUE DA EL CALENDARIO, según cómo se pide el contrato:
 *  - por DÍAS SUELTOS («Jornada»): los días marcados, uno por jornada. NO los días de la semana que
 *    caen en el período: «el martes 1 y el martes 15» son 2 jornadas, aunque entre los dos haya otro
 *    martes (así se contaba antes, y la solicitud salía con 3).
 *  - con días ROTATIVOS: no hay patrón del cual deducirlas (`null`: se cargan a mano).
 *  - por PERÍODO: los días de la semana marcados que caen en él (`jornadasDelCalendario`).
 *
 * EL TIPO DE CONTRATO YA NO LAS FIJA (pedido del 09/10/2026). Antes su «Cantidad de jornadas» mandaba
 * sobre el calendario —un tipo con 22 daba 22 jornadas del 9 al 31 de octubre, que son 17—, y el total
 * del contrato no era la suma de los días del contrato. Ahora el total es SIEMPRE jornada × los días
 * reales del período (o los marcados). La «Cantidad de jornadas» del tipo sigue valiendo para lo que
 * es: cuántas jornadas tiene un MES, de donde salen el importe por jornada de la escala y el mensual
 * (ver `importePorJornada` y `mesesParaImportes`).
 *
 * Se deja la función —siempre `null`— porque la usan la app, el escritorio y el plan de lote: volver a
 * fijarlas es cambiar esto, en un solo lugar.
 */
export const jornadasFijadasPorElTipo = (_jornadasDelTipo: unknown, _porDiasSueltos: boolean): number | null => null;
export const jornadasCalculadasDelPedido = (p: { porDiasSueltos: boolean; fechas: string[]; rotativos: boolean; desde: string; hasta: string; dias: number[]; jornadasDelTipo?: unknown }): number | null => {
  const fijadas = jornadasFijadasPorElTipo(p.jornadasDelTipo, p.porDiasSueltos);
  if (fijadas !== null) return fijadas;
  if (p.porDiasSueltos) return p.fechas.length > 0 ? new Set(p.fechas).size : null;
  if (p.rotativos) return null;
  return jornadasDelCalendario(p.desde, p.hasta, p.dias);
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

  /*
    LAS FECHAS SON OBLIGATORIAS. Sin «Desde» se aceptaba una solicitud con las jornadas tipeadas a
    mano y sin período: llegaba al aprobador como «Desde —, Hasta Indeterminado» en un plazo fijo. En
    tiempo indeterminado el «hasta» lo pone `periodoDeCalculo` (fin del mes del alta): alcanza el desde.
  */
  if (!d.desde) e.fechas = "Cargá la fecha de inicio del contrato.";
  else if (!d.hasta) e.fechas = "Cargá la fecha de fin del contrato.";
  else if (diasCorridos(d.desde, d.hasta) === null) e.fechas = "La fecha de fin no puede ser anterior a la de inicio.";

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
 *
 * DÍAS SUELTOS (`fechas`): las jornadas de cada mes son los días MARCADOS, no todos los días de la
 * semana que caen entre el primero y el último. «Viernes 2, 9 y 23» de octubre son 3 de los 5 viernes
 * del mes (0,6), no 4 de 5: contando el período, el mensual daba una jornada más cara que la real.
 */
export const mesesEquivalentes = (desde: string | undefined, hasta: string | undefined, dias: number[], fechas?: string[]): number => {
  const d1 = utc(desde);
  const d2 = utc(hasta);
  if (d1 === null || d2 === null || d2 < d1 || dias.length === 0) return 0;
  const marcados = new Set(dias);
  const sueltas = fechas?.length ? new Set(fechas.map((f) => utc(String(f).slice(0, 10))).filter((t): t is number => t !== null)) : null;

  // Jornadas del período por mes. Un mes tocado sin jornadas en el período aporta 0: no se recorre.
  const enPeriodo = new Map<string, { anio: number; mes: number; jornadas: number }>();
  for (let t = d1; t <= d2; t += DIA_MS) {
    const d = new Date(t);
    if (!marcados.has(d.getUTCDay())) continue;
    if (sueltas && !sueltas.has(t)) continue;
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

/**
 * CUÁNTOS MESES DURA EL CONTRATO PARA LOS IMPORTES, con las jornadas del tipo de contrato.
 *
 * Si el tipo dice cuántas jornadas tiene un mes («Jornada»: 22), un mes son 22 jornadas: el contrato
 * dura `jornadas ÷ 22` meses, y con eso `derivarImportes` da mensual = jornada × 22 —que es la escala
 * mensual × el multiplicador, la misma base de `importePorJornada`—. Con los meses del calendario, un
 * día suelto contaba como un cuarto de mes y el mensual salía jornada × 4.
 *
 * Sin jornadas en el tipo, los meses del período de siempre (`mesesEquivalentes`).
 */
export const mesesParaImportes = (mesesEq: number, jornadas: number, jornadasDelTipo?: number | null): number =>
  Number(jornadasDelTipo) > 0 && jornadas > 0 ? jornadas / Number(jornadasDelTipo) : mesesEq;

/** Editar la jornada deja como ancla el mensual que le corresponde. `null` si todavía no se puede calcular. */
export const anclaDesdeJornada = (jornada: number, jornadas: number, mesesEq: number): AnclaImporte | null =>
  jornadas > 0 && mesesEq > 0 ? { unidad: "mensual", valor: (jornada * jornadas) / mesesEq } : null;

/** Lo que hace falta de la escala de una categoría para el importe por jornada. */
export interface EscalaParaJornada {
  sueldoBasico?: number | null;
  sueldoAdicional?: number | null;
  presentismo?: number | null;
  /** Respaldo: básico + adicional + presentismo, para las categorías que no traen los tres por separado. */
  sueldoBruto?: number | null;
}

/** Sin jornadas cargadas en el tipo de contrato, el mes se cuenta de 30 días. */
export const JORNADAS_DEL_MES_POR_DEFECTO = 30;

/**
 * EL IMPORTE POR JORNADA DE UNA CATEGORÍA, con el tipo de contrato:
 *
 *     (básico + adicional + presentismo) ÷ jornadas del tipo de contrato × multiplicador diario
 *
 * Con «Jornada» (22 jornadas, ×1,5) y el G10 del 634/11: (734.833,55 + 154.315,05 + 88.914,86)
 * ÷ 22 × 1,5 = 66.686,15. Antes era el NETO ÷ 30 × multiplicador (39.611,57 con esos números): no
 * usaba las jornadas del tipo y partía del neto en vez del bruto.
 *
 *   - Sin los tres componentes por separado se usa el bruto de la escala, que es su suma.
 *   - Sin jornadas en el tipo de contrato (0, vacío o ausente) se divide por 30.
 *   - Sin multiplicador (0, vacío o ausente) se usa 1: es «sin multiplicador», no «por cero».
 *
 * Se redondea a centavos DESPUÉS de multiplicar. Es la única cuenta: la usan el formulario del móvil,
 * las plantillas de equipo, la carga en lote y la web.
 */
export const importePorJornada = (escala: EscalaParaJornada | null | undefined, multiplicadorDiario?: number | null, jornadasDelTipo?: number | null): number => {
  if (!escala) return 0;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const componentes = n(escala.sueldoBasico) + n(escala.sueldoAdicional) + n(escala.presentismo);
  const mensual = componentes > 0 ? componentes : n(escala.sueldoBruto);
  const jornadas = Number(jornadasDelTipo) > 0 ? Number(jornadasDelTipo) : JORNADAS_DEL_MES_POR_DEFECTO;
  const multiplicador = Number(multiplicadorDiario) > 0 ? Number(multiplicadorDiario) : 1;
  return Number(((mensual / jornadas) * multiplicador).toFixed(2));
};

/** Los sueldos que guarda el contrato, derivados del importe por jornada. Ver `sueldosDelContrato`. */
export interface SueldosDelContrato {
  /** Neto por jornada: el bruto por jornada × neto/bruto de la escala. */
  sueldo_diario_neto: number;
  /** Diario neto × jornadas del contrato: lo que cobra en mano por todo el contrato. */
  sueldo_mano: number;
  /** Neto por los días que trabaja (= sueldo en mano). */
  sueldo_neto: number;
  /** Bruto por los días que trabaja: bruto por jornada × jornadas. */
  sueldo_bruto: number;
  /** Diario neto cargado − diario neto de la escala: cuánto se lo subió o bajó al editar los importes. */
  diferencia_diaria_neto: number;
}

/**
 * LOS SUELDOS DEL CONTRATO, la misma cuenta que muestra la solicitud del móvil.
 *
 * Parten del importe por jornada que se pactó (`jornadaBruto`, el `sueldo_jornada` del contrato o el
 * `dailyRate` de la solicitud), que es BRUTO, y de las jornadas del contrato:
 *
 *     diario neto  = jornada bruta × neto/bruto de la escala          (0,81 en el 634/11)
 *     en mano      = diario neto × jornadas
 *     neto         = diario neto × jornadas
 *     bruto        = jornada bruta × jornadas
 *     diferencia   = diario neto − diario neto de la escala          (0 si no se editó el importe)
 *
 * Antes el neto y el bruto eran los MENSUALES de la escala aunque el contrato fuera de un día, el
 * diario neto era el neto ÷ 30 y el sueldo en mano salía de la jornada bruta: cuatro números que no
 * hablaban del mismo contrato. Sin escala (un servicio) no hay descuentos que aplicar: neto = bruto.
 */
export const sueldosDelContrato = (p: { jornadaBruto: number; jornadas: number; proporcionNeto?: number | null; jornadaBrutoEscala?: number | null }): SueldosDelContrato => {
  const r2 = (n: number) => Number((Number.isFinite(n) ? n : 0).toFixed(2));
  const jornada = Number(p.jornadaBruto) || 0;
  const jornadas = Number(p.jornadas) > 0 ? Number(p.jornadas) : 0;
  const prop = Number(p.proporcionNeto) > 0 ? Number(p.proporcionNeto) : 1;
  const diarioNeto = jornada * prop;
  const escala = Number(p.jornadaBrutoEscala) > 0 ? Number(p.jornadaBrutoEscala) : null;
  return {
    sueldo_diario_neto: r2(diarioNeto),
    sueldo_mano: r2(diarioNeto * jornadas),
    sueldo_neto: r2(diarioNeto * jornadas),
    sueldo_bruto: r2(jornada * jornadas),
    diferencia_diaria_neto: escala === null ? 0 : r2(diarioNeto - escala * prop),
  };
};
