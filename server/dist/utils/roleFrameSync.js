import { RoleFrame } from "../models/RoleFrame.js";
/**
 * Mapea roles_frame de FRAME ({ id, nombre }) a refs de la colección `roles_frame` (RoleFrame).
 *
 * Por cada rol:
 *   1) Busca RoleFrame existente por data.rol.id === id.
 *   2) Fallback: por name === nombre (los RoleFrame creados a mano tienen data.rol.id sintético).
 *   3) Si no existe, lo CREA (externalId/name/data.rol) y lo registra en `created`.
 *
 * Deduplica dentro de la misma llamada.
 */
export async function resolveRoleFrameRefs(roles) {
    const refs = [];
    const created = [];
    const seen = new Set();
    for (const r of roles) {
        const id = Number(r.id);
        const nombre = String(r.nombre ?? "").trim();
        const dedupeKey = Number.isFinite(id) ? `id:${id}` : `name:${nombre.toLowerCase()}`;
        if (seen.has(dedupeKey))
            continue;
        seen.add(dedupeKey);
        let doc = null;
        if (Number.isFinite(id)) {
            doc = await RoleFrame.findOne({ "data.rol.id": id });
        }
        if (!doc && nombre) {
            doc = await RoleFrame.findOne({ name: nombre });
        }
        if (!doc) {
            doc = await RoleFrame.create({
                externalId: String(id),
                name: nombre || `rol_frame_${id}`,
                data: { rol: { id, nombre }, categoriasSat: [] },
            });
            created.push({ id, nombre });
        }
        refs.push(doc._id);
    }
    return { refs, created };
}
