/**
 * EL ÁREA Y TURNO DE UNA PERSONA DEL EQUIPO, escritos de una sola manera.
 *
 * Lo que hacía el PATCH .../team-config/:userId/areas (la Jerarquía del panel), sacado a un servicio para que
 * el cambio de turno desde la app (Equipos, 26/11/2026) escriba exactamente lo mismo: la fila de `teamConfig`
 * por persona y con un solo update (30/10/2026), el rastro en `historial_equipo`, y el área/turno en el
 * contrato que rige (12/11/2026, `areasDelContratoQueRige`). Sin esto, el segundo camino terminaría con su
 * propia variante y el equipo y el contrato volverían a decir cosas distintas.
 *
 * `asignaciones` viene con ids en texto (lo que manda el cliente); acá se convierten. Devuelve si hubo cambio.
 */
export interface AsignacionDeArea {
    areaId: string;
    shiftIds: string[];
    sedeId?: number | null;
}
export declare function asignarAreasDeMiembro(p: {
    tenantId: any;
    project: {
        _id: any;
        teamConfig?: any[];
    };
    userId: string;
    asignaciones: AsignacionDeArea[];
    porUserId?: string;
    origen: string;
    payload?: any;
}): Promise<{
    cambio: boolean;
}>;
