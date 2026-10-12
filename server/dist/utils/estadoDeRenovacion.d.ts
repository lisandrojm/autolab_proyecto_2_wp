/**
 * QUÉ DECIR AL LADO DE UN CONTRATO SOBRE SU RENOVACIÓN (regla del 12/10/2026).
 *
 *   · «Renovar» es SÓLO para contratos viejos: los que no vinieron ni por Solicitudes ni por «Agregar
 *     miembro» (importados de FRAME/WP), ya vencidos, y que todavía no entraron en ningún proceso.
 *   · Un contrato que vino por Solicitudes o por «Agregar miembro» ES el proceso de renovación: mientras
 *     recorre el circuito (trámite impositivo, documentos, firma) está «En proceso»; cuando lo terminó
 *     y todavía no venció, «Renovado»; cuando vence, no se renueva: se edita. Nunca «Renovar».
 *   · El contrato viejo hereda eso de su renovación: si ya tiene un contrato posterior del sistema,
 *     dice «En proceso» o «Renovado» según cómo vaya ese posterior.
 *   · Una solicitud de renovación pendiente también es «En proceso».
 *
 * Es puro: recibe el contrato, todos los contratos de la persona en el proyecto, hoy, y quién sabe si
 * un estado es el final del circuito. Lo usan Contratos (contracts-overview) y la tabla de equipo.
 */
export type EstadoRenovacion = "renovar" | "en_proceso" | "renovado" | null;
export interface ContratoParaRenovacion {
    fecha_alta_contrato?: string | null;
    fecha_baja_contrato?: string | null;
    nombre_estado_empleado?: string | null;
    /** Vino por Solicitudes (`solicitudId`) o por «Agregar miembro» (`origen`). */
    delSistema: boolean;
}
export declare function estadoDeRenovacion(o: {
    contrato: ContratoParaRenovacion;
    contratos: ContratoParaRenovacion[];
    hoy: string;
    /** ¿Ese estado es el final del circuito (p. ej. «Disponible»)? Desconocido = terminado. */
    procesoTerminado: (estado: string) => boolean;
    /** Hay una solicitud de renovación pendiente de ESTE contrato. */
    renovacionPedida?: boolean;
}): EstadoRenovacion;
/**
 * «Terminado» = el estado con el `ordenDependencia` más alto del circuito («Disponible»). Un estado
 * que no está en el circuito (sin orden, o que ya no existe) no retiene nada: cuenta como terminado.
 */
export declare function procesoTerminadoSegunEstados(estados: Array<{
    name: string;
    data?: {
        ordenDependencia?: unknown;
    };
}>, claveDe: (nombre: string) => string): (estado: string) => boolean;
