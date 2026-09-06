import { Router } from "express";
import { firmaValida, tenantsDeCuentas, programarEscaneo } from "../services/dropboxWebhookService.js";
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
export const dropboxWebhookRoutes = Router();
/**
 * GET — la verificación de la URL, que Dropbox hace una sola vez al darla de alta.
 *
 * Manda `?challenge=...` y espera ese mismo texto de vuelta, tal cual. Las dos cabeceras no son
 * decorativas y las pide la documentación: sin `X-Content-Type-Options` un navegador podría
 * interpretar la respuesta como HTML, y este endpoint devuelve texto que vino de afuera.
 */
dropboxWebhookRoutes.get("/webhook", (req, res) => {
    const challenge = String(req.query?.challenge || "");
    res.set("Content-Type", "text/plain");
    res.set("X-Content-Type-Options", "nosniff");
    res.send(challenge);
});
/**
 * POST — «algo cambió para estas cuentas».
 *
 * SE CONTESTA 200 ANTES DE ESCANEAR, siempre. Dropbox espera una respuesta rápida y va espaciando —y
 * después cortando— las notificaciones al endpoint que tarda. Un escaneo son segundos o minutos: si
 * se hiciera adentro del request, el webhook se iría degradando solo hasta dejar de servir.
 *
 * Un cuerpo sin firma válida se contesta 403 y no se toca nada. No se dice por qué: quien manda una
 * firma inválida no es Dropbox, y no hay ningún motivo para ayudarlo a acertar.
 */
dropboxWebhookRoutes.post("/webhook", async (req, res) => {
    const raw = req.rawBody;
    const firma = String(req.header("X-Dropbox-Signature") || "");
    const cuentas = Array.isArray(req.body?.list_folder?.accounts) ? req.body.list_folder.accounts : [];
    if (!raw || cuentas.length === 0) {
        // Nada que hacer, pero 200: un 4xx acá le enseña a Dropbox que este endpoint falla.
        res.status(200).end();
        return;
    }
    try {
        /*
          LA FIRMA SE VERIFICA CON EL SECRET DEL TENANT AL QUE PERTENECE LA CUENTA.
    
          Cada tenant conecta su propia app de Dropbox, así que no hay un secret único de la aplicación
          contra el cual validar. Se resuelve primero de quién es la cuenta y recién ahí se comprueba la
          firma con SU secret — que es también lo que impide que el `account_id` de un tenant sirva para
          disparar el escaneo de otro.
        */
        const tenants = await tenantsDeCuentas(cuentas);
        if (tenants.length === 0) {
            // Cuenta desconocida: puede ser un tenant que todavía no tiene guardado su `accountId`, o una
            // app apuntando a un servidor que no es el suyo. En los dos casos, no hay nada que escanear.
            res.status(200).end();
            return;
        }
        const autorizados = tenants.filter((t) => firmaValida(raw, firma, t.appSecret));
        if (autorizados.length === 0) {
            res.status(403).end();
            return;
        }
        res.status(200).end();
        for (const t of autorizados)
            programarEscaneo(String(t._id));
    }
    catch (e) {
        console.error("[Dropbox webhook] error resolviendo la notificación:", e?.message || e);
        // 200 igual: el error es nuestro y reintentar no lo va a arreglar. El polling cubre lo perdido.
        if (!res.headersSent)
            res.status(200).end();
    }
});
