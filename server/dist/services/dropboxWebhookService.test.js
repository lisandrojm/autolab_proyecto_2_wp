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
const firmar = (buf, secret = SECRET) => crypto.createHmac("sha256", secret).update(buf).digest("hex");
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
import { autorizadosDe, programarEscaneo, limpiarPendientes } from "./dropboxWebhookService.js";
/**
 * UNA CUENTA DE DROPBOX PUEDE ESTAR EN DOS ORGANIZACIONES, y una notificación puede traer varias
 * cuentas. Las dos cosas son arrays, y quedarse con el primero de cualquiera de ellos deja a alguien
 * sin escanear — sin ningún síntoma del lado del que pierde: los archivos están en Dropbox y sus
 * contratos simplemente no avanzan.
 */
describe("autorizadosDe — quien firmo de verdad este aviso", () => {
    const tA = { _id: "tenantA", appSecret: "secret-de-A" };
    const tB = { _id: "tenantB", appSecret: "secret-de-B" };
    it("con la misma app en dos organizaciones, las dos quedan autorizadas", () => {
        const compartido = { ...tB, appSecret: tA.appSecret };
        const autorizados = autorizadosDe([tA, compartido], CUERPO, firmar(CUERPO, tA.appSecret));
        assert.deepEqual(autorizados.map((t) => t._id), ["tenantA", "tenantB"]);
    });
    it("la firma de una organizacion NO dispara el escaneo de la otra", () => {
        // El caso que importa: alguien conoce el account_id de B, pero firma con el secret de A.
        const autorizados = autorizadosDe([tA, tB], CUERPO, firmar(CUERPO, tA.appSecret));
        assert.deepEqual(autorizados.map((t) => t._id), ["tenantA"]);
    });
    it("una firma que no es de nadie no autoriza a ninguno", () => {
        const autorizados = autorizadosDe([tA, tB], CUERPO, firmar(CUERPO, "secret-de-un-tercero"));
        assert.equal(autorizados.length, 0);
    });
    it("no corta en el primero que valida", () => {
        // Si el filtro fuera un `find`, esto devolveria uno solo y el segundo tenant nunca escanearia.
        const mismos = [tA, { ...tB, appSecret: tA.appSecret }, { _id: "tenantC", appSecret: tA.appSecret }];
        assert.equal(autorizadosDe(mismos, CUERPO, firmar(CUERPO, tA.appSecret)).length, 3);
    });
});
/**
 * EL DEBOUNCE AGRUPA LA RAFAGA, PERO NO LA POSTERGA.
 *
 * Las dos mitades importan y se rompen al reves una de otra: sin agrupar, veinte archivos son veinte
 * escaneos encimados peleandose el candado; reiniciando el reloj en cada aviso, una subida continua
 * corre la ventana sola y el escaneo no ocurre NUNCA — justo en la subida grande donde mas se lo
 * necesita.
 */
describe("programarEscaneo — la ventana", () => {
    const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
    it("dos avisos dentro de la ventana son UN solo escaneo", async () => {
        limpiarPendientes();
        const corridas = [];
        const opts = { esperaMs: 30, correr: async (id) => void corridas.push(id) };
        programarEscaneo("t1", opts);
        await esperar(10);
        programarEscaneo("t1", opts);
        await esperar(60);
        assert.deepEqual(corridas, ["t1"]);
    });
    it("una rafaga continua NO posterga el escaneo: sale al vencer la ventana del PRIMER aviso", async () => {
        limpiarPendientes();
        const corridas = [];
        const opts = { esperaMs: 40, correr: async (id) => void corridas.push(id) };
        programarEscaneo("t2", opts);
        // Avisos cada 10ms durante mas de una ventana entera: con un debounce que reinicia, acá no
        // habria corrido nada todavia.
        for (let i = 0; i < 5; i++) {
            await esperar(10);
            programarEscaneo("t2", opts);
        }
        assert.ok(corridas.length >= 1, "la ventana se cuenta desde el primer aviso, no desde el ultimo");
    });
    it("lo que llega DURANTE el escaneo se lleva su propia pasada", async () => {
        /*
          La diferencia con el test de arriba es CUANDO llega el segundo aviso, y es toda la regla:
    
            durante la ESPERA    ya esta cubierto — el escaneo que va a salir todavia no leyo nada
            durante el ESCANEO   NO esta cubierto — el archivo pudo entrar despues de leer esa carpeta
    
          Por eso este manda el segundo aviso a los 40ms, con la ventana de 20: para ese momento el
          escaneo ya arranco y esta a mitad de camino.
        */
        limpiarPendientes();
        const corridas = [];
        const opts = {
            esperaMs: 20,
            correr: async (id) => {
                corridas.push(id);
                await esperar(60); // el escaneo tarda: un archivo puede entrar mientras tanto
            },
        };
        programarEscaneo("t3", opts);
        await esperar(40); // la ventana vencio: el escaneo esta corriendo
        assert.equal(corridas.length, 1, "a esta altura el primer escaneo ya tiene que estar corriendo");
        programarEscaneo("t3", opts);
        await esperar(150);
        assert.equal(corridas.length, 2, "el aviso que llego mientras escaneaba tiene que forzar una segunda pasada");
    });
    it("tenants distintos no se pisan la ventana", async () => {
        limpiarPendientes();
        const corridas = [];
        const opts = { esperaMs: 20, correr: async (id) => void corridas.push(id) };
        programarEscaneo("tA", opts);
        programarEscaneo("tB", opts);
        await esperar(60);
        assert.deepEqual(corridas.sort(), ["tA", "tB"]);
    });
});
