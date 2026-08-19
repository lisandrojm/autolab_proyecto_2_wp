import { Types } from "mongoose";
/** rol_frame de FRAME tal como lo devuelve GET /rol-frame/empleado/{id}. */
export interface FrameRolFrame {
    id: number;
    nombre: string;
}
export interface ResolveRoleFrameResult {
    refs: Types.ObjectId[];
    created: Array<{
        id: number;
        nombre: string;
    }>;
}
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
export declare function resolveRoleFrameRefs(roles: FrameRolFrame[]): Promise<ResolveRoleFrameResult>;
