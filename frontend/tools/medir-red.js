/*
 * ═══════════════════════════════════════════════════════════════════════
 * MEDIR LA RED DE UNA PANTALLA — para pegar en la consola del navegador
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Instrumenta `fetch` y `XMLHttpRequest` y, por cada endpoint, cuenta cuántas veces se llamó, cuántos
 * bytes trajo, cuánto tardó y si vino comprimido. Es con lo que se compara antes y después de una
 * optimización: «tarda menos» no es un dato, «una llamada en vez de cuatro y 12 KB en vez de 1 MB» sí.
 *
 * CÓMO SE USA
 *   1. Abrir la consola del navegador en la pantalla ANTERIOR a la que se quiere medir.
 *   2. Pegar este archivo entero y ejecutar.
 *   3. Navegar a la pantalla (Proyectos, o Gestionar Equipo) y esperar a que termine de cargar.
 *   4. Ejecutar `medirRed.tabla()`.
 *
 * Otros comandos: `medirRed.reset()` empieza de cero, `medirRed.detalle("/users")` lista una por una
 * las llamadas a ese endpoint, `medirRed.parar()` saca la instrumentación.
 *
 * LOS BYTES SON LOS DEL CUERPO YA DESCOMPRIMIDO. El navegador no expone desde JavaScript cuánto viajó
 * realmente por el cable, así que la columna «gzip» dice si la respuesta vino comprimida (mirando
 * `Content-Encoding`) y el ahorro real se confirma en la pestaña Network, columna Size.
 */
(() => {
  if (window.medirRed?.parar) window.medirRed.parar();

  const llamadas = [];
  const fetchOriginal = window.fetch;
  const abrirOriginal = XMLHttpRequest.prototype.open;
  const enviarOriginal = XMLHttpRequest.prototype.send;

  /** El endpoint sin querystring ni ids: `/projects/68f…/members` → `/projects/:id/members`. */
  const normalizar = (url) => {
    try {
      const u = new URL(url, location.origin);
      return u.pathname
        .replace(/\/api\/v\d+/, "")
        .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, "/:id")
        .replace(/\/\d+(?=\/|$)/g, "/:n");
    } catch {
      return String(url);
    }
  };

  const anotar = (url, ms, bytes, encoding, estado) => {
    llamadas.push({ endpoint: normalizar(url), url: String(url), ms: Math.round(ms), bytes, gzip: !!encoding, estado });
  };

  window.fetch = async function (...args) {
    const t0 = performance.now();
    const respuesta = await fetchOriginal.apply(this, args);
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url;
    // Se clona para poder leer el cuerpo sin consumírselo a la aplicación.
    const clon = respuesta.clone();
    clon
      .arrayBuffer()
      .then((b) => anotar(url, performance.now() - t0, b.byteLength, respuesta.headers.get("content-encoding"), respuesta.status))
      .catch(() => anotar(url, performance.now() - t0, 0, respuesta.headers.get("content-encoding"), respuesta.status));
    return respuesta;
  };

  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__url = url;
    return abrirOriginal.call(this, metodo, url, ...resto);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const t0 = performance.now();
    this.addEventListener("loadend", () => {
      const bytes = Number(this.getResponseHeader("content-length")) || (typeof this.responseText === "string" ? new Blob([this.responseText]).size : 0);
      anotar(this.__url, performance.now() - t0, bytes, this.getResponseHeader("content-encoding"), this.status);
    });
    return enviarOriginal.apply(this, args);
  };

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

  window.medirRed = {
    llamadas,
    reset: () => {
      llamadas.length = 0;
      console.log("Medición reiniciada.");
    },
    parar: () => {
      window.fetch = fetchOriginal;
      XMLHttpRequest.prototype.open = abrirOriginal;
      XMLHttpRequest.prototype.send = enviarOriginal;
      console.log("Instrumentación sacada.");
    },
    detalle: (texto) => console.table(llamadas.filter((l) => l.endpoint.includes(texto) || l.url.includes(texto)).map(({ url, ms, bytes, gzip, estado }) => ({ url, ms, bytes, gzip, estado }))),
    tabla: () => {
      const porEndpoint = new Map();
      for (const l of llamadas) {
        const a = porEndpoint.get(l.endpoint) || { endpoint: l.endpoint, veces: 0, bytes: 0, msTotal: 0, msMax: 0, gzip: 0 };
        a.veces++;
        a.bytes += l.bytes;
        a.msTotal += l.ms;
        a.msMax = Math.max(a.msMax, l.ms);
        a.gzip += l.gzip ? 1 : 0;
        porEndpoint.set(l.endpoint, a);
      }
      const filas = [...porEndpoint.values()]
        .sort((a, b) => b.bytes - a.bytes)
        .map((a) => ({
          endpoint: a.endpoint,
          veces: a.veces,
          bytes: kb(a.bytes),
          "ms (prom)": Math.round(a.msTotal / a.veces),
          "ms (peor)": a.msMax,
          // «parcial» = algunas vinieron comprimidas y otras no: casi siempre es un endpoint que
          // devuelve un archivo además de JSON.
          gzip: a.gzip === a.veces ? "sí" : a.gzip === 0 ? "NO" : "parcial",
        }));
      console.table(filas);

      const total = llamadas.reduce((s, l) => s + l.bytes, 0);
      const duplicados = filas.filter((f) => f.veces > 1);
      console.log(`Total: ${llamadas.length} llamadas · ${kb(total)} descomprimidos`);
      if (duplicados.length) console.warn(`Repetidos (${duplicados.length}): ${duplicados.map((d) => `${d.endpoint} ×${d.veces}`).join(", ")}`);
      const sinGzip = filas.filter((f) => f.gzip === "NO");
      if (sinGzip.length) console.warn(`Sin comprimir: ${sinGzip.map((f) => f.endpoint).join(", ")}`);
      return filas;
    },
  };

  console.log("Midiendo. Navegá a la pantalla y después ejecutá medirRed.tabla()");
})();
