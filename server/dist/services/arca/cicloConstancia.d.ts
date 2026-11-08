/**
 * EL CICLO DE LA CONSTANCIA DE UN ALTA PRESENTADA EN ARCA (07/11/2026). Puro: sin base, sin ARCA, sin Dropbox.
 *
 * Una presentación es persona + empleadora + fecha de alta (`claveConstancia`). Su constancia pasa por:
 *
 *   presentada → constancia_pendiente → constancia_descargada → enviada_a_firmar → firmada → archivada
 *
 * y dos terminales: `baja_mismo_dia_ok` (la constancia de una relación que ya terminó, que no va a
 * firma) y `requiere_revision` (con un motivo en castellano). Es la única fuente de verdad: Pendientes,
 * Presentadas, el panel de descargas y el Registro leen de acá (colección `constancias_arca`).
 *
 * POR QUÉ EXISTE. Antes la cola era «todo lo presentado sin constancia validada», en el orden en que
 * venía de la base, y lo que rebotaba no dejaba rastro: la constancia de BAJA de una jornada (ARCA la
 * emite así cuando la relación ya terminó) rebotaba todos los días, para siempre, y ocupaba el tope de
 * 40 por empleadora antes que las nuevas. Ahora cada intento queda anotado, se reintenta a lo sumo
 * `MAX_INTENTOS` veces con espera creciente, y el cupo es primero para las nunca intentadas.
 */
export type EstadoConstancia = "presentada" | "constancia_pendiente" | "constancia_descargada" | "enviada_a_firmar" | "firmada" | "archivada" | "baja_mismo_dia_ok" | "requiere_revision";
/** Se intenta, como mucho, esta cantidad de veces en las corridas automáticas. */
export declare const MAX_INTENTOS = 3;
/** Días de espera después del intento fallido n (1.º → 1 día, 2.º → 2 días). Al 3.º, a revisión. */
export declare const ESPERA_DIAS: number[];
/** Persona + empleadora + fecha de alta: lo que identifica una constancia. Dos corridas sobre lo mismo dan la misma clave. */
export declare const claveConstancia: (o: {
    cuil: unknown;
    empresaCuit: unknown;
    fechaAlta: unknown;
}) => string;
/** Ya tiene su constancia: no se vuelve a pedir a ARCA ni cuenta contra el tope, nunca. */
export declare const yaTieneConstancia: (estado: EstadoConstancia) => boolean;
/** Se puede pedir en una corrida AUTOMÁTICA: nueva, o un reintento cuya espera ya pasó. */
export declare function sePuedePedir(item: {
    estado: EstadoConstancia;
    proximoIntentoEl?: Date | string | null;
}, ahora: Date): boolean;
/** «redescarga»: no es un intento contra ARCA sino la marca de «Volver a bajar» (ver `puedeVolverABajarse`); los intentos se cuentan desde ahí. */
export type ResultadoIntento = "descargada" | "rechazada" | "sin_constancia" | "ambigua" | "error" | "redescarga";
export interface Intento {
    fecha: Date;
    resultado: ResultadoIntento;
    detalle?: string;
    /** Pedido a mano («Reintentar», «Forzar descarga»): no cuenta para el tope de intentos automáticos. */
    manual?: boolean;
}
/** Los intentos que cuentan hoy: los posteriores al último «Volver a bajar» (una re-descarga arranca con sus 3 intentos). */
export declare const intentosDesdeLaRedescarga: <T extends {
    resultado: string;
}>(intentos: T[]) => T[];
/** La re-descarga pedida de una constancia cuyo documento se perdió. `enCurso` hasta que se baja o vuelve a revisión. */
export interface Redescarga {
    pedidaEl: Date;
    porUsuarioId?: string | null;
    /** La validación de la constancia anterior (la que se perdió), que se limpió del contrato para que vuelva a la cola. */
    validadaElAnterior?: Date | null;
    documentoAnterior?: {
        codigo?: string;
        nombre?: string;
        path?: string;
    } | null;
    enCurso: boolean;
    terminadaEl?: Date | null;
}
/**
 * ¿SE PUEDE «VOLVER A BAJAR»? Sólo una constancia en revisión porque su documento no está en ninguna
 * carpeta del circuito (se borró). Idempotente: si el documento reapareció (ya no está en revisión, o
 * está por otro motivo) o ya hay una re-descarga en curso, no. Puro.
 */
export declare function puedeVolverABajarse(item: {
    estado: EstadoConstancia;
    documento?: {
        noUbicadoDesde?: Date | string | null;
    } | null;
    redescarga?: Pick<Redescarga, "enCurso"> | null;
}): {
    ok: true;
} | {
    ok: false;
    motivo: string;
};
export interface Fallo {
    resultado: Exclude<ResultadoIntento, "descargada" | "redescarga">;
    detalle?: string;
    /**
     * La ambigüedad que no se resuelve sola: ARCA muestra varias relaciones de ese inicio y son
     * DISTINTAS. Reintentar no la arregla, así que va derecho a revisión.
     */
    sinArreglo?: boolean;
}
/**
 * Qué pasa con la constancia después de un intento fallido. Puro.
 *
 * Cuentan sólo los intentos automáticos: un «Reintentar» a mano que falla vuelve a revisión sin gastar
 * los que le quedaban, y uno que sale bien la saca. Lo que no se arregla reintentando (`sinArreglo`)
 * no espera tres días para decirlo.
 */
export declare function trasUnFallo(intentosPrevios: Intento[], fallo: Fallo, ahora: Date, o?: {
    manual?: boolean;
}): {
    estado: EstadoConstancia;
    proximoIntentoEl: Date | null;
    motivoRevision?: string;
};
export interface ItemDeCola {
    estado: EstadoConstancia;
    proximoIntentoEl?: Date | string | null;
    /** YYYY-MM-DD. */
    fechaAlta: string;
}
export interface FueraDeLaCorrida {
    /** Nuevas que no entraron por el tope: salen en la próxima. */
    nuevasPorTope: number;
    /** Reintentos ya vencidos que no entraron por el tope. */
    reintentosPorTope: number;
    /** Reintentos que todavía esperan su fecha. */
    esperandoReintento: number;
    /** En revisión: no se piden solas ni ocupan cupo. */
    enRevision: number;
}
/**
 * LAS QUE ENTRAN EN UNA CORRIDA AUTOMÁTICA, con su tope. Puro.
 *
 * Primero las nunca intentadas (de la más vieja a la más nueva), después los reintentos ya vencidos
 * (el que más espera, primero). Lo que ya tiene constancia, lo que está en revisión y los reintentos
 * que todavía esperan no entran ni ocupan lugar. Devuelve cuántas quedaron afuera y por qué.
 */
export declare function elegirParaCorrida<T extends ItemDeCola>(items: T[], o: {
    ahora: Date;
    tope: number;
}): {
    elegidas: T[];
    fuera: FueraDeLaCorrida;
};
export type CarpetaDelDocumento = "outbox" | "pendbox" | "firmados" | "alta_firmadas" | "no_firmar";
/** De todas las carpetas donde aparece el código, la más avanzada del circuito. Puro. */
export declare const carpetaMasAvanzada: (donde: CarpetaDelDocumento[]) => CarpetaDelDocumento | null;
/** El estado que corresponde a esa carpeta. Puro. */
export declare function estadoPorCarpeta(carpeta: CarpetaDelDocumento, o?: {
    esDeBaja?: boolean;
}): EstadoConstancia;
/**
 * El estado nuevo, sin volver nunca para atrás en el circuito. Puro.
 *
 * Desde revisión se sale a cualquier estado con documento (reapareció, o se resolvió a mano). Lo que no
 * se hace es retroceder: una constancia firmada no vuelve a «en firma» porque un listado viejo la vea
 * todavía en Pendbox.
 */
export declare function siguienteEstado(actual: EstadoConstancia, nuevo: EstadoConstancia): EstadoConstancia;
export type CategoriaConstancia = "pendientes" | "descargadas" | "en_firma" | "firmadas" | "revision";
export declare function categoriaDe(estado: EstadoConstancia, o?: {
    firmada?: boolean;
}): CategoriaConstancia;
