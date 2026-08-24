/**
 * Tests del script de validación de obras sociales.
 *
 *   node --test tools/validar-obras-sociales.test.mjs
 *
 * Reemplazan a los del puente de Tampermonkey (`puenteArca.test.ts`), que probaban el mecanismo que
 * se abandonó: el sandbox, el handshake, las marcas en el DOM. Lo que sobrevive es lo único que
 * importaba de aquellos: las REGLAS DEL TRÁMITE, que son las mismas contra ARCA con o sin extensión.
 *
 * El primer describe es el que no se puede perder nunca.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { boton, parsearArgs, conGuiones, ROTULOS_PERMITIDOS, TOPE_ARCA } from "./validar-obras-sociales.mjs";

const FUENTE = fs.readFileSync(path.resolve("tools/validar-obras-sociales.mjs"), "utf8");

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

describe("«Aceptar» — la línea que no se cruza", () => {
  /**
   * En la pantalla de altas de ARCA conviven tres botones:
   *
   *   Agregar    carga un CUIL para poder leerlo. No registra nada.
   *   Reiniciar  vacía la grilla.
   *   Aceptar    REGISTRA LAS ALTAS ANTE EL ORGANISMO. Irreversible.
   *
   * Apretar el tercero por error daría de alta relaciones laborales reales, masivas, a nombre de una
   * empresa real y por fuera del TXT. Es el peor error posible de todo el proyecto, así que no
   * alcanza con un comentario: la lista blanca es de verdad y esto lo comprueba.
   */
  it("`boton()` se niega a buscar «Aceptar»", async () => {
    const page = paginaFalsa();
    await assert.rejects(() => boton(page, "Aceptar"), /no aprieta/i);
    assert.equal(page.pedidos.length, 0, "ni siquiera tiene que llegar a buscarlo en el DOM");
  });

  it("la lista blanca son exactamente Agregar y Reiniciar", () => {
    assert.deepEqual([...ROTULOS_PERMITIDOS].sort(), ["Agregar", "Reiniciar"]);
  });

  /**
   * Nadie puede clickear por afuera de `boton()`, que es donde vive la lista blanca. Si aparece un
   * `.click()` sobre un locator armado en otro lado, este test se cae — que es lo que tiene que pasar.
   */
  it("no hay ningún `.click()` que se saltee una guarda", () => {
    const sospechosas = FUENTE.split("\n").filter((l) => /\.click\(/.test(l) && !/^\s*(\*|\/\/)/.test(l));
    for (const linea of sospechosas) {
      // `btn.click()` viene de `boton()`, que tiene la lista blanca. `x.click()` es la ✖ de borrar un
      // bloque, que tiene su propia guarda —se comprueba abajo—. Cualquier otro click es un locator
      // armado en otro lado y sin nadie mirando qué es.
      assert.match(linea, /(btn|x)\.click\(\)/, `este click no pasa por ninguna guarda:\n  ${linea.trim()}`);
    }
    assert.ok(sospechosas.length > 0 && sospechosas.length <= 3, `esperaba hasta 3 clicks (Agregar, Reiniciar y la ✖), hay ${sospechosas.length}`);
  });

  /**
   * La ✖ que saca un bloque se busca por rótulo, y el rótulo se COMPRUEBA antes de apretar.
   *
   * El selector se escribió sin poder verlo contra la página real, así que puede empezar a matchear
   * otro control el día que ARCA cambie algo. En esta pantalla el control que no se puede apretar
   * REGISTRA LAS ALTAS ANTE EL ORGANISMO, así que un selector que se corre no puede terminar en un
   * click a ciegas: tiene que chocar contra esta guarda.
   */
  it("la ✖ de borrar no puede terminar apretando «Aceptar»", () => {
    const fn = FUENTE.slice(FUENTE.indexOf("async function borrarBloque"), FUENTE.indexOf("async function vaciarPantalla"));
    assert.match(fn, /aceptar\|confirmar\|registrar/i, "hay que rechazar explícitamente lo que parezca confirmar el trámite");
    assert.match(fn, /limin\|orrar\|uitar/i, "y exigir que el rótulo hable de eliminar");
    assert.ok(fn.indexOf("throw") < fn.indexOf("x.click()"), "las dos guardas van ANTES del click");
  });

  it("los botones se buscan por texto exacto, nunca por posición", () => {
    // `.first()` está bien: desempata entre rótulos idénticos, no adivina por posición. Lo que no
    // puede aparecer es un índice — `nth(2)`, `[3]` — que es como se termina apretando el de al lado.
    const fn = FUENTE.slice(FUENTE.indexOf("export async function boton"), FUENTE.indexOf("async function textoPagina"));
    assert.ok(!/\.nth\(|\[\s*\d+\s*\]/.test(fn), "buscar por índice es como se termina apretando el botón equivocado");
    assert.match(FUENTE, /input\[type=submit\]\[value="\$\{rotulo\}"\]/, "el rótulo tiene que ir en el selector");
  });
});

describe("reglas del trámite", () => {
  /**
   * ARCA rechaza más de 10 relaciones laborales cargadas a la vez.
   *
   * La constante sobrevive al cambio a «de a uno» porque el límite sigue existiendo y hay que poder
   * NOMBRARLO cuando aparece: si `topeAlcanzado` salta con un solo bloque en pantalla, es que quedaron
   * bloques de antes. Ya no se usa para armar tandas — la corrida es de a uno y por eso puede ser de
   * 20, de 50 o de 200 sin tocar nada.
   */
  it("el tope de ARCA sigue siendo 10, aunque ya no se armen tandas", () => {
    assert.equal(TOPE_ARCA, 10);
  });

  /**
   * Con UN bloque a la vez el tope de 10 no se puede alcanzar por acumulación propia: si aparece, es
   * que quedaron bloques de una corrida anterior. O sea, un problema real de esa consulta.
   *
   * Lo que no puede pasar —y es lo que este test cuida— es que se lo ignore: cuando ARCA rechaza por
   * el tope, `Agregar` no hace NADA, y sin verificar que el bloque apareció esa persona se daría por
   * procesada sin haber leído nada. Esa es exactamente la forma de `faltaron: N` sin errores que
   * hacía que la pantalla pareciera colgada.
   */
  it("si el bloque no aparece, es un error DE ESA PERSONA y dice por qué", () => {
    const cuerpo = FUENTE.slice(FUENTE.indexOf("if (cuil in filas)"));
    assert.match(cuerpo.slice(0, 900), /topeAlcanzado\(page\)/, "hay que distinguir el tope del resto");
    assert.match(cuerpo.slice(0, 900), /errores\.add\(cuil\)/);
    assert.match(cuerpo.slice(0, 900), /tipo: "error", cuil, motivo/, "el error de la fila tiene que viajar con su motivo");
  });

  /**
   * NUNCA MÁS DE UN BLOQUE ABIERTO.
   *
   * Cada bloque en pantalla es un alta a medio iniciar esperando que alguien apriete algo. Lo único
   * que se necesita de ARCA es leer el número que precompleta; una vez leído, el bloque es riesgo sin
   * contrapartida. Y la pantalla se deja en cero VERIFICANDO, no suponiendo: se cuentan los bloques.
   */
  it("se carga de a uno y la pantalla vuelve a cero después de cada persona", () => {
    const bucle = FUENTE.slice(FUENTE.indexOf("for (const cuil of cuils)"), FUENTE.indexOf("const items ="));
    assert.ok(!/TOPE_ARCA/.test(bucle), "ya no se arma ninguna tanda: es de a uno");
    assert.match(bucle, /await vaciarPantalla\(page\);/, "hay que vaciar después de cada persona");
    const vaciar = FUENTE.slice(FUENTE.indexOf("async function vaciarPantalla"));
    assert.match(vaciar.slice(0, 800), /bloquesAbiertos\(page\)/, "se cuenta lo que quedó: no alcanza con haber apretado algo");
    assert.match(vaciar.slice(0, 800), /throw new Error/, "si no se pudo vaciar hay que cortar, no seguir cargando encima");
  });

  /** El resultado se emite ANTES de borrar: si el borrado falla, el dato ya está a salvo. */
  it("emite el resultado antes de borrar el bloque", () => {
    const bucle = FUENTE.slice(FUENTE.indexOf("if (cuil in filas)"), FUENTE.indexOf("const items ="));
    assert.ok(bucle.indexOf('tipo: "resultado"') < bucle.indexOf("await vaciarPantalla(page);"));
  });

  /**
   * `rnos` vacío es una RESPUESTA —«esta persona no tiene afiliación registrada, rige la del
   * convenio»— y cuenta como validada. Un error de consulta emitido como vacío sellaría ese
   * significado sobre alguien que ARCA nunca contestó.
   */
  it("los CUIL con error NO se aplican", () => {
    // Se pinea el CAMINO y no la sintaxis: el `else` de una línea se volvió un `continue` cuando entró
    // el aviso de progreso del Asistente. Lo que no puede cambiar es que no estar en `filas` termine
    // en `errores`.
    assert.match(FUENTE, /if \(cuil in filas\)[\s\S]{0,1600}?errores\.add\(cuil\)/, "la fila que no aparece es un error de ESE CUIL");
    // Lo que se manda a la API sale de `hechos` —lo que ARCA efectivamente contestó— y nunca de la
    // lista original: un error emitido como rnos vacío se guardaría como "no tiene obra social".
    const salida = FUENTE.slice(FUENTE.indexOf("const items ="));
    assert.match(salida.slice(0, 200), /hechos\.entries\(\)/, "los items salen de `hechos`, no de la lista original");
    assert.ok(!/errores/.test(salida.slice(0, 200)), "los errores no pueden entrar al lote");
  });

  /** Sesión caída = frenar. Lo pendiente queda pendiente; jamás se lo marca como vacío. */
  it("si se cae la sesión, frena y reporta cuántos faltan", () => {
    assert.match(FUENTE, /sinSesion = true;/);
    assert.match(FUENTE, /faltaron: cuils\.length - hechos\.size/, "hay que poder decir cuántos quedaron sin leer");
    assert.match(FUENTE, /Se cortó la sesión de ARCA\. Quedaron \$\{r\.faltaron\}/);
  });

  /**
   * La pantalla queda vacía SIEMPRE: fin normal, «Detener» o error.
   *
   * Tiene que estar en el `finally` y no al final del camino feliz, porque los otros dos son
   * justamente los que dejaban bloques colgados — y con bloques colgados la corrida siguiente arranca
   * condenada: el primer `Agregar` rebota contra el tope de 10 y falla en silencio.
   */
  it("deja la pantalla de ARCA vacía al terminar, incluso si falló", () => {
    const fin = FUENTE.slice(FUENTE.indexOf("  } finally {"));
    assert.match(fin.slice(0, 1400), /if \(page\) await vaciarPantalla\(page\)/);
    // Y sin tapar el error original: si veníamos con una excepción, esa es la que tiene que llegar.
    assert.match(fin.slice(0, 1400), /vaciarPantalla\(page\)\.catch\(/);
  });

  /** Y la corrida ARRANCA vacía: bloques de una corrida anterior condenan a la siguiente. */
  it("vacía la pantalla antes de la primera persona", () => {
    const arranque = FUENTE.slice(FUENTE.indexOf("Validando ${cuils.length} CUIL"), FUENTE.indexOf("for (const cuil of cuils)"));
    assert.match(arranque, /await vaciarPantalla\(page\);/);
  });

  /** Emparejamiento dudoso = frenar: seguir exportaría obras sociales posiblemente corridas. */
  it("si no puede emparejar una fila con su CUIL, frena", () => {
    assert.match(FUENTE, /if \(ambiguas > 0\)/);
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

describe("entrada", () => {
  it("acepta --cuil repetido y normaliza el formato", () => {
    const { cuils } = parsearArgs(["--cuil", "27400736877", "--cuil", "20-36397260-9"]);
    assert.deepEqual(cuils, ["27-40073687-7", "20-36397260-9"]);
  });

  it("deduplica: un CUIL repetido desperdicia un lugar de la tanda", () => {
    const { cuils } = parsearArgs(["--cuil", "27-40073687-7", "--cuil", "27400736877"]);
    assert.deepEqual(cuils, ["27-40073687-7"]);
  });

  it("descarta lo que no sea un CUIL de 11 dígitos", () => {
    assert.deepEqual(parsearArgs(["--cuil", "123", "--cuil", "sin cuil"]).cuils, []);
    assert.equal(conGuiones("123"), "");
  });

  it("lee un archivo y le toma la primera columna, así sirve un CSV", (t) => {
    const tmp = path.join(process.env.TMPDIR || "/tmp", `cuils-test-${process.pid}.csv`);
    fs.writeFileSync(tmp, "cuil,nombre\n27-40073687-7,PEREZ JUAN\n20-36397260-9,GOMEZ ANA\n\n");
    t.after(() => fs.rmSync(tmp, { force: true }));
    assert.deepEqual(parsearArgs(["--cuils", tmp]).cuils, ["27-40073687-7", "20-36397260-9"]);
  });
});

describe("la empleadora no se adivina", () => {
  /**
   * "Está entre las registradas ante ARCA" es una regla POR CUIT. Correr contra la empleadora
   * equivocada escribe obras sociales que pasan todas las validaciones y están mal — y quedan
   * bloqueadas, así que el error sobrevive hasta la rectificativa. Por eso falta de `--empresa` es un
   * error duro y no un default.
   */
  it("sin --empresa, `parsearArgs` no inventa ninguna", () => {
    assert.equal(parsearArgs(["--cuil", "27-40073687-7"]).empresa, "");
  });

  it("el CLI corta con un mensaje que explica por qué, no con un stack trace", () => {
    const main = FUENTE.slice(FUENTE.indexOf("async function main()"));
    assert.match(main, /if \(!args\.empresa\)/, "tiene que chequearlo antes de hacer nada");
    assert.match(main, /Falta --empresa/);
    assert.match(main.slice(0, 2000), /la obra social se valida contra el CUIT de la empleadora/i, "el mensaje tiene que decir POR QUÉ hace falta");
  });

  it("`--dry-run` llega hasta la API como dryRun y no escribe", () => {
    assert.equal(parsearArgs(["--dry-run"]).dryRun, true);
    assert.match(FUENTE, /body: JSON\.stringify\(\{ empresa, origen: "script", items, dryRun, forzar \}\)/, "el flag tiene que viajar al endpoint");
    assert.match(FUENTE, /--dry-run: NO se escribió nada/);
  });
});
