import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificarPantalla } from "./clasificarPantalla.js";
const MANAGE = "https://app.sign.dropbox.com/home/manage";
const TEXTO_MANAGE = "Documentos\nFirmar documentos\nPlantillas\nEsperando mi firma\nSolicitud de firma enviada";
const TEXTO_REVISAR = "Revisar y enviar\nTítulo del documento\nAgregar un destinatario en CC\nEnviar para firmar";
const TEXTO_LIMITE = "Revisar y enviar\nSe detectó el siguiente error:\nDebido a la seguridad de la cuenta, no puedes enviar más solicitudes de firma hasta mañana";
const TEXTO_LOGIN = "Iniciar sesión\nCorreo electrónico\nContraseña\nContinuar";
const TEXTO_EDITOR = "Insertar campos\nCampos\nDocumentos\nFirma\nIniciales\nSiguiente";
test("el límite gana aunque la URL sea la de revisión", () => {
    assert.equal(clasificarPantalla("https://app.sign.dropbox.com/request/review", TEXTO_LIMITE), "limite");
});
test("login por URL o por texto", () => {
    assert.equal(clasificarPantalla("https://www.dropbox.com/login?cont=...", ""), "login");
    assert.equal(clasificarPantalla("https://app.sign.dropbox.com/account/logIn", TEXTO_LOGIN), "login");
    assert.equal(clasificarPantalla("https://app.sign.dropbox.com/", TEXTO_LOGIN), "login");
});
test("manage, editor y revisar", () => {
    assert.equal(clasificarPantalla(MANAGE, TEXTO_MANAGE), "manage");
    assert.equal(clasificarPantalla("https://app.sign.dropbox.com/prep/xyz", TEXTO_EDITOR), "editor");
    assert.equal(clasificarPantalla("https://app.sign.dropbox.com/request/review", TEXTO_REVISAR), "revisar");
});
test("lo que no se reconoce es desconocida, no manage", () => {
    assert.equal(clasificarPantalla("https://app.sign.dropbox.com/otra", "Página no encontrada"), "desconocida");
});
import { pasoDeLogin } from "./clasificarPantalla.js";
const OAUTH = "https://www.dropbox.com/oauth2/authorize?client_id=x&response_type=code";
const vista = (v) => ({ url: OAUTH, texto: "", hayEmail: false, hayClave: false, hayCodigo: false, hayCaptcha: false, emailCargado: false, claveEnviada: false, ...v });
test("la página de OAuth es login", () => {
    assert.equal(clasificarPantalla(OAUTH, "Iniciar sesión\nCorreo electrónico\nContinuar"), "login");
});
test("login en dos pasos: primero el email, después la contraseña", () => {
    assert.equal(pasoDeLogin(vista({ hayEmail: true, texto: "Iniciar sesión\nCorreo electrónico\nContinuar" })), "email");
    assert.equal(pasoDeLogin(vista({ hayEmail: true, emailCargado: true })), "esperar");
    assert.equal(pasoDeLogin(vista({ hayEmail: true, hayClave: true, emailCargado: true })), "clave");
    assert.equal(pasoDeLogin(vista({ hayClave: true, claveEnviada: true, emailCargado: true })), "esperar");
});
test("llegar al listado es listo", () => {
    assert.equal(pasoDeLogin(vista({ url: MANAGE, texto: TEXTO_MANAGE })), "listo");
});
test("segundo factor, captcha y contraseña incorrecta cortan con su código", () => {
    assert.equal(pasoDeLogin(vista({ texto: "Verificación en dos pasos\nIngresá el código que te enviamos", claveEnviada: true })), "login_requiere_2fa");
    assert.equal(pasoDeLogin(vista({ hayCodigo: true, claveEnviada: true })), "login_requiere_2fa");
    assert.equal(pasoDeLogin(vista({ hayCaptcha: true, hayClave: true })), "login_requiere_captcha");
    assert.equal(pasoDeLogin(vista({ hayClave: true, claveEnviada: true, texto: "Contraseña incorrecta. Volvé a intentarlo." })), "login_clave_incorrecta");
});
test("el consentimiento de OAuth no se acepta solo", () => {
    assert.equal(pasoDeLogin(vista({ texto: "Dropbox Sign quiere acceso a tu cuenta\nPermitir\nCancelar" })), "login_requiere_autorizacion");
});
test("el login de Dropbox Sign con «Iniciar sesión con Dropbox»", () => {
    assert.equal(pasoDeLogin(vista({ url: "https://app.sign.dropbox.com/account/logIn", texto: "Iniciar sesión con Dropbox" })), "boton_dropbox");
});
