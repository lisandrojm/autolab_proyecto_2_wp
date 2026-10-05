/**
 * La regla que este archivo protege es una sola: **`con_fuente` no se puede afirmar sin enlaces**.
 *
 * Es el punto donde la primera entrega se equivocó al revés —trataba «no tener fuente» como una
 * falta— y es el punto donde una segunda versión se equivocaría de la manera cara: guardando un
 * booleano que dice «vigilado» y que sobrevive a que le saquen la última fuente. A partir de ahí la
 * pantalla afirma cobertura que no existe, y nadie se entera hasta que sale una paritaria y no avisa.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { estadoFuenteDe, esDeclarable, ESTADOS_DECLARABLES } from "./estadoFuenteConvenio.js";
describe("con_fuente es derivado, nunca declarado", () => {
    it("con una fuente asignada, está con_fuente", () => {
        assert.equal(estadoFuenteDe(true), "con_fuente");
    });
    it("los enlaces le ganan a cualquier cosa que diga el campo declarado", () => {
        // Si alguien escribió "sin_fuente_conocida" en la base por otro camino y después le asignaron una
        // fuente, la verdad son los enlaces. El endpoint además impide guardar esa contradicción, pero la
        // derivación tiene que aguantar sola: es la que sobrevive a un import o a un script.
        assert.equal(estadoFuenteDe(true, "sin_fuente_conocida"), "con_fuente");
        assert.equal(estadoFuenteDe(true, "no_aplica"), "con_fuente");
    });
    it("sacada la última fuente, deja de estar con_fuente", () => {
        // El caso que un booleano guardado no atraparía: nada que actualizar, porque nada se copió.
        assert.equal(estadoFuenteDe(false, "sin_revisar"), "sin_revisar");
        assert.equal(estadoFuenteDe(false, "no_aplica"), "no_aplica");
    });
    it("«con_fuente» no es declarable", () => {
        assert.equal(esDeclarable("con_fuente"), false);
        assert.equal(ESTADOS_DECLARABLES.includes("con_fuente"), false);
    });
});
describe("sin fuente, manda lo declarado", () => {
    it("ausente es sin_revisar: el default de los 2.669 es no tener el campo", () => {
        assert.equal(estadoFuenteDe(false), "sin_revisar");
        assert.equal(estadoFuenteDe(false, undefined), "sin_revisar");
        assert.equal(estadoFuenteDe(false, null), "sin_revisar");
        assert.equal(estadoFuenteDe(false, ""), "sin_revisar");
    });
    it("sin_revisar y sin_fuente_conocida NO son lo mismo", () => {
        // Es toda la razón de ser del campo: «nadie buscó» contra «se buscó y no hay nada publicado».
        // Si colapsaran, la próxima persona repetiría una búsqueda que ya se hizo.
        assert.notEqual(estadoFuenteDe(false, "sin_revisar"), estadoFuenteDe(false, "sin_fuente_conocida"));
    });
    it("no_aplica se conserva: 9999/99 no va a tener paritaria nunca", () => {
        assert.equal(estadoFuenteDe(false, "no_aplica"), "no_aplica");
    });
    it("un valor que no existe cae en sin_revisar, no rompe", () => {
        // Un estado viejo o mal tipeado tiene que degradar a «nadie buscó», que es lo único que se puede
        // afirmar sin datos. Inventar una cobertura ahí sería peor que no saber.
        assert.equal(estadoFuenteDe(false, "vigilado"), "sin_revisar");
        assert.equal(estadoFuenteDe(false, "SIN_REVISAR"), "sin_revisar");
    });
});
