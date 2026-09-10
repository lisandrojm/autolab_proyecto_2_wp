import { Types } from "mongoose";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";

/**
 * QUÉ VE UN «RESPONSABLE DE PROYECTO».
 *
 * La regla general de la plataforma es "ves aquello a lo que estás asignado": todo lo que no sea
 * admin lleva `assignedUsers: <userId>` pegado al filtro. Con eso solo, un Responsable de Proyecto
 * abría el escritorio y no veía NADA —ni un cliente, ni un proyecto— porque nadie lo había agregado
 * a mano a esas listas, y como toda la navegación arranca eligiendo un cliente, lo de abajo quedaba
 * vacío también.
 *
 * Acá se agrega la otra fuente de acceso, la que se mantiene sola: los proyectos que la persona tiene
 * A CARGO. Ponerla como responsable de un proyecto le da acceso a ese proyecto y a su cliente;
 * sacarla se lo quita. No hay una segunda lista que alguien tenga que acordarse de actualizar.
 *
 * OJO CON EL VÍNCULO: `Project.metadata.responsableId` NO es un ObjectId a User, es el id numérico
 * que viene de FRAME, y se corresponde con `User.metadata.id` (así lo guarda el selector de
 * responsable en Proyectos, que usa `c.metadata?.id` como value). Por eso hay que resolver primero
 * el id de FRAME de la persona: un `$in` con el `_id` de Mongo no matchea nada.
 *
 * Es SOLO para lectura. Editar o borrar un proyecto sigue pidiendo estar asignado: tener un proyecto
 * a cargo explica por qué alguien necesita verlo, no por qué podría eliminarlo.
 */
export interface AlcanceResponsable {
  proyectos: Types.ObjectId[];
  clientes: Types.ObjectId[];
}

const VACIO: AlcanceResponsable = { proyectos: [], clientes: [] };

export async function alcanceDeResponsable(tenantId: Types.ObjectId | string | undefined, userId: string | undefined): Promise<AlcanceResponsable> {
  if (!tenantId || !userId) return VACIO;

  const usuario: any = await User.findById(userId).select("metadata.id").lean();
  const idFrame = Number(usuario?.metadata?.id);
  // Sin id de FRAME no hay forma de matchear `responsableId`: se devuelve vacío y manda `assignedUsers`.
  if (!Number.isFinite(idFrame)) return VACIO;

  const proyectos: any[] = await Project.find({ tenantId, "metadata.responsableId": idFrame }).select("_id clientId").lean();
  if (proyectos.length === 0) return VACIO;

  const clientes = [...new Set(proyectos.map((p) => (p.clientId ? String(p.clientId) : "")).filter(Boolean))].map((id) => new Types.ObjectId(id));
  return { proyectos: proyectos.map((p) => p._id as Types.ObjectId), clientes };
}
