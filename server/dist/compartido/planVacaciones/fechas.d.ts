/**
 * FECHAS DEL PLAN DE VACACIONES, puras y en "YYYY-MM-DD" (sin Date de por medio para no depender de la
 * zona horaria del servidor ni del navegador: un bloque «del 1 al 15» es del 1 al 15 en cualquier reloj).
 * Las comparten el server (el plan) y el front (la previsualización del reparto).
 */
export declare const esISO: (v: unknown) => v is string;
/** "YYYY-MM-DD" ± n días. */
export declare function sumarDias(iso: string, n: number): string;
/** Días corridos entre dos fechas, ambas incluidas. 0 si `hasta` es anterior a `desde`. */
export declare function diasEntre(desde: string, hasta: string): number;
/** ¿Dos rangos comparten al menos un día? */
export declare const sePisan: (a: {
    desde: string;
    hasta: string;
}, b: {
    desde: string;
    hasta: string;
}) => boolean;
/** "YYYY-MM" de una fecha. */
export declare const mesDe: (iso: string) => string;
/** Cuántos días tiene el mes "YYYY-MM". */
export declare function diasDelMes(mes: string): number;
/** Primer y último día del mes "YYYY-MM". */
export declare const rangoDelMes: (mes: string) => {
    desde: string;
    hasta: string;
};
/** Los meses "YYYY-MM" que toca una ventana, en orden. Vacío si la ventana está dada vuelta. */
export declare function mesesDeVentana(desde: string, hasta: string): string[];
/** El mes recortado a la ventana (un plan que empieza el 15/12 reparte diciembre del 15 al 31). `null` si no se tocan. */
export declare function rangoDelMesEnVentana(mes: string, ventanaDesde: string, ventanaHasta: string): {
    desde: string;
    hasta: string;
    dias: number;
} | null;
/** "DD/MM/YYYY" para mostrar. */
export declare const fechaCorta: (iso: string) => string;
/** «diciembre 2026» para un "YYYY-MM". */
export declare const nombreDeMes: (mes: string) => string;
