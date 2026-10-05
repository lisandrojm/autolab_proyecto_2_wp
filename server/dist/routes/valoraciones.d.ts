/**
 * ABM de valoraciones comerciales (Plata, Oro…).
 *
 * Es un catálogo simple con dos reglas propias que el factory no puede conocer —los rangos no se
 * pueden pisar y la default tiene que ser una sola—, así que van en middlewares montados ANTES de
 * delegar. Se resuelve así y no con un CRUD a mano para no duplicar listado, alta, edición, borrado
 * y el manejo de campos extra, que es exactamente lo que el factory ya sabe hacer.
 */
declare const router: import("express-serve-static-core").Router;
export { router as valoracionRoutes };
