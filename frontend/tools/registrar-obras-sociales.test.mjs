/**
 * Tests del script que registra obras sociales ante ARCA.
 *
 *   node --test tools/registrar-obras-sociales.test.mjs
 *
 * Este script ESCRIBE en el organismo, así que los dos primeros describes son los que no se pueden
 * perder: que nunca se apriete el botón de BAJA, y que sin `--si` no se escriba nada.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parsearArgs, calcularFaltantes, rellenarRnos, botonAlta, SELECTORES, PAUSA_MS, conGuionesCuit } from "./registrar-obras-sociales.mjs";

const FUENTE = fs.readFileSync(path.resolve("tools/registrar-obras-sociales.mjs"), "utf8");

/**
 * La fuente sin comentarios, para los escaneos que buscan CÓDIGO.
 *
 * Filtrar por "la línea empieza con `*` o `//`" no alcanza: los bloques `/* … *​/` de este archivo no
 * llevan asterisco al margen, así que una línea de prosa que mencione `.click()` —justamente al
 * explicar por qué existe este control— se contaba como código y hacía fallar el test. Un escaneo
 * de seguridad que se deja engañar por su propia documentación no sirve como escaneo.
 */
const CODIGO = FUENTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Una página de mentira: registra los selectores pedidos, sin tocar ningún navegador. */
const paginaFalsa = () => {
  const pedidos = [];
  return {
    pedidos,
    locator(sel) {
      pedidos.push(sel);
      return { first: () => ({ count: async () => 1, click: async () => {} }) };
    },
  };
};

describe("la baja — la línea que no se cruza", () => {
  /**
   * En esta pantalla conviven dos `input[type=image]`:
   *
   *   btnAceptaAltaOS   registra la obra social cargada.
   *   (uno por fila)    DA DE BAJA esa obra social del padrón de la empleadora.
   *
   * Clickear el segundo por error vacía el padrón en vez de completarlo, y sin ruido: la pantalla
   * queda igual de prolija, con menos filas. Por eso el botón se busca por id exacto y nada más.
   */
  it("el único botón que se aprieta es el de alta, por su id", async () => {
    const page = paginaFalsa();
    await botonAlta(page);
    assert.deepEqual(page.pedidos, [SELECTORES.altaOS]);
    assert.match(SELECTORES.altaOS, /btnAceptaAltaOS/);
  });

  /**
   * Nadie puede clickear por afuera de `botonAlta()`. Si aparece un `.click()` sobre un locator
   * armado en otro lado, este test se cae — que es lo que tiene que pasar.
   */
  it("no hay ningún `.click()` que se saltee `botonAlta()`", () => {
    const sospechosas = CODIGO.split("\n").filter((l) => /\.click\(/.test(l));
    for (const linea of sospechosas) {
      assert.match(linea, /btn\.click\(\)/, `este click no pasa por \`botonAlta()\`:\n  ${linea.trim()}`);
    }
    assert.equal(sospechosas.length, 1, `esperaba exactamente 1 click (el alta), hay ${sospechosas.length}`);
  });

  it("el botón se busca por id exacto, nunca por tipo ni por posición", () => {
    const fn = FUENTE.slice(FUENTE.indexOf("export async function botonAlta"), FUENTE.indexOf("async function registrarUna"));
    assert.ok(!/\.nth\(|\[\s*\d+\s*\]/.test(fn), "buscar por índice es como se termina apretando el de al lado");
    assert.ok(!/input\[type=image\]/.test(fn), "por tipo entran también los botones de baja");
  });

  /** No hay ningún camino, ni con flag, que dé de baja algo. Si alguna vez hace falta, es otro comando. */
  it("no existe ninguna baja en todo el archivo", () => {
    assert.ok(!/btnBaja|EliminaOS|BajaOS|--baja|eliminar/i.test(FUENTE.replace(/da de baja|de BAJA|DA DE BAJA|dar de baja|NO da de baja|nunca da de baja/gi, "")), "este script solo agrega");
  });

  /** No es su pantalla: el «Aceptar» de Altas.aspx registra relaciones laborales de verdad. */
  it("no toca nada de la pantalla de altas de trabajadores", () => {
    assert.ok(!/Altas\.aspx|InputCuil|btnAceptar\b/i.test(FUENTE.replace(/altas de trabajadores/gi, "")), "esa pantalla es del otro script");
  });
});

describe("no escribe sin que se lo pidan", () => {
  it("sin --si, `escribir` queda en false", () => {
    assert.equal(parsearArgs(["--empleadora", "30717068374"]).si, false);
    assert.equal(parsearArgs(["--empleadora", "30717068374", "--si"]).si, true);
  });

  /** El default de la función tiene que ser el seguro, no solo el del CLI. */
  it("`registrarObrasSociales` no escribe por defecto", () => {
    assert.match(FUENTE, /escribir = false/, "el default de la firma tiene que ser no escribir");
    const cuerpo = FUENTE.slice(FUENTE.indexOf("if (!escribir) return"));
    assert.match(cuerpo.slice(0, 200), /dryRun: true/);
  });

  it("el dry-run devuelve antes de cualquier alta", () => {
    // El `return` del dry-run tiene que estar ANTES del bucle que registra. Si alguien lo mueve
    // después, el "modo seco" escribiría.
    assert.ok(FUENTE.indexOf("if (!escribir) return") < FUENTE.indexOf("for (const os of faltantes)"), "el corte del dry-run quedó después del bucle de altas");
  });

  it("el CLI dice cómo confirmar en vez de hacerlo solo", () => {
    assert.match(FUENTE, /Confirmá con --si para ejecutar/);
  });
});

describe("la empleadora no se adivina", () => {
  /**
   * Registrar bajo el CUIT equivocado le agrega a una empresa real obras sociales que no le
   * corresponden, y no avisa. Por eso la verificación va ANTES de leer siquiera el catálogo, y no
   * hay flag para saltearla.
   */
  it("se verifica el CUIT antes de escribir, y no hay forma de saltearlo", () => {
    const cuerpo = FUENTE.slice(FUENTE.indexOf("const enPantalla = await cuitsEnPantalla(page)"));
    assert.match(cuerpo.slice(0, 400), /if \(!enPantalla\.includes\(cuit\)\)/);
    assert.ok(FUENTE.indexOf("const enPantalla = await cuitsEnPantalla(page)") < FUENTE.indexOf("const catalogo = await leerCatalogo(page)"), "la verificación tiene que ir antes de trabajar");
    assert.ok(!/--forzar|forzarCuit|saltearCuit/i.test(FUENTE), "no puede haber escape para esta verificación");
  });

  it("sin --empleadora el CLI corta con un mensaje que explica por qué", () => {
    assert.equal(parsearArgs([]).empleadora, "");
    const main = FUENTE.slice(FUENTE.indexOf("async function main()"));
    assert.match(main, /if \(args\.empleadora\.length !== 11\)/, "tiene que chequearlo antes de hacer nada");
    assert.match(main.slice(0, 1200), /bajo el CUIT equivocado/i, "el mensaje tiene que decir la consecuencia");
  });

  it("normaliza el CUIT con o sin guiones", () => {
    assert.equal(parsearArgs(["--empleadora", "30-71706837-4"]).empleadora, "30717068374");
    assert.equal(conGuionesCuit("30717068374"), "30-71706837-4");
  });
});

describe("qué se registra", () => {
  const CATALOGO = [
    { _value: "102", _text: "OSDE" },
    { _value: "000322", _text: "SWISS MEDICAL" },
    { _value: "634", _text: "GALENO" },
  ];

  it("los RNOS se rellenan a 6 dígitos", () => {
    assert.equal(rellenarRnos("102"), "000102");
    assert.equal(rellenarRnos("000322"), "000322");
    assert.equal(rellenarRnos("1-2"), "000012");
  });

  /** La idempotencia: lo ya registrado no se vuelve a intentar, venga con ceros o sin ellos. */
  it("saltea lo que ya está registrado", () => {
    const faltan = calcularFaltantes(CATALOGO, ["000102", "634"]);
    assert.deepEqual(
      faltan.map((f) => f.rnos),
      ["000322"],
    );
  });

  it("con todo registrado, no queda nada por hacer", () => {
    assert.deepEqual(calcularFaltantes(CATALOGO, ["000102", "000322", "000634"]), []);
  });

  it("no repite una fila duplicada del catálogo", () => {
    const conDuplicado = [...CATALOGO, { _value: "0102", _text: "OSDE (otra vez)" }];
    const faltan = calcularFaltantes(conDuplicado, []);
    assert.equal(new Set(faltan.map((f) => f.rnos)).size, faltan.length);
    assert.equal(faltan.length, 3);
  });

  it("descarta un RNOS vacío o en cero", () => {
    assert.deepEqual(calcularFaltantes([{ _value: "", _text: "vacía" }, { _value: "0", _text: "cero" }], []), []);
  });

  /** El catálogo se lee de la página. Hardcodear 494 lo deja desactualizado el día que ARCA agregue una. */
  it("el catálogo sale de `l_OS` y no de una lista en el código", () => {
    assert.match(FUENTE, /window\.l_OS/);
    assert.ok(!/\b494\b(?!.*(catálogo de hoy|pueden ser otras))/.test(FUENTE.split("\n").filter((l) => !/^\s*(\*|\/\/)/.test(l)).join("\n")), "el total no se hardcodea");
  });
});

describe("cómo reacciona cuando algo sale mal", () => {
  /** Una que no entra no puede abortar la corrida: dejaría sin registrar las 300 que sí iban a andar. */
  it("un alta fallida se anota y sigue", () => {
    const bucle = FUENTE.slice(FUENTE.indexOf("for (const os of faltantes)"));
    assert.match(bucle.slice(0, 1400), /fallidas\.push\(os\)/);
    assert.ok(!/throw/.test(bucle.slice(0, 1400)), "no puede abortar por una fallida");
  });

  /** El alta se confirma por CONTEO: ARCA no siempre avisa que algo falló. */
  it("el alta se da por buena solo si sube el conteo", () => {
    const fn = FUENTE.slice(FUENTE.indexOf("async function registrarUna"), FUENTE.indexOf("/** Busca la pestaña"));
    assert.match(fn, /ahora > antes \? "ok" : "falla"/);
  });

  /** Sesión caída = frenar. Sin reintento ciego contra el organismo. */
  it("si se cae la sesión, frena y dice cuántas faltan", () => {
    assert.match(FUENTE, /cortadoPorSesion = true;/);
    assert.match(FUENTE, /Se cortó la sesión de ARCA\. Quedaron/);
    const bucle = FUENTE.slice(FUENTE.indexOf("for (const os of faltantes)"));
    assert.match(bucle.slice(0, 600), /break;/);
  });

  it("va de a una: nunca en paralelo", () => {
    // ASP.NET con `__VIEWSTATE` no admite dos postbacks encimados. Un `Promise.all` sobre las altas
    // mandaría viewstates viejos y el rechazo se vería igual que un alta que no tomó.
    assert.ok(!/Promise\.all|Promise\.allSettled/.test(FUENTE), "las altas no se pueden paralelizar");
    assert.ok(PAUSA_MS >= 100, "hace falta aire entre postbacks");
  });
});

describe("no toca la sesión ni abre navegadores", () => {
  it("se cuelga del Chrome existente y nunca lanza uno propio", () => {
    assert.match(FUENTE, /connectOverCDP/);
    assert.ok(!/chromium\.launch/.test(FUENTE), "un Chrome propio no tendría la sesión del operador");
  });

  it("no hay nada parecido a una clave fiscal en el código", () => {
    assert.ok(!/password|contrase|clave\s*=|\.fill\(.*(pass|clave)/i.test(FUENTE.replace(/clave fiscal/gi, "")), "el login es manual, siempre");
  });
});
