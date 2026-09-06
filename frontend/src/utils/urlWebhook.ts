/**
 * LA URL DEL WEBHOOK DE DROPBOX, SIEMPRE ABSOLUTA.
 *
 * EL BUG QUE ARREGLA
 *
 * Esta URL se muestra en pantalla para copiarla y pegarla en la App Console de Dropbox. Se armaba
 * concatenando `VITE_API_URL`, y en el build de producción esa variable vale `/api/v1` — la app le
 * pega a su propio origen y nadie lo notó nunca, porque para un `fetch` una ruta relativa funciona
 * perfecto. El botón «Copiar» entregaba entonces `/api/v1/dropbox/webhook`: 23 caracteres sin esquema
 * ni host, inútiles del otro lado. Justo el error que esa sección existía para evitar.
 *
 * POR QUÉ ES UNA FUNCIÓN PURA Y NO LEE `import.meta.env`
 *
 * Para poder probarla. Cualquier módulo que toque `import.meta.env` explota bajo `tsx --test`, así
 * que la variable y el origen entran como argumentos y quien la llama los provee. Es la misma razón
 * por la que `claveEstado` vive fuera de `EstadoSelect`.
 *
 * SIN BARRA FINAL, Y NO ES UN DETALLE. Con barra final el pedido no matchea el rewrite de `/api` de
 * Vercel, cae en el catch-all del SPA y el frontend responde 200 con una página HTML. Dropbox da la
 * entrega por buena y en el servidor no pasa nada: falla sin dejar rastro en ningún lado.
 */

/** La ruta del webhook, colgando de la base de la API. Un solo lugar. */
export const RUTA_WEBHOOK = "/dropbox/webhook";

/**
 * @param base   lo que valga `VITE_API_URL`: absoluta (`https://host/api/v1`) o relativa (`/api/v1`).
 * @param origen `window.location.origin` — contra qué se resuelve cuando la base es relativa.
 */
export const urlWebhookDropbox = (base: string | null | undefined, origen: string): string => {
  // Sin base, la de siempre: es donde vive la API en todos los despliegues de esta app.
  const limpia = String(base || "/api/v1").trim().replace(/\/+$/, "") || "/api/v1";

  /*
    `new URL` resuelve los dos casos con la misma línea y sin partir strings a mano:

      base absoluta   gana ella y el origen se ignora  → https://autolab.fun:7001/api/v1/dropbox/webhook
      base relativa   se cuelga del origen del browser → https://<lo-que-sea>.vercel.app/api/v1/dropbox/webhook

    Si el origen tampoco sirve —un `origen` vacío en un entorno raro— se devuelve la concatenación
    cruda antes que tirar una excepción: una URL a medias se ve y se corrige, una pantalla en blanco no.
  */
  try {
    return new URL(`${limpia}${RUTA_WEBHOOK}`, origen).toString().replace(/\/+$/, "");
  } catch {
    return `${limpia}${RUTA_WEBHOOK}`;
  }
};
