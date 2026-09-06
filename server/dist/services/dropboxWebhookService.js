import crypto from "node:crypto";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig } from "./dropboxService.js";
import { escanearTenantAhora } from "./estadoDropboxCronService.js";
/**
 * ESCANEAR APENAS DROPBOX AVISA, en vez de esperar el próximo turno del reloj.
 *
 * El escaneo de carpetas vigiladas corre por polling, cada 5 a 1440 minutos según el tenant. Eso
 * significa que un contrato firmado y archivado puede quedar hasta un intervalo entero sin avanzar de
 * estado, sin que nada esté roto: simplemente todavía no le tocaba mirar.
 *
 * Este módulo agrega el disparador que faltaba. NO reemplaza al polling y no debería: Dropbox entrega
 * «al menos una vez» y no reintenta para siempre, así que una notificación perdida —el servidor
 * reiniciándose, un deploy— se recupera sola en el próximo tick del cron. Los dos juntos dan latencia
 * de segundos con la red abajo.
 *
 * LO QUE EL WEBHOOK NO DICE, Y CAMBIA TODO EL DISEÑO
 *
 * La notificación es `{"list_folder": {"accounts": ["dbid:..."]}}` y nada más. No dice qué carpeta,
 * ni qué archivo, ni si fue alta o baja. Es un TIMBRE, no un contenido. Por eso acá no se intenta
 * interpretar nada: se resuelve a qué tenant corresponde la cuenta y se corre el escaneo completo,
 * que es el mismo que ya sabe qué carpetas mirar y qué hacer con lo que encuentra.
 *
 * Y como es por CUENTA y no por carpeta, también llegan avisos por movimientos de `/HelloSign` que
 * hace Dropbox Sign por su cuenta. No molesta —el escaneo ya sabe qué mira— pero es la razón por la
 * que el debounce de abajo no es opcional.
 */
/**
 * Cuánto se espera antes de escanear, para que una tanda de archivos sea UN escaneo y no veinte.
 *
 * Subir veinte documentos dispara varias notificaciones en pocos segundos. Sin agrupar, cada una
 * largaría un escaneo, se pelearían el candado por tenant y el resultado sería peor que el polling:
 * mucho trabajo para llegar al mismo lugar. Ocho segundos alcanzan para juntar una subida normal y
 * siguen siendo imperceptibles contra los minutos que se ahorran.
 */
const DEBOUNCE_MS = 8_000;
const pendientes = new Map();
/**
 * La firma del webhook, verificada contra el CUERPO EXACTO que mandó Dropbox.
 *
 * `X-Dropbox-Signature` es un HMAC-SHA256 del body crudo con el app secret. Tiene que calcularse
 * sobre los bytes tal cual llegaron: si se firma `JSON.stringify(req.body)` el resultado no coincide
 * casi nunca —cambia un espacio, el orden de una clave— y el webhook queda rechazando todo.
 *
 * `timingSafeEqual` y no `===` porque comparar strings corta en el primer byte distinto, y ese tiempo
 * es medible: con suficientes intentos se puede adivinar una firma byte a byte. Es barato hacerlo bien.
 */
export function firmaValida(rawBody, firma, appSecret) {
    if (!rawBody || !firma || !appSecret)
        return false;
    const esperada = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const a = Buffer.from(esperada, "utf8");
    const b = Buffer.from(String(firma), "utf8");
    if (a.length !== b.length)
        return false;
    return crypto.timingSafeEqual(a, b);
}
/** Los tenants cuya cuenta de Dropbox es una de las que avisó el webhook. */
export async function tenantsDeCuentas(accountIds) {
    const ids = [...new Set(accountIds.filter(Boolean).map(String))];
    if (ids.length === 0)
        return [];
    const tenants = await Tenant.find({ "integrations.dropbox.accountId": { $in: ids } })
        .select("_id integrations.dropbox")
        .lean();
    return tenants
        .map((t) => {
        const cfg = getTenantDropboxConfig(t);
        return cfg ? { _id: t._id, appSecret: cfg.appSecret } : null;
    })
        .filter(Boolean);
}
/**
 * Encola un escaneo para este tenant, agrupando la ráfaga.
 *
 * Vuelve al instante: el escaneo corre por su cuenta. Dropbox espera una respuesta rápida y deja de
 * mandar notificaciones al que tarda, así que escanear DENTRO del request sería la forma de terminar
 * sin webhook — que es exactamente lo contrario de lo que se quiere.
 */
export function programarEscaneo(tenantId) {
    const yaHabia = pendientes.get(tenantId);
    if (yaHabia) {
        // No se reinicia el reloj: una subida larga postergaría el escaneo indefinidamente. Se anota que
        // hay que volver a mirar cuando éste termine.
        yaHabia.repetir = true;
        return;
    }
    const timer = setTimeout(() => {
        const entrada = pendientes.get(tenantId);
        pendientes.delete(tenantId);
        const repetir = !!entrada?.repetir;
        void escanearTenantAhora(tenantId)
            .catch((e) => console.error(`[Dropbox webhook] falló el escaneo del tenant ${tenantId}:`, e?.message || e))
            .finally(() => {
            // Lo que llegó mientras escaneábamos merece su propia pasada: puede haber entrado un archivo
            // justo después de que el escaneo leyera esa carpeta.
            if (repetir)
                programarEscaneo(tenantId);
        });
    }, DEBOUNCE_MS);
    // `unref` para que un escaneo encolado no le impida al proceso terminar cuando se lo baja.
    timer.unref?.();
    pendientes.set(tenantId, { timer, repetir: false });
}
/** Solo para los tests y para poder apagar limpio: cancela lo encolado. */
export function limpiarPendientes() {
    for (const p of pendientes.values())
        clearTimeout(p.timer);
    pendientes.clear();
}
