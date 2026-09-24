import { Types } from "mongoose";
import { Calificacion, ESTRELLAS_VALIDAS, OrigenCalificacion } from "../models/Calificacion.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { alcanceDeResponsable } from "../utils/visibilidadResponsable.js";

/*
  CALIFICACIONES DE LAS PERSONAS: las reglas que comparten todas las pantallas que califican.
  Qué es cada origen y por qué el 3 no existe está en `models/Calificacion.ts`.
*/

export interface ResumenCalificacion {
  /** 0 a 5, con un decimal. 0 = sin calificaciones. */
  promedio: number;
  cantidad: number;
}

/**
 * Lo que manda el formulario, validado: estrellas 1, 2, 4 o 5, y comentario opcional.
 * Devuelve el error en texto para mostrarlo tal cual.
 */
export function leerCalificacion(body: any): { estrellas: number; comentario?: string } | { error: string } {
  const estrellas = Number(body?.estrellas);
  if (!(ESTRELLAS_VALIDAS as readonly number[]).includes(estrellas)) return { error: "La calificación tiene que ser de 1, 2, 4 o 5 estrellas." };
  const comentario = typeof body?.comentario === "string" ? body.comentario.trim().slice(0, 1000) : "";
  return { estrellas, comentario: comentario || undefined };
}

export async function nombreDeUsuario(userId: string): Promise<string> {
  const u: any = await User.findById(userId).select("firstName lastName metadata.fullName").lean();
  return (u?.metadata?.fullName || `${u?.firstName || ""} ${u?.lastName || ""}`).trim();
}

/** Promedio y cantidad de cada persona pedida. Quien no tiene ninguna no viene en el mapa. */
export async function resumenDeCalificaciones(tenantId: Types.ObjectId, userIds: string[]): Promise<Record<string, ResumenCalificacion>> {
  const ids = [...new Set(userIds.filter((id) => Types.ObjectId.isValid(id)))].map((id) => new Types.ObjectId(id));
  if (ids.length === 0) return {};
  const filas: any[] = await Calificacion.aggregate([{ $match: { tenantId, userId: { $in: ids } } }, { $group: { _id: "$userId", promedio: { $avg: "$estrellas" }, cantidad: { $sum: 1 } } }]);
  const resumen: Record<string, ResumenCalificacion> = {};
  for (const f of filas) resumen[String(f._id)] = { promedio: Math.round(f.promedio * 10) / 10, cantidad: f.cantidad };
  return resumen;
}

/** Todas las de una persona, la más nueva primero, con el proyecto resuelto a nombre. */
export async function historialDeCalificaciones(tenantId: Types.ObjectId, userId: string) {
  const lista: any[] = await Calificacion.find({ tenantId, userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).populate("projectId", "name").lean();
  const calificaciones = lista.map((c) => ({
    _id: String(c._id),
    estrellas: c.estrellas,
    comentario: c.comentario || "",
    origen: c.origen,
    decision: c.decision,
    proyectoNombre: c.projectId?.name || "",
    fechaBajaContrato: c.fechaBajaContrato,
    calificadoPorNombre: c.calificadoPorNombre || "",
    createdAt: c.createdAt,
  }));
  const promedio = lista.length ? Math.round((lista.reduce((s, c) => s + c.estrellas, 0) / lista.length) * 10) / 10 : 0;
  return { promedio, cantidad: lista.length, calificaciones };
}

/** Una calificación nueva. Nunca pisa otra (salvo las de fin de contrato: ver `calificarFinDeContrato`). */
export async function crearCalificacion(datos: { tenantId: Types.ObjectId; userId: string; estrellas: number; comentario?: string; origen: Exclude<OrigenCalificacion, "fin_contrato">; projectId?: string; solicitudId?: string; calificadoPor: string }) {
  return Calificacion.create({
    tenantId: datos.tenantId,
    userId: new Types.ObjectId(datos.userId),
    estrellas: datos.estrellas,
    comentario: datos.comentario,
    origen: datos.origen,
    projectId: datos.projectId && Types.ObjectId.isValid(datos.projectId) ? new Types.ObjectId(datos.projectId) : undefined,
    solicitudId: datos.solicitudId && Types.ObjectId.isValid(datos.solicitudId) ? new Types.ObjectId(datos.solicitudId) : undefined,
    calificadoPor: new Types.ObjectId(datos.calificadoPor),
    calificadoPorNombre: await nombreDeUsuario(datos.calificadoPor),
  });
}

/**
 * La calificación de un contrato que termina, al decidir renovarlo o dejarlo vencer. Una por contrato:
 * si ya había una (se calificó, se abrió la renovación y no se mandó), se corrige esa.
 */
export async function calificarFinDeContrato(datos: { tenantId: Types.ObjectId; contrato: { userId: string; projectId: string; userProjectId: string; fechaBaja: string }; estrellas: number; comentario?: string; decision: "renovar" | "dejar_vencer"; calificadoPor: string }) {
  const { contrato } = datos;
  await Calificacion.updateOne(
    { tenantId: datos.tenantId, origen: "fin_contrato", userProjectId: new Types.ObjectId(contrato.userProjectId), fechaBajaContrato: contrato.fechaBaja },
    {
      $set: {
        userId: new Types.ObjectId(contrato.userId),
        projectId: new Types.ObjectId(contrato.projectId),
        estrellas: datos.estrellas,
        ...(datos.comentario ? { comentario: datos.comentario } : {}),
        decision: datos.decision,
        calificadoPor: new Types.ObjectId(datos.calificadoPor),
        calificadoPorNombre: await nombreDeUsuario(datos.calificadoPor),
      },
      // Corregirla sin comentario borra el de antes: la calificación es la última que se dio, entera.
      ...(datos.comentario ? {} : { $unset: { comentario: "" } }),
    },
    { upsert: true },
  );
}

/**
 * ¿Puede quien pregunta calificar (o ver las calificaciones) de la gente de este proyecto desde Equipos?
 * Lo mismo que le muestra Equipos: el proyecto que supervisa (es su responsable) o en el que coordina
 * algún área/turno.
 */
export async function tieneAlCargoElProyecto(tenantId: Types.ObjectId, userId: string, projectId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(projectId)) return false;
  const [{ proyectos }, coordina] = await Promise.all([
    alcanceDeResponsable(tenantId, userId),
    Project.exists({ _id: new Types.ObjectId(projectId), tenantId, "coordinatorAssignments.userId": new Types.ObjectId(userId) }),
  ]);
  return !!coordina || proyectos.some((p) => String(p) === projectId);
}

/** ¿La persona es del proyecto? Se califica a la gente del equipo, no a cualquiera del tenant. */
export async function esDelProyecto(tenantId: Types.ObjectId, userId: string, projectId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(projectId)) return false;
  return !!(await User.exists({ _id: new Types.ObjectId(userId), tenantId, projectIds: new Types.ObjectId(projectId) }));
}
