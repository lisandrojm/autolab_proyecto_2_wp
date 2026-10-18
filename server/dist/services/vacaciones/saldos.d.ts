import { Types } from "mongoose";
/**
 * LA CUENTA DE VACACIONES DE CADA PERSONA PARA UN PERÍODO: antigüedad (ARCA, contratos o fecha de
 * ingreso), días por ley (LCT) proyectados al 31/12, extras, beneficio y arrastre, lo tomado y lo
 * pendiente, los overrides de la grilla y el desglose por empleadora.
 *
 * Era el cuerpo de `GET /vacations/users-balance` (Vacaciones → Gestión por Usuario). Vive acá porque
 * el plan de vacaciones por proyecto necesita la misma cuenta para su equipo (`opciones.userIds`) y
 * la cuenta tiene que ser UNA: lo que ve RR.HH. en la grilla y lo que ve el planificador al repartir
 * un mes tienen que coincidir.
 */
export type FilaSaldo = Awaited<ReturnType<typeof saldosDeVacaciones>>[number];
export declare function saldosDeVacaciones(tenantId: any, tenantObjectId: any, selectedYear: number, opciones?: {
    userIds?: Array<string | Types.ObjectId>;
}): Promise<any[]>;
