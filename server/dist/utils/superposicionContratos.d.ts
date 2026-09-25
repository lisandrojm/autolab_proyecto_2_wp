/**
 * ═══════════════════════════════════════════════════════════════════════
 * ¿LO QUE SE PIDE SE SUPERPONE CON LO QUE LA PERSONA YA TIENE?
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Antes de pedir el alta de alguien —de a uno o en lote con una plantilla de equipo— se revisan sus
 * contratos y sus otras solicitudes pendientes, EN CUALQUIER PROYECTO (también el mismo):
 *
 *   · HORARIO   comparten al menos un día Y los horarios se pisan (o es el mismo turno). La persona no
 *               puede estar en dos lugares a la vez: es el aviso fuerte, pide confirmación explícita.
 *   · FECHAS    los períodos se cruzan pero en días u horarios distintos. Puede estar bien (alguien que
 *               hace mañana en un proyecto y noche en otro), pero quien pide tiene que saberlo.
 *
 * Son AVISOS, no bloqueos: los contratos que vienen de FRAME no siempre traen días u horario, y un
 * bloqueo con datos incompletos frenaría altas legítimas. Cuando falta el dato se asume que PODRÍA
 * pisarse y el mensaje lo dice («sin días cargados»), en lugar de callarse.
 *
 * Puro: sin base ni fechas del sistema (el «hoy» entra por parámetro). Lo arma `services/superposicion.ts`.
 */
export interface PedidoDeAlta {
    /** "YYYY-MM-DD" */
    desde: string;
    /** "YYYY-MM-DD"; vacío = tiempo indeterminado. */
    hasta: string;
    /** Jornada por días sueltos: los días exactos. Si vienen, mandan sobre `desde/hasta/dias`. */
    fechas?: string[];
    /** 0 = domingo … 6 = sábado. Vacío o rotativos = cualquier día. */
    dias: number[];
    rotativos?: boolean;
    /** "HH:MM" */
    inTime: string;
    outTime: string;
    shiftIds?: string[];
}
export interface CompromisoExistente {
    /** `lote` = otro puesto de la MISMA contratación en lote (la persona ocupa dos puestos). */
    origen: "contrato" | "solicitud" | "lote";
    proyectoNombre: string;
    /** "YYYY-MM-DD" */
    desde: string;
    /** "YYYY-MM-DD"; vacío = sin baja. */
    hasta: string;
    fechas?: string[];
    dias?: number[];
    rotativos?: boolean;
    inTime?: string;
    outTime?: string;
    shiftIds?: string[];
    turnoNombre?: string;
}
export interface Superposicion {
    tipo: "horario" | "fechas";
    origen: CompromisoExistente["origen"];
    proyectoNombre: string;
    desde: string;
    hasta: string;
    /** Vigente hoy (ya arrancó y no terminó). Sólo para contratos. */
    vigente: boolean;
    /** Qué no se pudo comparar por falta de datos: el aviso lo dice en vez de callarlo. */
    sinDatos: ("dias" | "horario")[];
    mensaje: string;
}
/**
 * ¿Se pisan dos horarios de un mismo día? Un turno que cruza la medianoche (18:00 a 00:00, 22:00 a 06:00)
 * termina al día siguiente: se lo compara también corrido un día para cada lado. Tocarse en el borde
 * (uno termina 12:00 y el otro empieza 12:00) no es pisarse.
 */
export declare function horariosSePisan(a: {
    inTime?: string;
    outTime?: string;
}, b: {
    inTime?: string;
    outTime?: string;
}): boolean | null;
export declare function superposiciones(pedido: PedidoDeAlta, existentes: CompromisoExistente[], hoy: string): Superposicion[];
/**
 * UN PUESTO DE UN EQUIPO GUARDADO, ya con sus condiciones (las del puesto pisadas por las del equipo).
 * Sin fechas: una plantilla no las tiene, así que sólo se comparan los días de la semana y el horario.
 */
export interface PuestoDelEquipo {
    puestoId: string;
    /** Cómo se lo nombra en el aviso («puesto 3, Cámara»). */
    etiqueta: string;
    userId: string;
    dias: number[];
    rotativos?: boolean;
    /** Por días sueltos: los días se eligen al contratar, no se saben. */
    porDiasSueltos?: boolean;
    inTime?: string;
    outTime?: string;
    shiftId?: string | null;
}
/**
 * ¿La misma persona ocupa dos puestos del equipo que se pisan? Se permite (mañana en uno y noche en otro
 * está bien) y se AVISA cuando comparten un día de la semana y el horario se pisa o es el mismo turno.
 * Si falta el dato (días rotativos o sueltos, sin horario) se avisa que PODRÍA pisarse. Devuelve los
 * avisos por `puestoId` (cada puesto del par recibe el suyo).
 */
export declare function choquesDelEquipo(puestos: PuestoDelEquipo[]): Map<string, string[]>;
