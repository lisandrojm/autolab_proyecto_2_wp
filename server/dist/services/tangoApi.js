import axios from "axios";
/*
  EL CLIENTE DE TANGO, A TRAVÉS DEL TANGO-CONNECTOR (desde el 25/11/2026).

  WeProdu ya no le habla a Tango directo. Le habla al **tango-connector** (`/tango-connector` en la
  raíz del repo: README.md y docs/decisiones/), que es la capa única de acceso a Tango Gestión de
  Lumba y corre en el mismo VPS donde termina el túnel FRP de cada Tango. Antes el server le pegaba
  al puerto del túnel (`http://72.60.9.42:8003/Api`) con el token de Tango en la mano; ese camino
  dejó de funcionar y, además, dependía de un puerto que el connector tiene previsto cerrar al
  exterior (`docs/relevamiento/2026-10-08-vps.md`, etapa 0).

  EL PROTOCOLO ES EL DEL SDK DEL CONNECTOR (`tango-connector/sdk/src/cliente.ts`), que es idéntico
  al de Tango salvo la URL y la autenticación (ADR 0002):

    GET {TANGO_CONNECTOR_URL}/tango/{tenant}/{empresa}/GetById?process={proceso}&id={id}
    X-Api-Key: <key de la plataforma WeProdu>

  - `{tenant}` es el servidor Tango registrado en el connector (`servertango`, el de Frame Zero).
  - `{empresa}` es el slug o el **Company ID de Tango**: se manda el `Company.tangoId` que ya se
    guardaba, así que la ficha de cada empresa no cambia.
  - La respuesta es la de Tango, byte por byte: el mismo sobre `{ value, message, exceptionInfo,
    succeeded }` de siempre. Lo que la interpreta (`leerRegistroAuxiliares`) no se enteró del cambio.
  - El header `X-Connector-Origin` dice quién contestó: `tango` (la respuesta es de Tango, errores
    incluidos) o `connector` (lo rechazó el connector: key, permisos, validación, túnel caído). Es lo
    que permite explicar una falla en palabras de quien tiene que ir a arreglarla (`explicarFalla`).

  LO QUE HACE FALTA DEL LADO DEL CONNECTOR, y que se administra en el VPS de Lumba, no acá:
  - una API key para WeProdu con las empresas de la plataforma y el permiso `1656:GetById`. Los
    permisos de la key se escriben con el SLUG con que cada empresa está registrada, aunque la URL
    lleve el Company ID (`node dist/cli key:crear weprodu --empresas servertango/fzero-srl,
    servertango/2030-srl-gestion,servertango/grini-srl --procesos "1656:GetById"`);
  - que cada empresa que se sincroniza esté REGISTRADA en el connector (`empresa:crear`). Una que no
    lo esté contesta 404 «Empresa no registrada» (o 403 si la key tampoco la tiene) y la
    sincronización lo dice tal cual. Al 25/11/2026 FZERO CORP (Company 9) no está registrada.

  NO SE USA EL SDK como paquete: se distribuye como tarball, no tiene `.js` en los imports (el
  server compila con NodeNext) y sumarlo obligaba a un `npm install` en el VPS. Para una sola
  consulta, el protocolo de arriba con axios alcanza; `transporte` queda inyectable para los tests.

  ─────────────────────────────────────────────────────────────────────────────
    TANGO_CONNECTOR_URL       la base del connector, con /v1
                              (https://www.somoslumba.site/production/tango-connector/v1)
    TANGO_CONNECTOR_API_KEY   la key de WeProdu (se muestra una sola vez al crearla)
    TANGO_CONNECTOR_TENANT    el servidor Tango en el connector; `servertango` si no se dice
    TANGO_API_TIMEOUT         ms por consulta; 30000 si no se dice (el connector corta a los 120 s)
  ─────────────────────────────────────────────────────────────────────────────
*/
export const TENANT_POR_DEFECTO = "servertango";
const TIMEOUT_POR_DEFECTO = 30000;
/** Un reintento ante una falla del túnel o de la red, como hace el SDK; no más, para no duplicar esperas. */
const REINTENTOS = 1;
const ESPERA_REINTENTO_MS = 1000;
const sinBarra = (s) => s.replace(/\/+$/, "");
/** La configuración del entorno, o `null` si falta la URL o la key: sin las dos no hay a quién preguntarle. */
export function configDelEntorno(env = process.env) {
    const url = sinBarra(String(env.TANGO_CONNECTOR_URL || "").trim());
    const apiKey = String(env.TANGO_CONNECTOR_API_KEY || "").trim();
    if (!url || !apiKey)
        return null;
    const timeout = Number(env.TANGO_API_TIMEOUT);
    return {
        url,
        apiKey,
        tenant: String(env.TANGO_CONNECTOR_TENANT || "").trim() || TENANT_POR_DEFECTO,
        timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : TIMEOUT_POR_DEFECTO,
    };
}
/**
 * Una consulta que no trajo el sobre de Tango. Guarda lo que hace falta para explicarla: quién
 * contestó, con qué estado HTTP y con qué detalle (`exceptionInfo.messages`, que es donde el
 * connector y Tango ponen el motivo real; el `message` suele ser genérico).
 */
export class ErrorConnector extends Error {
    origen;
    status;
    mensajes;
    destino;
    reintentable;
    constructor(origen, status, mensajes, 
    /** `tenant/empresa` al que se le preguntó. Nunca la key. */
    destino, reintentable) {
        super(mensajes.length ? mensajes.join(" | ") : `Error de ${origen} (HTTP ${status})`);
        this.origen = origen;
        this.status = status;
        this.mensajes = mensajes;
        this.destino = destino;
        this.reintentable = reintentable;
        this.name = "ErrorConnector";
    }
}
const transporteAxios = async (url, headers, timeoutMs) => {
    // `validateStatus: () => true`: un 403 del connector trae el motivo en el body y hay que leerlo, no tirarlo.
    const r = await axios.get(url, { headers, timeout: timeoutMs, validateStatus: () => true });
    const origen = r.headers?.["x-connector-origin"];
    return { status: r.status, origen: origen ? String(origen) : null, cuerpo: r.data };
};
/** Los mensajes de un body de error, del más específico al más general, sin repetir (como `mensajesDe` del SDK). */
export function mensajesDe(cuerpo) {
    if (!cuerpo || typeof cuerpo !== "object")
        return [];
    const r = cuerpo;
    const lista = (v) => (Array.isArray(v) ? v.filter((m) => typeof m === "string" && m !== "") : []);
    const detalle = [...lista(r.exceptionInfo?.detailMessages), ...lista(r.exceptionInfo?.messages)];
    const todos = detalle.length ? detalle : [r.message, r.title, r.detail].filter((m) => typeof m === "string" && m !== "");
    return [...new Set(todos)];
}
/** 502 y 504 son el túnel o Tango que no responden; un 5xx sin header de origen es nginx. Las dos cosas pasan. */
const esReintentable = (r) => r.status === 502 || r.status === 504 || (r.status >= 500 && !r.origen);
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export class TangoApi {
    transporte;
    leerConfig;
    constructor(transporte = transporteAxios, leerConfig = () => configDelEntorno()) {
        this.transporte = transporte;
        this.leerConfig = leerConfig;
    }
    /** ¿Está configurada? Sin URL y key del connector, cada llamada terminaría en un error. */
    static configurada() {
        return configDelEntorno() !== null;
    }
    /** `tenant/empresa` tal como viaja en la URL, para poder mostrarlo en un diagnóstico. */
    static destino(empresaTangoId, env = process.env) {
        return `${TangoApi.tenant(env)}/${empresaTangoId}`;
    }
    /** La URL del connector, sin la key. Vacía si no está configurada. */
    static url() {
        return configDelEntorno()?.url || "";
    }
    /** El servidor Tango registrado en el connector al que se le habla. */
    static tenant(env = process.env) {
        return String(env.TANGO_CONNECTOR_TENANT || "").trim() || TENANT_POR_DEFECTO;
    }
    config() {
        const c = this.leerConfig();
        if (!c)
            throw new Error("Falta configurar el tango-connector (TANGO_CONNECTOR_URL y TANGO_CONNECTOR_API_KEY): sin eso no se puede consultar Tango.");
        return c;
    }
    /**
     * `GET /tango/{tenant}/{empresa}/GetById?process=&id=` para una empresa, por su Company ID de Tango.
     *
     * Devuelve el sobre de Tango tal cual: interpretarlo es de quien sabe qué pidió (para centros de
     * costo, `leerRegistroAuxiliares`; un `succeeded: false` de Tango también llega por acá). Lo que
     * NO es un sobre —rechazos del connector, túnel caído, red— sale como `ErrorConnector`.
     */
    async getRegistro(proceso, id, empresaTangoId) {
        const c = this.config();
        const destino = `${c.tenant}/${empresaTangoId}`;
        const url = `${c.url}/tango/${encodeURIComponent(c.tenant)}/${encodeURIComponent(empresaTangoId)}/GetById?process=${proceso}&id=${id}`;
        const r = await this.pedir(url, c, destino);
        if (!r.cuerpo || typeof r.cuerpo !== "object") {
            throw new ErrorConnector(r.origen === "tango" ? "tango" : "connector", r.status, [`Respuesta vacía o que no es JSON (HTTP ${r.status})`], destino, false);
        }
        return r.cuerpo;
    }
    /** Con qué key se está hablando y qué le permiten: `GET /meta/yo`. Para el diagnóstico de «Probar Tango». */
    async quienSoy() {
        const c = this.config();
        const r = await this.pedir(`${c.url}/meta/yo`, c, c.tenant);
        return (r.cuerpo && typeof r.cuerpo === "object" ? r.cuerpo : {});
    }
    /** Un request con un reintento ante fallas del túnel o de la red. Un 4xx es un rechazo: se explica, no se repite. */
    async pedir(url, c, destino) {
        const headers = { "X-Api-Key": c.apiKey, Accept: "application/json" };
        for (let intento = 0;; intento++) {
            let r;
            try {
                r = await this.transporte(url, headers, c.timeoutMs);
            }
            catch (e) {
                if (intento < REINTENTOS) {
                    await esperar(ESPERA_REINTENTO_MS);
                    continue;
                }
                const porTimeout = e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT" || /timeout/i.test(String(e?.message || ""));
                throw new ErrorConnector("red", 0, [porTimeout ? `El connector no respondió en ${c.timeoutMs / 1000} s` : `No se pudo conectar con el connector: ${e?.code || e?.message || "error de red"}`], destino, true);
            }
            if (esReintentable(r) && intento < REINTENTOS) {
                await esperar(ESPERA_REINTENTO_MS);
                continue;
            }
            if (r.status >= 400) {
                const mensajes = mensajesDe(r.cuerpo);
                throw new ErrorConnector(r.origen === "tango" ? "tango" : "connector", r.status, mensajes.length ? mensajes : [`HTTP ${r.status}`], destino, esReintentable(r));
            }
            return r;
        }
    }
}
/**
 * Por qué no se pudo consultar Tango, en palabras de quien tiene que ir a arreglarlo.
 *
 * «Request failed with status code 403» no dice qué hacer. Cada rechazo del connector tiene un
 * responsable distinto —la key la administra Lumba en su VPS, el túnel lo levanta el cliente del
 * lado de Tango, la URL está en el `.env` de WeProdu— y el mensaje tiene que mandar al lugar correcto.
 */
export function explicarFalla(e) {
    if (!(e instanceof ErrorConnector)) {
        const msg = String(e?.message || "error desconocido").replace(/\.+$/, "");
        return `No se pudo consultar Tango: ${msg}.`;
    }
    const detalle = e.mensajes.join(" · ");
    if (e.origen === "red") {
        return `No se llega al tango-connector (${TangoApi.url() || "sin URL"}): ${detalle}. Hay que revisar TANGO_CONNECTOR_URL y la salida HTTPS del servidor.`;
    }
    if (e.origen === "tango") {
        return `Tango contestó HTTP ${e.status} a través del connector (${e.destino})${detalle ? `: ${detalle}` : ""}. El token de la empresa en el connector puede estar vencido.`;
    }
    switch (e.status) {
        case 401:
            return `El tango-connector rechazó la API key (${detalle}). Hay que revisar TANGO_CONNECTOR_API_KEY.`;
        case 403:
            return `El tango-connector no autoriza a ${e.destino}: ${detalle}. La key de WeProdu tiene que incluir esa empresa y el permiso 1656:GetById.`;
        case 404:
            return `${detalle} (${e.destino}). Si es la empresa, hay que registrarla en el tango-connector (empresa:crear) y sumarla a la key de WeProdu.`;
        case 502:
            return `Tango no responde detrás del tango-connector (${e.destino}): ${detalle}. El túnel del lado de Tango (frpc) puede estar caído.`;
        case 504:
            return `Tango no respondió a tiempo detrás del tango-connector (${e.destino}): ${detalle}.`;
        default:
            return `El tango-connector contestó HTTP ${e.status} para ${e.destino}: ${detalle}.`;
    }
}
export const tangoApi = new TangoApi();
