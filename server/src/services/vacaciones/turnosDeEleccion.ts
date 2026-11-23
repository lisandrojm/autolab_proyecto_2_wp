import { Types } from "mongoose";
import { CampaniaVacaciones, InvitacionVacaciones, type ICampaniaVacaciones, type IInvitacionVacaciones } from "../../models/CampaniaVacaciones.js";
import { VacationConfig, type IEmbeddedOverlap } from "../../models/VacationConfig.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { RoleFrame } from "../../models/RoleFrame.js";
import { Project } from "../../models/Project.js";
import { hoyArgentina } from "../../utils/contratoVigencia.js";
import { fechaCorta } from "../../compartido/planVacaciones/fechas.js";
import { PUEDE_PROPONER, armarTurnos, estadoDelTurno, type EstadoDelTurno, type MiembroDelTurno, type TurnoDeEleccion } from "../../compartido/vacaciones/campania.js";
import { ambitosDe, perfilDeSolapamiento, reglasAplicables } from "./solapamiento.js";
import { saldosDeVacaciones } from "./saldos.js";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * TURNOS PARA ELEGIR EN LA CAMPAÑA DE GOCE, POR ANTIGÜEDAD (23/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Una regla de solapamiento con «Quién elige primero: por antigüedad» ordena a las personas que alcanza (las del
 * mismo rol en su ámbito: proyecto × área, como cuenta el solapamiento): la más antigua elige primero y cada una
 * tiene `diasPorTurno` días antes de que se le abra a la siguiente. La regla pura (orden, fechas, cuándo se abre)
 * está en `compartido/vacaciones/campania.ts`; acá se arma cada grupo con la gente invitada y se guarda el turno en
 * cada invitación (`turnos`).
 *
 * Qué personas entran: las invitadas de la campaña a las que la regla les APLICA (`reglasAplicables`: activa y la
 * más específica de las suyas). No se mira el horario de los contratos (el solapamiento sí, al contar): el turno
 * ordena a todo el rol del ámbito.
 *
 * Cuándo se arma: al lanzar, y al crear, cambiar o borrar una regla con orden (en segundo plano, en todas las
 * campañas lanzadas). El día de arranque (`base`) de un grupo se conserva al rearmar: cambiar los días de turno no
 * reinicia la cuenta.
 */

const oid = (x: unknown) => new Types.ObjectId(String(x));
const conOrden = (r: IEmbeddedOverlap) => r.isActive && r.prioridad === "antiguedad";

/** El nombre de la regla para mostrar: su descripción, o «rol · proyecto». */
async function nombreDeRegla(r: IEmbeddedOverlap): Promise<string> {
  if (r.description?.trim()) return r.description.trim();
  const partes: string[] = [];
  if (r.roleFrameId) {
    const rf: any = await RoleFrame.findById(r.roleFrameId).select("name").lean();
    if (rf?.name) partes.push(rf.name);
  }
  if (r.projectId) {
    const p: any = await Project.findById(r.projectId).select("name").lean().catch(() => null);
    if (p?.name) partes.push(p.name);
  }
  return partes.join(" · ") || "Regla de solapamiento";
}

/**
 * Las invitadas a las que les aplica la regla, agrupadas por ámbito. Primero se acota por lo que se puede pedir a la
 * base (proyecto y área de la regla); después se confirma persona por persona con la misma lectura del solapamiento.
 */
export async function gruposDeLaRegla(tid: Types.ObjectId, regla: IEmbeddedOverlap, userIds: string[]): Promise<Map<string, string[]>> {
  const grupos = new Map<string, string[]>();
  let ids = userIds;
  if (regla.areaId) {
    const enArea = new Set((await UserProject.find({ areaId: regla.areaId }).distinct("userId")).map(String));
    ids = ids.filter((u) => enArea.has(u));
  }
  const query: any = { tenantId: tid, "metadata.activo": true, _id: { $in: ids.map(oid) } };
  if (regla.projectId) query.projectIds = regla.projectId;
  const candidatos = ids.length ? (await User.find(query).select("_id").lean()).map((u: any) => String(u._id)) : [];
  for (const uid of candidatos) {
    const perfil = await perfilDeSolapamiento(tid, uid);
    if (!perfil) continue;
    const aplicables = await reglasAplicables(tid, perfil);
    if (!aplicables.some((r) => String(r._id) === String(regla._id))) continue;
    for (const a of ambitosDe(regla, perfil)) {
      const clave = `${String(regla._id)}|${a.pId ? String(a.pId) : "-"}|${a.aId ? String(a.aId) : "-"}`;
      const g = grupos.get(clave) || [];
      if (!g.includes(uid)) g.push(uid);
      grupos.set(clave, g);
    }
  }
  return grupos;
}

const mismoTurno = (a: TurnoDeEleccion[], b: TurnoDeEleccion[]) => {
  const clave = (l: TurnoDeEleccion[]) => JSON.stringify([...l].map((t) => [t.grupo, t.orden, t.de, t.desde, t.delante.join(","), t.recortado, t.regla]).sort());
  return clave(a) === clave(b);
};

/**
 * ARMA LOS TURNOS DE UNA CAMPAÑA LANZADA y los guarda en cada invitación (sólo las que cambian, con su paso en el
 * historial). Sin reglas con orden, deja todas sin turno.
 */
export async function recalcularTurnos(tid: Types.ObjectId, c: ICampaniaVacaciones): Promise<{ grupos: number; conTurno: number; recortados: number; cambiadas: number }> {
  if (c.estado !== "lanzada") return { grupos: 0, conTurno: 0, recortados: 0, cambiadas: 0 };
  const hoy = hoyArgentina();
  const config: any = await VacationConfig.findOne({ tenantId: tid }).select("overlaps").lean();
  const reglas: IEmbeddedOverlap[] = (config?.overlaps || []).filter(conOrden);
  const invitaciones = await InvitacionVacaciones.find({ tenantId: tid, campaniaId: c._id }).select("_id userId nombre turnos fechaLimite").lean();
  const invDe = new Map(invitaciones.map((i: any) => [String(i.userId), i]));
  // El día de arranque de cada grupo que ya existía: se conserva.
  const baseDe = new Map<string, string>();
  for (const i of invitaciones as any[]) for (const t of i.turnos || []) if (t.grupo && t.base && !baseDe.has(t.grupo)) baseDe.set(t.grupo, t.base);

  const nuevos = new Map<string, TurnoDeEleccion[]>();
  let grupos = 0;
  for (const regla of reglas) {
    const porAmbito = await gruposDeLaRegla(tid, regla, [...invDe.keys()]);
    const conVarias = [...porAmbito.entries()].filter(([, uids]) => uids.length >= 2);
    if (conVarias.length === 0) continue;
    const nombre = await nombreDeRegla(regla);
    const todos = [...new Set(conVarias.flatMap(([, u]) => u))];
    const saldos = await saldosDeVacaciones(String(tid), tid, c.anio, { userIds: todos });
    const antig = new Map(saldos.map((f: any) => [String(f.userId), { dias: Number(f.antiguedad?.dias) || 0, ingreso: f.hireDate || null }]));
    for (const [grupo, uids] of conVarias) {
      grupos++;
      const miembros: MiembroDelTurno[] = uids.map((u) => ({ invitacionId: String(invDe.get(u)._id), nombre: invDe.get(u).nombre || "", antiguedadDias: antig.get(u)?.dias || 0, ingreso: antig.get(u)?.ingreso || null }));
      const turnos = armarTurnos({ grupo, reglaId: String(regla._id), regla: nombre, miembros, base: baseDe.get(grupo) || hoy, diasPorTurno: regla.diasPorTurno || 3, fechaLimite: c.fechaLimite || "" });
      for (const [invId, t] of turnos) nuevos.set(invId, [...(nuevos.get(invId) || []), t]);
    }
  }

  const ops: any[] = [];
  let conTurno = 0;
  let recortados = 0;
  for (const i of invitaciones as any[]) {
    const id = String(i._id);
    const t = nuevos.get(id) || [];
    if (t.length) conTurno++;
    if (t.some((x) => x.recortado)) recortados++;
    if (mismoTurno(i.turnos || [], t)) continue;
    const detalle = t.length
      ? t.map((x) => `Elige por antigüedad (${x.regla}): turno ${x.orden} de ${x.de}, desde el ${fechaCorta(x.desde)}${x.orden > 1 ? " o antes si ya eligieron las de adelante" : ""}.`).join(" ")
      : "Ya no tiene turno para elegir: elige cuando quiera.";
    ops.push({ updateOne: { filter: { _id: i._id }, update: { $set: { turnos: t }, $push: { historial: { accion: "turno", porUserId: null, at: new Date(), detalle } } } } });
  }
  if (ops.length) await InvitacionVacaciones.bulkWrite(ops, { ordered: false });
  if (ops.length || grupos) console.log(`[turnos-vacaciones] ${String(c._id)}: ${grupos} grupo(s), ${conTurno} con turno, ${ops.length} cambiada(s)`);
  return { grupos, conTurno, recortados, cambiadas: ops.length };
}

/** Rearma los turnos de todas las campañas lanzadas del tenant (después de cambiar una regla con orden). */
export async function recalcularTurnosDelTenant(tid: any) {
  const t = oid(tid);
  const lanzadas = await CampaniaVacaciones.find({ tenantId: t, estado: "lanzada" });
  for (const c of lanzadas) await recalcularTurnos(t, c);
}

/** ¿Ya puede elegir? Mira cómo están las invitaciones que tiene adelante. */
export async function estadoDelTurnoDe(inv: Pick<IInvitacionVacaciones, "turnos">, hoy = hoyArgentina()): Promise<EstadoDelTurno> {
  const turnos = (inv.turnos || []) as TurnoDeEleccion[];
  const delante = [...new Set(turnos.flatMap((t) => t.delante || []))].filter((x) => Types.ObjectId.isValid(x));
  const estados = delante.length ? await InvitacionVacaciones.find({ _id: { $in: delante.map(oid) } }).select("estado").lean() : [];
  const estadoDe = new Map(estados.map((i: any) => [String(i._id), i.estado]));
  // Una que ya no está (o ya no espera para elegir) no frena a nadie.
  return estadoDelTurno(turnos, hoy, (id) => !PUEDE_PROPONER.includes(estadoDe.get(id)));
}
