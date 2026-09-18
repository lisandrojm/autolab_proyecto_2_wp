import { Types } from "mongoose";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { fechaISO } from "../utils/contratoVigencia.js";

/**
 * Saca UN contrato de una asignación. Si la persona queda sin contratos en el proyecto, se borra la
 * asignación y sus referencias (equipo, coordinación, ficha), como si nunca hubiera estado.
 *
 * Es lo mismo que hace el borrado de un contrato desde el panel; vive acá para que borrar una
 * solicitud aprobada deje la base exactamente igual que borrar su contrato a mano.
 */
export async function quitarContrato(up: any, idx: number): Promise<void> {
  const projectId = up.projectId;
  const userId = up.userId;
  up.contracts.splice(idx, 1);
  up.markModified("contracts");

  if (up.contracts.length === 0) {
    const upId = up._id;
    await up.deleteOne();
    await Project.findByIdAndUpdate(projectId, { $pull: { assignedUsers: userId, teamConfig: { userId }, coordinatorAssignments: { userId } } });
    await User.findByIdAndUpdate(userId, { $pull: { projectIds: projectId, "metadata.projects": upId } });
  } else {
    await up.save();
  }
}

/** "YYYY-MM-DD" de lo que venga: la solicitud guarda texto, pero un Date no debe romper la comparación. */
const dia = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : fechaISO(v == null ? "" : String(v)));

/**
 * Cuál de los contratos candidatos es el de la solicitud (ver los criterios abajo). Sin base de datos
 * de por medio, para poder probarlo: equivocarse acá es borrar el contrato de otra contratación.
 */
export function elegirContratoDeSolicitud<T extends { c: any }>(todos: T[], params: { solicitudId: string; startDate?: unknown; dueDate?: unknown }): T | null {
  const unico = (lista: T[]) => (lista.length === 1 ? lista[0] : null);
  const libres = todos.filter((x) => !x.c.solicitudId || String(x.c.solicitudId) === params.solicitudId);
  const alta = dia(params.startDate);
  const baja = dia(params.dueDate);
  return (
    unico(todos.filter((x) => x.c.solicitudId && String(x.c.solicitudId) === params.solicitudId)) ||
    (alta ? unico(libres.filter((x) => dia(x.c.fecha_alta_contrato) === alta && dia(x.c.fecha_baja_contrato) === baja)) : null) ||
    (alta ? unico(libres.filter((x) => dia(x.c.fecha_alta_contrato) === alta)) : null)
  );
}

/** Dónde buscar el contrato de una solicitud: quién lo recibió y qué se pidió. */
export interface DatosDeSolicitud {
  solicitudId: string;
  personaId: string;
  projectIds: unknown[];
  startDate?: unknown;
  dueDate?: unknown;
}

/**
 * Los datos de búsqueda a partir del documento de la solicitud (con `_id` y `metadata`).
 *
 * El contrato va en la PERSONA: si la solicitud apunta a alguien que ya existía (`solicitudUserId`),
 * es esa; si no, al aprobarla la solicitud se convirtió en la persona misma.
 */
export function datosDeSolicitud(solicitud: any): DatosDeSolicitud {
  const m = solicitud?.metadata || {};
  const id = String(solicitud?._id || "");
  const apuntaAOtraPersona = !!m.solicitudUserId && String(m.solicitudUserId) !== id;
  return { solicitudId: id, personaId: apuntaAOtraPersona ? String(m.solicitudUserId) : id, projectIds: m.projectIds || [], startDate: m.startDate, dueDate: m.dueDate };
}

/**
 * EL CONTRATO QUE CREÓ UNA SOLICITUD AL APROBARSE: para editarlo desde la solicitud o borrarlo con ella.
 *
 * Se busca en la persona que recibió el contrato y en los proyectos que pidió la solicitud:
 *   1. por `solicitudId`, que la aprobación deja anotado en el contrato — es exacto;
 *   2. si no hay (contratos aprobados antes de ese campo), por las fechas que pidió la solicitud:
 *      primero alta y baja, después sólo el alta. Cada criterio vale SOLO si da un único contrato
 *      que no pertenezca a otra solicitud: si hay dos iguales, no se adivina cuál es.
 *
 * `null` si no aparece —p. ej. porque al aprobar se cambiaron las fechas—.
 */
export async function buscarContratoDeSolicitud(params: DatosDeSolicitud): Promise<{ up: any; c: any; idx: number } | null> {
  const projectIds = (params.projectIds || []).map((p: any) => String(p?._id ?? p)).filter((id) => Types.ObjectId.isValid(id));
  if (!Types.ObjectId.isValid(params.personaId) || projectIds.length === 0) return null;

  const asignaciones: any[] = await UserProject.find({ userId: params.personaId, projectId: { $in: projectIds } });
  const todos = asignaciones.flatMap((up) => (up.contracts || []).map((c: any, idx: number) => ({ up, c, idx })));
  return elegirContratoDeSolicitud(todos, params);
}

/** Borra el contrato de la solicitud, si aparece. Si no, no toca nada y lo dice. */
export async function borrarContratoDeSolicitud(params: DatosDeSolicitud): Promise<{ borrado: boolean; proyecto?: string; desde?: string; hasta?: string }> {
  const elegido = await buscarContratoDeSolicitud(params);
  if (!elegido) return { borrado: false };

  const detalle = { proyecto: String(elegido.up.nombre_proyecto || ""), desde: dia(elegido.c.fecha_alta_contrato), hasta: dia(elegido.c.fecha_baja_contrato) };
  await quitarContrato(elegido.up, elegido.idx);
  return { borrado: true, ...detalle };
}
