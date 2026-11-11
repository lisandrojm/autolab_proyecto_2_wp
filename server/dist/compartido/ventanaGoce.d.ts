/**
 * LA VENTANA ANUAL DE GOCE DE VACACIONES (10/11/2026): el tramo del año en el que se pueden tomar,
 * p. ej. del 1/11 al 30/4. Se repite todas las temporadas, así que se guarda SIN año, como "MM-DD".
 *
 * Reglas puras, compartidas por el server (que es el que frena) y las pantallas (que avisan antes):
 *  · Si `inicio` es mayor que `fin` como "MM-DD", la ventana ENVUELVE el 1/1: "11-01" → "04-30" incluye
 *    diciembre y enero.
 *  · Un rango es válido si TODOS sus días caen adentro (no alcanza con que empiece adentro: del 28/4
 *    al 5/5 no entra en una ventana que termina el 30/4).
 *  · Todo en strings "YYYY-MM-DD": un `Date` de por medio corre el día según la zona horaria.
 *
 * La configuración es global por tenant, con la misma excepción por Proyecto o Área que el
 * fraccionamiento y los días corridos (`vacationConfig.useGlobalConfig === false`). La que rige para
 * una persona la resuelve `ventanaEfectiva`.
 */
/** Un tramo del año, con las dos puntas incluidas. */
export interface TramoDeVentana {
    /** "MM-DD" */
    inicio: string;
    /** "MM-DD" */
    fin: string;
}
/** La ventana como se configura (global, o la propia de un proyecto o un área). */
export interface VentanaGoce extends TramoDeVentana {
    enabled: boolean;
}
/**
 * La ventana que RIGE para una persona o un proyecto, ya resuelta. Casi siempre es un solo tramo; son
 * varios sólo cuando la persona está en proyectos con ventanas que no se tocan entre sí (ver `unirVentanas`).
 */
export interface VentanaEfectiva {
    enabled: boolean;
    tramos: TramoDeVentana[];
}
/** Apagada por defecto: quien no la configuró sigue pidiendo vacaciones en cualquier fecha, como siempre. */
export declare const VENTANA_POR_DEFECTO: VentanaGoce;
export declare const SIN_VENTANA: VentanaEfectiva;
/** ¿Es un "MM-DD" que existe? (mes 1–12 y un día que ese mes tiene) */
export declare function esMesDia(v: unknown): v is string;
/** Cuántos días tiene el mes (1–12) para elegir en un selector sin año. */
export declare const diasDelMesSinAnio: (mes: number) => number;
/** ¿La fecha "YYYY-MM-DD" cae dentro de la ventana `inicio`–`fin` ("MM-DD")? */
export declare function dentroDeVentana(fecha: string, inicio: string, fin: string): boolean;
/** ¿TODOS los días del rango caen dentro de la ventana? `false` si el rango está dado vuelta o no es válido. */
export declare function rangoDentroDeVentana(desde: string, hasta: string, inicio: string, fin: string): boolean;
/** ¿Se puede tomar ese día? Sin ventana (apagada), cualquiera. */
export declare function fechaPermitida(fecha: string, ventana: VentanaEfectiva | null | undefined): boolean;
/** ¿Se puede tomar el rango entero? Sin ventana (apagada), cualquiera. */
export declare function rangoPermitido(desde: string, hasta: string, ventana: VentanaEfectiva | null | undefined): boolean;
/** Lee una ventana guardada tolerando lo que falte o venga mal: cada dato inválido cae al de `base`. */
export declare function normalizarVentana(v: unknown, base?: VentanaGoce): VentanaGoce;
/** El `vacationConfig` embebido de un Proyecto o un Área, en lo que toca a la ventana. */
export interface ConfigDeEntidad {
    useGlobalConfig?: boolean;
    ventanaGoceEnabled?: boolean | null;
    ventanaGoceInicio?: string | null;
    ventanaGoceFin?: string | null;
}
/**
 * La ventana de un proyecto o un área. Usa la global salvo que la entidad tenga configuración propia
 * (`useGlobalConfig === false`); y aun así, lo que la entidad no definió sale de la global: los
 * proyectos que ya tenían configuración propia por el fraccionamiento no cambian de ventana solos.
 */
export declare function ventanaDeEntidad(config: ConfigDeEntidad | null | undefined, global: VentanaGoce): VentanaGoce;
/**
 * LA MÁS FLEXIBLE ENTRE VARIAS (la regla de siempre para quien está en más de un proyecto): si ALGUNA
 * está apagada, no hay ventana; si todas la tienen, vale la UNIÓN. Con ventanas que se tocan, la unión
 * es un solo tramo —el inicio más temprano y el fin más tardío—; con ventanas separadas (una de verano
 * y otra de invierno) quedan los dos tramos, en vez de un tramo grande que habilitaría los meses del
 * medio que ningún proyecto permite.
 */
export declare function unirVentanas(ventanas: VentanaGoce[]): VentanaEfectiva;
/**
 * LA VENTANA QUE RIGE PARA UNA PERSONA. Misma jerarquía que el resto de las reglas de vacaciones:
 * el Área con configuración propia manda; si no, sus Proyectos (la más flexible entre todos, cada uno
 * con la suya o la global); sin proyectos, la global.
 */
export declare function ventanaEfectiva(o: {
    global: VentanaGoce;
    area?: ConfigDeEntidad | null;
    proyectos?: Array<ConfigDeEntidad | null | undefined>;
}): VentanaEfectiva;
/** "MM-DD" → «1/11» (sin ceros, como se dice). */
export declare const mesDiaCorto: (mesDia: string) => string;
/** «1/11 – 30/4», para el chip «Efectivo:». «Sin ventana» si está apagada. */
export declare function resumenDeVentana(ventana: VentanaEfectiva | null | undefined): string;
/** «entre el 1/11 y el 30/4», para armar las frases. Vacío si está apagada. */
export declare function textoDeVentana(ventana: VentanaEfectiva | null | undefined): string;
/** Qué tiene de malo una ventana que se quiere guardar; `null` si está bien. */
export declare function errorDeVentana(v: unknown): string | null;
/** La ventana («MM-DD») que dice la temporada de un plan. */
export declare const ventanaDeTemporada: (desde: string, hasta: string) => TramoDeVentana;
/**
 * La temporada de un plan con la ventana nueva, en el MISMO año en que empieza la de ahora. Si la
 * ventana envuelve el 1/1 (1/11 → 30/4), el fin cae en el año siguiente.
 */
export declare function temporadaConVentana(desdeActual: string, tramo: TramoDeVentana): {
    desde: string;
    hasta: string;
};
