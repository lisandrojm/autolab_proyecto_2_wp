import { type AltaPresentada, type RelacionArcaResumida } from "./altasVigentes.js";
import { type ConfigAltasAutomaticas } from "./horarioAltasAutomaticas.js";
/** El registro de 85 le manda a ARCA la fecha de fin. En blanco (tiempo indeterminado), ARCA deja la relación abierta hasta que alguien informe la baja. */
export declare const mandaFechaFin: (registro85: string | null | undefined) => boolean;
/** Las fechas de inicio y fin tal como van en el registro de 85: lo que ARCA mira para decir «alta activa». */
export declare const fechasDelRegistro: (registro85: string | null | undefined) => string;
export interface ContratoPendiente {
    userId: string;
    userProjectId: string;
    contractIndex: number;
    empresaId: string;
    alta: string;
    baja: string;
}
export interface Bloqueo {
    tipo: "mismo_dia_arca" | "vigente_weprodu" | "vigente_arca";
    /** Por qué no se presenta todavía: va a la pantalla y al error del lote. */
    motivo: string;
    /** Hasta qué día (inclusive) dura lo que la pisa, "YYYY-MM-DD"; vacío = abierta o no se sabe. */
    hasta: string;
    /** Qué la destraba, corto: la columna de la próxima corrida cuando no hay fecha prevista. */
    desbloqueo: string;
}
/**
 * La relación de ARCA que se superpone con el contrato. `relaciones` ya son las de esa persona con esa
 * empleadora. La que empieza el mismo día no cuenta (ver `relacionArcaDelMismoDia`).
 */
export declare function relacionArcaQueSePisa(alta: string, baja: string, relaciones: RelacionArcaResumida[]): RelacionArcaResumida | null;
/** La relación de ARCA de esa persona y empleadora que empieza el mismo día que el contrato. */
export declare const relacionArcaDelMismoDia: (alta: string, relaciones: RelacionArcaResumida[]) => RelacionArcaResumida | null;
/**
 * Por qué este contrato no se puede presentar todavía según lo que ya está vigente —en WeProdu o en
 * ARCA—, o `null` si nada lo pisa. Si lo pisan las dos fuentes, manda la que termina más tarde (abierta
 * gana), porque es la que de verdad lo destraba.
 */
export declare function bloqueoPorVigencia(contrato: ContratoPendiente, presentadas: AltaPresentada[], relacionesArca: RelacionArcaResumida[]): Bloqueo | null;
/** Lo que mira el turno de cada pendiente. */
export interface PendienteEnSecuencia {
    cuil: string;
    empresaId: string;
    fechaAlta: string;
    fechaBaja: string;
    /** Sale en esta corrida si nada de la secuencia lo frena. */
    presentable: boolean;
    /**
     * Es un alta real que espera (presentable, o bloqueada por algo vigente): ocupa su lugar en la fila.
     * Un contrato al que le faltan datos NO ocupa turno (no traba a los demás por un dato sin cargar), ni
     * uno que ARCA ya tiene del mismo día (es un duplicado).
     */
    ocupaTurno: boolean;
    /** Su registro le manda a ARCA la fecha de fin (`mandaFechaFin`). */
    mandaFin: boolean;
}
export interface EsperaTurno {
    /** Índice (en la lista recibida) del alta de la misma persona que va antes. */
    antes: number;
    motivo: string;
    desbloqueo: string;
    /** Desde qué día puede salir, si se sabe: el siguiente a la baja de la anterior (que ARCA cierra sola). Vacío si no. */
    desdeDia: string;
}
/**
 * Qué pendientes esperan su turno: por persona y empleadora, en orden de fecha de alta, sale la primera
 * que ocupa turno; cada siguiente sale en la misma corrida sólo si la anterior también sale, termina
 * antes y le manda a ARCA la fecha de fin (jornadas encadenadas). Las demás esperan.
 */
export declare function esperanSuTurno<T extends PendienteEnSecuencia>(cs: T[]): Map<number, EsperaTurno>;
/**
 * La próxima corrida que presentaría un alta que no puede salir antes de `desdeDia`: la más tardía entre
 * la de su propio turno y la del día `desdeDia`. Reutiliza `proximaCorridaPara` (el turno de un alta es la
 * corrida de `fechaAlta - diasAntes`, por eso se le suma la anticipación).
 */
export declare function momentoDesde(fechaAlta: string, desdeDia: string, cfg: ConfigAltasAutomaticas, ahora: Date, hoy: string, o?: {
    ultimaCola?: string;
    esperaAManana?: boolean;
}): Date | null;
/** La corrida que espera la baja de algo vigente: la primera del día siguiente a esa baja. */
export declare const momentoTrasBaja: (fechaAlta: string, baja: string, cfg: ConfigAltasAutomaticas, ahora: Date, hoy: string, o?: {
    ultimaCola?: string;
}) => Date | null;
/**
 * EL RECHAZO POR «ALTA ACTIVA» DEJA DE SER UN LOOP (pedido del 01/11/2026). Si ARCA lo rechazó así pero
 * las Relaciones Laborales sincronizadas no muestran nada que lo pise, los datos locales están atrasados:
 * reintentar da lo mismo. Se destraba con una sincronización de Relaciones Laborales POSTERIOR al rechazo
 * (que trae la relación que lo pisa, o confirma que ya no está) o si cambiaron las fechas que se le
 * mandaron a ARCA. Sin el registro del rechazo (rechazos de antes de esta regla), sólo la sincronización.
 */
export declare function rechazoAltaActivaDestrabado(o: {
    rechazadaEl: string;
    registroAlRechazo?: string;
    registroActual?: string | null;
    ultimaSyncOk?: string;
}): boolean;
export declare const TEXTO_RECHAZO_ALTA_ACTIVA = "ARCA la rechaz\u00F3 por un alta activa, pero las Relaciones Laborales sincronizadas no muestran ninguna que la pise: los datos est\u00E1n atrasados. Se vuelve a presentar despu\u00E9s de la pr\u00F3xima sincronizaci\u00F3n de Relaciones Laborales (o si cambian sus fechas).";
export declare const DESBLOQUEO_RECHAZO_ALTA_ACTIVA = "Despu\u00E9s de la pr\u00F3xima sincronizaci\u00F3n de Relaciones Laborales (o si cambian sus fechas).";
/**
 * Las vueltas de una corrida (un lote no puede repetir CUIL, ver `validarLoteAltas`): la k-ésima alta de
 * cada persona, por fecha de alta, va en la vuelta k. Así las jornadas encadenadas salen en orden aunque
 * una rechazada haya quedado al final de la lista. Dentro de cada vuelta se respeta el orden recibido.
 */
export declare function vueltasPorPersona<T extends {
    cuil: string;
    fechaAlta: string;
}>(items: T[]): T[][];
