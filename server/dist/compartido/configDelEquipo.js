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
const idDe = (v) => String((v && typeof v === "object" ? v._id ?? v : v) ?? "");
/** Área/turnos/sede como texto comparable: mismo contenido = misma firma, sin importar el orden. */
export function firmaDeAreas(asignaciones) {
    const filas = (asignaciones || [])
        .map((a) => ({ a: idDe(a?.areaId), s: (a?.shiftIds || []).map(idDe).filter(Boolean).sort(), sede: Number(a?.sedeId) > 0 ? Number(a?.sedeId) : null }))
        .filter((f) => f.a)
        .sort((x, y) => `${x.a}|${x.sede}`.localeCompare(`${y.a}|${y.sede}`));
    return JSON.stringify(filas);
}
const SIN_ROL = /^(|-|sin rol frame)$/i;
export const tieneRol = (nombre) => !SIN_ROL.test(String(nombre ?? "").trim());
/**
 * Lo que el wizard le pide al server que escriba en el equipo.
 *  · Alta en el equipo: todo.
 *  · Editando un contrato: sólo lo que el usuario cambió respecto de lo precargado, y sólo si ese contrato
 *    es el que rige (corregir una tarjeta vieja corrige ese contrato y nada más).
 *  · Contrato nuevo de alguien que ya está (aprobar/renovar): lo que confirmó (`confirmado`).
 */
export function queActualizarDelEquipo(p) {
    if (p.nuevoEnElEquipo)
        return { areas: true, rol: true };
    if (p.contratoNuevo)
        return { areas: !!p.confirmado?.areas, rol: !!p.confirmado?.rol };
    if (!p.editaElQueRige || !p.precarga)
        return { areas: false, rol: false };
    return { areas: p.ahora.areas !== p.precarga.areas, rol: String(p.ahora.rolFrameId) !== String(p.precarga.rolFrameId) };
}
/** Qué difiere entre lo que trae el contrato nuevo y lo que el miembro tiene hoy en el equipo (para confirmar). */
export function diferenciasConElEquipo(p) {
    return {
        // Sin área en el equipo no hay nada que pisar: se completa sin preguntar (lo hace el server).
        areas: p.areasEquipo !== "[]" && p.areasContrato !== "[]" && p.areasEquipo !== p.areasContrato,
        rol: tieneRol(p.rolEquipo) && tieneRol(p.rolContrato) && p.rolEquipo.trim() !== p.rolContrato.trim(),
    };
}
/**
 * La fila del equipo después de guardar. Devuelve `null` si no cambia. Nunca reemplaza la fila entera:
 * `canRegister`, `useProjectSchedule` y el horario propio (`startTime`/`endTime`) se conservan.
 */
export function filaDelEquipoTrasGuardar(previa, nueva, actualizar) {
    if (!previa)
        return { canRegister: true, useProjectSchedule: true, ...nueva };
    const sinArea = !previa.areaShiftAssignments?.length;
    if (!actualizar && !sinArea)
        return null;
    if (firmaDeAreas(previa.areaShiftAssignments) === firmaDeAreas(nueva.areaShiftAssignments))
        return null;
    return { ...previa, areaId: nueva.areaId, shiftId: nueva.shiftId, areaShiftAssignments: nueva.areaShiftAssignments };
}
/** El rol del equipo después de guardar: `null` si no cambia. */
export function rolDelEquipoTrasGuardar(previo, delContrato, actualizar) {
    if (!tieneRol(delContrato))
        return null;
    if (tieneRol(previo) && !actualizar)
        return null;
    return String(previo ?? "").trim() === delContrato.trim() ? null : delContrato;
}
/**
 * ELEGIR UN TURNO Y EL HORARIO: el del turno completa el del contrato, salvo que el contrato tuviera un
 * horario PROPIO (distinto del default del turno que tenía): ése se conserva. Devuelve el horario a
 * poner, o `null` para no tocarlo.
 */
export function horarioAlElegirTurno(p) {
    if (!p.turnoNuevo.startTime || !p.turnoNuevo.endTime)
        return null;
    const a = p.turnoAnterior;
    const propio = !!(a?.startTime && a?.endTime && p.horaInicio && p.horaFin && (p.horaInicio !== a.startTime || p.horaFin !== a.endTime));
    if (propio)
        return null;
    return { hora_inicio: p.turnoNuevo.startTime, hora_fin: p.turnoNuevo.endTime };
}
