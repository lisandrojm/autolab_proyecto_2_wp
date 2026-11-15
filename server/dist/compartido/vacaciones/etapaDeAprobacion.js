/**
 * ═══════════════════════════════════════════════════════════════════════
 * QUIÉN APRUEBA UNA SOLICITUD DE VACACIONES, Y EN QUÉ PASO ESTÁ (15/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Pedido del usuario: el admin ya no pre-aprueba. La solicitud sube por la jerarquía del proyecto:
 *
 *   Colaborador pide → Supervisor (el de su área × turno × sede) → Coordinador (el del proyecto) → Admin.
 *
 * Reglas (decididas por el usuario el 15/11/2026):
 *   · Una persona en varios proyectos: le aparece al supervisor y al coordinador de CADA proyecto vigente;
 *     con que apruebe uno por nivel, avanza.
 *   · Un nivel sin nadie se saltea: sin supervisor para su área va al coordinador; sin coordinador va al
 *     admin; sin ninguno de los dos, nace directamente en la bandeja del admin.
 *   · El coordinador ve lo que espera al supervisor y puede pedirle que apruebe, pero no aprobar por él.
 *   · El admin aprueba recién cuando la jerarquía terminó (`pre_approved`). Rechazar puede siempre.
 *
 * OJO CON LOS NOMBRES, ESTÁN CRUZADOS EN EL RESTO DEL CÓDIGO: el rol «Supervisor» es el que está en
 * `Project.coordinatorAssignments` (capacidad `project_coordinator:eligible`) y el rol «Coordinador» es
 * el responsable del proyecto, `Project.metadata.responsableId` (capacidad `project_supervisor:eligible`).
 * Acá se usan los nombres de negocio, los que ve el usuario.
 *
 * Funciones puras: las usan el server (para decidir) y la bandeja del admin (para mostrar).
 */
const str = (x) => (x == null ? "" : String(x));
/** Todos los que pueden aprobar un nivel, sumando los proyectos, sin repetir. */
export function aprobadoresDe(cadena, nivel) {
    const ids = new Set();
    for (const p of cadena?.proyectos || [])
        for (const u of (nivel === "supervisor" ? p.supervisores : p.coordinadores) || [])
            if (str(u))
                ids.add(str(u));
    return [...ids];
}
export const requiereSupervisor = (cadena) => aprobadoresDe(cadena, "supervisor").length > 0;
export const requiereCoordinador = (cadena) => aprobadoresDe(cadena, "coordinador").length > 0;
/**
 * El primer nivel que todavía falta, mirando sólo la cadena y lo aprobado. `admin` si no falta ninguno.
 * No mira el estado: es lo que usa `avanzar` para decidir adónde va después de cada aprobación.
 */
export function nivelQueFalta(v) {
    if (requiereSupervisor(v.cadena) && !v.aprobaciones?.supervisor)
        return "supervisor";
    if (requiereCoordinador(v.cadena) && !v.aprobaciones?.coordinador)
        return "coordinador";
    return "admin";
}
/**
 * EN QUÉ PASO ESTÁ. `null` si ya no espera a nadie (aprobada, rechazada, entregada, cancelada).
 *   · `pre_approved` → admin (la jerarquía terminó).
 *   · `pending` → el primer nivel que falta. Una `pending` sin nivel que falte (cadena vacía o ya
 *     aprobada) también es del admin: le toca aprobarla aunque no haya pasado por el paso intermedio
 *     (las viejas, anteriores a la jerarquía, que no tienen cadena).
 */
export function etapaDe(v) {
    if (v.status === "pre_approved")
        return "admin";
    if (v.status !== "pending")
        return null;
    return nivelQueFalta(v);
}
/** ¿Esta persona puede aprobar (o rechazar) el paso en que está la solicitud? Sólo supervisor y coordinador: el admin va por su lado. */
export function puedeAprobarEtapa(v, userId) {
    const etapa = etapaDe(v);
    if (etapa !== "supervisor" && etapa !== "coordinador")
        return null;
    return aprobadoresDe(v.cadena, etapa).includes(str(userId)) ? etapa : null;
}
/** ¿Es coordinador de alguno de los proyectos de la cadena? (para ver lo que espera al supervisor y recordárselo). */
export const esCoordinadorDeLaCadena = (v, userId) => aprobadoresDe(v.cadena, "coordinador").includes(str(userId));
export function estadoDeNivel(v, nivel) {
    if (v.aprobaciones?.[nivel])
        return "aprobado";
    if (aprobadoresDe(v.cadena, nivel).length === 0)
        return "sin_nadie";
    const etapa = etapaDe(v);
    if (etapa === nivel)
        return "pendiente";
    if (etapa === "supervisor" && nivel === "coordinador")
        return "esperando";
    return "no_intervino";
}
