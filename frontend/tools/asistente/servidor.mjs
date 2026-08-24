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
     son estas seis y nada más.

  Ver `seguridad.mjs` para las tres barreras y para qué NO cubren.
*/
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
import { ORIGENES_PERMITIDOS, origenPermitido, tokenDeInstalacion, tokenValido } from "./seguridad.mjs";
import { abrirChrome, chromeAbierto, estadoSesionArca, rutaChrome, guardarRutaChrome, CDP_URL } from "./chrome.mjs";

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

const TOKEN = tokenDeInstalacion();

/** La corrida en curso. Una sola por vez: dos tandas encimadas se pisan la pantalla de ARCA. */
let corrida = null;

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
  return { ok: true, version: VERSION, chromeAbierto: await chromeAbierto(), sesionArca: await estadoSesionArca(), chromeEncontrado: !!rutaChrome(), corriendo: !!corrida };
}

/**
 * Arranca una corrida de validación. Devuelve enseguida: el progreso se sigue por `/progreso`.
 *
 * `soloLeer` va SIEMPRE en true. Este proceso no guarda nada en WeProdu — no tiene con qué, y es a
 * propósito (ver la cabecera del archivo).
 */
async function arrancarValidacion({ cuils }) {
  if (corrida) throw Object.assign(new Error("Ya hay una corrida en curso."), { codigo: "ocupado" });
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
      corrida.resultado = { items: r.items, errores: r.errores, sinSesion: r.sinSesion, faltaron: r.faltaron };
      emitir({ tipo: "fin", ...corrida.resultado });
    })
    .catch((e) => {
      corrida.error = e?.message || String(e);
      emitir({ tipo: "fallo", mensaje: corrida.error });
    })
    .finally(() => {
      corrida.terminada = true;
      for (const enviar of oyentes) enviar({ tipo: "cerrado" });
    });

  return { arrancada: true, total: cuils.length };
}

async function arrancarRegistroObrasSociales({ empresaCuit, dryRun }) {
  if (corrida) throw Object.assign(new Error("Ya hay una corrida en curso."), { codigo: "ocupado" });
  const { registrarObrasSociales } = await import("../registrar-obras-sociales.mjs");

  const eventos = [];
  const oyentes = new Set();
  const emitir = (e) => {
    eventos.push(e);
    for (const enviar of oyentes) enviar(e);
  };
  corrida = { señal: { cortada: false }, eventos, oyentes, terminada: false, resultado: null, error: null };

  registrarObrasSociales({ empleadora: empresaCuit, escribir: !dryRun, cdpUrl: CDP_URL, onPaso: (p) => emitir({ tipo: "paso", ...p }) })
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

  try {
    if (req.method === "GET" && ruta === "/estado") return json(res, 200, await estado());
    if (req.method === "GET" && ruta === "/progreso") return abrirProgreso(req, res);

    if (req.method === "POST" && ruta === "/chrome") {
      const r = await abrirChrome();
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
      if (corrida) corrida.señal.cortada = true;
      return json(res, 200, { detenida: !!corrida });
    }

    return json(res, 404, { error: "No existe esa operación." });
  } catch (e) {
    return json(res, e?.codigo === "ocupado" ? 409 : 500, { error: e?.message || "Error inesperado.", codigo: e?.codigo });
  }
});

// SOLO 127.0.0.1. La primera de las tres barreras, y la única que no depende del cliente.
servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════════╗
  ║   Asistente WeProdu ${VERSION}                                    ║
  ╚══════════════════════════════════════════════════════════════╝

  Ya está funcionando. Dejá esta ventana abierta y volvé a WeProdu.

  Si te pide el código de emparejamiento, es este:

      ${TOKEN}

  Se pide una sola vez por navegador. No lo compartas: con ese código
  se puede manejar el Chrome de ARCA de esta máquina.
`);
});

servidor.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n  El puerto ${PUERTO} ya está ocupado.\n\n  Probablemente el Asistente ya esté corriendo en otra ventana: usá esa.\n`);
    process.exit(1);
  }
  console.error("\n  No pude arrancar:", e?.message || e, "\n");
  process.exit(1);
});
