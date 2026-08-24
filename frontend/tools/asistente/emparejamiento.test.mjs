/**
 * Tests del emparejamiento automático.
 *
 *   node --test emparejamiento.test.mjs
 *
 * Lo que se prueba acá no es «la página se ve bien»: es que el token no se escape por donde no tiene
 * que escaparse, y que la única ruta pública siga siendo solo eso. Son las dos cosas que, si se
 * rompen en un refactor, no producen ningún síntoma visible.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { paginaEmparejar, origenAtendido, banner } from "./emparejamiento.mjs";

const SERVIDOR = fs.readFileSync(new URL("./servidor.mjs", import.meta.url), "utf8");
const TOKEN = "a".repeat(64);

describe("el token no sale de la máquina", () => {
  /**
   * El fragmento (`#`) no viaja al servidor; la query (`?`) sí. Con `?token=` el código quedaría en
   * los logs de acceso, en el `Referer` de todo lo que la página cargue y en cualquier proxy del
   * camino — y es el mismo token que autoriza a manejar la sesión de ARCA de una empresa.
   */
  it("la URL de emparejamiento usa el fragmento y nunca la query", () => {
    const arranque = SERVIDOR.slice(SERVIDOR.indexOf("servidor.listen"));
    assert.match(arranque, /\/asistente\/emparejar#token=\$\{TOKEN\}/);
    assert.ok(!/\?token=/.test(SERVIDOR), "un query param dejaría el token en los logs del servidor");
  });

  /**
   * Sin cabeceras de CORS, una página cualquiera no puede LEER la respuesta de `/emparejar`. Con
   * ellas, cualquier origen de la lista blanca podría sacarle el token con un `fetch` y saltearse el
   * emparejamiento entero. La ruta se atiende ANTES de `ponerCors` justamente para eso.
   */
  it("`/emparejar` se resuelve antes de poner cabeceras de CORS", () => {
    const iEmparejar = SERVIDOR.indexOf('ruta === "/emparejar"');
    const iCors = SERVIDOR.indexOf("const conCors = ponerCors(req, res);");
    assert.ok(iEmparejar > 0 && iCors > 0);
    assert.ok(iEmparejar < iCors, "si CORS corre primero, una navegación normal (que no manda Origin) se come un 403");
  });
});

describe("la ruta pública muestra el código y NADA más", () => {
  const html = paginaEmparejar(TOKEN);

  it("trae el código", () => {
    assert.match(html, new RegExp(TOKEN));
  });

  /**
   * Es la única puerta sin autorización del servicio. Todo lo que se le agregue —un botón para abrir
   * ARCA, el estado, la ruta de Chrome— sería una acción o un dato disponible para cualquier cosa que
   * corra en la máquina. La tentación concreta es «total ya está la página»; esto la corta.
   */
  it("no dispara ninguna operación del Asistente", () => {
    assert.ok(!/fetch\(|XMLHttpRequest|<form/i.test(html), "la página no puede llamar a ningún endpoint");
    for (const op of ["/chrome", "/validar", "/registrar-obras-sociales", "/detener", "/progreso", "/estado"]) {
      assert.ok(!html.includes(op), `no puede haber nada de ${op} en la página pública`);
    }
  });

  it("no se puede embeber en un iframe ni queda cacheada", () => {
    const cabeceras = SERVIDOR.slice(SERVIDOR.indexOf('ruta === "/emparejar"'), SERVIDOR.indexOf("const conCors = ponerCors"));
    assert.match(cabeceras, /X-Frame-Options.*DENY/);
    assert.match(cabeceras, /Cache-Control.*no-store/);
  });

  it("no carga nada de afuera: se sirve desde 127.0.0.1 y tiene que verse sin internet", () => {
    // 127.0.0.1 no cuenta: es el propio Asistente, y acá solo aparece en un comentario del script.
    const remotos = (html.match(/https?:\/\/[^\s"')]+/g) || []).filter((u) => !/127\.0\.0\.1|localhost/.test(u));
    assert.deepEqual(remotos, [], "ni fuentes ni CSS remoto: tiene que verse igual sin internet");
  });
});

describe("no molestar en cada arranque", () => {
  /**
   * La marca se escribe cuando llega un request AUTORIZADO, no cuando se abre el navegador. Marcarla
   * al abrir haría que una pestaña cerrada sin mirar cuente como emparejada, y el Asistente no
   * volvería a ofrecer nada nunca: quedaría esperando a un navegador que no guardó ningún token.
   */
  it("la marca la escribe el primer request con token válido", () => {
    const trasElToken = SERVIDOR.slice(SERVIDOR.indexOf("if (!tokenValido("));
    assert.match(trasElToken.slice(0, 1200), /marcarEmparejado\(TOKEN\)/);
    assert.ok(!/marcarEmparejado/.test(SERVIDOR.slice(SERVIDOR.indexOf("servidor.listen"))), "el arranque no puede darla por hecha");
  });

  it("el navegador solo se abre si todavía no hay ninguno emparejado", () => {
    assert.match(SERVIDOR, /const abrio = !emparejado && abrirNavegador\(/);
  });
});

describe("la URL de WeProdu", () => {
  it("avisa si el origen configurado no es uno de los que atiende", () => {
    assert.equal(origenAtendido("http://localhost:5173"), true);
    assert.equal(origenAtendido("https://autolab.fun"), true);
    assert.equal(origenAtendido("https://otra-cosa.com"), false);
    assert.equal(origenAtendido("no es una url"), false);
  });

  it("el banner dice el código aunque no se haya podido abrir el navegador", () => {
    const b = banner({ version: "1.0.0", token: TOKEN, url: "https://autolab.fun", archivo: "", abrio: false, atendido: true });
    assert.match(b, new RegExp(TOKEN));
    assert.match(b, /127\.0\.0\.1:47653\/emparejar/);
  });
});
