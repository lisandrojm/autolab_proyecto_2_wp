import { Types } from "mongoose";
import { claveAreaTurno, clavesDelMiembro, sedePrincipalDe } from "../../compartido/areaTurno.js";
import type { CadenaDeAprobacion, ProyectoDeLaCadena } from "../../compartido/vacaciones/etapaDeAprobacion.js";
import UserProject from "../../models/UserProject.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { esContratoVigente, hoyArgentina } from "../../utils/contratoVigencia.js";
import { filaSegunContratos } from "../equipoSegunContratos.js";

/**
 * QUIÉN APRUEBA LAS VACACIONES DE UNA PERSONA (15/11/2026). Ver `compartido/vacaciones/etapaDeAprobacion.ts`.
 *
 * Por cada proyecto donde tiene un contrato VIGENTE HOY:
 *   · Supervisores: los de `coordinatorAssignments` (rol «Supervisor», nombres cruzados en el código) cuya
 *     combinación área × turno × sede coincide con la de la persona. Su área/turno sale de sus contratos
 *     vigentes (`filaSegunContratos`), el mismo criterio que contratos por vencer y Equipos.
 *   · Coordinadores: el responsable del proyecto (`metadata.responsableId`, el id de FRAME = `User.metadata.id`).
 *
 * La persona nunca se aprueba a sí misma: si es la supervisora de su propia área, ese nivel pasa al siguiente.
 * Sin contrato vigente en ningún proyecto, la cadena queda vacía y la solicitud va directo al admin.
 */
export async function cadenaDeAprobacion(tenantId: Types.ObjectId | string, userId: Types.ObjectId | string, hoy: string = hoyArgentina()): Promise<CadenaDeAprobacion> {
  const yo = String(userId ?? "");
  if (!Types.ObjectId.isValid(yo) || !Types.ObjectId.isValid(String(tenantId))) return { proyectos: [], calculadaAt: new Date() };
  const tenant = new Types.ObjectId(String(tenantId));
  /*
    Por `projectId` + `userId`, que es el índice que tiene `users_&_projects`: buscar sólo por `userId`
    recorre la colección entera con los contratos adentro (ver memoria de índices / latencia de Atlas).
  */
  const persona: any = await User.findById(yo).select("projectIds").lean();
  const misProyectos = ((persona?.projectIds || []) as any[]).map((p) => new Types.ObjectId(String(p)));
  if (misProyectos.length === 0) return { proyectos: [], calculadaAt: new Date() };
  const asignaciones: any[] = await UserProject.find({ projectId: { $in: misProyectos }, userId: new Types.ObjectId(yo) }).select("projectId contracts").lean();
  // Los proyectos donde tiene algún contrato vigente, con TODOS sus contratos ahí (`filaSegunContratos` elige).
  const vigentesPorProyecto = new Map<string, any[]>();
  for (const up of asignaciones) {
    const contratos = (up.contracts || []) as any[];
    if (up.projectId && contratos.some((c) => esContratoVigente(c, hoy))) vigentesPorProyecto.set(String(up.projectId), contratos);
  }
  if (vigentesPorProyecto.size === 0) return { proyectos: [], calculadaAt: new Date() };

  const proyectos: any[] = await Project.find({ _id: { $in: [...vigentesPorProyecto.keys()].map((id) => new Types.ObjectId(id)) }, tenantId: tenant })
    .select("_id teamConfig coordinatorAssignments areasConfig metadata.sedeIds metadata.sedeId metadata.responsableId")
    .lean();

  // Los responsables (id de FRAME) → usuarios, de una sola vez.
  const idsFrame = [...new Set(proyectos.map((p) => Number(p?.metadata?.responsableId)).filter((n) => Number.isFinite(n)))];
  const usuarioDeFrame = new Map<number, string>();
  if (idsFrame.length) for (const u of (await User.find({ tenantId: tenant, "metadata.id": { $in: idsFrame } }).select("_id metadata.id").lean()) as any[]) usuarioDeFrame.set(Number(u.metadata?.id), String(u._id));

  const resultado: ProyectoDeLaCadena[] = proyectos.map((p) => {
    const filaEquipo = ((p.teamConfig || []) as any[]).find((f) => String(f?.userId) === yo) || { userId: yo };
    const fila = filaSegunContratos(filaEquipo, vigentesPorProyecto.get(String(p._id)), hoy);
    const mias = clavesDelMiembro(fila?.areaShiftAssignments, { areasConfig: p.areasConfig || [], sedePrincipal: sedePrincipalDe(p.metadata) });
    const supervisores = new Set<string>();
    for (const a of (p.coordinatorAssignments || []) as any[]) if (a?.userId && mias.has(claveAreaTurno(a)) && String(a.userId) !== yo) supervisores.add(String(a.userId));
    const coordinador = usuarioDeFrame.get(Number(p?.metadata?.responsableId));
    return { projectId: String(p._id), supervisores: [...supervisores], coordinadores: coordinador && coordinador !== yo ? [coordinador] : [] };
  });
  return { proyectos: resultado, calculadaAt: new Date() };
}
