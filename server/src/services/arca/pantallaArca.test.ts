import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarPantalla } from "./pantallaArca.js";

const SERVICIO = "https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/login/IndexContribuyente.aspx";
const ERROR_PAGE = "https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/ErrorPage.aspx";
const FIN_SESSION = "https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/FinSession.aspx";

// Texto REAL de FinSession.aspx, copiado de una corrida contra el servidor de ARCA. Se guarda entero
// a propósito: lo peligroso de esta pantalla es que trae el decorado del servicio —el título, el
// «Empleador:», el «SALIR»— y por arriba parece estar adentro.
const TEXTO_FIN_SESSION = `| Simplificación registral
 Empleador:
SALIR
 CUIT:
 Inicio como Empleador:
 ART contratada:  Inicio:
Su tiempo de sesión ha finalizado,
o ud. no ha iniciado su sesión de trabajo.
Por favor, ingrese con su clave fiscal.`;

// EL BUG. Verificado contra el servidor real: pedir la URL profunda sin sesión del servicio redirige
// acá, contesta 200, se queda en el mismo dominio, y todo lo que dice es «Ha ocurrido un error».
test("ErrorPage.aspx NO es una sesión buena", () => {
  assert.equal(clasificarPantalla(ERROR_PAGE, "Simplificación Registral Ha ocurrido un error."), "error");
});

test("el error se reconoce por la URL aunque no se haya podido leer el texto", () => {
  assert.equal(clasificarPantalla(ERROR_PAGE, ""), "error");
});

// Es a DONDE CAE de verdad la URL profunda sin sesión del servicio, en un navegador con JavaScript.
test("FinSession.aspx es sesión caída, no el servicio abierto", () => {
  assert.equal(clasificarPantalla(FIN_SESSION, TEXTO_FIN_SESSION), "login");
});

test("FinSession se reconoce por la URL aunque cambie la frase de AFIP", () => {
  assert.equal(clasificarPantalla(FIN_SESSION, "| Simplificación registral Empleador: SALIR CUIT:"), "login");
});

test("el selector de apoderado es el servicio abierto", () => {
  const texto = "CUIT: 23276025759 Ud. es apoderado de los siguientes CUITs , por favor seleccione uno para comenzar a operar: Aceptar";
  assert.equal(clasificarPantalla(SERVICIO, texto), "servicio");
});

test("la pantalla de altas también es el servicio abierto", () => {
  assert.equal(clasificarPantalla("https://serviciossegsoc.afip.gob.ar/tramites_con_clave_fiscal/MiSimplificacion/app/altas/Altas.aspx", "Registrar Nuevas Altas"), "servicio");
});

test("una sesión caída dentro del dominio es login, no servicio", () => {
  for (const t of ["Su sesión ha finalizado", "Usted no ha iniciado su sesión", "Ingrese con su Clave Fiscal"]) {
    assert.equal(clasificarPantalla(SERVICIO, t), "login", t);
  }
});

// Distinguir «me mandó al login» de «esto no es ARCA» es lo que permite que el mensaje diga qué pasó
// en vez de mandar a revisar la delegación, que era lo que estaba bien.
test("el portal y el login de AFIP son login", () => {
  assert.equal(clasificarPantalla("https://auth.afip.gob.ar/contribuyente_/login.xhtml", ""), "login");
  assert.equal(clasificarPantalla("https://portalcf.cloud.afip.gob.ar/portal/app/", "Mis Servicios"), "login");
});

test("una pestaña en blanco no es ninguna de las de ARCA", () => {
  assert.equal(clasificarPantalla("about:blank", ""), "otra");
});

// El dominio del servicio no se confunde con uno parecido: el chequeo es sobre el host de ARCA.
test("otro sitio no pasa por servicio", () => {
  assert.equal(clasificarPantalla("https://www.google.com/", "Simplificación Registral"), "otra");
});
