import { Types } from "mongoose";
import { type ICampaniaVacaciones, type IInvitacionVacaciones } from "../../models/CampaniaVacaciones.js";
import { type IEmbeddedOverlap } from "../../models/VacationConfig.js";
import { type EstadoDelTurno } from "../../compartido/vacaciones/campania.js";
/**
 * Las invitadas a las que les aplica la regla, agrupadas por ámbito. Primero se acota por lo que se puede pedir a la
 * base (proyecto y área de la regla); después se confirma persona por persona con la misma lectura del solapamiento.
 */
export declare function gruposDeLaRegla(tid: Types.ObjectId, regla: IEmbeddedOverlap, userIds: string[]): Promise<Map<string, string[]>>;
/**
 * ARMA LOS TURNOS DE UNA CAMPAÑA LANZADA y los guarda en cada invitación (sólo las que cambian, con su paso en el
 * historial). Sin reglas con orden, deja todas sin turno.
 */
export declare function recalcularTurnos(tid: Types.ObjectId, c: ICampaniaVacaciones): Promise<{
    grupos: number;
    conTurno: number;
    recortados: number;
    cambiadas: number;
}>;
/** Rearma los turnos de todas las campañas lanzadas del tenant (después de cambiar una regla con orden). */
export declare function recalcularTurnosDelTenant(tid: any): Promise<void>;
/** ¿Ya puede elegir? Mira cómo están las invitaciones que tiene adelante. */
export declare function estadoDelTurnoDe(inv: Pick<IInvitacionVacaciones, "turnos">, hoy?: string): Promise<EstadoDelTurno>;
