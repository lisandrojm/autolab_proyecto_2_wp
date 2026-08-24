#!/usr/bin/env node
/*
  ============================================================================
  Asistente WeProdu — el botón local que reemplaza la terminal.
  ============================================================================

  QUIÉN LO USA Y POR QUÉ EXISTE

  Los administrativos que dan de alta gente en ARCA no abren terminales. Hasta
  acá, validar obras sociales pedía correr `npm run …` con un hash de 24
  caracteres pegado atrás — un pedido razonable para quien programa y una
  barrera absoluta para quien no. Todo tiene que ser un botón dentro de WeProdu.

  Pero una página web no puede ejecutar programas de la máquina, y el backend no
  alcanza el Chrome del usuario. De ahí este servicio: corre en la máquina del
  administrativo, escucha SOLO en 127.0.0.1, y traduce «apretó un botón» en «abrí
  Chrome» o «recorré estos CUIL en ARCA».

  NO REESCRIBE EL MOTOR. La lógica CDP —las tandas de 10, «Aceptar» que no se
  toca, la sesión que se cae— es la misma de `validar-obras-sociales.mjs` y
  `registrar-obras-sociales.mjs`, importada tal cual. Acá adentro no hay ninguna
  regla del trámite: si alguna vez aparece una, está en el archivo equivocado.

  LO QUE NUNCA HACE

   - No pide ni guarda la clave fiscal. El login lo hace la persona, en el Chrome
     que este servicio abre.
   - No tiene credenciales de WeProdu. Lee de ARCA y devuelve el resultado; quien
     GUARDA es el navegador, con la sesión de quien está sentado ahí. Por eso
     `/validar` corre con `soloLeer`.
   - No expone ningún endpoint que ejecute un comando arbitrario. Las operaciones
     son estas ocho y nada más.

  Ver `seguridad.mjs` para las tres barreras y para qué NO cubren.
*/
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { ORIGENES_PERMITIDOS, origenPermitido, tokenDeInstalacion, tokenValido } from "./seguridad.mjs";
import { abrirChrome, enfocarChrome, chromeAbierto, enPantallaDeAltas, estadoSesionArca, rutaChrome, guardarRutaChrome, CDP_URL } from "./chrome.mjs";
import { noMorirEnSilencio } from "./diagnostico.mjs";
import { OPERACIONES } from "./operaciones.mjs";
import { urlWeProdu, origenAtendido, yaEmparejado, marcarEmparejado, guardarCodigoEnArchivo, abrirNavegador, paginaEmparejar, banner } from "./emparejamiento.mjs";

/**
 * La versión se INCRUSTA al empaquetar (`--define:__VERSION__`, ver empaquetar.mjs) y solo se lee del
 * package.json cuando se corre a mano con `node servidor.mjs`.
 *
 * Adentro del ejecutable no hay package.json que leer. Cuando lo leía siempre, el binario compilaba
 * sin una queja y moría al arrancar buscando un archivo que no estaba en el snapshot: la ventana se
 * abría y se cerraba, sin nada que mirar. Un dato fijo y conocido en tiempo de build no tiene por qué
 * costar un acceso a disco que puede fallar.
 */
const AQUI = dirname(fileURLToPath(import.meta.url));
const VERSION = typeof __VERSION__ === "string" ? __VERSION__ : JSON.parse(readFileSync(join(AQUI, "package.json"), "utf8")).version;

/**
 * Puerto fijo y alto.
 *
 * Fijo porque WeProdu tiene que poder buscarlo sin que nadie configure nada; alto y poco usado para
 * no chocar con un servidor de desarrollo. No se cae a otro puerto si está ocupado: que "algo más ya
 * está escuchando acá" pase desapercibido sería peor que no arrancar.
 */
const PUERTO = 47653;

// Antes que nada: un error suelto no puede llevarse puesto el servicio. Ver `diagnostico.mjs`.
noMorirEnSilencio();

const TOKEN = tokenDeInstalacion();

/**
 * Por qué una corrida terminó sin hacer todo lo que le pidieron.
 *
 * UN `fin` CON `faltaron > 0` Y `errores: []` ES UN BUG EN SÍ MISMO, y estuvo escondido: el motor
 * abortaba antes de la primera persona por un botón que no encontraba, salía del bucle con un
 * `break`, y devolvía el resultado normal —cero hechas, cero errores, `sinSesion: false`—. El
 * Asistente lo emitía como un final exitoso, la pantalla no tenía nada que mostrar, y las veinte
 * filas se quedaban en «en cola» para siempre. Desde afuera: «se cuelga».
 *
 * Este es el último filtro: si faltaron personas y nadie dijo por qué, se dice al menos que nadie
 * dijo por qué. Un final sin explicación tiene que verse como lo que es.
 */
function motivoDeQueFaltaran(r) {
  if (!r.faltaron) return "";
  if (r.sinSesion) return "Se cortó la sesión de ARCA, o se pidió detener la corrida.";
  if (r.errores?.length) return `ARCA no devolvió fila para ${r.errores.length} CUIL. Puede que no tengan relación laboral registrada con esta empleadora.`;
  return "La corrida terminó sin procesar a nadie y el motor no informó ningún error. Mirá la ventana del Asistente: el detalle se imprime ahí.";
}

/**
 * La corrida en curso. Una sola por vez: dos tandas encimadas se pisan la pantalla de ARCA.
 *
 * La corrida TERMINADA se conserva —`/progreso` reenvía sus eventos a quien llegue tarde— pero deja
 * de ocupar el turno. Antes la guarda miraba `if (corrida)` a secas, así que la primera validación
 * dejaba el lugar tomado para siempre: la segunda contestaba «Ya hay una corrida en curso» y el
 * Asistente quedaba inservible hasta reiniciarlo, sin nada que explicara por qué.
 */
let corrida = null;

const ocupado = () => !!corrida && !corrida.terminada;

/** ¿Algún navegador ya se emparejó con este token? Decide si el arranque abre una pestaña o no. */
let emparejado = yaEmparejado(TOKEN);

// ───────────────────────────────────────────────────────────── HTTP, a mano

const json = (res, codigo, cuerpo) => {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(texto) });
  res.end(texto);
};

/**
 * Las cabeceras de CORS, solo si el origen está en la lista.
 *
 * Cuando NO está no se manda ninguna cabecera: el navegador entonces le niega la respuesta al que
 * preguntó. Devolver `Access-Control-Allow-Origin: *` sería abrirle la puerta a cualquier sitio.
 */
function ponerCors(req, res) {
  const origen = req.headers.origin;
  if (!origenPermitido(origen)) return false;
  res.setHeader("Access-Control-Allow-Origin", origen);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-WeProdu-Token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Max-Age", "600");
  return true;
}

const leerCuerpo = (req) =>
  new Promise((resolve, reject) => {
    let datos = "";
    req.on("data", (c) => {
      datos += c;
      // Tope defensivo: nadie manda un lote de megabytes, y sin límite un cliente local puede
      // llenar la memoria del proceso con una sola request.
      if (datos.length > 1_000_000) reject(new Error("Cuerpo demasiado grande."));
    });
    req.on("end", () => {
      try {
        resolve(datos ? JSON.parse(datos) : {});
      } catch {
        reject(new Error("El cuerpo no es JSON válido."));
      }
    });
    req.on("error", reject);
  });

// ─────────────────────────────────────────────────────────────── operaciones

async function estado() {
  return { ok: true, version: VERSION, operaciones: OPERACIONES, chromeAbierto: await chromeAbierto(), sesionArca: await estadoSesionArca(), pantallaAltas: await enPantallaDeAltas(), chromeEncontrado: !!rutaChrome(), corriendo: ocupado() };
}

/**
 * Arranca una corrida de validación. Devuelve enseguida: el progreso se sigue por `/progreso`.
 *
 * `soloLeer` va SIEMPRE en true. Este proceso no guarda nada en WeProdu — no tiene con qué, y es a
 * propósito (ver la cabecera del archivo).
 */
async function arrancarValidacion({ cuils }) {
  if (ocupado()) throw Object.assign(new Error("Ya hay una corrida en curso."), { codigo: "ocupado" });
  const { validarObrasSociales } = await import("../validar-obras-sociales.mjs");

  const señal = { cortada: false };
  const eventos = [];
  const oyentes = new Set();
  const emitir = (e) => {
    eventos.push(e);
    for (const enviar of oyentes) enviar(e);
  };

  corrida = { señal, eventos, oyentes, terminada: false, resultado: null, error: null };

  // Se lanza sin `await`: la respuesta HTTP tiene que volver ya, o el fetch del navegador se queda
  // colgado los minutos que dure la tanda.
  validarObrasSociales({ empresa: "", cuils, soloLeer: true, cdpUrl: CDP_URL, onProgreso: emitir, señal })
    .then((r) => {
      corrida.resultado = { items: r.items, errores: r.errores, sinSesion: r.sinSesion, faltaron: r.faltaron, motivo: motivoDeQueFaltaran(r) };
      emitir({ tipo: "fin", ...corrida.resultado });
    })
    .catch((e) => {
      corrida.error = e?.message || String(e);
      // El stack va a la CONSOLA del Asistente. Es una app de consola y esa ventana está abierta
      // adelante de la persona: si el motivo no aparece ahí, no aparece en ningún lado — el usuario
      // no tiene un log al que entrar ni forma de pedirlo.
      console.error(`\n  ✗ La validación falló:\n${e?.stack || e?.message || e}\n`);
      emitir({ tipo: "fallo", mensaje: corrida.error });
    })
    .finally(() => {
      corrida.terminada = true;
      for (const enviar of oyentes) enviar({ tipo: "cerrado" });
    });

  return { arrancada: true, total: cuils.length };
}

async function arrancarRegistroObrasSociales({ empresaCuit, dryRun }) {
  if (ocupado()) throw Object.assign(new Error("Ya hay una corrida en curso."), { codigo: "ocupado" });
  const { registrarObrasSociales } = await import("../registrar-obras-sociales.mjs");

  const eventos = [];
  const oyentes = new Set();
  const emitir = (e) => {
    eventos.push(e);
    for (const enviar of oyentes) enviar(e);
  };
  corrida = { señal: { cortada: false }, eventos, oyentes, terminada: false, resultado: null, error: null };

  // `señal` va SIEMPRE: sin ella `/detener` contestaba 200 y la corrida seguía escribiendo en ARCA.
  registrarObrasSociales({ empleadora: empresaCuit, escribir: !dryRun, cdpUrl: CDP_URL, onPaso: (p) => emitir({ tipo: "paso", ...p }), señal: corrida.señal })
    .then((r) => {
      corrida.resultado = r;
      emitir({ tipo: "fin", ...r });
    })
    .catch((e) => {
      corrida.error = e?.message || String(e);
      emitir({ tipo: "fallo", mensaje: corrida.error });
    })
    .finally(() => {
      corrida.terminada = true;
      for (const enviar of oyentes) enviar({ tipo: "cerrado" });
    });

  return { arrancada: true, dryRun: !!dryRun };
}

/**
 * El stream de progreso, en formato SSE.
 *
 * Se reenvían PRIMERO los eventos ya ocurridos y después los nuevos: entre que `/validar` contesta y
 * el navegador abre el stream pasan milisegundos en los que puede haberse resuelto un CUIL, y sin
 * este replay esa fila se quedaría en «consultando…» para siempre.
 */
function abrirProgreso(req, res) {
  // Las cabeceras de CORS ya se pusieron con `setHeader` y `writeHead` las conserva: no hay que
  // reenviarlas acá, y hacerlo a mano es cómo se termina mandando el origen equivocado.
  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });

  const enviar = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  if (!corrida) {
    enviar({ tipo: "cerrado" });
    return res.end();
  }
  for (const e of corrida.eventos) enviar(e);
  if (corrida.terminada) {
    enviar({ tipo: "cerrado" });
    return res.end();
  }
  corrida.oyentes.add(enviar);
  // Un latido cada 20s: sin tráfico, un proxy o el propio navegador pueden dar la conexión por muerta
  // durante una tanda lenta.
  const latido = setInterval(() => res.write(": latido\n\n"), 20000);
  req.on("close", () => {
    clearInterval(latido);
    corrida?.oyentes.delete(enviar);
  });
}

// ─────────────────────────────────────────────────────────────── el servidor

const servidor = createServer(async (req, res) => {
  const ruta = new URL(req.url, `http://127.0.0.1:${PUERTO}`).pathname;

  /*
    LA ÚNICA RUTA SIN TOKEN, y va antes que todo lo demás a propósito.

    Antes de CORS porque una navegación normal del navegador NO manda `Origin`: pasar por `ponerCors`
    la cortaría con un 403 y el respaldo no serviría para nada.

    Antes del token porque es de donde se saca el token. Que la puerta de entrada pida la llave que
    hay adentro es exactamente el callejón sin salida que esto viene a arreglar.

    Y sin cabeceras de CORS, deliberadamente: eso deja que la muestre el navegador cuando la persona
    la escribe, y le impide leerla a cualquier página que la busque con `fetch`. Es lo único que
    separa «un respaldo para el usuario» de «el token es público para toda la web».
  */
  if (req.method === "GET" && ruta === "/emparejar") {
    const html = paginaEmparejar(TOKEN);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(html),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // Que no la embeba nadie: dentro de un iframe el token queda a la vista de la página de afuera
      // para cualquiera que le saque una captura, o que engañe a la persona para que lo copie.
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
    });
    return res.end(html);
  }

  const conCors = ponerCors(req, res);
  if (req.method === "OPTIONS") {
    // El preflight se contesta 204 con las cabeceras ya puestas, o 403 pelado si el origen no está.
    res.writeHead(conCors ? 204 : 403);
    return res.end();
  }
  if (!conCors) return json(res, 403, { error: "Origen no autorizado.", origenesPermitidos: ORIGENES_PERMITIDOS });

  /*
    El token, ANTES de mirar la ruta.

    Sin este orden, un endpoint nuevo agregado por distracción quedaría abierto: la autorización sería
    algo que cada handler se acuerda de hacer, en vez de la puerta por la que todos pasan.
  */
  if (!tokenValido(req.headers["x-weprodu-token"], TOKEN)) {
    return json(res, 401, { error: "Falta el código de emparejamiento, o no es el de este Asistente." });
  }

  /*
    Un request autorizado ES la prueba de que el emparejamiento funcionó, y la única que hay.

    Por eso la marca se escribe acá y no al abrir el navegador: si se marcara al abrirlo, una pestaña
    que el usuario cierra sin mirar contaría como emparejada y el Asistente no volvería a ofrecer
    nada nunca — quedaría esperando a un navegador que no guardó ningún token.
  */
  if (!emparejado) {
    emparejado = true;
    marcarEmparejado(TOKEN);
  }

  try {
    if (req.method === "GET" && ruta === "/estado") return json(res, 200, await estado());
    if (req.method === "GET" && ruta === "/progreso") return abrirProgreso(req, res);

    if (req.method === "POST" && ruta === "/chrome") {
      const r = await abrirChrome();
      return json(res, 200, { ...r, ...(await estado()) });
    }

    /*
      Traer al frente la ventana que YA está abierta.

      Separado de `/chrome` a propósito: aquel ABRE y este ENFOCA, y colapsarlos haría que pedir
      "mostrame la ventana" pudiera terminar lanzando un navegador. Son dos intenciones distintas del
      usuario y el estado en que se piden es distinto.
    */
    if (req.method === "POST" && ruta === "/chrome/focus") {
      const r = await enfocarChrome();
      return json(res, 200, { ...r, ...(await estado()) });
    }

    if (req.method === "POST" && ruta === "/chrome/ruta") {
      const { ruta: nueva } = await leerCuerpo(req);
      return json(res, 200, { ruta: guardarRutaChrome(nueva) });
    }

    if (req.method === "POST" && ruta === "/validar") {
      const { personas } = await leerCuerpo(req);
      const cuils = (Array.isArray(personas) ? personas : []).map((p) => String(p?.cuil || "").replace(/\D/g, "")).filter((c) => c.length === 11);
      if (cuils.length === 0) return json(res, 400, { error: "No vino ningún CUIL de 11 dígitos." });
      return json(res, 200, await arrancarValidacion({ cuils }));
    }

    if (req.method === "POST" && ruta === "/registrar-obras-sociales") {
      const { empresaCuit, dryRun } = await leerCuerpo(req);
      if (String(empresaCuit || "").replace(/\D/g, "").length !== 11) return json(res, 400, { error: "Falta el CUIT de la empleadora." });
      return json(res, 200, await arrancarRegistroObrasSociales({ empresaCuit, dryRun }));
    }

    if (req.method === "POST" && ruta === "/detener") {
      if (ocupado()) corrida.señal.cortada = true;
      return json(res, 200, { detenida: ocupado() });
    }

    return json(res, 404, { error: "No existe esa operación." });
  } catch (e) {
    return json(res, e?.codigo === "ocupado" ? 409 : 500, { error: e?.message || "Error inesperado.", codigo: e?.codigo });
  }
});

// SOLO 127.0.0.1. La primera de las tres barreras, y la única que no depende del cliente.
servidor.listen(PUERTO, "127.0.0.1", () => {
  const url = urlWeProdu();
  const atendido = origenAtendido(url);
  const archivo = guardarCodigoEnArchivo(TOKEN);

  /*
    Se abre el navegador SOLO si todavía no hay ningún navegador emparejado.

    El emparejamiento es de una vez y para siempre —el token se guarda en el `localStorage` de
    WeProdu—, así que abrir una pestaña en cada arranque sería ruido puro para alguien que ya lo
    resolvió hace meses. Y si el token cambiara (se borró el archivo, es otra máquina), la marca deja
    de coincidir y el flujo se vuelve a disparar solo: no hay nada que reconfigurar.

    El `#` es clave: el token va en el FRAGMENTO, que no viaja al servidor. Ver `emparejamiento.mjs`.
  */
  const abrio = !emparejado && abrirNavegador(`${url}/asistente/emparejar#token=${TOKEN}`);
  console.log(banner({ version: VERSION, token: TOKEN, url, archivo, abrio, atendido }));
});

servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  El puerto ${PUERTO} ya está ocupado.\n\n  Probablemente el Asistente ya esté corriendo en otra ventana: usá esa.\n`);
    process.exit(1);
  }
  console.error("\n  No pude arrancar:", e?.message || e, "\n");
  process.exit(1);
});
