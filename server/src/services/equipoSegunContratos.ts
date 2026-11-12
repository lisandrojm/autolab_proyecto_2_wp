import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { getContratoActivo, hoyArgentina } from "../utils/contratoVigencia.js";

/**
 * EL ÁREA Y EL TURNO DE CADA MIEMBRO SE LEEN DEL CONTRATO QUE RIGE (12/11/2026).
 *
 * Pedido: «quiero que las pantallas del equipo lean directamente el contrato que rige»; que el equipo
 * dijera «Tarde» y el contrato «Mañana» confundía. `project.teamConfig` sigue guardando la fila de cada
 * persona (si puede registrar, su horario propio, quién la tocó), pero su ÁREA/TURNO/SEDE ya no se lee de
 * ahí: antes de que `teamConfig` salga del server o de que el server lo use para contar, se le superpone
 * lo que dice el contrato que rige de cada uno. Así todas las pantallas (Gestionar Equipo, Jerarquía,
 * Supervisores, la app, vacaciones, reportes de novedades) muestran lo mismo sin tocar cada una.
 *
 * Reglas:
 *   · Tiene contrato que rige con área → ésa, exacta (áreas, turnos y sede de cada fila).
 *   · El contrato sólo tiene los campos viejos (`areaId`/`shiftId`) → una fila con ésos.
 *   · El contrato que rige no tiene ninguna área cargada, o la persona no tiene contratos en el proyecto
 *     → queda lo que diga su fila del equipo (no se la manda a «sin área» por un contrato viejo incompleto).
 *   · Tiene contrato con área y no tenía fila → se le arma una, con los defaults del modelo.
 *
 * Qué contrato rige lo decide `getContratoActivo` / `contratosQueRigenDelProyecto` (vigentes; entre
 * ellos el de tiempo indeterminado; el más reciente). Cambia solo con el calendario: es lo pedido.
 */

/** Las filas de área del contrato, o `null` si no tiene ninguna cargada. */
export function areasDelContrato(contrato: any): any[] | null {
  const filas = ((contrato?.areaShiftAssignments || []) as any[]).filter((a) => a?.areaId);
  if (filas.length) return filas;
  if (contrato?.areaId) return [{ areaId: contrato.areaId, shiftIds: contrato.shiftId ? [contrato.shiftId] : [] }];
  return null;
}

/** `teamConfig` con el área de cada persona tomada de su contrato que rige (`contratoDe`: userId → contrato). No modifica el original. */
export function superponerContratos(teamConfig: any[] | null | undefined, contratoDe: Map<string, any>): any[] {
  const vistos = new Set<string>();
  const idDe = (v: any) => String(v?._id ?? v ?? "");
  const conArea = (fila: any, areas: any[]) => ({ ...fila, areaShiftAssignments: areas, areaId: areas[0]?.areaId ?? null, shiftId: areas[0]?.shiftIds?.[0] ?? null });
  const filas = (teamConfig || []).map((fila: any) => {
    const uid = idDe(fila?.userId);
    vistos.add(uid);
    const areas = areasDelContrato(contratoDe.get(uid));
    return areas ? conArea(fila, areas) : fila;
  });
  for (const [uid, contrato] of contratoDe) {
    if (vistos.has(uid)) continue;
    const areas = areasDelContrato(contrato);
    if (areas) filas.push(conArea({ userId: uid, canRegister: true, useProjectSchedule: true }, areas));
  }
  return filas;
}

/** Lo mismo, buscando los contratos que rigen del proyecto. */
export async function equipoSegunContratos(projectId: string, teamConfig: any[] | null | undefined): Promise<any[]> {
  return superponerContratos(teamConfig, await contratosQueRigenDelProyecto(String(projectId), hoyArgentina()));
}

/** Para UNA persona con sus contratos del proyecto a mano (la ficha del usuario). */
export function filaSegunContratos(fila: any, contratos: any[] | null | undefined): any {
  const areas = areasDelContrato(getContratoActivo((contratos || []) as any[]));
  return areas && fila ? { ...fila, areaShiftAssignments: areas, areaId: areas[0]?.areaId ?? null, shiftId: areas[0]?.shiftIds?.[0] ?? null } : fila;
}
