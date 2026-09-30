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
import { boton, parsearArgs, conGuiones, ROTULOS_PERMITIDOS, TOPE_ARCA, agregarCuil, vaciarPantalla, mensajeNuevo } from "./validar-obras-sociales.mjs";

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
    // Con `esperaMin > 0` (Asistente, CLI) se sigue esperando a la persona como siempre.
    assert.match(FUENTE, /page = await prepararAltas\(ctx, empresaCuit\);[\s\S]{0,1200}?if \(!page\) \{\s*\n\s*page = await esperarSesion\(/);
  });

  /**
   * En el servidor nadie abre la pantalla a mano: `esperaMin: 0` corta YA. Sin esto, leer con una
   * empleadora que el usuario de ARCA no tiene en su selector costaba un minuto entero de espera.
   */
  it("con esperaMin 0 no espera a nadie: corta con el motivo", () => {
    assert.match(FUENTE, /if \(!page && esperaMin <= 0\) \{[\s\S]{0,400}?throw new Error\(/);
    // Y dice si la empleadora directamente no está en el selector: ahí una sesión nueva no ayuda.
    assert.match(FUENTE, /no está en el selector de CUIT de ARCA/);
  });

  /**
   * CAMBIAR DE EMPLEADORA EN LA MISMA SESIÓN: se vuelve al selector de CUIT y se elige la otra.
   *
   * Solo cuando fue ESTE motor el que eligió la anterior: una pestaña abierta a mano por una persona
   * (Asistente) no se cambia de empleadora por detrás.
   */
  it("cambia de empleadora volviendo al selector, solo si la anterior la eligió él", () => {
    const fn = FUENTE.slice(FUENTE.indexOf("async function prepararAltas"), FUENTE.indexOf("async function textoPagina"));
    assert.match(fn, /const hayQueCambiar = !!empresaCuit && !!elegida && elegida !== soloDigitos\(empresaCuit\);/);
    assert.match(fn, /IndexContribuyente\.aspx/);
    // Y se anota la empleadora recién DESPUÉS de que el «Aceptar» del selector salió bien.
    assert.ok(fn.indexOf("aceptarSelectorDeCuit(page, empresaCuit)") < fn.indexOf("empleadoraDePagina.set("));
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
    const cuerpo = FUENTE.slice(FUENTE.indexOf("if (porDigitos.has(cuilDigitos))"), FUENTE.indexOf("await vaciarPantalla(page);", FUENTE.indexOf("if (porDigitos.has(cuilDigitos))")));
    assert.match(cuerpo, /RE_TOPE\.test\(/, "hay que distinguir el tope del resto");
    assert.match(cuerpo, /errores\.add\(cuil\)/);
    assert.match(cuerpo, /tipo: "error", cuil, motivo/, "el error de la fila tiene que viajar con su motivo");
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
    assert.match(bucle, /await vaciarPantalla\(page\)/, "hay que vaciar después de cada persona");
    const vaciar = FUENTE.slice(FUENTE.indexOf("async function vaciarPantalla"));
    // Hasta el final de la función: con el aprendizaje de la ✖ el cuerpo creció, pero la guarda es la misma.
    const cuerpoVaciar = vaciar.slice(0, vaciar.indexOf("\n}\n"));
    assert.match(cuerpoVaciar, /bloquesAbiertos\(page\)/, "se cuenta lo que quedó: no alcanza con haber apretado algo");
    assert.match(cuerpoVaciar, /throw new Error/, "si no se pudo vaciar hay que cortar, no seguir cargando encima");
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
    assert.match(FUENTE, /const \{ aparecio, texto: textoDespues, tope \} = await agregarCuil\(page, cuil, textoAntes, textoLimpio\);/);
    assert.match(FUENTE, /if \(!aparecio && !tope\)/);
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
    // Entre las dos líneas se lee el nombre del bloque, así que se permite lo que haya en el medio
    // mientras las dos sigan estando: lo que el test cuida es de DÓNDE sale el rnos.
    assert.match(FUENTE, /const rnos = porDigitos\.get\(cuilDigitos\);[\s\S]{0,200}?hechos\.set\(cuil, rnos\);/);
  });

  /**
   * LA VALIDACIÓN DE OBRAS SOCIALES NO LEE NOMBRES. Los nombres se validan aparte, desde Usuarios.
   *
   * El nombre se sigue pudiendo leer del mismo bloque —lo pide `nombresPorPantalla` para los CUIT
   * inactivos—, pero solo con `leerNombres`, y el evento «resultado» ya no lo lleva.
   */
  it("el nombre solo se lee si se pide, y del MISMO bloque", () => {
    assert.match(FUENTE, /leerFilas\(page, \{ conNombres: leerNombres \}\)/);
    assert.match(FUENTE, /if \(leerNombres\) \{[\s\S]{0,120}nombresPorDigitos\.get\(cuilDigitos\)/);
    assert.match(FUENTE, /tipo: "resultado", cuil, rnos, hechas/, "el evento de la obra social no lleva nombre");
    assert.ok(!/tipo: "resultado", cuil, rnos, nombreArca/.test(FUENTE));
    // Dentro de la página, `nombreDeLaFila` corre solo con `conNombres`.
    assert.match(FUENTE, /if \(conNombres\) \{\s*\n\s*const nombre = nombreDeLaFila\(/);
  });

  it("el nombre de ARCA no se parte en nombre y apellido", () => {
    // ARCA lo muestra como APELLIDO + NOMBRES pegados. Dónde termina el apellido no se puede saber
    // («DEL VALLE ROJAS ANA»), y partirlo mal escribe el nombre de una persona al revés. Este motor
    // solo lo LEE; el que difiera se resuelve con el padrón, que los devuelve separados.
    const leer = FUENTE.slice(FUENTE.indexOf("const nombreDeLaFila"), FUENTE.indexOf("const out = {};"));
    assert.ok(!/\.split\(/.test(leer), "partir el nombre acá es adivinar dónde termina el apellido");
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

/**
 * Una pantalla de altas de mentira, con postbacks que tardan.
 *
 * Reproduce lo que importa para medir la espera: el bloque, los carteles, los diálogos y el estado
 * de `Sys.WebForms.PageRequestManager`. `respuesta(cuil)` dice qué contesta ARCA al «Agregar».
 */
function arcaFalsa({ sys = true, demoraMs = 300, conX = true, respuesta = () => ({ tipo: "bloque" }) } = {}) {
  const st = { bloques: 0, texto: "Registrar Nuevas Altas\nCUIL del empleado\nAgregar", enPostback: false, lecturasTexto: 0, busquedasX: 0, manejadores: [] };
  const base = st.texto;
  const postback = (alTerminar) => {
    st.enPostback = true;
    st.texto = `${base}\nProcesando, aguarde por favor…`;
    setTimeout(() => {
      st.texto = base;
      alTerminar();
      st.enPostback = false;
    }, demoraMs);
  };
  const dialogo = (tipo, texto, alAceptar) => ({
    type: () => tipo,
    message: () => texto,
    accept: async () => alAceptar?.(),
    dismiss: async () => {},
  });
  const efecto = (r) => {
    if (r.tipo === "bloque") st.bloques++;
    else if (r.tipo === "cartel") st.texto = `${base}\n${r.texto}`;
    else if (r.tipo === "alert") for (const m of st.manejadores) m(dialogo("alert", r.texto));
    else if (r.tipo === "confirm") for (const m of st.manejadores) m(dialogo("confirm", r.texto, () => setTimeout(() => st.bloques++, 150)));
  };
  const page = {
    st,
    on: (_ev, fn) => st.manejadores.push(fn),
    off: (_ev, fn) => (st.manejadores = st.manejadores.filter((f) => f !== fn)),
    fill: async (_sel, v) => (st.cuil = v),
    evaluate: async (fn) => {
      const src = String(fn);
      if (src.includes("PageRequestManager")) return sys ? st.enPostback : null;
      if (src.includes("innerText")) {
        st.lecturasTexto++;
        return st.texto;
      }
      throw new Error("evaluate no previsto en la página falsa");
    },
    locator(sel) {
      const loc = {
        first: () => loc,
        count: async () => {
          if (sel.includes("ExtendCodeOS")) return st.bloques;
          if (sel.includes('value="Agregar"')) return 1;
          if (sel.includes('value="Reiniciar"')) return st.bloques > 0 ? 1 : 0;
          if (sel.includes("type=image")) {
            st.busquedasX++;
            return conX && st.bloques > 0 ? 1 : 0;
          }
          return 0;
        },
        getAttribute: async (a) => (a === "title" ? "Eliminar" : ""),
        click: async () => {
          if (sel.includes('value="Agregar"')) postback(() => efecto(respuesta(st.cuil)));
          else if (sel.includes('value="Reiniciar"')) postback(() => (st.bloques = 0));
          else if (sel.includes("type=image")) postback(() => st.bloques--);
        },
      };
      return loc;
    },
  };
  return page;
};

const cronometrar = async (fn) => {
  const t = Date.now();
  const r = await fn();
  return { ...r, ms: Date.now() - t };
};

describe("«Agregar» termina apenas ARCA contesta — con bloque o con rechazo", () => {
  const CUIL = "27-40073687-7";

  /**
   * «CUIL ya tiene un alta activa» no abre bloque. Antes la espera terminaba recién a los 25 s
   * (ESPERA_POSTBACK_MS), por persona; ahora termina con el cartel.
   */
  it("un rechazo con cartel resuelve cuando termina el postback, no a los 25 s", async () => {
    const page = arcaFalsa({ respuesta: () => ({ tipo: "cartel", texto: "CUIL ya tiene un alta activa." }) });
    const r = await cronometrar(() => agregarCuil(page, CUIL, page.st.texto));
    assert.equal(r.aparecio, false);
    assert.ok(r.ms < 1500, `tardó ${r.ms} ms`);
    assert.match(mensajeNuevo(page.st.texto.replace("CUIL ya tiene un alta activa.", ""), r.texto, CUIL), /alta activa/);
  });

  /**
   * El cartel del rechazo anterior sigue en pantalla y ARCA contesta el MISMO texto. Antes se
   * esperaban los 25 s enteros por cada rechazo después del primero.
   */
  it("un rechazo repetido (mismo cartel que el anterior) también resuelve enseguida", async () => {
    const page = arcaFalsa({ respuesta: () => ({ tipo: "cartel", texto: "CUIL ya tiene un alta activa." }) });
    const limpio = page.st.texto;
    await agregarCuil(page, CUIL, limpio, limpio);
    const conCartelViejo = page.st.texto;
    const r = await cronometrar(() => agregarCuil(page, "20-30000001-1", conCartelViejo, limpio));
    assert.equal(r.aparecio, false);
    assert.ok(r.ms < 1500, `tardó ${r.ms} ms`);
  });

  it("mientras ARCA procesa no se lee el texto de la página", async () => {
    const page = arcaFalsa({ demoraMs: 800 });
    const r = await agregarCuil(page, CUIL, page.st.texto);
    assert.equal(r.aparecio, true);
    assert.equal(page.st.lecturasTexto, 0, "el bloque apareció: no hacía falta leer nada");
  });

  it("un confirm aceptado NO es un rechazo: se sigue esperando el bloque", async () => {
    const page = arcaFalsa({ respuesta: () => ({ tipo: "confirm", texto: "El CUIL ya tiene una relación laboral activa. ¿Desea continuar?" }) });
    const r = await agregarCuil(page, CUIL, page.st.texto);
    assert.equal(r.aparecio, true);
  });

  it("un alert es la respuesta: no viene ningún bloque detrás", async () => {
    const page = arcaFalsa({ respuesta: () => ({ tipo: "alert", texto: "CUIL inválido" }) });
    const r = await cronometrar(() => agregarCuil(page, CUIL, page.st.texto));
    assert.equal(r.aparecio, false);
    assert.ok(r.ms < 1500, `tardó ${r.ms} ms`);
  });

  /**
   * Sin `Sys` a la vista no se sabe si el postback terminó: el cartel tiene que quedarse quieto
   * CARTEL_ESTABLE_MS. Y lo que ARCA muestra MIENTRAS procesa («Procesando, aguarde…») no cuenta.
   */
  it("sin Sys, el cartel tiene que quedarse quieto; el «Procesando» no cuenta", async () => {
    const rechazo = arcaFalsa({ sys: false, respuesta: () => ({ tipo: "cartel", texto: "CUIL ya tiene un alta activa." }) });
    const r1 = await cronometrar(() => agregarCuil(rechazo, CUIL, rechazo.st.texto));
    assert.equal(r1.aparecio, false);
    assert.ok(r1.ms >= 1500 && r1.ms < 4000, `tardó ${r1.ms} ms`);

    const lento = arcaFalsa({ sys: false, demoraMs: 2500 });
    const r2 = await agregarCuil(lento, CUIL, lento.st.texto);
    assert.equal(r2.aparecio, true, "el spinner no puede leerse como un rechazo");
  });
});

describe("vaciar la pantalla aprende qué método funciona", () => {
  it("si la ✖ no está, cae a «Reiniciar» y no la vuelve a buscar", async () => {
    const page = arcaFalsa({ conX: false, demoraMs: 50 });
    page.st.bloques = 1;
    assert.equal(await vaciarPantalla(page), "reiniciar");
    const busquedas = page.st.busquedasX;
    page.st.bloques = 1;
    assert.equal(await vaciarPantalla(page), "reiniciar");
    assert.equal(page.st.busquedasX, busquedas, "la segunda vez va directo a «Reiniciar»");
    assert.equal(page.st.bloques, 0);
  });

  it("si la ✖ funciona, se sigue usando", async () => {
    const page = arcaFalsa({ demoraMs: 50 });
    page.st.bloques = 1;
    assert.equal(await vaciarPantalla(page), "x");
    page.st.bloques = 1;
    assert.equal(await vaciarPantalla(page), "x");
  });
});
