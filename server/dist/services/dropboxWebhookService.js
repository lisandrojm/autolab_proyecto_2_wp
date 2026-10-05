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
/**
 * ESPERANDO Y ESCANEANDO SON DOS ESTADOS DISTINTOS, y confundirlos rompe el agrupamiento.
 *
 * Un aviso que llega mientras se ESPERA ya está cubierto: el escaneo que está por salir todavía no
 * leyó ninguna carpeta, así que va a ver ese archivo. No hay nada que anotar.
 *
 * Un aviso que llega mientras se ESCANEA no está cubierto: el archivo pudo entrar justo después de
 * que el escaneo leyera esa carpeta, y esa pasada no lo va a ver nunca. Ese sí obliga a otra.
 *
 * Estaban en una sola estructura, y ahí los dos casos marcaban «repetir»: dos avisos dentro de la
 * misma ventana terminaban en DOS escaneos, que es exactamente lo que el debounce venía a evitar.
 */
const esperando = new Map();
const escaneando = new Map();
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
/**
 * CUÁLES DE ESTOS TENANTS FIRMÓ REALMENTE ESTE AVISO.
 *
 * Está aparte y es pura porque es la regla de seguridad del endpoint, y es la que hay que poder
 * probar sin base de datos: que un `account_id` compartido entre dos organizaciones NO deje que la
 * firma de una dispare el escaneo de la otra.
 *
 * Se prueban TODOS, no se corta en el primero que valida: la misma cuenta puede estar conectada en
 * dos organizaciones con la misma app, y ahí las dos tienen derecho a escanear.
 */
export function autorizadosDe(tenants, rawBody, firma) {
    return tenants.filter((t) => firmaValida(rawBody, firma, t.appSecret));
}
/**
 * Los tenants cuya cuenta de Dropbox es alguna de las que avisó el webhook.
 *
 * DEVUELVE TODOS, no el primero. Dos cosas obligan a eso:
 *
 *   - `list_folder.accounts` es un ARRAY: un aviso puede traer varias cuentas;
 *   - la misma cuenta de Dropbox puede estar conectada en dos organizaciones.
 *
 * En los dos casos, quedarse con el primero deja a alguien sin escanear y sin ningún síntoma: los
 * archivos llegan a Dropbox y sus contratos simplemente no avanzan hasta que pase el reloj.
 *
 * Y de yapa cuenta los que están conectados pero todavía sin `accountId`. Ese estado es transitorio
 * —lo completa el primer escaneo— pero mientras dura, sus avisos son indistinguibles de una cuenta
 * ajena. Contarlos es lo que permite saber, mirando un log, si falta configurar algo o si alguien
 * está golpeando el endpoint.
 */
export async function tenantsDeCuentas(accountIds) {
    const ids = [...new Set(accountIds.filter(Boolean).map(String))];
    if (ids.length === 0)
        return { tenants: [], cuentasSinTenant: [], tenantsSinAccountId: 0 };
    const encontrados = await Tenant.find({ "integrations.dropbox.accountId": { $in: ids } })
        .select("_id integrations.dropbox")
        .lean();
    const tenants = encontrados
        .map((t) => {
        const cfg = getTenantDropboxConfig(t);
        return cfg ? { _id: t._id, accountId: String(t?.integrations?.dropbox?.accountId || ""), appSecret: cfg.appSecret } : null;
    })
        .filter(Boolean);
    const conTenant = new Set(tenants.map((t) => t.accountId));
    const cuentasSinTenant = ids.filter((id) => !conTenant.has(id));
    // Solo se cuenta si hay alguna cuenta sin dueño: si todas se resolvieron, no hay nada que explicar.
    const tenantsSinAccountId = cuentasSinTenant.length === 0
        ? 0
        : await Tenant.countDocuments({
            "integrations.dropbox.refreshTokenEnc": { $exists: true },
            $or: [{ "integrations.dropbox.accountId": { $exists: false } }, { "integrations.dropbox.accountId": null }, { "integrations.dropbox.accountId": "" }],
        });
    return { tenants, cuentasSinTenant, tenantsSinAccountId };
}
/**
 * Encola un escaneo para este tenant, agrupando la ráfaga.
 *
 * Vuelve al instante: el escaneo corre por su cuenta. Dropbox espera una respuesta rápida y deja de
 * mandar notificaciones al que tarda, así que escanear DENTRO del request sería la forma de terminar
 * sin webhook — que es exactamente lo contrario de lo que se quiere.
 */
export function programarEscaneo(tenantId, opts) {
    const correr = opts?.correr || ((id) => escanearTenantAhora(id));
    const esperaMs = opts?.esperaMs ?? DEBOUNCE_MS;
    // ESCANEANDO: este aviso puede ser de algo que la pasada en curso ya no va a ver. Se anota otra.
    const enCurso = escaneando.get(tenantId);
    if (enCurso) {
        enCurso.repetir = true;
        return;
    }
    /*
      ESPERANDO: no se hace nada, y NO se reinicia el reloj.
  
      Ya hay un escaneo por salir y todavía no leyó ninguna carpeta, así que va a ver este archivo
      también: anotar algo sería pedir una segunda pasada para lo que la primera ya cubre.
  
      Y el plazo no se mueve. La forma habitual del debounce —cada evento reinicia la espera— acá sería
      un bug: mientras siga entrando un archivo cada pocos segundos, la ventana se corre sola y el
      escaneo no ocurre nunca, justo en la subida grande donde más se lo necesita. Se cuenta desde el
      PRIMER aviso.
    */
    if (esperando.has(tenantId))
        return;
    const timer = setTimeout(() => {
        esperando.delete(tenantId);
        const estado = { repetir: false };
        escaneando.set(tenantId, estado);
        void Promise.resolve()
            .then(() => correr(tenantId))
            .catch((e) => console.error(`[Dropbox webhook] falló el escaneo del tenant ${tenantId}:`, e?.message || e))
            .finally(() => {
            escaneando.delete(tenantId);
            if (estado.repetir)
                programarEscaneo(tenantId, opts);
        });
    }, esperaMs);
    // `unref` para que un escaneo encolado no le impida al proceso terminar cuando se lo baja.
    timer.unref?.();
    esperando.set(tenantId, timer);
}
/** Solo para los tests y para poder apagar limpio: cancela lo encolado. */
export function limpiarPendientes() {
    for (const t of esperando.values())
        clearTimeout(t);
    esperando.clear();
    escaneando.clear();
}
