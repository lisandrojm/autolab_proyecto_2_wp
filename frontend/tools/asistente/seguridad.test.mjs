/**
 * Las barreras del Asistente. Estos tests son los que no se pueden perder.
 *
 *   node --test tools/asistente/seguridad.test.mjs
 *
 * El Asistente maneja un navegador con la sesión de ARCA de una empresa real, y cualquier página que
 * el administrativo tenga abierta puede intentar hablarle. Un `Access-Control-Allow-Origin: *`
 * agregado sin pensar, o un endpoint nuevo que se olvide de mirar el token, convierten «abrí WeProdu»
 * en «cualquier sitio maneja tu sesión de AFIP». Por eso se prueba la puerta, no solo las funciones.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { origenPermitido, tokenValido, ORIGENES_PERMITIDOS } from "./seguridad.mjs";

const AQUI = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SERVIDOR = fs.readFileSync(path.join(AQUI, "servidor.mjs"), "utf8");
/** Sin comentarios: un escaneo que se deja engañar por su propia documentación no sirve como escaneo. */
const soloCodigo = (fuente) => fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CODIGO = soloCodigo(SERVIDOR);
const SEGURIDAD_CODIGO = soloCodigo(fs.readFileSync(path.join(AQUI, "seguridad.mjs"), "utf8"));

describe("escucha solo en la máquina", () => {
  /** La única barrera que no depende del cliente: si no se puede abrir la conexión, no hay ataque. */
  it("el listen es a 127.0.0.1 y nunca a 0.0.0.0", () => {
    assert.match(CODIGO, /servidor\.listen\(PUERTO,\s*"127\.0\.0\.1"/);
    assert.ok(!/0\.0\.0\.0/.test(CODIGO), "exponerlo a la red convierte esto en un servicio remoto");
  });

  it("el puerto es fijo y no se cae a otro si está ocupado", () => {
    assert.match(CODIGO, /const PUERTO = 47653;/);
    // Buscar otro puerto libre haría que "algo más ya está escuchando acá" pase desapercibido.
    assert.match(CODIGO, /EADDRINUSE[\s\S]{0,300}process\.exit\(1\)/);
  });
});

describe("CORS con lista blanca", () => {
  it("los orígenes de WeProdu entran", () => {
    assert.ok(origenPermitido("http://localhost:5173"));
    assert.ok(origenPermitido("https://autolab.fun"));
  });

  it("cualquier otro, no", () => {
    for (const o of ["https://evil.example", "http://autolab.fun", "https://autolab.fun.evil.com", "null", "", undefined]) {
      assert.ok(!origenPermitido(o), `${o} no tendría que entrar`);
    }
  });

  /** Un subdominio olvidado de staging alcanza para que la lista deje de significar algo. */
  it("no hay comodines en la lista", () => {
    for (const o of ORIGENES_PERMITIDOS) assert.ok(!o.includes("*"), `${o} tiene comodín`);
  });

  it("nunca se responde con `*`", () => {
    assert.ok(!/Allow-Origin["'\s,]*[:,]\s*["']\*/.test(CODIGO), "eso le abre la puerta a cualquier sitio");
    // El origen que se devuelve es el que vino, y solo después de validarlo.
    assert.match(CODIGO, /if \(!origenPermitido\(origen\)\) return false/);
  });

  it("el preflight de un origen ajeno se rechaza", () => {
    assert.match(CODIGO, /res\.writeHead\(conCors \? 204 : 403\)/);
  });
});

describe("token de emparejamiento", () => {
  it("se compara en tiempo constante", () => {
    // Un `===` corta en el primer carácter distinto, y contra un servicio local esa diferencia
    // alcanza para adivinar el token de a un carácter por vez.
    assert.match(SEGURIDAD_CODIGO, /timingSafeEqual/);
    assert.ok(!/recibido === esperado|esperado === recibido/.test(SEGURIDAD_CODIGO));
  });

  it("largos distintos no explotan, devuelven false", () => {
    assert.equal(tokenValido("corto", "muchísimo más largo"), false);
  });

  it("compara de verdad", () => {
    const t = "a".repeat(64);
    assert.equal(tokenValido(t, t), true);
    assert.equal(tokenValido("b".repeat(64), t), false);
    assert.equal(tokenValido("", t), false);
    assert.equal(tokenValido(undefined, t), false);
  });

  it("sale de un generador criptográfico, no de Math.random", () => {
    assert.match(SEGURIDAD_CODIGO, /randomBytes\(32\)/);
    assert.ok(!/Math\.random/.test(SEGURIDAD_CODIGO), "un token adivinable es lo mismo que no tener token");
  });

  /**
   * EL ORDEN IMPORTA. El token se mira ANTES de elegir la ruta, así que un endpoint nuevo agregado
   * por distracción nace protegido. Si la autorización fuera cosa de cada handler, sería cuestión de
   * tiempo que uno se olvide.
   */
  it("se valida antes de mirar la ruta, no dentro de cada endpoint", () => {
    const puerta = CODIGO.indexOf("tokenValido(req.headers");
    assert.ok(puerta > 0, "tiene que haber un chequeo de token en la puerta");
    for (const ruta of ["/estado", "/chrome", "/validar", "/progreso", "/detener", "/registrar-obras-sociales"]) {
      assert.ok(CODIGO.indexOf(`"${ruta}"`) > puerta, `${ruta} se atiende antes de validar el token`);
    }
  });
});

describe("la superficie es chica y fija", () => {
  /** Un endpoint genérico que ejecute comandos convertiría esto en una puerta trasera con CORS. */
  it("no ejecuta nada que venga en el request", () => {
    assert.ok(!/\bexec\(|execSync|spawnSync|new Function|eval\(/.test(CODIGO), "el Asistente no corre comandos arbitrarios");
    // `spawn` solo puede aparecer en `chrome.mjs`, con el binario que el propio Asistente resolvió.
    assert.ok(!/\bspawn\(/.test(CODIGO), "abrir procesos es cosa de chrome.mjs, con una ruta que no viene del request");
  });

  it("las operaciones son exactamente las que están documentadas", () => {
    const rutas = [...CODIGO.matchAll(/ruta === "([^"]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(rutas, ["/chrome", "/chrome/ruta", "/detener", "/emparejar", "/estado", "/progreso", "/registrar-obras-sociales", "/validar"]);
  });

  /**
   * `/emparejar` es la ÚNICA ruta sin token, y tiene que seguir siendo la única.
   *
   * Está antes de la guarda a propósito —es de donde se saca el token, así que pedírselo sería un
   * callejón sin salida— pero eso también la vuelve el lugar donde va a aparecer el próximo endpoint
   * público «que total no hace nada». Este test es la línea: todo lo que se atienda antes del
   * `tokenValido` queda expuesto a cualquier proceso de la máquina.
   *
   * Ver `emparejamiento.test.mjs` para lo que esa página puede y no puede contener.
   */
  it("solo `/emparejar` se atiende antes de la guarda del token", () => {
    const antesDelToken = CODIGO.slice(0, CODIGO.indexOf("if (!tokenValido("));
    const publicas = [...antesDelToken.matchAll(/ruta === "([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(publicas, ["/emparejar"]);
  });

  it("lo que no matchea es 404, no un fallback que adivine", () => {
    assert.match(CODIGO, /return json\(res, 404, \{ error: "No existe esa operación\." \}\)/);
  });

  it("el cuerpo tiene tope: un cliente local no puede llenar la memoria del proceso", () => {
    assert.match(CODIGO, /datos\.length > 1_000_000/);
  });
});

describe("no toca credenciales", () => {
  it("no hay nada parecido a una clave fiscal", () => {
    assert.ok(!/password|contrase|clave\s*=/i.test(SERVIDOR.replace(/clave fiscal/gi, "")), "el login es manual, siempre");
  });

  /**
   * El Asistente LEE de ARCA y devuelve; quien GUARDA en WeProdu es el navegador, con la sesión de
   * quien está sentado ahí. Si acá hubiera un token de WeProdu, sería una credencial más viviendo en
   * un servicio local — y de las que dan acceso a los datos de todos los clientes.
   */
  it("valida con `soloLeer` y no guarda en WeProdu", () => {
    assert.match(CODIGO, /soloLeer: true/);
    assert.ok(!/WEPRODU_TOKEN|Authorization|Bearer/.test(SERVIDOR), "el Asistente no tiene ni necesita credenciales de WeProdu");
  });
});

describe("una corrida por vez", () => {
  /** Dos tandas encimadas se pisan la misma pantalla de ARCA y el resultado queda corrido. */
  it("la segunda se rechaza con 409, no se encola", () => {
    assert.match(CODIGO, /if \(ocupado\(\)\) throw Object\.assign\(new Error\("Ya hay una corrida en curso\."\)/);
    assert.match(CODIGO, /codigo === "ocupado" \? 409 : 500/);
  });

  /**
   * «Una por vez» tiene que significar UNA A LA VEZ, no una por arranque.
   *
   * La guarda miraba `if (corrida)` a secas, y `corrida` nunca volvía a null: la primera validación
   * dejaba el turno tomado para siempre y todo lo que venía después contestaba «Ya hay una corrida en
   * curso». Desde WeProdu se veía un botón que dejó de funcionar sin ninguna razón visible, y la
   * única salida era reiniciar el Asistente — que nadie tiene motivo para sospechar.
   */
  it("una corrida TERMINADA libera el turno", () => {
    assert.match(CODIGO, /const ocupado = \(\) => !!corrida && !corrida\.terminada;/);
    assert.ok(!/if \(corrida\)/.test(CODIGO), "mirar solo si existe deja el turno tomado para siempre");
  });
});
