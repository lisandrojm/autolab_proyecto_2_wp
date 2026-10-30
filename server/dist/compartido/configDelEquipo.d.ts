/**
 * LO QUE ES DEL MIEMBRO EN EL EQUIPO vs. LO QUE ES DEL CONTRATO (30/10/2026). Lógica pura, compartida
 * con el front (`@compartido/configDelEquipo`).
 *
 * Un miembro tiene en el proyecto un área/turno (`project.teamConfig[].areaShiftAssignments`) y un rol
 * (`UserProject.nombre_rol_frame`, el de la tabla del equipo). Cada contrato tiene además los suyos.
 * Hasta acá todo guardado del wizard («Configurar Miembro», aprobar, renovar, editar una tarjeta vieja)
 * pisaba los del equipo con los del contrato guardado: una jornada con otro rol, o abrir para tocar
 * otra cosa, «cambiaba solos» el área, el turno y el rol del miembro.
 *
 * La regla: el contrato guarda lo suyo; lo del equipo se escribe sólo si
 *   · el miembro no lo tiene todavía (alta en el equipo, o sin área/rol cargado), o
 *   · el usuario lo cambió en este guardado editando el contrato que rige, o
 *   · el usuario lo confirmó (aprobar o renovar con un área/rol distinto del que tiene hoy).
 */
export interface AsignacionAreaTurno {
    areaId: any;
    shiftIds?: any[];
    sedeId?: number | null;
}
/** Área/turnos/sede como texto comparable: mismo contenido = misma firma, sin importar el orden. */
export declare function firmaDeAreas(asignaciones: AsignacionAreaTurno[] | null | undefined): string;
export declare const tieneRol: (nombre: string | null | undefined) => boolean;
export interface QueActualizar {
    areas: boolean;
    rol: boolean;
}
/**
 * Lo que el wizard le pide al server que escriba en el equipo.
 *  · Alta en el equipo: todo.
 *  · Editando un contrato: sólo lo que el usuario cambió respecto de lo precargado, y sólo si ese contrato
 *    es el que rige (corregir una tarjeta vieja corrige ese contrato y nada más).
 *  · Contrato nuevo de alguien que ya está (aprobar/renovar): lo que confirmó (`confirmado`).
 */
export declare function queActualizarDelEquipo(p: {
    nuevoEnElEquipo: boolean;
    contratoNuevo: boolean;
    editaElQueRige: boolean;
    precarga: {
        rolFrameId: string;
        areas: string;
    } | null;
    ahora: {
        rolFrameId: string;
        areas: string;
    };
    confirmado?: Partial<QueActualizar>;
}): QueActualizar;
/** Qué difiere entre lo que trae el contrato nuevo y lo que el miembro tiene hoy en el equipo (para confirmar). */
export declare function diferenciasConElEquipo(p: {
    areasEquipo: string;
    areasContrato: string;
    rolEquipo: string;
    rolContrato: string;
}): QueActualizar;
/**
 * La fila del equipo después de guardar. Devuelve `null` si no cambia. Nunca reemplaza la fila entera:
 * `canRegister`, `useProjectSchedule` y el horario propio (`startTime`/`endTime`) se conservan.
 */
export declare function filaDelEquipoTrasGuardar<T extends Record<string, any>>(previa: T | null | undefined, nueva: {
    areaId?: any;
    shiftId?: any;
    areaShiftAssignments: AsignacionAreaTurno[];
}, actualizar: boolean | undefined): (T & {
    areaShiftAssignments: AsignacionAreaTurno[];
}) | Record<string, any> | null;
/** El rol del equipo después de guardar: `null` si no cambia. */
export declare function rolDelEquipoTrasGuardar(previo: string | null | undefined, delContrato: string, actualizar: boolean | undefined): string | null;
/**
 * ELEGIR UN TURNO Y EL HORARIO: el del turno completa el del contrato, salvo que el contrato tuviera un
 * horario PROPIO (distinto del default del turno que tenía): ése se conserva. Devuelve el horario a
 * poner, o `null` para no tocarlo.
 */
export declare function horarioAlElegirTurno(p: {
    horaInicio: string;
    horaFin: string;
    turnoAnterior: {
        startTime?: string;
        endTime?: string;
    } | null;
    turnoNuevo: {
        startTime?: string;
        endTime?: string;
    };
}): {
    hora_inicio: string;
    hora_fin: string;
} | null;
