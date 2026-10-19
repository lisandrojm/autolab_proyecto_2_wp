import { Types } from "mongoose";
import type { IPlanVacaciones } from "../../models/PlanVacaciones.js";
import { type DatosSolicitud } from "../../compartido/solicitudDeContratacion.js";
import { type Importes } from "../../compartido/jornadas.js";
/**
 * EL REEMPLAZO MENSUAL DE UN ROL (pedido del 17/10/2026): en vez de cubrir cada quincena con un
 * jornalero (que sale ~150 % más), se contrata UNA persona por el mes entero para el área, turno y
 * rol cuyos integrantes se van de vacaciones. El plan arma la SOLICITUD DE CONTRATACIÓN por el mismo
 * camino que las plantillas de equipo y el alta individual (`armarPayloadDeSolicitud` →
 * `createUserSchema` → `prepararSolicitudNueva` → `User.create`): llega a Proyecto › Solicitudes como
 * cualquier otra, marcada como reemplazo, y la aprueba quien aprueba siempre.
 *
 * El modelo de la solicitud admite UN `replacedUserId`: va el primero de los cubiertos; los demás
 * quedan en el comentario y en `plan.reemplazos[].cubreA`, que es la verdad completa.
 */
export interface PedidoReemplazo {
    areaId: string;
    shiftId: string;
    /** La sede del grupo (fila área × turno × sede), si la tiene. */
    sedeId?: number | null;
    rolFrameId: string | null;
    nombreRol?: string;
    mes: string;
    /** La persona que cubre el mes. */
    userId: string;
    contratoId: string;
    nombreContrato?: string;
    tipoImpositivo?: string;
    categoriaSatId?: string;
    dailyRate?: number;
    motivoReemplazoId?: string;
    comentarios?: string;
    convenioId?: string;
}
export interface ReemplazoArmado {
    datos: DatosSolicitud;
    cubreA: Array<{
        userId: string;
        nombre: string;
        desde: string;
        hasta: string;
    }>;
    avisos: string[];
    resumen: {
        persona: string;
        nombreContrato: string;
        desde: string;
        hasta: string;
        jornadas: number;
        dailyRate: number;
        importes: Importes;
        esServicios: boolean;
        motivo: string | null;
    };
}
export declare function armarReemplazoMensual(tenantObjectId: Types.ObjectId, plan: IPlanVacaciones, pedido: PedidoReemplazo): Promise<ReemplazoArmado>;
/** Crea la Solicitud de contratación y la deja vinculada al plan. Un solo reemplazo pedido por grupo y mes. */
export declare function crearReemplazoMensual(tenantObjectId: Types.ObjectId, creadorId: string, plan: IPlanVacaciones, pedido: PedidoReemplazo): Promise<{
    solicitudId: string;
    reemplazoId: string;
    avisos: string[];
}>;
/** Cancela el reemplazo: la solicitud, si sigue pendiente, pasa a cancelada (como desde Proyecto › Solicitudes). */
export declare function cancelarReemplazoMensual(tenantObjectId: Types.ObjectId, actorId: string, plan: IPlanVacaciones, reemplazoId: string, motivo?: string): Promise<void>;
