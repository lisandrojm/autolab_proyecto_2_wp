import type { Regimen } from "../../utils/liquidacion/contratos.js";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETAPA 1 — DE RENGLÓN DE PARTE A EVENTO PLANO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un parte de novedades trae una fila por empleado con todo mezclado: quién faltó, quién lo cubrió,
 * las horas extra de los dos. Para liquidar hace falta lo contrario: hechos sueltos, cada uno a
 * nombre de UNA persona, con su legajo, su empresa y su régimen al lado.
 *
 * UN REEMPLAZO GENERA DOS EVENTOS. La ausencia del titular y la presencia del reemplazante son dos
 * cosas que se liquidan por separado, a dos personas distintas, muchas veces en dos empresas
 * distintas. Meterlas en un solo evento obliga a arrastrar "y además" por todo el motor.
 *
 * ES PURA: no toca Mongo. Lo que necesita saber de cada persona se lo pasan resuelto.
 */
export type AplicaA = "titular" | "reemplazante";
/** Lo que el padrón sabe de una persona en un proyecto. Ver `services/liquidacion/padron.ts`. */
export interface DatosDePersona {
    apellidoYNombre: string;
    legajo: string | null;
    empresaId: string | null;
    ccCodigo: string | null;
    regimen: Regimen | null;
}
export interface Evento {
    /** Identifica al evento de punta a punta. Es lo que después permite decir de dónde salió una línea. */
    id: string;
    activityReportId: string;
    attendanceItemId: string;
    aplicaA: AplicaA;
    userId: string;
    apellidoYNombre: string;
    legajo: string | null;
    empresaId: string | null;
    ccCodigo: string | null;
    regimen: Regimen | null;
    fecha: string;
    proyectoId: string | null;
    proyecto: string | null;
    areaId: string | null;
    turnoId: string | null;
    estado: string;
    motivoId: string | null;
    motivoNombre: string | null;
    /** Días que abarca el evento. Un parte es de un día, así que siempre 1. */
    jornadas: number;
    he50: number;
    he100: number;
    /**
     * HORAS EXTRA QUE NADIE DISCRIMINÓ.
     *
     * La app guarda el total en `overtimeHours` y el desglose en `overtimeHours50/100`, pero el
     * desglose casi no se usa: medido sobre toda la historia, 472,75 horas están sin discriminar
     * contra 9 que sí lo están.
     *
     * Van acá y NO repartidas: liquidarlas todas al 50% sería inventar un dato que cambia lo que
     * cobra la gente. El motor las convierte en una excepción para que alguien las clasifique.
     */
    heSinDiscriminar: number;
    horarioDesde: string | null;
    horarioHasta: string | null;
    /**
     * CUÁNTAS HORAS DURA EL TURNO de esa persona ese día.
     *
     * Sale del horario base del renglón, que está cargado en 7.916 de los 7.938 que existen. Es lo
     * que se liquida en 0017 Feriado y 0018 Día del gremio. Cero cuando no hay horario: sin dato no
     * se inventa una jornada de ocho horas.
     */
    horasDeJornada: number;
    /** A quién cubre este evento, cuando es el del reemplazante. Para la planilla de control. */
    reemplazaA: string | null;
    notas: string | null;
}
/** El parte, con lo mínimo que hace falta. Los ids ya resueltos a string. */
export interface ParteParaNormalizar {
    _id: string;
    date: string;
    projectId?: string | null;
    proyectoNombre?: string | null;
    areaId?: string | null;
    shiftId?: string | null;
    attendance: RenglonDeParte[];
}
export interface RenglonDeParte {
    _id: string;
    employeeId: string;
    typeId?: string | null;
    status: string;
    absenceReason?: string | null;
    replacementId?: string | null;
    overtimeHours?: number;
    overtimeHours50?: number;
    overtimeHours100?: number;
    replacementOvertimeHours?: number;
    replacementOvertimeHours50?: number;
    replacementOvertimeHours100?: number;
    scheduleInTime?: string | null;
    scheduleOutTime?: string | null;
    notes?: string | null;
}
/**
 * Las horas entre dos "HH:MM".
 *
 * Si la salida es menor o igual que la entrada, el turno CRUZA LA MEDIANOCHE y se le suman 24 h:
 * "18:00 → 00:00" son seis horas, no menos veintidós. Son 1.984 renglones con ese turno.
 */
export declare function horasEntre(desde: string | null | undefined, hasta: string | null | undefined): number;
/**
 * Convierte un parte entero en eventos.
 *
 * `datosDe` resuelve legajo, empresa, CC y régimen de una persona en ese proyecto. Devuelve
 * `undefined` cuando esa persona no tiene contrato vigente, y en ese caso el evento SE GENERA IGUAL
 * con los datos en null: lo que no se puede liquidar tiene que verse en el anexo, no desaparecer.
 */
export declare function normalizarParte(parte: ParteParaNormalizar, datosDe: (userId: string, projectId: string | null) => DatosDePersona | undefined): Evento[];
