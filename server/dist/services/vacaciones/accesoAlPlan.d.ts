import { Types } from "mongoose";
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
/** Los permisos efectivos del usuario del request (misma lectura que `requirePermission`). */
export declare function permisosDelRequest(req: any): Promise<{
    esAdmin: boolean;
    permisos: Set<string>;
}>;
export declare function accesoAlPlan(req: any, projectId: string | Types.ObjectId): Promise<AccesoPlan>;
/** Los proyectos cuyos planes puede listar: `null` = todos (admin o módulo); si no, los que coordina. */
export declare function proyectosVisibles(req: any): Promise<Types.ObjectId[] | null>;
