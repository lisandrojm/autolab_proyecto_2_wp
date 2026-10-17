/**
 *   npx tsx --test src/services/arca/rechazoDefinitivo.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { esRechazoDefinitivo } from "./rechazoDefinitivo.js";

describe("qué rechazo de ARCA no se reintenta solo", () => {
  it("«ya posee una relación laboral activa» es del padrón: no cambia por insistir", () => {
    assert.equal(esRechazoDefinitivo("El CUIL 27440427834 ya posee una relación laboral activa."), true);
    assert.equal(esRechazoDefinitivo("Registro 1: El CUIL ya tiene un alta activa con este empleador"), true);
  });
  it("lo que puede haberse corregido, o lo que no dijo nada, se vuelve a intentar", () => {
    assert.equal(esRechazoDefinitivo("La remuneración no corresponde a la categoría informada"), false);
    assert.equal(esRechazoDefinitivo("ARCA no aceptó el texto pegado y no mostró el motivo en pantalla."), false);
    assert.equal(esRechazoDefinitivo("ARCA no contestó el «Aceptar» del pegado en 25 s: no se sabe si lo aceptó."), false);
    assert.equal(esRechazoDefinitivo(""), false);
    assert.equal(esRechazoDefinitivo(undefined), false);
  });
});
