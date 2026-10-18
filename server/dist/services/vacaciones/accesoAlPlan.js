import { Role } from "../../models/Role.js";
import { alcanceDeResponsable } from "../../utils/visibilidadResponsable.js";
const PERMISO_MODULO = "admin_vacations";
/** Los permisos efectivos del usuario del request (misma lectura que `requirePermission`). */
export async function permisosDelRequest(req) {
    const user = req.user || {};
    const roleNames = user.roles || [];
    const primario = String(user.primaryRole || "").toLowerCase();
    const nombres = roleNames.map((r) => String(r).toLowerCase());
    let esAdmin = nombres.includes("admin") || nombres.includes("superadmin") || primario === "admin" || primario === "superadmin";
    const permisos = new Set();
    if (roleNames.length > 0 && req.tenantObjectId) {
        const roles = await Role.find({ name: { $in: roleNames.map((n) => new RegExp(`^${String(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i")) }, tenantId: req.tenantObjectId }).select("name permissions").lean();
        for (const r of roles) {
            if (["admin", "superadmin"].includes(String(r.name || "").toLowerCase()))
                esAdmin = true;
            for (const p of r.permissions || [])
                permisos.add(String(p));
        }
    }
    return { esAdmin, permisos };
}
export async function accesoAlPlan(req, projectId) {
    const { esAdmin, permisos } = await permisosDelRequest(req);
    const tieneModulo = permisos.has("*") || permisos.has(`${PERMISO_MODULO}:view`) || permisos.has(`${PERMISO_MODULO}:*`);
    const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user?.userId);
    const esCoordinador = proyectos.some((p) => String(p) === String(projectId));
    const puedeVer = esAdmin || tieneModulo || esCoordinador;
    return { esAdmin, tieneModulo, esCoordinador, puedeVer, puedeEditar: puedeVer, puedeAprobar: esAdmin || esCoordinador };
}
/** Los proyectos cuyos planes puede listar: `null` = todos (admin o módulo); si no, los que coordina. */
export async function proyectosVisibles(req) {
    const { esAdmin, permisos } = await permisosDelRequest(req);
    if (esAdmin || permisos.has("*") || permisos.has(`${PERMISO_MODULO}:view`) || permisos.has(`${PERMISO_MODULO}:*`))
        return null;
    const { proyectos } = await alcanceDeResponsable(req.tenantObjectId, req.user?.userId);
    return proyectos;
}
