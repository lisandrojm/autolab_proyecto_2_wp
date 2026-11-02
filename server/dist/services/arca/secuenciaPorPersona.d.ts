import { type AltaPresentada, type RelacionArcaResumida } from "./altasVigentes.js";
import { type ConfigAltasAutomaticas } from "./horarioAltasAutomaticas.js";
/** El registro de 85 le manda a ARCA la fecha de fin. En blanco (tiempo indeterminado), ARCA deja la relación abierta hasta que alguien informe la baja. */
export declare const mandaFechaFin: (registro85: string | null | undefined) => boolean;
/** Las fechas de inicio y fin tal como van en el registro de 85. */
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
    /**
     * `mismo_dia`: ya hay un alta de ese día (duplicado, no ocupa turno). `activa_arca`: ARCA la lista sin baja
     * procesada. `presentada`: presentada desde WeProdu, ARCA no la lista y todavía no pasó la noche de su
     * vencimiento (o no tiene baja).
     */
    tipo: "mismo_dia" | "activa_arca" | "presentada";
    /** Por qué no se presenta todavía: va a la pantalla y al error del lote. */
    motivo: string;
    /** Hasta qué día dura lo que la traba, "YYYY-MM-DD"; vacío = sin baja conocida en ningún lado. */
    hasta: string;
    /** Qué la destraba, corto: la columna de la próxima corrida. */
    desbloqueo: string;
}
/**
 * Por qué este contrato no se puede presentar todavía, o `null` si nada lo traba. `relacionesArca` son las
 * de esa persona con esa empleadora; `presentadas`, las de WeProdu (se filtran acá).
 */
export declare function bloqueoPorVigencia(contrato: ContratoPendiente, presentadas: AltaPresentada[], relacionesArca: RelacionArcaResumida[], o: {
    hoy: string;
}): Bloqueo | null;
/** Lo que mira el turno de cada pendiente. */
export interface PendienteEnSecuencia {
    cuil: string;
    empresaId: string;
    fechaAlta: string;
    fechaBaja: string;
    /** Sale en esta corrida si nada de la secuencia lo frena. */
    presentable: boolean;
    /**
     * Es un alta real que espera (presentable, o trabada por algo activo): ocupa su lugar en la fila. Un
     * contrato al que le faltan datos NO ocupa turno (no traba a los demás por un dato sin cargar), ni uno
     * que ya tiene su alta del mismo día (es un duplicado).
     */
    ocupaTurno: boolean;
    /** Su registro le manda a ARCA la fecha de fin (`mandaFechaFin`): ARCA la cierra sola al vencer. */
    mandaFin: boolean;
}
export interface EsperaTurno {
    /** Índice (en la lista recibida) del alta de la misma persona que va antes. */
    antes: number;
    motivo: string;
    desbloqueo: string;
    /** No antes de este día: el siguiente a la baja de la anterior, si ARCA la cierra sola. Vacío = espera una baja que alguien tiene que informar. */
    desdeDia: string;
}
/** Por persona y empleadora, en orden de fecha de alta, sale la primera que ocupa turno; las demás esperan, cada una detrás de la anterior. */
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
/**
 * La fecha prevista de un alta trabada por algo ACTIVO con baja conocida: la primera corrida del día
 * siguiente a esa baja y nunca antes de mañana, porque que ARCA la procese lo trae recién la próxima
 * sincronización (una por día). Si mañana todavía no figura, se vuelve a calcular: no se presenta a ciegas.
 */
export declare const momentoTrasBaja: (fechaAlta: string, baja: string, cfg: ConfigAltasAutomaticas, ahora: Date, hoy: string, o?: {
    ultimaCola?: string;
}) => Date | null;
/**
 * La fecha prevista de un alta que espera su turno: no antes del día siguiente a la corrida que presenta la
 * anterior (la baja de esa llega con la sincronización de al otro día), ni antes del día siguiente a su
 * baja. `null` si la anterior no tiene fecha o su baja la tiene que informar alguien.
 */
export declare function momentoDetrasDe(fechaAlta: string, espera: EsperaTurno, anterior: Date | null, cfg: ConfigAltasAutomaticas, ahora: Date, hoy: string, o?: {
    ultimaCola?: string;
}): Date | null;
/**
 * EL RECHAZO POR «ALTA ACTIVA» DEJA DE SER UN LOOP (pedido del 01/11/2026). Si ARCA lo rechazó así pero lo
 * sincronizado no muestra nada activo, los datos locales están atrasados: reintentar da lo mismo. Se
 * destraba con una sincronización de Relaciones Laborales POSTERIOR al rechazo (que trae lo que lo traba,
 * o confirma que ya no está) o si cambiaron las fechas que se le mandaron a ARCA. Sin el registro del
 * rechazo (rechazos de antes de esta regla), sólo la sincronización.
 */
export declare function rechazoAltaActivaDestrabado(o: {
    rechazadaEl: string;
    registroAlRechazo?: string;
    registroActual?: string | null;
    ultimaSyncOk?: string;
}): boolean;
export declare const TEXTO_RECHAZO_ALTA_ACTIVA = "ARCA la rechaz\u00F3 por un alta activa, pero las Relaciones Laborales sincronizadas no muestran ninguna: los datos est\u00E1n atrasados. Se vuelve a presentar despu\u00E9s de la pr\u00F3xima sincronizaci\u00F3n de Relaciones Laborales (o si cambian sus fechas).";
export declare const DESBLOQUEO_RECHAZO_ALTA_ACTIVA = "Despu\u00E9s de la pr\u00F3xima sincronizaci\u00F3n de Relaciones Laborales (o si cambian sus fechas).";
/**
 * Las vueltas de una corrida (un lote no puede repetir CUIL, ver `validarLoteAltas`): la k-ésima alta de
 * cada persona, por fecha de alta, va en la vuelta k. Con el turno por persona y empleadora casi siempre es
 * una sola; quedan más con dos empleadoras distintas, que son corridas distintas igual.
 */
export declare function vueltasPorPersona<T extends {
    cuil: string;
    fechaAlta: string;
}>(items: T[]): T[][];
