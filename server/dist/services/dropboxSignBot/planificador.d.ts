/**
 * QUÉ SE ENVÍA EN LA PRÓXIMA TANDA, y si corresponde enviar ahora. Lógica pura (sin Dropbox ni base):
 * recibe el listado del Outbox ya leído, los envíos ya registrados y el estado del throttle, y
 * devuelve la tanda, lo que requiere revisión y por qué no se corre si no se corre.
 *
 * Orden: por nombre de archivo, ascendente. Dedupe duro por código: lo que ya figura `enviado` no
 * vuelve a salir aunque siga en Outbox (el IMAP lo mueve a los ~2 min).
 */
export interface ConfigEnvio {
    activo: boolean;
    tamanoTanda: number;
    intervaloHoras: number;
    topeDiario: number;
    enfriamientoHoras: number;
    horaDesde: number;
    horaHasta: number;
}
export declare const CONFIG_POR_DEFECTO: ConfigEnvio;
export interface EstadoThrottle {
    contadorDia: {
        fecha: string;
        enviados: number;
    };
    enfriadoHasta: Date | null;
    ultimaCorridaAt: Date | null;
}
/** Un archivo del Outbox ya resuelto contra la base (o no). */
export interface ArchivoResuelto {
    archivo: string;
    /** Email y nombre del firmante, ya decididos (la base manda sobre el nombre de archivo). `null` si no se pudo resolver. */
    firmante: {
        nombre: string;
        email: string;
    } | null;
    /** Por qué no se pudo resolver, para el log. */
    motivoSinFirmante?: string;
}
export interface Candidato {
    archivo: string;
    codigo: string;
    tipo: string;
    email: string;
    firmante: string;
}
export interface RequiereRevision {
    archivo: string;
    codigo: string;
    motivo: string;
}
export interface Plan {
    tanda: Candidato[];
    requiereRevision: RequiereRevision[];
    /** Ya enviados (en Outbox todavía porque el IMAP no los movió). */
    yaEnviados: string[];
    /** Cuántos quedan para tandas siguientes. */
    pendientesDespues: number;
    /** Cupo que queda hoy. */
    cupoHoy: number;
}
/** La fecha (YYYY-MM-DD) y la hora (0-23) en Argentina. */
export declare function fechaYHoraArgentina(ahora: Date): {
    fecha: string;
    hora: number;
};
export declare const cupoDelDia: (config: ConfigEnvio, estado: EstadoThrottle, ahora: Date) => number;
/**
 * ¿Le toca correr al scheduler ahora? Devuelve el motivo si no. (El botón «Enviar tanda ahora» no
 * pasa por acá salvo por el enfriamiento y el cupo: es una decisión de la persona.)
 */
export declare function puedeCorrer(config: ConfigEnvio, estado: EstadoThrottle, ahora: Date, opciones?: {
    manual?: boolean;
}): {
    ok: boolean;
    motivo?: string;
};
/** La tanda a enviar y lo que queda afuera, a partir del Outbox resuelto. */
export declare function planificar(archivos: ArchivoResuelto[], codigosEnviados: Set<string>, config: ConfigEnvio, estado: EstadoThrottle, ahora: Date): Plan;
