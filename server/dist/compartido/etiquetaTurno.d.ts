/**
 * La etiqueta de un turno: "Mañana", "Tarde", "Noche".
 *
 * El nombre guardado es "Mañana 6 a 12 - Lun a Dom": trae los días y el rango horario pegados. Los
 * días se dicen una vez por área, y el horario va debajo en su formato real ("06:00 a 12:00"), así
 * que dejarlo también en el título lo decía dos veces con distinta forma.
 *
 * El rango se saca sólo si de verdad lo parece —dos números con "a" o un guion en el medio— y nunca
 * si al recortarlo no queda nada: un turno llamado "6 a 12" a secas se sigue llamando así.
 *
 * Vive en `compartido` (26/11/2026) porque el server también lo necesita: el pedido de cambio de turno
 * guarda los nombres de los turnos para el detalle y el PDF. Puro, sin imports.
 */
export declare const etiquetaDeTurno: (nombre: string) => string;
