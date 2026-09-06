import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CBU_DIGITOS, soloDigitosCbu, faltanDigitosCbu, cbuIncompleto, contadorCbu } from "./cbu.js";

/**
 * UN CBU MAL CARGADO NO FALLA ACÁ: FALLA EN EL BANCO.
 *
 * Por eso se prueba la limpieza y no solo el largo. El caso que importa es el pegado desde el
 * homebanking, que viene con espacios o guiones: si entra tal cual, el campo tiene 27 caracteres, la
 * validación por largo lo rechaza y quien lo cargó no entiende por qué —el número que ve es el
 * correcto—. Y al revés: si se aceptara con guiones, se guarda un dato con el que no se puede
 * transferir y eso aparece semanas después.
 */
const VALIDO = "0170099920000012345678"; // 22 dígitos

describe("soloDigitosCbu", () => {
  it("limpia lo que se pega del homebanking", () => {
    assert.equal(soloDigitosCbu("0170 0999 2000 0012 3456 78"), VALIDO);
    assert.equal(soloDigitosCbu("0170-0999-2000-0012-3456-78"), VALIDO);
    assert.equal(soloDigitosCbu("  0170099920000012345678  "), VALIDO);
  });

  it("corta en 22: los de más nunca iban a servir", () => {
    assert.equal(soloDigitosCbu(VALIDO + "999").length, CBU_DIGITOS);
    assert.equal(soloDigitosCbu(VALIDO + "999"), VALIDO);
  });

  it("saca las letras, no las convierte en nada raro", () => {
    assert.equal(soloDigitosCbu("CBU: 0170099920000012345678"), VALIDO);
    assert.equal(soloDigitosCbu("abc"), "");
    assert.equal(soloDigitosCbu(""), "");
  });
});

describe("cbuIncompleto — vacío no es lo mismo que a medias", () => {
  it("vacío se puede guardar: es «todavía no lo tengo»", () => {
    assert.equal(cbuIncompleto(""), false);
    assert.equal(cbuIncompleto("   "), false);
  });

  it("empezado y corto NO se puede guardar: parece cargado y está roto", () => {
    assert.equal(cbuIncompleto("017009992000001234567"), true); // 21
    assert.equal(cbuIncompleto("1"), true);
  });

  it("completo está bien", () => {
    assert.equal(cbuIncompleto(VALIDO), false);
    // Con guiones también: se limpian antes de contar.
    assert.equal(cbuIncompleto("0170-0999-2000-0012-3456-78"), false);
  });
});

describe("faltanDigitosCbu y el contador", () => {
  it("cuenta sobre los DÍGITOS, no sobre los caracteres escritos", () => {
    assert.equal(faltanDigitosCbu("0170 0999"), CBU_DIGITOS - 8);
    assert.equal(faltanDigitosCbu(VALIDO), 0);
    assert.equal(faltanDigitosCbu(""), CBU_DIGITOS);
  });

  it("el contador dice los dos números desde el primer dígito", () => {
    assert.equal(contadorCbu(""), "22 dígitos, sin guiones.");
    assert.equal(contadorCbu("1"), "1 de 22 · faltan 21.");
    assert.equal(contadorCbu("017009992000001234567"), "21 de 22 · falta 1.");
    assert.equal(contadorCbu(VALIDO), "22 de 22 ✓");
  });
});
