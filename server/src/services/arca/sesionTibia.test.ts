import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cerrarSesionTibia, cerrarSesionesTibias, dejarSesionTibia, hayTibia, msSesionTibia, tomarSesionTibia, MINUTOS_TIBIA_DEFAULT } from "./sesionTibia.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const fuente = (archivo: string) => readFileSync(resolve(AQUI, archivo), "utf8");

/** Una sesión de mentira: sólo sabe cerrarse, y cuenta cuántas veces la cerraron. */
const sesionFalsa = (nombre = "s") => {
  const s = { nombre, cierres: 0, browser: { close: async () => void s.cierres++ } };
  return s;
};
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(async () => {
  await cerrarSesionesTibias();
});

describe("sesión tibia de ARCA", () => {
  it("la corrida siguiente se lleva la que dejó la anterior, y nadie más puede tomarla", async () => {
    const s = sesionFalsa();
    assert.equal(dejarSesionTibia("t1", s, 60_000), true);
    assert.equal(hayTibia("t1"), true);
    const tomada = await tomarSesionTibia("t1", async () => true);
    assert.equal(tomada, s);
    assert.equal(hayTibia("t1"), false, "sale del mapa: no se comparte");
    assert.equal(await tomarSesionTibia("t1", async () => true), null);
    assert.equal(s.cierres, 0, "tomarla no la cierra");
  });

  it("es por tenant: la de uno no se la lleva otro", async () => {
    const s = sesionFalsa();
    dejarSesionTibia("t1", s, 60_000);
    assert.equal(await tomarSesionTibia("t2", async () => true), null);
    assert.equal(hayTibia("t1"), true);
  });

  it("si ya no está en el servicio, se cierra y se cae al camino de siempre", async () => {
    const s = sesionFalsa();
    dejarSesionTibia("t1", s, 60_000);
    assert.equal(await tomarSesionTibia("t1", async () => false), null);
    assert.equal(s.cierres, 1);
    assert.equal(hayTibia("t1"), false);
  });

  it("si revalidar tira, también: una sesión dudosa no se reusa", async () => {
    const s = sesionFalsa();
    dejarSesionTibia("t1", s, 60_000);
    assert.equal(
      await tomarSesionTibia("t1", async () => {
        throw new Error("la página se cerró");
      }),
      null,
    );
    assert.equal(s.cierres, 1);
  });

  it("vence sola por inactividad y cierra el navegador", async () => {
    const s = sesionFalsa();
    dejarSesionTibia("t1", s, 20);
    await espera(60);
    assert.equal(s.cierres, 1);
    assert.equal(hayTibia("t1"), false);
    assert.equal(await tomarSesionTibia("t1", async () => true), null);
  });

  it("tomarla desarma el vencimiento: no se cierra en uso", async () => {
    const s = sesionFalsa();
    dejarSesionTibia("t1", s, 20);
    assert.equal(await tomarSesionTibia("t1", async () => true), s);
    await espera(60);
    assert.equal(s.cierres, 0);
  });

  it("nunca dos del mismo tenant: dejar otra cierra la anterior", async () => {
    const a = sesionFalsa("a");
    const b = sesionFalsa("b");
    dejarSesionTibia("t1", a, 60_000);
    dejarSesionTibia("t1", b, 60_000);
    await espera(5);
    assert.equal(a.cierres, 1);
    assert.equal(b.cierres, 0);
    assert.equal(await tomarSesionTibia("t1", async () => true), b);
  });

  it("volver a dejar la MISMA no la cierra, y el vencimiento viejo no la mata", async () => {
    const s = sesionFalsa();
    dejarSesionTibia("t1", s, 20);
    dejarSesionTibia("t1", s, 60_000);
    await espera(60);
    assert.equal(s.cierres, 0);
    assert.equal(hayTibia("t1"), true);
  });

  it("abrir una sesión nueva cierra la tibia de ese tenant", async () => {
    const s = sesionFalsa();
    dejarSesionTibia("t1", s, 60_000);
    await cerrarSesionTibia("t1");
    assert.equal(s.cierres, 1);
    assert.equal(hayTibia("t1"), false);
    // Sin tibia no hace nada.
    await cerrarSesionTibia("t1");
    assert.equal(s.cierres, 1);
  });

  it("apagada (0 minutos) no guarda nada: quien llama la cierra como antes", () => {
    const s = sesionFalsa();
    assert.equal(dejarSesionTibia("t1", s, 0), false);
    assert.equal(hayTibia("t1"), false);
    assert.equal(s.cierres, 0, "no la cierra este módulo: devuelve false para que la cierre quien la abrió");
  });

  it("un cierre que falla no rompe nada", async () => {
    const s = { browser: { close: async () => Promise.reject(new Error("ya estaba muerto")) } };
    dejarSesionTibia("t1", s, 60_000);
    await cerrarSesionTibia("t1");
    assert.equal(hayTibia("t1"), false);
  });

  it("los minutos salen de ARCA_SESION_TIBIA_MIN, con default y con 0 para apagar", () => {
    assert.equal(msSesionTibia(undefined), MINUTOS_TIBIA_DEFAULT * 60_000);
    assert.equal(msSesionTibia(""), MINUTOS_TIBIA_DEFAULT * 60_000);
    assert.equal(msSesionTibia("3"), 180_000);
    assert.equal(msSesionTibia("0"), 0);
    assert.equal(msSesionTibia("no es número"), MINUTOS_TIBIA_DEFAULT * 60_000);
    assert.equal(msSesionTibia("-5"), MINUTOS_TIBIA_DEFAULT * 60_000);
  });
});

describe("cómo la usan la corrida y el navegador", () => {
  const corrida = fuente("corridaServidor.ts");
  const navegador = fuente("navegador.ts");

  it("la corrida prueba la tibia antes de abrir una sesión nueva, y sólo al inicio", () => {
    assert.match(corrida, /if \(motivo === "inicio"\) \{[\s\S]*?tomarSesionTibia<[\s\S]*?>\(tenantId, revalidarSesionArca\)[\s\S]*?\}\s*sesion = await abrirSesionArca\(tenantId, cred\);/);
  });

  it("sólo deja tibia una sesión sana: sin error, con sesión y sin que la hayan cortado", () => {
    assert.match(corrida, /const sana = !!s && !sinSesion && !error && !corrida\.señal\.cortada;/);
    assert.match(corrida, /if \(!\(sana && dejarSesionTibia\(tenantId, s\)\)\) await s\?\.browser\.close\(\)\.catch\(\(\) => \{\}\);/);
  });

  it("el candado se suelta después de dejarla o cerrarla, no antes", () => {
    const dejar = corrida.indexOf("dejarSesionTibia(tenantId, s)");
    const soltar = corrida.indexOf('soltarCandado(tenantId, "obras_sociales");', dejar);
    assert.ok(dejar > 0 && soltar > dejar);
  });

  it("abrir una sesión nueva cierra antes la tibia del tenant: nunca dos navegadores del mismo usuario", () => {
    const cuerpo = navegador.slice(navegador.indexOf("export async function abrirSesionArca"));
    const cierra = cuerpo.indexOf("await cerrarSesionTibia(tenantId);");
    const lanza = cuerpo.indexOf("chromium.launch(");
    assert.ok(cierra > 0 && lanza > cierra, "cerrarSesionTibia va antes de chromium.launch");
  });

  it("revalidar pregunta a ARCA: navega al selector de CUIT y exige la pantalla del servicio", () => {
    const cuerpo = navegador.slice(navegador.indexOf("export async function revalidarSesionArca"));
    assert.match(cuerpo, /irA\(sesion\.page, SIMPLIFICACION_URL\)/);
    assert.match(cuerpo, /\(await pantallaDe\(sesion\.page\)\) === "servicio"/);
  });
});
