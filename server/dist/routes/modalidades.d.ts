/**
 * ABM de modalidades de trabajo (Presencial, Remoto, Híbrido). Catálogo simple del tenant con las
 * mismas dos reglas propias que Valoraciones: la por defecto es una sola, y lo que está en uso no se
 * borra (se apaga).
 */
declare const router: import("express-serve-static-core").Router;
export { router as modalidadRoutes };
