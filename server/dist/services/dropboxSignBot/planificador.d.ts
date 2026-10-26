import type { ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";
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
    /**
     * Enviados en las ÚLTIMAS 24 H (ventana móvil, 25/10/2026): Dropbox Sign libera de a poco, no a la
     * medianoche. Si viene, el cupo se cuenta con esto y no con `contadorDia`.
     */
    enviados24h?: number;
    /** Cuándo se libera el próximo lugar de la ventana, si no queda cupo. */
    liberaAt?: Date | null;
}
/** Un documento en la cola (un `DropboxSignEnvio` en estado `en_cola` o `limite`). */
export interface ItemEnCola {
    archivo: string;
    codigo: string;
    tipo: string;
    email: string;
    firmante: string;
    orden: number;
    /** La última detección del ancla (✓/✗), si se hizo; la muestra «Ver cola». */
    colocacion?: {
        ok: boolean;
        pagina: number | null;
        rotulo: string;
        motivo: string;
        verificadaAt: Date;
    } | null;
    /** Cuándo saldría según la simulación del scheduler (`estimarEnvios`), si el envío automático está activo. */
    estimadoAt?: Date | null;
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
/** El instante de «ese día (YYYY-MM-DD) a esa hora, en Argentina». */
export declare function instanteArgentino(fecha: string, hora: number, minutos?: number): Date;
/**
 * CUÁNDO SALDRÍA CADA ÍTEM DE LA COLA (la cuenta regresiva del tab, 22/10/2026): se simula el
 * scheduler hacia adelante —tandas de `tamanoTanda` cada `intervaloHoras`, dentro de la ventana
 * horaria, sin pasar el tope diario y después del enfriamiento— y se le asigna a cada ítem, por
 * orden, la hora de arranque de la tanda que lo lleva. Con el envío automático apagado no hay
 * estimación (sale cuando alguien aprieta «Enviar tanda ahora»). Es una estimación: una corrida
 * manual, un cambio de configuración o un freno de Dropbox Sign la mueven.
 */
export declare function estimarEnvios(enCola: ItemEnCola[], config: ConfigEnvio, estado: EstadoThrottle, ahora: Date): Map<string, Date>;
/** Lo enviado que cuenta para el tope: las últimas 24 h si se sabe (ventana móvil), si no el día calendario. */
export declare const enviadosQueCuentan: (estado: EstadoThrottle, ahora: Date) => number;
export declare const cupoDelDia: (config: ConfigEnvio, estado: EstadoThrottle, ahora: Date) => number;
/**
 * ¿Le toca correr al scheduler ahora? Devuelve el motivo si no. (El botón «Enviar a la firma» no pasa
 * por acá salvo por el enfriamiento y el cupo: es una decisión de la persona.)
 */
export declare function puedeCorrer(config: ConfigEnvio, estado: EstadoThrottle, ahora: Date, opciones?: {
    manual?: boolean;
    yaReservada?: boolean;
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
    /** Las reglas de colocación del tenant (sin ellas, el catálogo de fábrica). */
    reglas?: ReglaColocacion[];
    /** La posición de la firma la declaró la plantilla al generar el documento: no hace falta regla por nombre (25/10/2026). */
    posicionDeclarada?: {
        plantillaNombre: string;
    } | null;
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
/**
 * QUÉ PASA CON UN DOCUMENTO DESPUÉS DE INTENTAR ENVIARLO (26/10/2026). Un documento sale de la cola
 * SÓLO si se envió de verdad. Una falla de pantalla, de red, de login o una detención lo dejan en la
 * cola, en su lugar, sin marcarlo («requiere revisión» es sólo para cuando la colocación de la firma no
 * se puede resolver, y eso se decide antes de abrir el navegador). La única excepción: si la falla fue
 * DESPUÉS de apretar «Enviar para firmar», pudo haber salido; reenviarlo podría duplicar la solicitud,
 * así que queda como «error» para que una persona lo mire en Dropbox Sign.
 */
export type DestinoDelIntento = "enviado" | "limite" | "seco" | "sigue_en_cola" | "error_tras_enviar";
export declare function destinoDelIntento(resultado: string, pasoElIrreversible: boolean): DestinoDelIntento;
/** Tantos documentos seguidos que fallan en la pantalla sin que salga ninguno = el problema es la pantalla o el bot. */
export declare const FALLOS_SEGUIDOS_PARA_CORTAR = 3;
/** Tantos intentos fallidos de UN documento, en corridas donde otros sí salieron = el problema es ese documento. */
export declare const INTENTOS_FALLIDOS_MAXIMOS = 3;
export declare function cortarPorFallosSeguidos(seguidos: number, huboExito: boolean): boolean;
/**
 * Cuántos intentos fallidos le quedan anotados a un documento al cerrar la corrida. Sólo cuentan si en
 * la misma corrida salió otro (la pantalla anda): si no salió ninguno, la falla no es del documento y
 * no se le carga. Con `INTENTOS_FALLIDOS_MAXIMOS` pasa a «error» para que alguien lo mire.
 */
export declare function intentosTrasLaCorrida(previos: number, huboExito: boolean): {
    intentos: number;
    pasaAError: boolean;
};
