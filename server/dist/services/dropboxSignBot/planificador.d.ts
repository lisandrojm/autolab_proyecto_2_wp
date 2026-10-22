/**
 * LA COLA DE ENVÍO Y LA PRÓXIMA TANDA. Lógica pura (sin Dropbox ni base).
 *
 * Nada se envía si no fue ENCOLADO desde el tab «Para Firmar» (22/10/2026). `validarEncolado` decide
 * si un archivo puede entrar en la cola; `planificar` toma SÓLO lo encolado (y lo frenado por el
 * límite, que se reintenta), por orden de encolado, y aplica tanda, tope diario, ventana horaria y
 * enfriamiento. Lo que no está encolado simplemente espera.
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
/** Un documento en la cola (un `DropboxSignEnvio` en estado `en_cola` o `limite`). */
export interface ItemEnCola {
    archivo: string;
    codigo: string;
    tipo: string;
    email: string;
    firmante: string;
    orden: number;
}
export interface Candidato extends ItemEnCola {
}
export interface Plan {
    tanda: Candidato[];
    /** Encolados cuyo archivo ya no está en Outbox (el IMAP lo movió, o alguien lo borró): no se envían. */
    faltantes: ItemEnCola[];
    /** Cuántos encolados quedan para tandas siguientes. */
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
 * ¿Le toca correr al scheduler ahora? Devuelve el motivo si no. (El botón «Enviar a la firma» no pasa
 * por acá salvo por el enfriamiento y el cupo: es una decisión de la persona.)
 */
export declare function puedeCorrer(config: ConfigEnvio, estado: EstadoThrottle, ahora: Date, opciones?: {
    manual?: boolean;
}): {
    ok: boolean;
    motivo?: string;
};
/** Lo que hace falta saber de un archivo para decidir si entra en la cola. */
export interface ContextoDeEncolado {
    /** Está en el Outbox tal como lo lista Dropbox. */
    enOutbox: boolean;
    /** El registro previo de ese código, si hay. */
    registroPrevio: {
        estado: string;
    } | null;
    /** El firmante resuelto desde la base, o null. */
    firmante: {
        nombre: string;
        email: string;
    } | null;
    motivoSinFirmante?: string;
}
export interface ResultadoEncolado {
    ok: boolean;
    codigo: string;
    /** Por qué no entra ("" si entra). */
    motivo: string;
    /** Si no entra: ¿se puede volver a intentar cuando se arregle la causa? (false para lo enviado/encolado) */
    reencolable: boolean;
    tipo?: string;
    firmante?: {
        nombre: string;
        email: string;
    };
}
/**
 * ¿Puede entrar este archivo en la cola? Lo que no pasa queda `requiere_revision` con el motivo, salvo
 * lo que ya está enviado o encolado (eso no se toca). UN ARCHIVO ENVIADO JAMÁS SE RE-ENCOLA.
 */
export declare function validarEncolado(archivo: string, ctx: ContextoDeEncolado): ResultadoEncolado;
/** La tanda a enviar, a partir de la cola y de lo que sigue en Outbox. */
export declare function planificar(enCola: ItemEnCola[], archivosEnOutbox: Set<string>, config: ConfigEnvio, estado: EstadoThrottle, ahora: Date): Plan;
