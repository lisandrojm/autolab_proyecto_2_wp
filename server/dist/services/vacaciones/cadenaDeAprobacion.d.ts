import { Types } from "mongoose";
import type { CadenaDeAprobacion } from "../../compartido/vacaciones/etapaDeAprobacion.js";
/**
 * QUIÉN APRUEBA LAS VACACIONES DE UNA PERSONA (15/11/2026). Ver `compartido/vacaciones/etapaDeAprobacion.ts`.
 *
 * Por cada proyecto donde tiene un contrato VIGENTE HOY:
 *   · Supervisores: los de `coordinatorAssignments` (rol «Supervisor», nombres cruzados en el código) cuya
 *     combinación área × turno × sede coincide con la de la persona. Su área/turno sale de sus contratos
 *     vigentes (`filaSegunContratos`), el mismo criterio que contratos por vencer y Equipos.
 *   · Coordinadores: el responsable del proyecto (`metadata.responsableId`, el id de FRAME = `User.metadata.id`).
 *
 * La persona nunca se aprueba a sí misma: si es la supervisora de su propia área, ese nivel pasa al siguiente.
 * Sin contrato vigente en ningún proyecto, la cadena queda vacía y la solicitud va directo al admin.
 */
export declare function cadenaDeAprobacion(tenantId: Types.ObjectId | string, userId: Types.ObjectId | string, hoy?: string): Promise<CadenaDeAprobacion>;
