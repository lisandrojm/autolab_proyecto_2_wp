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
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
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
    assert.ok(sospechosas.length > 0 && sospechosas.length <= 4, `esperaba hasta 4 clicks (Agregar, Reiniciar, la ✖ y el «Aceptar» del selector de CUIT), hay ${sospechosas.length}`);
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
    // Acotado a `boton()` y nada más: entre esa función y `textoPagina` ahora viven otras, con sus
    // propias guardas y sus propios tests.
    const fn = FUENTE.slice(FUENTE.indexOf("export async function boton"), FUENTE.indexOf("/*\n  ==========================================================================="  , FUENTE.indexOf("export async function boton")));
    assert.ok(!/\.nth\(|\[\s*\d+\s*\]/.test(fn), "buscar por índice es como se termina apretando el botón equivocado");
    assert.match(FUENTE, /input\[type=submit\]\[value="\$\{rotulo\}"\]/, "el rótulo tiene que ir en el selector");
  });
});

describe("«Aceptar» del selector de CUIT — el mismo rótulo, dos pantallas", () => {
  /**
   * EL MISMO RÓTULO SIGNIFICA COSAS OPUESTAS SEGÚN LA PANTALLA:
   *
   *   IndexContribuyente.aspx   entra al servicio con el CUIT elegido. No registra nada.
   *   Altas.aspx                REGISTRA LAS ALTAS ANTE EL ORGANISMO. Irreversible.
   *
   * Por eso este click no puede estar en `ROTULOS_PERMITIDOS`, que decide por rótulo: acá lo que
   * distingue las dos pantallas es la URL, y la guarda tiene que ser por URL.
   */
  it("solo se aprieta en IndexContribuyente.aspx, y la guarda TIRA", () => {
    const fn = FUENTE.slice(FUENTE.indexOf("async function aceptarSelectorDeCuit"), FUENTE.indexOf("async function prepararAltas"));
    assert.match(fn, /if \(!INDEX_CONTRIBUYENTE_RE\.test\(page\.url\(\)\)\) \{\s*\n\s*throw new Error/, "tiene que cortar con excepción, no devolver false: un false lo puede ignorar quien llama");
    // Y otra vez pegado al click: entre leer las opciones y apretar hubo awaits.
    const antesDelClick = fn.slice(0, fn.indexOf("btn.click()"));
    assert.equal((antesDelClick.match(/INDEX_CONTRIBUYENTE_RE\.test/g) || []).length, 2, "se revalida la URL justo antes de apretar");
  });

  /**
   * Elegir la empleadora equivocada escribe obras sociales que pasan todas las validaciones y están
   * mal — y quedan bloqueadas, así que el error sobrevive hasta la rectificativa. Ante cualquier
   * duda no se elige nada y espera la persona, que es lo que pasaba siempre hasta ahora.
   */
  it("no elige el CUIT si no hay exactamente una coincidencia", () => {
    const fn = FUENTE.slice(FUENTE.indexOf("async function aceptarSelectorDeCuit"), FUENTE.indexOf("async function prepararAltas"));
    assert.match(fn, /if \(coinciden\.length !== 1\)[\s\S]{0,200}return false;/);
    assert.match(fn, /soloDigitos\(cuit\)/, "la coincidencia es por los once dígitos, no por el nombre");
  });

  /** Llegar solo es best-effort: si no se puede, se espera a la persona igual que antes. */
  it("si no puede llegar solo, devuelve null y no rompe nada", () => {
    const fn = FUENTE.slice(FUENTE.indexOf("async function prepararAltas"), FUENTE.indexOf("async function textoPagina"));
    assert.match(fn, /catch \(e\) \{[\s\S]{0,200}return null;/);
    assert.match(FUENTE, /page = await prepararAltas\(ctx, empresaCuit\);\s*\n\s*if \(!page\) \{\s*\n\s*page = await esperarSesion\(/);
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
    const cuerpo = FUENTE.slice(FUENTE.indexOf("if (porDigitos.has(cuilDigitos))"));
    assert.match(cuerpo.slice(0, 1400), /topeAlcanzado\(page\)/, "hay que distinguir el tope del resto");
    assert.match(cuerpo.slice(0, 1400), /errores\.add\(cuil\)/);
    assert.match(cuerpo.slice(0, 1400), /tipo: "error", cuil, motivo/, "el error de la fila tiene que viajar con su motivo");
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

  /**
   * NADA SE ESPERA CON `waitForLoadState`: en esta pantalla no hay navegación.
   *
   * Los botones son postbacks AJAX de ASP.NET —velo gris y spinner— así que la página nunca se carga
   * de nuevo y `waitForLoadState("load")` resuelve en el mismo instante en que se lo llama. Con eso,
   * el script leía la pantalla mientras ARCA todavía procesaba y reportaba «no abrió el bloque» para
   * las veinte personas, con ARCA andando perfecto.
   *
   * Con el ciclo viejo de a diez el error estaba tapado: entre el primer `Agregar` y la lectura final
   * pasaban nueve clicks, y ese tiempo alcanzaba de casualidad.
   */
  it("espera ESTADOS de la pantalla, nunca un evento de carga", () => {
    // Se busca la LLAMADA y no la palabra: los comentarios la nombran justamente para explicar por
    // qué no se usa, y un test que se rompe con su propia explicación no sirve.
    assert.ok(!/page\.waitForLoadState\(/.test(FUENTE), "waitForLoadState no espera nada acá: los postbacks son AJAX");
    // El helper vive compartido: el mismo hecho del sitio vale para los dos motores de ARCA, y
    // arreglarlo en uno solo los dejaría divergiendo.
    assert.match(FUENTE, /from "\.\/arca-postback\.mjs"/);
    const compartido = fs.readFileSync(path.resolve("tools/arca-postback.mjs"), "utf8");
    assert.match(compartido, /export async function esperarEstado\(/);
    // Y el que agrega tiene que DEVOLVER si apareció: leer la pantalla igual convierte «no esperé lo
    // suficiente» en «ARCA rechazó a esta persona», que son cosas opuestas.
    assert.match(FUENTE, /const aparecio = await agregarCuil\(page, cuil\);/);
    assert.match(FUENTE, /if \(!aparecio && !\(await topeAlcanzado\(page\)\)\)/);
  });

  /** El resultado se emite ANTES de borrar: si el borrado falla, el dato ya está a salvo. */
  it("emite el resultado antes de borrar el bloque", () => {
    const bucle = FUENTE.slice(FUENTE.indexOf("if (porDigitos.has(cuilDigitos))"), FUENTE.indexOf("const items ="));
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
    assert.match(FUENTE, /if \(porDigitos\.has\(cuilDigitos\)\)[\s\S]{0,1600}?errores\.add\(cuil\)/, "la fila que no aparece es un error de ESE CUIL");
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

describe("el emparejamiento CUIL ↔ fila", () => {
  /**
   * SE COMPARAN LOS DÍGITOS, no el string. Esto hacía fallar TODAS las validaciones del Asistente.
   *
   * La pantalla de ARCA muestra los CUIL con guiones (`23-22702067-9`) y `leerFilas` los devuelve
   * así. La CLI normaliza su entrada con guiones, así que le daba bien; el Asistente los manda
   * pelados (`23227020679`) y la comparación era falsa siempre, para todas las personas.
   *
   * El síntoma no se parecía en nada a la causa: cada fila salía como «ARCA no abrió el bloque»,
   * que suena a un problema del organismo o de esa persona. ARCA contestaba perfecto.
   */
  it("compara por dígitos, así da igual con guiones o sin ellos", () => {
    assert.match(FUENTE, /new Map\(Object\.entries\(filas\)\.map\(\(\[k, v\]\) => \[soloDigitos\(k\), v\]\)\)/);
    assert.match(FUENTE, /const cuilDigitos = soloDigitos\(cuil\);/);
    // Se busca la EXPRESIÓN y no la frase: el comentario de arriba la nombra para explicar por qué
    // no se usa, y un test que se rompe con su propia explicación no sirve.
    assert.ok(!/if \(cuil in filas\)/.test(FUENTE), "comparar los strings crudos es lo que estaba roto");
    assert.ok(!/rnos: filas\[cuil\]/.test(FUENTE), "el rnos del evento sale del mismo lugar que `hechos`, no de una búsqueda cruda");
  });

  it("el resultado sale con el CUIL en el formato en que entró", () => {
    // Los eventos y los items se emparejan del otro lado sin traducir nada: quien llamó manda.
    assert.match(FUENTE, /const rnos = porDigitos\.get\(cuilDigitos\);\s*\n\s*hechos\.set\(cuil, rnos\);/);
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

describe("el camino del servidor no arrastra las dependencias del frontend", () => {
  /*
    ESTO FALLÓ EN PRODUCCIÓN, y el síntoma no se parecía a la causa: «La corrida terminó sin validar
    ninguna de las 20 — Falta la dependencia `playwright-core`. Corré `npm install` en frontend/».
    Correr ese `npm install` no arreglaba nada, dos veces.

    `chromium` se usa en UNA línea, la del `connectOverCDP`, que es del camino del Asistente. El
    servidor pasa `paginaExistente` y nunca la toca. Pero el import estaba arriba de la función y
    corría igual, resolviéndose desde `frontend/node_modules` — una carpeta que en el VPS no existe
    (el frontend va a Vercel) y donde, cuando existe, `playwright-core` es devDependency y un
    `npm install` de producción no la baja.

    El motor se copia a un directorio sin `node_modules` a la vista para que el import sea imposible:
    es la forma de probar que NO se hace, en vez de confiar en que la línea está en el lugar correcto.
  */
  it("con `paginaExistente` no necesita `playwright-core` ni para arrancar", async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "motor-sin-playwright-"));
    for (const f of ["validar-obras-sociales.mjs", "arca-postback.mjs"]) {
      fs.copyFileSync(path.resolve("tools", f), path.join(dir, f));
    }
    const copia = path.join(dir, "validar-obras-sociales.mjs");

    try {
      createRequire(copia).resolve("playwright-core");
      t.skip("en esta máquina playwright-core se resuelve igual desde /tmp: la prueba no probaría nada");
      return;
    } catch {
      /* es lo que queremos: ahí no se puede resolver */
    }

    const { validarObrasSociales } = await import(`file://${copia}`);
    // La página falsa tira apenas la tocan: alcanza para saber que el import quedó atrás.
    const paginaExistente = {
      context: () => {
        throw new Error("LLEGUE-HASTA-CONTEXT");
      },
      url: () => "",
    };

    await assert.rejects(
      () => validarObrasSociales({ empresa: "", empresaCuit: "30712345678", cuils: ["20-36397260-9"], soloLeer: true, paginaExistente }),
      (e) => {
        assert.ok(!/playwright-core/.test(e.message), `no tiene que pedir playwright-core: «${e.message}»`);
        assert.match(e.message, /LLEGUE-HASTA-CONTEXT/);
        return true;
      },
    );

    fs.rmSync(dir, { recursive: true, force: true });
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
