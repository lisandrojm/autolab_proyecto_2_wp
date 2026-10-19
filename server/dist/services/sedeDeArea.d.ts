import { Types } from "mongoose";
/**
 * PONERLE LA SEDE A LAS ASIGNACIONES DE UN ÁREA (área × sede explícita, 18/10/2026).
 *
 * La fila (sede) de una persona en un área sale de la `sedeId` de su asignación, sin deducir nada del
 * contrato (ver `sedeEnArea`). Esto la escribe, sobre `project.teamConfig` —nunca sobre contratos—:
 * a quien no tenga fila propia en `teamConfig` se le copia la asignación de su contrato que rige, como
 * hace la Jerarquía al arrastrar.
 *
 * Lo usan dos cosas:
 *   · «Pasar todos a…» de la Jerarquía, para ubicar a los que les falta elegir sede (`userIds`);
 *   · el guardado del proyecto cuando un área pasa de una sede a varias: a los que estaban ahí se les
 *     estampa la sede de la fila que ya existía (`soloSinSede`), para que nadie quede colgado.
 *
 * Modifica `project` (un documento de Mongoose) en memoria; quien llama hace el `save`. Devuelve
 * cuántas personas cambió.
 */
export declare function ponerSedeEnArea(tenantObjectId: Types.ObjectId, project: any, areaId: string, sedeId: number, opciones: {
    userIds?: string[];
    soloSinSede?: boolean;
}): Promise<number>;
