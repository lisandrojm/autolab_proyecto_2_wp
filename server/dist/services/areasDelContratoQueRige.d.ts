import { Types } from "mongoose";
/**
 * EL ÁREA Y EL TURNO DEL EQUIPO, TAMBIÉN EN EL CONTRATO QUE RIGE (12/11/2026).
 *
 * Pedido: «el equipo debe tener exactamente los turnos del contrato»; que el equipo diga «Tarde» y el
 * contrato «Mañana» confunde. Guardar un contrato ya deja al equipo igual (`queActualizarDelEquipo`); esto
 * cubre el otro sentido: cuando el área se cambia desde el equipo (Jerarquía, tabla del equipo, «Pasar
 * todos a…»), se escribe la misma área, turnos y sede en el contrato que rige de cada persona.
 *
 * Toca SÓLO el área/turno del contrato (`areaShiftAssignments`, `areaId`, `shiftId`, `nombre_area`,
 * `nombre_turno`): ni fechas, ni horario, ni sueldos, ni `sede_id` (de la sede del contrato sale el
 * domicilio de ARCA). Los contratos no tienen `_id` en los viejos, así que se escribe por posición, pero
 * condicionado a que en esa posición siga estando el mismo contrato (misma alta y baja).
 *
 * VARIOS CONTRATOS VIGENTES A LA VEZ (14/11/2026): el equipo muestra la suma de todos, así que lo que llega
 * de ahí se reparte entre ellos con `repartirAreas` —cada uno conserva lo suyo, lo nuevo va al que rige— en
 * vez de copiarle la suma entera al que rige (un contrato de la Tarde terminaría diciendo Mañana y Tarde).
 *
 * Devuelve cuántos contratos cambió.
 */
export declare function llevarAreasAlContratoQueRige(projectId: string | Types.ObjectId, asignacionesPorUsuario: Map<string, any[]>): Promise<number>;
