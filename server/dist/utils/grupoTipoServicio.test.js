/**
 * La regla que separa CONTINUOS de DISCONTINUOS.
 *
 * Es una regla de ARCA, no nuestra: se verificó contra el filtro del propio Simplificación Registral
 * sobre los 293 tipos de servicio, sin excepciones. Está acá para que quede congelada — si alguien
 * "arregla" el corte, se cae esto y no un alta rechazada tres semanas después.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { grupoDeTipoServicio, tipoPerteneceAlGrupo, PRIMER_CODIGO_DISCONTINUO, GRUPO_CONTINUOS, GRUPO_DISCONTINUOS } from "./grupoTipoServicio.js";
describe("a qué grupo pertenece un tipo de servicio", () => {
    it("por debajo de 500 es CONTINUOS", () => {
        for (const c of ["000", "001", "100", "499"])
            assert.equal(grupoDeTipoServicio(c), GRUPO_CONTINUOS, c);
    });
    it("de 500 para arriba es DISCONTINUOS", () => {
        for (const c of ["500", "514", "550", "557", "560"])
            assert.equal(grupoDeTipoServicio(c), GRUPO_DISCONTINUOS, c);
    });
    /** El borde es lo único que se puede equivocar sin que se note: 499 y 500 caen en grupos distintos. */
    it("el corte está exactamente en 500", () => {
        assert.equal(PRIMER_CODIGO_DISCONTINUO, 500);
        assert.equal(grupoDeTipoServicio("499"), GRUPO_CONTINUOS);
        assert.equal(grupoDeTipoServicio("500"), GRUPO_DISCONTINUOS);
    });
    it("los ceros a la izquierda no cambian nada", () => {
        assert.equal(grupoDeTipoServicio("007"), grupoDeTipoServicio("7"));
        assert.equal(grupoDeTipoServicio("0514"), GRUPO_DISCONTINUOS);
    });
    /**
     * Sin código NO se asume un grupo. Devolver "1" por defecto sería lo cómodo y lo peligroso: el
     * grupo filtra el combo del alta, y arrancar filtrado por el grupo equivocado esconde justo los
     * tipos que la persona busca.
     */
    it("sin código no hay grupo", () => {
        for (const c of ["", "   ", null, undefined, "sin código"])
            assert.equal(grupoDeTipoServicio(c), "", String(c));
    });
});
describe("coherencia entre el tipo y el grupo declarado", () => {
    it("un tipo del grupo que dice, pasa", () => {
        assert.ok(tipoPerteneceAlGrupo("100", GRUPO_CONTINUOS));
        assert.ok(tipoPerteneceAlGrupo("514", GRUPO_DISCONTINUOS));
    });
    it("un tipo del OTRO grupo, no", () => {
        assert.ok(!tipoPerteneceAlGrupo("514", GRUPO_CONTINUOS));
        assert.ok(!tipoPerteneceAlGrupo("100", GRUPO_DISCONTINUOS));
    });
    /** Si falta uno de los dos no hay contradicción que detectar: el que decide después es el código. */
    it("sin grupo o sin tipo no hay nada que contradecir", () => {
        assert.ok(tipoPerteneceAlGrupo("514", ""));
        assert.ok(tipoPerteneceAlGrupo("", GRUPO_CONTINUOS));
    });
});
