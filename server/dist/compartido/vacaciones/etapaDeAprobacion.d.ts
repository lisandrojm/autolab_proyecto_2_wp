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
type Id = string | {
    toString(): string;
};
export interface ProyectoDeLaCadena {
    projectId: Id;
    /** Los supervisores del área × turno × sede de la persona en ese proyecto (sin ella misma). */
    supervisores: Id[];
    /** El coordinador del proyecto (sin la persona misma). */
    coordinadores: Id[];
}
export interface CadenaDeAprobacion {
    proyectos: ProyectoDeLaCadena[];
    calculadaAt?: Date | string;
}
export interface AprobacionDeNivel {
    userId: Id;
    projectId?: Id | null;
    at: Date | string;
}
export interface VacacionConCadena {
    status: string;
    cadena?: CadenaDeAprobacion | null;
    aprobaciones?: {
        supervisor?: AprobacionDeNivel | null;
        coordinador?: AprobacionDeNivel | null;
    } | null;
}
export type Nivel = "supervisor" | "coordinador";
export type Etapa = Nivel | "admin";
/** Todos los que pueden aprobar un nivel, sumando los proyectos, sin repetir. */
export declare function aprobadoresDe(cadena: CadenaDeAprobacion | null | undefined, nivel: Nivel): string[];
export declare const requiereSupervisor: (cadena: CadenaDeAprobacion | null | undefined) => boolean;
export declare const requiereCoordinador: (cadena: CadenaDeAprobacion | null | undefined) => boolean;
/**
 * El primer nivel que todavía falta, mirando sólo la cadena y lo aprobado. `admin` si no falta ninguno.
 * No mira el estado: es lo que usa `avanzar` para decidir adónde va después de cada aprobación.
 */
export declare function nivelQueFalta(v: Pick<VacacionConCadena, "cadena" | "aprobaciones">): Etapa;
/**
 * EN QUÉ PASO ESTÁ. `null` si ya no espera a nadie (aprobada, rechazada, entregada, cancelada).
 *   · `pre_approved` → admin (la jerarquía terminó).
 *   · `pending` → el primer nivel que falta. Una `pending` sin nivel que falte (cadena vacía o ya
 *     aprobada) también es del admin: le toca aprobarla aunque no haya pasado por el paso intermedio
 *     (las viejas, anteriores a la jerarquía, que no tienen cadena).
 */
export declare function etapaDe(v: VacacionConCadena): Etapa | null;
/** ¿Esta persona puede aprobar (o rechazar) el paso en que está la solicitud? Sólo supervisor y coordinador: el admin va por su lado. */
export declare function puedeAprobarEtapa(v: VacacionConCadena, userId: Id): Nivel | null;
/** ¿Es coordinador de alguno de los proyectos de la cadena? (para ver lo que espera al supervisor y recordárselo). */
export declare const esCoordinadorDeLaCadena: (v: Pick<VacacionConCadena, "cadena">, userId: Id) => boolean;
/**
 * Qué dice cada nivel en la bandeja del admin:
 *   · `aprobado`: aprobó.
 *   · `pendiente`: es su turno.
 *   · `esperando`: el coordinador, mientras el supervisor no aprobó.
 *   · `sin_nadie`: el proyecto no tiene a nadie en ese nivel (se salteó).
 *   · `no_intervino`: la solicitud siguió sin pasar por él (rechazada antes, o vino del plan, que aprueba
 *     el coordinador directamente).
 */
export type EstadoDeNivel = "aprobado" | "pendiente" | "esperando" | "sin_nadie" | "no_intervino";
export declare function estadoDeNivel(v: VacacionConCadena, nivel: Nivel): EstadoDeNivel;
export {};
