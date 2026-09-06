/**
 * El webhook de Dropbox. VA SIN AUTENTICACIÓN, y por eso está en su propio router.
 *
 * Quien llama es Dropbox, no un usuario: no hay JWT ni tenant en la cabecera. El resto de
 * `/dropbox/*` sí está detrás de `requireTenant, authenticateToken`, así que meter esto ahí adentro
 * lo dejaría rechazando todas las notificaciones con un 401 — y del otro lado eso se ve como que el
 * webhook «no funciona», sin ninguna pista de por qué.
 *
 * Lo que reemplaza a la autenticación es la FIRMA: cada POST viene con un HMAC-SHA256 del cuerpo
 * hecho con el app secret, que solo conocen Dropbox y nosotros. Sin firma válida no se hace nada.
 *
 * CÓMO SE DA DE ALTA (no lo hace la app, se configura una vez en Dropbox):
 *
 *   App Console → la app → Settings → Webhooks → agregar
 *   https://<el-dominio-del-servidor>/api/v1/dropbox/webhook
 *
 * Dropbox valida la URL con el GET de abajo antes de aceptarla. Tiene que ser HTTPS y pública: contra
 * `localhost` no llega nada, y para probar en desarrollo hace falta un túnel.
 */
export declare const dropboxWebhookRoutes: import("express-serve-static-core").Router;
