import { Types } from "mongoose";
import { User } from "../models/User.js";
import { idDe, sedeDe } from "../compartido/areaTurno.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
import { areasDelContrato } from "./equipoSegunContratos.js";

/**
 * PONERLE LA SEDE A LAS ASIGNACIONES DE UN ÁREA (área × sede explícita, 18/10/2026).
 *
 * La fila (sede) de una persona en un área sale de la `sedeId` de su asignación, sin deducir nada del
 * contrato (ver `sedeEnArea`). Esto la escribe, sobre `project.teamConfig` —nunca sobre contratos—:
 * a quien no tenga fila propia en `teamConfig` se le copia la asignación de su contrato que rige, como
 * hace la Jerarquía al arrastrar.
 *
 * Lo usan dos cosas:
 *   · «Pasar todos a…» de la Jerarquía, para ubicar a los que les falta elegir sede (`userIds`);
 *   · el guardado del proyecto cuando un área pasa de una sede a varias: a los que estaban ahí se les
 *     estampa la sede de la fila que ya existía (`soloSinSede`), para que nadie quede colgado.
 *
 * Modifica `project` (un documento de Mongoose) en memoria; quien llama hace el `save`. Devuelve
 * cuántas personas cambió.
 */
export async function ponerSedeEnArea(
  tenantObjectId: Types.ObjectId,
  project: any,
  areaId: string,
  sedeId: number,
  opciones: { userIds?: string[]; soloSinSede?: boolean },
): Promise<number> {
  const ids = opciones.userIds
    ? opciones.userIds.filter((id) => Types.ObjectId.isValid(id))
    : ((await User.find({ tenantId: tenantObjectId, projectIds: project._id }).select("_id").lean()) as any[]).map((u) => String(u._id));
  if (ids.length === 0) return 0;

  const config: any[] = project.teamConfig || [];
  const porUsuario = new Map<string, any>(config.map((c: any) => [String(c.userId), c]));
  /*
    Se parte del área que el equipo MUESTRA: la de los contratos vigentes de cada uno (14/11/2026, ver
    `services/equipoSegunContratos.ts`), y la fila guardada sólo para quien no tiene área en ningún contrato.
    Partiendo de la fila guardada, a quien tiene dos contratos vigentes en turnos distintos se le perdía uno.
  */
  const contratoDe = await contratosQueRigenDelProyecto(String(project._id), hoyArgentina());

  let cambiadas = 0;
  for (const id of ids) {
    const entrada = porUsuario.get(id);
    const propias: any[] = entrada?.areaShiftAssignments || [];
    const base: any[] = areasDelContrato(contratoDe.get(id)) || propias;
    if (!base.some((a) => idDe(a?.areaId) === areaId)) continue;

    let cambio = false;
    const nuevas = base.map((a: any) => {
      const plano = {
        areaId: new Types.ObjectId(idDe(a.areaId)),
        shiftIds: (a.shiftIds || []).map((s: any) => new Types.ObjectId(idDe(s))),
        ...(sedeDe(a.sedeId) ? { sedeId: sedeDe(a.sedeId)! } : {}),
      };
      if (idDe(a.areaId) !== areaId) return plano;
      if (opciones.soloSinSede && sedeDe(a.sedeId)) return plano;
      if (sedeDe(a.sedeId) === sedeId) return plano;
      cambio = true;
      return { ...plano, sedeId };
    });
    if (!cambio) continue;

    if (entrada) entrada.areaShiftAssignments = nuevas;
    // Sin fila propia: se crea con los defaults del modelo, como la Jerarquía (sin inventarle horario).
    else config.push({ userId: new Types.ObjectId(id), canRegister: true, useProjectSchedule: true, areaShiftAssignments: nuevas });
    cambiadas++;
  }

  if (cambiadas > 0) {
    project.teamConfig = config;
    project.markModified?.("teamConfig");
  }
  return cambiadas;
}
