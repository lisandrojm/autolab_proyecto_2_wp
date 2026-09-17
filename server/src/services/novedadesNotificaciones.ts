import { Types } from "mongoose";
import { Notification } from "../models/Notification.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";

/*
  LOS AVISOS DE «ALGUIEN NUEVO»: registros y solicitudes de contratación.

  Hasta ahora, que se registrara alguien con tu link o que entrara una solicitud para un proyecto que
  coordinás no avisaba nada: había que entrar a la pantalla y darse cuenta. Estas notificaciones son
  las que ponen el número en las tarjetas Registro y Contratación del inicio de la app, y las que se
  leen en la campanita.

  Se apoyan en el modelo `Notification`, que ya existía y ya tiene leído/no leído por persona —que es
  justo lo que hace falta: la misma solicitud está leída para uno y no para otro—. El `type` es lo que
  decide en qué tarjeta se cuenta, así que es parte del contrato con la app (ver `TIPOS_NOVEDAD`).

  REGLA DE ORO: avisar NUNCA puede voltear lo que se está avisando. Todo pasa por `notificar`, que se
  come sus propios errores: si la notificación falla, el registro o la solicitud ya quedaron guardados
  y eso es lo que no se puede perder.
*/

export const NOVEDAD_REGISTRO = "registro_nuevo";
export const NOVEDAD_SOLICITUD = "solicitud_nueva";
export const NOVEDAD_SOLICITUD_APROBADA = "solicitud_aprobada";
export const NOVEDAD_SOLICITUD_RECHAZADA = "solicitud_rechazada";
/*
  TODO CAMBIO DE ESTADO AVISA, no sólo el rechazo.

  Quien pidió el alta desde la app sigue su solicitud por el número de la tarjeta Contratación: si la
  cancelan o la vuelven a dejar pendiente y eso no avisa nada, la solicitud cambia de estado a sus
  espaldas y se entera cuando entra a mirar —que es justo lo que las novedades vinieron a evitar—.
*/
export const NOVEDAD_SOLICITUD_CANCELADA = "solicitud_cancelada";
export const NOVEDAD_SOLICITUD_REABIERTA = "solicitud_reabierta";

/** Los tipos que la app cuenta por tarjeta. Agregar uno acá sin tocar la app lo deja sin contar. */
export const TIPOS_NOVEDAD = [NOVEDAD_REGISTRO, NOVEDAD_SOLICITUD, NOVEDAD_SOLICITUD_APROBADA, NOVEDAD_SOLICITUD_RECHAZADA, NOVEDAD_SOLICITUD_CANCELADA, NOVEDAD_SOLICITUD_REABIERTA];

const idValido = (x: unknown) => !!x && Types.ObjectId.isValid(String(x));

interface Aviso {
  tenantId: Types.ObjectId | string;
  /** A quiénes. Se limpian los repetidos y los inválidos. */
  destinatarios: (string | Types.ObjectId | undefined | null)[];
  type: string;
  title: string;
  message: string;
  /** Qué pantalla de la app abre. La app traduce `type`; esto es para el escritorio. */
  linkUrl?: string;
  /** De qué habla: la persona registrada, la solicitud. Es lo que permite marcar leída UNA fila. */
  refId?: string | Types.ObjectId | null;
  /** Quien hizo la acción: no se avisa a sí mismo lo que acaba de hacer. */
  excepto?: string | Types.ObjectId | null;
}

/** Manda el aviso a cada destinatario. No lanza: un aviso perdido no puede tumbar la operación. */
export async function notificar({ tenantId, destinatarios, type, title, message, linkUrl, refId, excepto }: Aviso): Promise<void> {
  try {
    const fuera = excepto ? String(excepto) : "";
    const ids = [...new Set(destinatarios.filter(idValido).map(String))].filter((id) => id !== fuera);
    if (ids.length === 0) return;
    await Notification.insertMany(
      ids.map((userId) => ({ tenantId: new Types.ObjectId(String(tenantId)), userId: new Types.ObjectId(userId), type, title, message, linkUrl, refId: idValido(refId) ? new Types.ObjectId(String(refId)) : undefined, isRead: false })),
      { ordered: false },
    );
  } catch (e) {
    console.error("[NOVEDADES] No se pudo crear la notificación:", e);
  }
}

/**
 * QUIÉN ES EL COORDINADOR DEL PROYECTO (el responsable) de cada proyecto, como `_id` de usuario.
 *
 * `Project.metadata.responsableId` NO es un ObjectId: es el id numérico de FRAME, que se corresponde
 * con `User.metadata.id` (ver `utils/visibilidadResponsable.ts`). Sin ese paso intermedio, un `$in`
 * por `_id` no matchea a nadie y el aviso no le llega a quien tiene que aprobar.
 */
export async function responsablesDeProyectos(tenantId: Types.ObjectId | string, projectIds: (string | Types.ObjectId)[]): Promise<string[]> {
  try {
    const ids = projectIds.filter(idValido).map((p) => new Types.ObjectId(String(p)));
    if (ids.length === 0) return [];
    const proyectos: any[] = await Project.find({ _id: { $in: ids }, tenantId }).select("metadata.responsableId").lean();
    const idsFrame = [...new Set(proyectos.map((p) => Number(p?.metadata?.responsableId)).filter((n) => Number.isFinite(n)))];
    if (idsFrame.length === 0) return [];
    const usuarios: any[] = await User.find({ tenantId, "metadata.id": { $in: idsFrame } }).select("_id").lean();
    return usuarios.map((u) => String(u._id));
  } catch (e) {
    console.error("[NOVEDADES] No se pudieron resolver los responsables de los proyectos:", e);
    return [];
  }
}

/**
 * Los responsables de los proyectos donde esta persona supervisa un área o turno.
 *
 * Es el mismo criterio con el que la app decide de quiénes ve los registrados (`invitadoresVisibles`
 * en `routes/registroLinks.ts`), leído al revés: si el coordinador del proyecto ve los registros de
 * su gente, también le corresponde el aviso.
 */
export async function responsablesDeQuienSupervisa(tenantId: Types.ObjectId | string, userId: string): Promise<string[]> {
  try {
    if (!idValido(userId)) return [];
    const proyectos: any[] = await Project.find({ tenantId, "coordinatorAssignments.userId": new Types.ObjectId(userId) })
      .select("_id")
      .lean();
    return await responsablesDeProyectos(tenantId, proyectos.map((p) => p._id));
  } catch (e) {
    console.error("[NOVEDADES] No se pudieron resolver los responsables de quien supervisa:", e);
    return [];
  }
}

/** Cómo se llama alguien, con los tres lugares donde puede estar el nombre. */
export const nombreDePersona = (u: any): string => u?.metadata?.fullName || `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || u?.email || "Alguien";
