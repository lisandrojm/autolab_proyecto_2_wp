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
