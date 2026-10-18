import { Types } from "mongoose";
import { Role } from "../../models/Role.js";
import { alcanceDeResponsable } from "../../utils/visibilidadResponsable.js";

/**
 * QUIÉN PUEDE QUÉ EN UN PLAN DE VACACIONES.
 *
 *   · Ver y armar el plan: admin, quien tiene el módulo de Vacaciones (`admin_vacations:view`) o el
 *     COORDINADOR del proyecto (`Project.metadata.responsableId` = su id de FRAME; ver
 *     `utils/visibilidadResponsable.ts`).
 *   · Aprobar o rechazar los bloques: sólo el coordinador del proyecto (o admin). Es la decisión del
 *     usuario (18/10/2026): «las vacaciones las tiene que aprobar el coordinador del proyecto antes
 *     de que se convierta en un pedido real».
 *
 * No va como middleware porque el proyecto sale del plan (hay que leerlo primero) y porque la
 * respuesta del GET lleva `permisos` para que la pantalla sepa en qué modo abrirse.
 */
export interface AccesoPlan {
  esAdmin: boolean;
  tieneModulo: boolean;
  esCoordinador: boolean;
  puedeVer: boolean;
  puedeEditar: boolean;
  puedeAprobar: boolean;
}

const PERMISO_MODULO = "admin_vacations";

/** Los permisos efectivos del usuario del request (misma lectura que `requirePermission`). */
export async function permisosDelRequest(req: any): Promise<{ esAdmin: boolean; permisos: Set<string> }> {
  const user = req.user || {};
  const roleNames: string[] = user.roles || [];
  const primario = String(user.primaryRole || "").toLowerCase();
  const nombres = roleNames.map((r) => String(r).toLowerCase());
  let esAdmin = nombres.includes("admin") || nombres.includes("superadmin") || primario === "admin" || primario === "superadmin";
  const permisos = new Set<string>();
  if (roleNames.length > 0 && req.tenantObjectId) {
    const roles = await Role.find({ name: { $in: roleNames.map((n) => new RegExp(`^${String(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) }, tenantId: req.tenantObjectId }).select("name permissions").lean();
    for (const r of roles as any[]) {
      if (["admin", "superadmin"].includes(String(r.name || "").toLowerCase())) esAdmin = true;
      for (const p of r.permissions || []) permisos.add(String(p));
    }
  }
  return { esAdmin, permisos };
}

export async function accesoAlPlan(req: any, projectId: string | Types.ObjectId): Promise<AccesoPlan> {
  const { esAdmin, permisos } = await permisosDelRequest(req);
  const tieneModulo = permisos.has("*") || permisos.has(`${PERMISO_MODULO}:view`) || permisos.has(`${PERMISO_MODULO}:*`);
  const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user?.userId);
  const esCoordinador = proyectos.some((p) => String(p) === String(projectId));
  const puedeVer = esAdmin || tieneModulo || esCoordinador;
  return { esAdmin, tieneModulo, esCoordinador, puedeVer, puedeEditar: puedeVer, puedeAprobar: esAdmin || esCoordinador };
}

/** Los proyectos cuyos planes puede listar: `null` = todos (admin o módulo); si no, los que coordina. */
export async function proyectosVisibles(req: any): Promise<Types.ObjectId[] | null> {
  const { esAdmin, permisos } = await permisosDelRequest(req);
  if (esAdmin || permisos.has("*") || permisos.has(`${PERMISO_MODULO}:view`) || permisos.has(`${PERMISO_MODULO}:*`)) return null;
  const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user?.userId);
  return proyectos;
}
