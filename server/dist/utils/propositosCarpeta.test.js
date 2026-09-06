/**
 * La inferencia del backfill, fijada contra la verdad de campo.
 *
 * Estos seis nombres son los que hay HOY en el tenant demo, verificados contra Dropbox. Son una
 * ASERCIÓN, no la entrada del script: si la inferencia devuelve otra cosa, el que está mal es el
 * script — el mapeo es lo que se sabe que es cierto.
 *
 * Ojo con «firmados»: la carpeta se llama «Requested signatures» porque ese nombre lo pone Dropbox
 * Sign. Es el ejemplo más claro de por qué el propósito no puede deducirse del nombre.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferirPropositos, esProposito, PROPOSITOS, VALORES_PROPOSITO, etiquetaProposito } from "./propositosCarpeta.js";
const carpeta = (dropboxCarpeta, detalle = "") => ({ dropboxCarpeta, detalle });
/** Lo verificado contra la cuenta real. */
const VERDAD_DE_CAMPO = [
    ["/WEPRODU/ARCA/Alta temprana de Arca", "alta_temprana"],
    ["/WEPRODU/ARCA/Constancia de cuit", "constancia_cuit"],
    ["/WEPRODU/ARCA/Sin cuit", "sin_cuit"],
    ["/HelloSign/Outbox", "outbox"],
    ["/HelloSign/Pendbox", "pendbox"],
    ["/HelloSign/Requested signatures", "firmados"],
];
describe("inferencia contra la verdad de campo", () => {
    for (const [ruta, esperado] of VERDAD_DE_CAMPO) {
        it(`${ruta} → ${esperado}`, () => {
            const p = inferirPropositos(carpeta(ruta));
            assert.deepEqual(p, [esperado], `${ruta} infirió [${p.join(", ")}]`);
        });
    }
    it("las seis son distintas entre sí: ninguna se pisa con otra", () => {
        // Si dos rutas reales infirieran el mismo propósito, la resolución venía eligiendo por orden de
        // carga — o sea, al azar desde el punto de vista de quien configuró.
        const todos = VERDAD_DE_CAMPO.map(([r]) => inferirPropositos(carpeta(r))[0]);
        assert.equal(new Set(todos).size, 6);
    });
    it("la nota libre también cuenta, no solo el nombre", () => {
        // El `detalle` de «Sin cuit» en producción menciona CUIT/CUIL: tiene que seguir matcheando.
        assert.deepEqual(inferirPropositos(carpeta("/x/Otra", "Personas sin CUIT/CUIL: comprobante de validación manual")), ["sin_cuit"]);
    });
});
describe("el caso que motiva todo el cambio: la carpeta renombrada", () => {
    it("«Alta ARCA» todavía se infiere", () => {
        // Se agregó `arca` al patrón justamente por esto.
        assert.deepEqual(inferirPropositos(carpeta("/WEPRODU/ARCA/Alta ARCA")), ["alta_temprana"]);
    });
    it("pero un renombre razonable SÍ deja de matchear, y por eso el patrón no alcanza", () => {
        // «Acuses» es un nombre perfectamente sensato para la misma carpeta. Con el patrón como única
        // verdad, esto resuelve a nada: la transición no se dispara, sin error y sin log. Es el fallo
        // silencioso que el campo `proposito` viene a eliminar — y este test lo deja escrito.
        assert.deepEqual(inferirPropositos(carpeta("/WEPRODU/ARCA/Acuses")), []);
    });
    it("«Requested signatures» renombrada a «Firmados» deja de matchear", () => {
        // Al revés de lo que uno esperaría: el patrón busca «requested» + «signature», así que traducir
        // el nombre al castellano rompe el matcheo.
        assert.deepEqual(inferirPropositos(carpeta("/HelloSign/Firmados")), []);
    });
});
describe("la fuente tipada", () => {
    it("no hay valores repetidos", () => {
        assert.equal(new Set(VALORES_PROPOSITO).size, VALORES_PROPOSITO.length);
    });
    it("todos tienen etiqueta y descripción: el desplegable se arma con eso", () => {
        for (const p of PROPOSITOS) {
            assert.ok(p.etiqueta.trim().length > 0, `${p.valor} sin etiqueta`);
            assert.ok(p.descripcion.trim().length > 0, `${p.valor} sin descripción`);
            assert.ok(p.patrones.length > 0, `${p.valor} sin patrones`);
        }
    });
    it("`esProposito` acepta lo válido y rechaza lo demás", () => {
        assert.equal(esProposito("outbox"), true);
        assert.equal(esProposito("alta_temprana_afip"), false, "no confundir con el `tipoImpositivo`, que es otra clave");
        assert.equal(esProposito(""), false);
        assert.equal(esProposito(undefined), false);
    });
    it("la etiqueta cae al valor crudo antes que mostrar vacío", () => {
        assert.equal(etiquetaProposito("outbox"), "Outbox (para firmar)");
        assert.equal(etiquetaProposito("inventado"), "inventado");
    });
});
