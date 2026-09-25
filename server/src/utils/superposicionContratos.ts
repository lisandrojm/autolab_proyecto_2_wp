/**
 * ═══════════════════════════════════════════════════════════════════════
 * ¿LO QUE SE PIDE SE SUPERPONE CON LO QUE LA PERSONA YA TIENE?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Antes de pedir el alta de alguien —de a uno o en lote con una plantilla de equipo— se revisan sus
 * contratos y sus otras solicitudes pendientes, EN CUALQUIER PROYECTO (también el mismo):
 *
 *   · HORARIO   comparten al menos un día Y los horarios se pisan (o es el mismo turno). La persona no
 *               puede estar en dos lugares a la vez: es el aviso fuerte, pide confirmación explícita.
 *   · FECHAS    los períodos se cruzan pero en días u horarios distintos. Puede estar bien (alguien que
 *               hace mañana en un proyecto y noche en otro), pero quien pide tiene que saberlo.
 *
 * Son AVISOS, no bloqueos: los contratos que vienen de FRAME no siempre traen días u horario, y un
 * bloqueo con datos incompletos frenaría altas legítimas. Cuando falta el dato se asume que PODRÍA
 * pisarse y el mensaje lo dice («sin días cargados»), en lugar de callarse.
 *
 * Puro: sin base ni fechas del sistema (el «hoy» entra por parámetro). Lo arma `services/superposicion.ts`.
 */

export interface PedidoDeAlta {
  /** "YYYY-MM-DD" */
  desde: string;
  /** "YYYY-MM-DD"; vacío = tiempo indeterminado. */
  hasta: string;
  /** Jornada por días sueltos: los días exactos. Si vienen, mandan sobre `desde/hasta/dias`. */
  fechas?: string[];
  /** 0 = domingo … 6 = sábado. Vacío o rotativos = cualquier día. */
  dias: number[];
  rotativos?: boolean;
  /** "HH:MM" */
  inTime: string;
  outTime: string;
  shiftIds?: string[];
}

export interface CompromisoExistente {
  /** `lote` = otro puesto de la MISMA contratación en lote (la persona ocupa dos puestos). */
  origen: "contrato" | "solicitud" | "lote";
  proyectoNombre: string;
  /** "YYYY-MM-DD" */
  desde: string;
  /** "YYYY-MM-DD"; vacío = sin baja. */
  hasta: string;
  fechas?: string[];
  dias?: number[];
  rotativos?: boolean;
  inTime?: string;
  outTime?: string;
  shiftIds?: string[];
  turnoNombre?: string;
}

export interface Superposicion {
  tipo: "horario" | "fechas";
  origen: CompromisoExistente["origen"];
  proyectoNombre: string;
  desde: string;
  hasta: string;
  /** Vigente hoy (ya arrancó y no terminó). Sólo para contratos. */
  vigente: boolean;
  /** Qué no se pudo comparar por falta de datos: el aviso lo dice en vez de callarlo. */
  sinDatos: ("dias" | "horario")[];
  mensaje: string;
}

const DIA_MS = 86400000;
/** Hasta dónde se mira un período sin fin: un año alcanza para encontrar un cruce de días de semana. */
const HORIZONTE_DIAS = 366;

const utc = (f: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(f || "");
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};
const corta = (f: string) => {
  const [y, m, d] = (f || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};

/** "HH:MM" → minutos. `null` si no se entiende. */
const minutos = (h?: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(h || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * ¿Se pisan dos horarios de un mismo día? Un turno que cruza la medianoche (18:00 a 00:00, 22:00 a 06:00)
 * termina al día siguiente: se lo compara también corrido un día para cada lado. Tocarse en el borde
 * (uno termina 12:00 y el otro empieza 12:00) no es pisarse.
 */
export function horariosSePisan(a: { inTime?: string; outTime?: string }, b: { inTime?: string; outTime?: string }): boolean | null {
  const a1 = minutos(a.inTime);
  let a2 = minutos(a.outTime);
  const b1 = minutos(b.inTime);
  let b2 = minutos(b.outTime);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return null;
  if (a2 <= a1) a2 += 1440;
  if (b2 <= b1) b2 += 1440;
  return [-1440, 0, 1440].some((corrimiento) => a1 < b2 + corrimiento && b1 + corrimiento < a2);
}

/** Los días concretos (ms UTC) de un pedido o compromiso, acotados a [desde, hasta] del otro. */
function diasEnVentana(x: { desde: string; hasta: string; fechas?: string[] }, ventana: [number, number]): number[] {
  if (x.fechas && x.fechas.length > 0) return x.fechas.map(utc).filter((t): t is number => t !== null && t >= ventana[0] && t <= ventana[1]);
  const d1 = utc(x.desde);
  if (d1 === null) return [];
  const d2 = utc(x.hasta) ?? d1 + HORIZONTE_DIAS * DIA_MS;
  const desde = Math.max(d1, ventana[0]);
  const hasta = Math.min(d2, ventana[1]);
  const dias: number[] = [];
  for (let t = desde; t <= hasta; t += DIA_MS) dias.push(t);
  return dias;
}

const rango = (x: { desde: string; hasta: string; fechas?: string[] }): [number, number] | null => {
  if (x.fechas && x.fechas.length > 0) {
    const ts = x.fechas.map(utc).filter((t): t is number => t !== null);
    return ts.length ? [Math.min(...ts), Math.max(...ts)] : null;
  }
  const d1 = utc(x.desde);
  if (d1 === null) return null;
  return [d1, utc(x.hasta) ?? d1 + HORIZONTE_DIAS * DIA_MS];
};

const usaDia = (x: { dias?: number[]; rotativos?: boolean; fechas?: string[] }, t: number): boolean | null => {
  if (x.fechas && x.fechas.length > 0) return true; // ya son los días exactos
  if (x.rotativos || !x.dias || x.dias.length === 0) return null; // no se sabe qué días
  return x.dias.includes(new Date(t).getUTCDay());
};

export function superposiciones(pedido: PedidoDeAlta, existentes: CompromisoExistente[], hoy: string): Superposicion[] {
  const rPedido = rango(pedido);
  if (!rPedido) return [];
  const resultado: Superposicion[] = [];

  for (const e of existentes) {
    const rE = rango(e);
    if (!rE) continue;
    const ventana: [number, number] = [Math.max(rPedido[0], rE[0]), Math.min(rPedido[1], rE[1])];
    if (ventana[0] > ventana[1]) continue; // los períodos no se tocan

    // ¿Hay un día en común que los dos trabajen? Si alguno no dice qué días, se asume que sí.
    // Un día CONFIRMADO (los dos dicen que trabajan) gana sobre uno POSIBLE (a alguno le faltan los días).
    const delPedido = new Set(diasEnVentana(pedido, ventana));
    let confirmado = false;
    let posible = false;
    for (const t of diasEnVentana(e, ventana)) {
      if (!delPedido.has(t)) continue;
      const p = usaDia(pedido, t);
      const x = usaDia(e, t);
      if (p === false || x === false) continue;
      if (p === true && x === true) {
        confirmado = true;
        break;
      }
      posible = true;
    }
    const diaEnComun = confirmado || posible;
    const diasDesconocidos = !confirmado && posible;
    // Sin un día en común, los períodos se cruzan en días distintos: es un aviso de fechas, no de horario.
    const mismoTurno = diaEnComun && !!pedido.shiftIds?.length && !!e.shiftIds?.some((s) => pedido.shiftIds!.includes(s));
    const pisan = !diaEnComun ? false : mismoTurno ? true : horariosSePisan(pedido, e);
    const sinDatos: Superposicion["sinDatos"] = [];
    if (diasDesconocidos) sinDatos.push("dias");
    if (pisan === null) sinDatos.push("horario");
    const tipo: Superposicion["tipo"] = pisan === false ? "fechas" : "horario";
    const vigente = e.origen === "contrato" && e.desde <= hoy && (!e.hasta || e.hasta >= hoy);

    const que = e.origen === "lote" ? "Ocupa otro puesto de esta contratación" : e.origen === "solicitud" ? "Tiene otra solicitud pendiente" : vigente ? "Tiene un contrato vigente" : "Tiene un contrato";
    const periodo = e.hasta ? `del ${corta(e.desde)} al ${corta(e.hasta)}` : `desde el ${corta(e.desde)}, sin fecha de baja`;
    const horario = e.inTime && e.outTime ? ` (${e.inTime} a ${e.outTime}${e.turnoNombre ? `, ${e.turnoNombre}` : ""})` : e.turnoNombre ? ` (${e.turnoNombre})` : "";
    const falta = sinDatos.length ? ` No se pudo confirmar: ${sinDatos.map((s) => (s === "dias" ? "sin días cargados" : "sin horario cargado")).join(" y ")}.` : "";
    const mensaje =
      tipo === "horario"
        ? `${que} ${e.origen === "lote" ? `(${e.proyectoNombre})` : `en ${e.proyectoNombre || "otro proyecto"}`} ${periodo}${horario} que se superpone en días y horario${mismoTurno ? " (mismo turno)" : ""}.${falta}`
        : `${que} ${e.origen === "lote" ? `(${e.proyectoNombre})` : `en ${e.proyectoNombre || "otro proyecto"}`} ${periodo}${horario}: las fechas se cruzan, ${diaEnComun ? "en otro horario" : "en otros días de la semana"}.${falta}`;

    resultado.push({ tipo, origen: e.origen, proyectoNombre: e.proyectoNombre, desde: e.desde, hasta: e.hasta, vigente, sinDatos, mensaje });
  }

  // Primero lo grave.
  return resultado.sort((a, b) => (a.tipo === b.tipo ? a.desde.localeCompare(b.desde) : a.tipo === "horario" ? -1 : 1));
}

/**
 * UN PUESTO DE UN EQUIPO GUARDADO, ya con sus condiciones (las del puesto pisadas por las del equipo).
 * Sin fechas: una plantilla no las tiene, así que sólo se comparan los días de la semana y el horario.
 */
export interface PuestoDelEquipo {
  puestoId: string;
  /** Cómo se lo nombra en el aviso («puesto 3, Cámara»). */
  etiqueta: string;
  userId: string;
  dias: number[];
  rotativos?: boolean;
  /** Por días sueltos: los días se eligen al contratar, no se saben. */
  porDiasSueltos?: boolean;
  inTime?: string;
  outTime?: string;
  shiftId?: string | null;
}

/**
 * ¿La misma persona ocupa dos puestos del equipo que se pisan? Se permite (mañana en uno y noche en otro
 * está bien) y se AVISA cuando comparten un día de la semana y el horario se pisa o es el mismo turno.
 * Si falta el dato (días rotativos o sueltos, sin horario) se avisa que PODRÍA pisarse. Devuelve los
 * avisos por `puestoId` (cada puesto del par recibe el suyo).
 */
export function choquesDelEquipo(puestos: PuestoDelEquipo[]): Map<string, string[]> {
  const avisos = new Map<string, string[]>();
  const sumar = (id: string, m: string) => avisos.set(id, [...(avisos.get(id) || []), m]);
  const diasInciertos = (p: PuestoDelEquipo) => !!p.porDiasSueltos || !!p.rotativos || p.dias.length === 0;
  const conPersona = puestos.filter((p) => p.userId);
  for (let i = 0; i < conPersona.length; i++) {
    for (let j = i + 1; j < conPersona.length; j++) {
      const a = conPersona[i];
      const b = conPersona[j];
      if (a.userId !== b.userId) continue;
      const inciertos = diasInciertos(a) || diasInciertos(b);
      const comunes = inciertos ? [] : a.dias.filter((d) => b.dias.includes(d));
      if (!inciertos && comunes.length === 0) continue; // días distintos: no se pisan
      const mismoTurno = !!a.shiftId && a.shiftId === b.shiftId;
      const pisan = mismoTurno ? true : horariosSePisan(a, b);
      if (pisan === false) continue; // otro horario el mismo día: está bien
      const falta = [inciertos ? "los días" : "", pisan === null ? "el horario" : ""].filter(Boolean).join(" y ");
      const texto = (otro: PuestoDelEquipo) =>
        falta ? `La misma persona ocupa también el ${otro.etiqueta}: podría pisarse (no se sabe ${falta}).` : `La misma persona ocupa también el ${otro.etiqueta} y se pisan en días y horario${mismoTurno ? " (mismo turno)" : ""}.`;
      sumar(a.puestoId, texto(b));
      sumar(b.puestoId, texto(a));
    }
  }
  return avisos;
}
