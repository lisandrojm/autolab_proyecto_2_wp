/**
 * LA COLA DE ENVÍO A LA FIRMA, COMO SE LA EXPLICA A LA PERSONA (25/10/2026). Lógica pura: sin base ni
 * Dropbox, para poder probarla.
 *
 *  · `categoriaDeTrabado`: un documento frenado («requiere revisión») por UNA razón, y cada razón con su
 *    salida. Antes era una lista plana con el motivo repetido y sólo «Previsualizar» al lado.
 *  · `estadoDelPanel`: en qué estado está el envío y qué va a pasar, en castellano. Antes el único
 *    mensaje era «Todavía no pasaron 4 h desde la última corrida», que no decía cuándo ni qué hacer.
 */
export type TipoTrabado = "sin_regla" | "ancla" | "pagina_intermedia" | "sin_firmante" | "pdf_cambiado" | "fuera_outbox" | "sin_codigo" | "otro";
export interface AccionTrabado {
    texto: string;
    /** Adónde lleva: una ruta de la app, o «previsualizar» (la previsualización del bot sobre ese archivo). */
    destino: string;
}
export interface CategoriaTrabado {
    tipo: TipoTrabado;
    /** En una línea, qué pasó. */
    titulo: string;
    /** Qué hacer. */
    accion: AccionTrabado;
}
/** De qué tipo es un motivo de «requiere revisión» (los textos los arman el bot y las reglas). */
export declare function categoriaDeTrabado(motivo: string): CategoriaTrabado;
/** Los trabados agrupados por motivo, de más a menos. */
export declare function agruparTrabados<T extends {
    detalle: string;
}>(items: T[]): Array<CategoriaTrabado & {
    cantidad: number;
    items: T[];
}>;
export type TipoEstadoPanel = "enviando" | "enfriamiento" | "sin_sesion" | "tope" | "fuera_de_horario" | "nada" | "lista" | "manual";
export interface EntradaPanel {
    corriendo: boolean;
    /** Sólo durante la corrida. */
    progreso?: {
        hechos: number;
        total: number;
        actual: string | null;
    };
    tieneSesion: boolean;
    conexionCaida: boolean;
    enfriadoHasta: Date | null;
    /** Lo que queda en la ventana de 24 h. */
    cupo: number;
    /** Cuándo se libera el próximo lugar de la ventana, si el cupo está en 0. */
    liberaAt: Date | null;
    enCola: number;
    trabados: number;
    envioAutomatico: boolean;
    horaDesde: number;
    horaHasta: number;
    horaActual: number;
    proximaTandaAt: Date | null;
}
/** En qué estado está el envío, con la razón y qué va a pasar. El primero que aplica manda. */
export declare function estadoDelPanel(e: EntradaPanel, ahora?: Date): {
    tipo: TipoEstadoPanel;
    texto: string;
};
/**
 * El cupo de la ventana MÓVIL de 24 h. Dropbox Sign no corta por día calendario: libera de a poco a
 * medida que se cumplen 24 h de cada envío (medido: tras 124 envíos en una jornada, al día siguiente
 * liberó 11 a la 01:00 y 22 más a las 06:00). `enviados` son los instantes de los envíos de las últimas
 * 24 h. Devuelve cuánto queda y cuándo se libera el próximo lugar si no queda nada.
 */
export declare function cupoVentana24h(tope: number, enviados: Date[], ahora?: Date): {
    usados: number;
    cupo: number;
    liberaAt: Date | null;
};
/**
 * EL ORDEN AUTOMÁTICO DE LA COLA: DE MÁS RECIENTE A MENOS RECIENTE (pedido del 26/10/2026). Manda la
 * fecha del archivo en el Outbox (la columna «Fecha» de Para Firmar). Lo que ya no está en el Outbox
 * no tiene fecha y va al final, por encolado más nuevo. A igual fecha, el código más alto primero.
 */
export declare function ordenPorRecientes<T extends {
    archivo: string;
    codigo: string;
    encoladoAt?: Date | string | null;
}>(items: T[], fechas: Map<string, Date | string>): T[];
