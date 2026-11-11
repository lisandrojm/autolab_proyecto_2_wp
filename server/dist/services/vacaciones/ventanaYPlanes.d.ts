import { Types } from "mongoose";
import { type IPlanVacaciones } from "../../models/PlanVacaciones.js";
import { type TramoDeVentana, type VentanaGoce } from "../../compartido/ventanaGoce.js";
/** La ventana de un proyecto, ya resuelta contra la global. */
export declare function ventanaDelProyecto(tenantId: Types.ObjectId, vacationConfig: any): Promise<VentanaGoce>;
/** Mueve la temporada de los planes en borrador del proyecto a la ventana. Devuelve cuántos cambiaron. */
export declare function llevarVentanaALosPlanes(tenantId: Types.ObjectId, projectId: Types.ObjectId | string, tramo: TramoDeVentana, exceptoPlanId?: string): Promise<number>;
/** La temporada de un plan pasa a ser la ventana de su proyecto (y de sus otros planes en borrador). */
export declare function llevarTemporadaAlProyecto(tenantId: Types.ObjectId, plan: IPlanVacaciones): Promise<void>;
/** Cambió la ventana global: se mueven los planes de los proyectos que la usan. */
export declare function llevarVentanaGlobalALosPlanes(tenantId: Types.ObjectId, tramo: TramoDeVentana): Promise<void>;
