import test from "node:test";
import assert from "node:assert/strict";
import { ADVERTENCIA_DIRECTORES_LRT, advertenciaDeModalidad, esModalidadDirectoresLrt, tipoDeContratoWeprodu, tipoDeModalidadArca, tipoDeRelacion } from "./modalidadArca.js";
const LRT = "LRT(Direc.SA, Municip.Org.cent.y descent.Emp.Mixta,docent.priv.opúbl.de jurisd.incorp. o no al SIJP";
const INDETERMINADO = "A tiempo completo indeterminado/Trabajo permanente";
const PLAZO = "A tiempo completo determinado (contrato a plazo fijo)";
test("la modalidad de directores (LRT) lleva la advertencia; las demás, ninguna", () => {
    assert.equal(esModalidadDirectoresLrt(LRT), true);
    assert.equal(advertenciaDeModalidad(LRT), ADVERTENCIA_DIRECTORES_LRT);
    assert.equal(advertenciaDeModalidad(` ${LRT.toLowerCase()}`), ADVERTENCIA_DIRECTORES_LRT);
    assert.equal(advertenciaDeModalidad(INDETERMINADO), "");
    assert.equal(advertenciaDeModalidad(PLAZO), "");
    assert.equal(advertenciaDeModalidad(""), "");
    assert.equal(advertenciaDeModalidad(undefined), "");
});
test("el tipo de un contrato de WeProdu sale de su nombre, con o sin el sufijo de la empleadora", () => {
    assert.equal(tipoDeContratoWeprodu("Tiempo Indeterminado"), "Indeterminado");
    assert.equal(tipoDeContratoWeprodu("Plazo fijo 6x6"), "Plazo fijo");
    assert.equal(tipoDeContratoWeprodu("Plazo fijo 5x7"), "Plazo fijo");
    assert.equal(tipoDeContratoWeprodu("Jornada"), "Jornada");
    assert.equal(tipoDeContratoWeprodu("Jornada 2030 S.R.L."), "Jornada");
    // Lo que no se reconoce queda con su nombre: el filtro lo muestra como una opción más.
    assert.equal(tipoDeContratoWeprodu("Eventual"), "Eventual");
});
test("sin contrato, el tipo es la modalidad que declara ARCA («indeterminado» no es «determinado»)", () => {
    assert.equal(tipoDeModalidadArca(INDETERMINADO), "Indeterminado");
    assert.equal(tipoDeModalidadArca(PLAZO), "Plazo fijo");
    assert.equal(tipoDeModalidadArca(LRT), "Directores (LRT)");
    assert.equal(tipoDeModalidadArca(""), "Sin modalidad");
});
test("con contrato manda el tipo de WeProdu: una jornada declarada en ARCA como plazo fijo es una jornada", () => {
    assert.equal(tipoDeRelacion(["Jornada"], PLAZO), "Jornada");
    assert.equal(tipoDeRelacion(["Tiempo Indeterminado"], LRT), "Indeterminado");
    assert.equal(tipoDeRelacion([], LRT), "Directores (LRT)");
    // La misma relación en varios proyectos: un solo tipo aunque haya varios contratos.
    assert.equal(tipoDeRelacion(["Tiempo Indeterminado", "Tiempo Indeterminado"], INDETERMINADO), "Indeterminado");
    assert.equal(tipoDeRelacion(["Tiempo Indeterminado", "Plazo fijo 6x6"], INDETERMINADO), "Indeterminado + Plazo fijo");
});
