import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { urlWebhookDropbox } from "./urlWebhook.js";

/**
 * ESTA CADENA SE COPIA Y SE PEGA EN DROPBOX. Si sale mal, el webhook no se puede dar de alta.
 *
 * Dos formas de salir mal, y las dos ya pasaron o casi:
 *
 *   RELATIVA      es el bug real de producción: `VITE_API_URL` vale `/api/v1` y la cadena quedaba en
 *                 `/api/v1/dropbox/webhook`. Pegada en la App Console no sirve para nada.
 *   CON BARRA     con barra final el pedido no matchea el rewrite de `/api`, cae en el SPA y el
 *                 frontend contesta 200 con HTML. Dropbox acepta el alta y después da todas las
 *                 entregas por exitosas contra una página estática, sin dejar rastro.
 *
 * Los dos últimos tests son los que pidió el criterio de aceptación: fallan si la cadena no empieza
 * con `https://` o termina en `/`.
 */
const ORIGEN = "https://autolab-proyecto-2-wp.vercel.app";

describe("urlWebhookDropbox", () => {
  it("con la base RELATIVA de producción, la resuelve contra el origen del navegador", () => {
    assert.equal(urlWebhookDropbox("/api/v1", ORIGEN), `${ORIGEN}/api/v1/dropbox/webhook`);
  });

  it("con la base vacía usa el default y también sale absoluta", () => {
    assert.equal(urlWebhookDropbox("", ORIGEN), `${ORIGEN}/api/v1/dropbox/webhook`);
    assert.equal(urlWebhookDropbox(undefined, ORIGEN), `${ORIGEN}/api/v1/dropbox/webhook`);
    assert.equal(urlWebhookDropbox(null, ORIGEN), `${ORIGEN}/api/v1/dropbox/webhook`);
  });

  it("con la base ABSOLUTA manda ella, no el origen del navegador", () => {
    assert.equal(urlWebhookDropbox("https://autolab.fun:7001/api/v1", ORIGEN), "https://autolab.fun:7001/api/v1/dropbox/webhook");
  });

  it("la barra final de la base no se duplica ni sobrevive", () => {
    assert.equal(urlWebhookDropbox("/api/v1/", ORIGEN), `${ORIGEN}/api/v1/dropbox/webhook`);
    assert.equal(urlWebhookDropbox("https://autolab.fun:7001/api/v1///", ORIGEN), "https://autolab.fun:7001/api/v1/dropbox/webhook");
  });

  it("SIEMPRE arranca con https:// — una relativa no se puede pegar en Dropbox", () => {
    for (const base of ["/api/v1", "", undefined, "/api/v1/", "api/v1"]) {
      const url = urlWebhookDropbox(base, ORIGEN);
      assert.ok(url.startsWith("https://"), `«${url}» no es absoluta (base: ${JSON.stringify(base)})`);
    }
  });

  it("NUNCA termina en barra — con barra el pedido cae en el frontend y falla en silencio", () => {
    for (const base of ["/api/v1", "/api/v1/", "https://autolab.fun:7001/api/v1/", "", undefined]) {
      const url = urlWebhookDropbox(base, ORIGEN);
      assert.ok(!url.endsWith("/"), `«${url}» termina en barra (base: ${JSON.stringify(base)})`);
    }
  });

  it("el valor exacto del deploy actual", () => {
    // El que hay que ver en pantalla y en el portapapeles hoy.
    assert.equal(urlWebhookDropbox("/api/v1", ORIGEN), "https://autolab-proyecto-2-wp.vercel.app/api/v1/dropbox/webhook");
  });
});
