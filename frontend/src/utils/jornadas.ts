/**
 * El cálculo de jornadas e importes vive en el server (`server/src/compartido/jornadas.ts`) y se
 * comparte con el alta masiva de plantillas de equipo: una sola copia, para que la solicitud individual
 * y la masiva calculen exactamente lo mismo. Este archivo sólo lo re-exporta con el camino de siempre.
 */
export * from "@compartido/jornadas";
