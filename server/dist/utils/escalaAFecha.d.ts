/**
 * QUÉ PERÍODO DE VIGENCIA RIGE A UNA FECHA, Y CÓMO SE ENCADENAN DOS PERÍODOS.
 *
 * Toda la feature de escalas versionadas se apoya en esto: la escala por grupo, los adicionales y el
 * capítulo de pequeñas empresas tienen los mismos dos campos (`desde`, `hasta`) y la misma pregunta
 * ("¿cuánto se pagaba el 15 de mayo?").
 *
 * OJO — ACÁ `hasta` ES INCLUSIVO, al revés que en las valoraciones.
 *
 * En `valoracionAutomatica` los tramos son semiabiertos `[desde, hasta)` porque parten un continuo
 * de porcentajes y hay que decidir de qué lado cae el borde. Un período de paritaria no: el acta
 * dice "del 1 de abril al 31 de mayo", y el 31 de mayo se cobra la escala de abril. Escribirlo
 * semiabierto obligaría a guardar el 1 de junio como fin de un período que no rige ese día, que es
 * justo el tipo de dato que después nadie entiende.
 *
 * `hasta: null` = vigente, sin vencimiento declarado. No es lo mismo que vencido.
 */
/** Cualquier cosa que tenga vigencia. Se tipa laxo porque llega de Mongo (`Date`) y del body (string). */
export interface ConVigencia {
    desde?: Date | string | null;
    hasta?: Date | string | null;
}
/** "2026-06-01" a partir de lo que haya. "" si no se puede leer. Mismo criterio que `auditoriaEscalas`. */
export declare const aIsoFecha: (v: unknown) => string;
/** El día anterior, en ISO. Es como se cierra el período viejo cuando entra uno nuevo. */
export declare const diaAnterior: (iso: string) => string;
/** `true` si la fecha cae dentro del período (bordes incluidos). Sin `desde` legible, no rige nunca. */
export declare function rigeEn(periodo: ConVigencia, fecha: string): boolean;
/**
 * El período que rige a esa fecha, o `null`.
 *
 * `fecha` se recibe y no se toma del reloj, igual que en `escalasVencidas`: un cálculo de sueldo que
 * cambia según cuándo se lo corre no se puede testear ni explicar.
 *
 * Si hay más de uno (vigencias mal cargadas que se superponen), gana **el de `desde` más reciente**:
 * ante datos contradictorios, el acta más nueva es la que manda. La superposición en sí se detecta
 * aparte con `periodosSuperpuestos` y se avisa en pantalla — no se resuelve en silencio.
 */
export declare function periodoVigente<T extends ConVigencia>(periodos: T[], fecha: string): T | null;
/** Todos los períodos ordenados por `desde` descendente: así se muestra un historial. */
export declare function ordenarPorVigencia<T extends ConVigencia>(periodos: T[]): T[];
export interface Superposicion {
    a: ConVigencia;
    b: ConVigencia;
    /** Primer día compartido, para poder decirlo en el mensaje. */
    desde: string;
}
/**
 * Pares de períodos que comparten al menos un día.
 *
 * Es la validación del ABM: dos escalas vigentes el mismo día significan que una liquidación puede
 * dar dos resultados distintos. Devuelve los pares en vez de un booleano para poder nombrarlos en el
 * error ("el período que arranca el 01/06/2026 pisa al que arranca el 01/04/2026").
 */
export declare function periodosSuperpuestos(periodos: ConVigencia[]): Superposicion[];
/**
 * Un período que termina antes de empezar.
 *
 * Existe porque está pasando en producción: los 12 grupos de 0634/11 tienen `fechaActualizacion`
 * 15/09/2026 y `vigenciaHasta` 30/06/2026 —la plantilla de junio con los importes de septiembre— y
 * por eso el banner los muestra como "escala vencida" sin estarlo.
 */
export declare function vigenciaIncoherente(periodo: ConVigencia): boolean;
