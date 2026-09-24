import { Types } from "mongoose";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import UserProject from "../models/UserProject.js";
import { RenovacionContrato } from "../models/RenovacionContrato.js";
import { olvidarContratosPorVencer } from "./contratosPorVencer.js";
import { NOVEDAD_SOLICITUD, nombreDePersona, notificar, responsablesDeProyectos } from "./novedadesNotificaciones.js";
import { pedidoDesdeSolicitud, superposicionesDeAlta } from "./superposicion.js";
/*
  CREAR UNA SOLICITUD DE CONTRATACIÓN: lo que hace el server además de guardar el documento.

  Lo usan `POST /users` (una solicitud desde el formulario del móvil) y el alta masiva de una plantilla
  de equipo (`services/plantillasEquipo.ts`). Tiene que ser LO MISMO en los dos caminos —mismo estado
  inicial, mismos sellos del server, mismos avisos—, así que vive una sola vez, acá. Está partido en
  «antes de guardar» y «después de guardar» porque el alta masiva guarda todo en una transacción y los
  efectos (avisos a otros, renovaciones) van recién cuando todo quedó guardado.
*/
/**
 * ANTES DE GUARDAR: valida lo que el server exige y pone lo que sólo el server pone. Modifica
 * `metadata`. Devuelve el motivo del rechazo, o `null` si se puede guardar.
 */
export async function prepararSolicitudNueva(tenantId, creadorId, metadata) {
    /*
      UNA SOLICITUD DE ALTA NUEVA TRAE ÁREA Y TURNO.
  
      Es lo que precarga el wizard de aprobación: sin eso llega vacía y quien aprueba tiene que elegir
      el área sabiendo menos que quien pidió el alta. La pantalla ya lo exige; esto es para que no se
      pueda saltear llamando al API. Sólo al CREAR: editar una solicitud vieja o aprobarla no se frena.
    */
    const asignaciones = metadata.areaShiftAssignments;
    const tieneAreaYTurno = Array.isArray(asignaciones) && asignaciones.some((a) => a?.areaId && Array.isArray(a.shiftIds) && a.shiftIds.length > 0);
    if (!tieneAreaYTurno)
        return "La solicitud tiene que traer el área y el turno de la persona.";
    // Toda solicitud de alta nace "pendiente" (ciclo de vida tipo Pedido).
    if (!metadata.solicitudStatus)
        metadata.solicitudStatus = "pendiente";
    // Quién la pidió, puesto por el servidor: es a quien se le avisa cómo terminó. Nunca del body.
    // Y nace INACTIVA: no es una persona hasta que se aprueba (ver `services/conteoUsuariosTenant.ts`).
    metadata.solicitudCreadaPor = new Types.ObjectId(String(creadorId));
    metadata.activo = false;
    /*
      LA FOTO DE LOS AVISOS DE SUPERPOSICIÓN, para quien la aprueba: si al pedirla la persona ya tenía
      algo en esas fechas u horario, el que aprueba lo ve en el detalle sin tener que buscarlo. La pone
      el server (nunca del body) y sirve igual para el alta individual y la masiva.
    */
    metadata.avisosSuperposicion = await superposicionesDeAlta(tenantId, metadata.solicitudUserId, pedidoDesdeSolicitud(metadata));
    return null;
}
/** El rol por defecto del tenant, que es con el que nace un alta que no pide otro. */
export async function rolesPorDefecto(tenantId, session) {
    const defaultRole = await Role.findOne({ tenantId, isDefault: true }).session(session || null);
    if (!defaultRole) {
        console.warn(`[User Creation] No default role found for tenant: ${tenantId}`);
        return [];
    }
    console.log(`[User Creation] Assigning default role: ${defaultRole.name} (${defaultRole._id})`);
    return [defaultRole._id.toString()];
}
/**
 * DESPUÉS DE GUARDAR: lo que la solicitud dispara afuera. Cada efecto con su propio catch donde hace
 * falta: la solicitud ya existe, y eso es lo que no se puede perder.
 */
export async function efectosDeSolicitudNueva(tenantId, creadorId, user) {
    /*
      RENOVACIÓN DE UN CONTRATO POR VENCER: se anota la decisión, y con eso el contrato sale de «Por
      vencer» (ver `services/contratosPorVencer.ts`). Va DESPUÉS de guardar la solicitud: anotada antes,
      un guardado fallido sacaría el contrato de la lista sin que nadie lo haya renovado.
    */
    const renovacionDe = user.metadata?.esRenovacion ? user.metadata?.renovacionDe : null;
    if (renovacionDe?.userProjectId && renovacionDe?.fechaBajaContrato) {
        try {
            const up = await UserProject.findById(renovacionDe.userProjectId).select("userId projectId").lean();
            if (up) {
                const quien = await User.findById(creadorId).select("firstName lastName").lean();
                await RenovacionContrato.updateOne({ tenantId, userProjectId: up._id, fechaBajaContrato: String(renovacionDe.fechaBajaContrato) }, {
                    $set: {
                        userId: up.userId,
                        projectId: up.projectId,
                        decision: "renovar",
                        solicitudId: user._id,
                        decididoPor: new Types.ObjectId(creadorId),
                        decididoPorNombre: `${quien?.firstName || ""} ${quien?.lastName || ""}`.trim(),
                        decididoEl: new Date(),
                    },
                }, { upsert: true });
                olvidarContratosPorVencer();
            }
        }
        catch (e) {
            console.error("[RENOVACION] No se pudo anotar la renovación del contrato:", e);
        }
    }
    /*
      AVISAR QUE ENTRÓ UNA SOLICITUD, a quien la tiene que aprobar.
  
      Va al coordinador del proyecto (el responsable): es quien la aprueba desde el escritorio. No se
      avisa a quien la acaba de cargar: ya sabe.
    */
    // Los proyectos de una solicitud vienen en `metadata`; los de un alta normal, en la raíz.
    const proyectos = [...(user.metadata?.projectIds || []), ...(user.projectIds || [])];
    await notificar({
        tenantId,
        destinatarios: await responsablesDeProyectos(tenantId, proyectos),
        type: NOVEDAD_SOLICITUD,
        title: user.metadata?.esRenovacion ? "Renovación de contrato pedida" : "Nueva solicitud de contratación",
        refId: user._id,
        message: `${nombreDePersona(user)} · pedida por ${nombreDePersona(await User.findById(creadorId).select("firstName lastName metadata.fullName").lean())}`,
        excepto: creadorId,
    });
}
