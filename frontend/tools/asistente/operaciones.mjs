/**
 * Lo que este Asistente sabe hacer, dicho por él mismo.
 *
 * POR QUÉ EXISTE
 *
 * WeProdu se actualiza solo —es una web— y el Asistente no: vive instalado en la máquina de cada
 * persona y se queda en la versión del día que lo bajaron. Así que la app siempre puede ser más
 * nueva que el Asistente que tiene enfrente, y tiene que poder saberlo ANTES de ofrecer un botón.
 *
 * Sin esto, agregar `/chrome/focus` hizo que la app le ofreciera «Ir a esa ventana» a Asistentes que
 * no la tenían: el botón contestaba 404 y salía un cartel rojo diciendo «No existe esa operación» —
 * un mensaje sobre el protocolo HTTP a alguien que solo quería ver su ventana de ARCA.
 *
 * SE DECLARA LA LISTA Y NO LA VERSIÓN porque el número no alcanzaba: los dos binarios decían 1.0.0,
 * así que ni la app ni la persona podían distinguirlos. Y porque una lista dice QUÉ falta, no solo
 * que algo falta. Que un Asistente viejo no mande este campo es en sí mismo la respuesta:
 * `undefined` significa «anterior a que esto existiera».
 *
 * POR QUÉ EN SU PROPIO ARCHIVO
 *
 * Para poder importarlo sin arrancar nada. En `servidor.mjs` el test que lo compara contra las rutas
 * reales levantaba el servicio al importarlo y se moría con «puerto ocupado»: ahí el `listen` corre
 * como efecto del import. Un dato que existe para ser verificado tiene que poder leerse sin
 * consecuencias.
 */
export const OPERACIONES = ["/estado", "/progreso", "/chrome", "/chrome/focus", "/chrome/ruta", "/validar", "/registrar-obras-sociales", "/detener"];
