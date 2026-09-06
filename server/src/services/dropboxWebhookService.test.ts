import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { firmaValida } from "./dropboxWebhookService.js";

/**
 * LA FIRMA ES LO ÚNICO QUE PROTEGE AL WEBHOOK.
 *
 * El endpoint va sin autenticación —lo llama Dropbox, no un usuario— así que si esta función se
 * ablanda, cualquiera que conozca la URL puede disparar escaneos contra ARCA y Dropbox a voluntad. Y
 * si se endurece de más, deja de funcionar el webhook entero sin ningún síntoma más que «no pasa
 * nada»: el caso más difícil de diagnosticar, porque desde afuera se ve igual que no haberlo
 * configurado.
 */
const SECRET = "un-app-secret-de-prueba";
const CUERPO = Buffer.from(JSON.stringify({ list_folder: { accounts: ["dbid:AABBCC"] } }), "utf8");
const firmar = (buf: Buffer, secret = SECRET) => crypto.createHmac("sha256", secret).update(buf).digest("hex");

describe("firmaValida — el HMAC del webhook de Dropbox", () => {
  it("acepta la firma que corresponde a ese cuerpo y ese secret", () => {
    assert.equal(firmaValida(CUERPO, firmar(CUERPO), SECRET), true);
  });

  it("rechaza si el cuerpo cambió aunque sea un byte", () => {
    const otro = Buffer.from(JSON.stringify({ list_folder: { accounts: ["dbid:AABBCD"] } }), "utf8");
    assert.equal(firmaValida(otro, firmar(CUERPO), SECRET), false);
  });

  it("rechaza la firma hecha con otro secret: es lo que separa un tenant de otro", () => {
    assert.equal(firmaValida(CUERPO, firmar(CUERPO, "el-secret-de-otra-organizacion"), SECRET), false);
  });

  it("no se cuelga ni acepta nada con los campos vacíos", () => {
    assert.equal(firmaValida(CUERPO, "", SECRET), false);
    assert.equal(firmaValida(CUERPO, firmar(CUERPO), ""), false);
    assert.equal(firmaValida(Buffer.alloc(0), firmar(CUERPO), SECRET), false);
  });

  it("una firma más corta o más larga no rompe la comparación", () => {
    // `timingSafeEqual` TIRA si los buffers miden distinto: sin el chequeo de largo previo, una firma
    // recortada no devolvería `false`, tumbaría el handler.
    const buena = firmar(CUERPO);
    assert.doesNotThrow(() => firmaValida(CUERPO, buena.slice(0, 10), SECRET));
    assert.equal(firmaValida(CUERPO, buena.slice(0, 10), SECRET), false);
    assert.equal(firmaValida(CUERPO, buena + "00", SECRET), false);
  });

  it("el formato del JSON importa: por eso se firma el cuerpo crudo y no el reparseado", () => {
    /*
      El mismo objeto, serializado distinto. Es exactamente lo que pasaría si el handler firmara
      `JSON.stringify(req.body)` en vez del Buffer original: Dropbox manda su propio formato, y
      cualquier diferencia de espacios u orden de claves da otro hash.
    */
    const reparseado = Buffer.from(JSON.stringify(JSON.parse(CUERPO.toString()), null, 2), "utf8");
    assert.notEqual(reparseado.toString(), CUERPO.toString());
    assert.equal(firmaValida(reparseado, firmar(CUERPO), SECRET), false);
  });
});
