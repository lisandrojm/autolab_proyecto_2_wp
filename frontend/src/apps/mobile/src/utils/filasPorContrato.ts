/*
  UNA PERSONA, DOS FILAS EN EL REPORTE DE ASISTENCIA (14/11/2026).

  Quien tiene dos contratos vigentes a la vez en turnos distintos —un plazo fijo a la Mañana y un Servicios
  Adicional a la Tarde— va en el reporte una vez por contrato: son dos jornadas distintas y cada una tiene su
  asistencia. Todo el formulario guarda las respuestas por `id`, así que esas filas llevan un id propio,
  «<id de la persona>@<área::turno>», y `turnoDeFila` dice de qué turno son y con qué horario. El resto de la
  gente sigue con su id de siempre: para ellos no cambia nada.

  Puro, sin imports: se prueba con `tsx --test`.
*/

export const SEP_FILA = "@";

/** El id de la PERSONA, venga de una fila propia («id@área::turno») o no. Para guardar el parte, buscar sus vacaciones, armar reemplazos. */
export const idReal = (id: unknown): string => String(id ?? "").split(SEP_FILA)[0];

export interface TurnoDeFila {
  areaId: string;
  shiftId: string;
  startTime?: string;
  endTime?: string;
}

/** Lo que manda el server por cada contrato vigente de quien tiene varios en turnos distintos (`porContrato`). */
export interface ContratoConTurnos {
  claves: string[];
  nombreContrato?: string;
  fechaAlta?: string;
  horaInicio?: string;
  horaFin?: string;
}

export interface FilaDeContrato {
  id: string;
  turnoDeFila: TurnoDeFila;
  contrato: ContratoConTurnos;
}

/**
 * Las filas de una persona en el reporte: una por contrato que entra en lo que se está reportando
 * (`enAlcance`: el área/turno elegido, o los que coordina quien reporta), con el horario de ese contrato o,
 * si el contrato no lo tiene, el del turno. Devuelve [] cuando la persona va una sola vez, como siempre
 * (no tiene varios contratos en turnos distintos, o ninguno entra en lo reportado).
 *
 * El id de la fila sale de la PRIMERA combinación del contrato, no de la que entra en el alcance: cambiar
 * de «Todas las áreas» a un turno puntual no le cambia el id ni pierde lo ya cargado.
 */
export function filasPorContrato(
  personaId: string,
  porContrato: ContratoConTurnos[] | null | undefined,
  enAlcance: (clave: string) => boolean,
  horarioDelTurno: (shiftId: string) => { startTime?: string; endTime?: string } | null | undefined,
): FilaDeContrato[] {
  if (!porContrato || porContrato.length < 2) return [];
  const filas: FilaDeContrato[] = [];
  for (const contrato of porContrato) {
    const clave = (contrato.claves || []).find(enAlcance);
    if (!clave) continue;
    const [areaId = "", shiftId = ""] = clave.split("::");
    const turno = horarioDelTurno(shiftId);
    filas.push({
      id: `${personaId}${SEP_FILA}${contrato.claves[0]}`,
      turnoDeFila: { areaId, shiftId, startTime: contrato.horaInicio || turno?.startTime || undefined, endTime: contrato.horaFin || turno?.endTime || undefined },
      contrato,
    });
  }
  return filas;
}

/**
 * AL EDITAR UN PARTE GUARDADO, las novedades llegan con el id de la persona. Si esa persona va más de una
 * vez, cada novedad se devuelve a su fila: la del turno que dice la fila guardada, o la del horario; si el
 * parte es de antes de este cambio y no dice nada, a la primera. Devuelve `null` si no hay nada que mover
 * (para no volver a guardar el estado en vano).
 */
export function novedadesASuFila<T extends { employeeId: string; filaShiftId?: string; filaScheduleIn?: string }>(novedades: T[], filas: { id: string; turnoDeFila?: TurnoDeFila }[]): T[] | null {
  const filasDe = new Map<string, { id: string; turnoDeFila?: TurnoDeFila }[]>();
  for (const f of filas) if (f.turnoDeFila) filasDe.set(idReal(f.id), [...(filasDe.get(idReal(f.id)) || []), f]);
  if (filasDe.size === 0) return null;
  let cambio = false;
  const nuevas = novedades.map((n) => {
    // Sólo las que traen el id de la persona: una que ya está en su fila tiene «@» y no es clave del mapa.
    const propias = filasDe.get(n.employeeId);
    if (!propias) return n;
    const fila = propias.find((f) => !!n.filaShiftId && f.turnoDeFila?.shiftId === n.filaShiftId) || propias.find((f) => !!n.filaScheduleIn && f.turnoDeFila?.startTime === n.filaScheduleIn) || propias[0];
    cambio = true;
    return { ...n, employeeId: fila.id };
  });
  return cambio ? nuevas : null;
}
