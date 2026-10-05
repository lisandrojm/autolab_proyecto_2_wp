import { test } from "node:test";
import assert from "node:assert/strict";
import { escalaDeCategoria, tieneEscalaResuelta } from "./escalaCategoria.js";
const grupo = { sueldoBasico: 1000, sueldoAdicional: 100, presentismo: 110, sueldoBruto: 1210, sueldoBrutoLetras: "mil doscientos diez", neto: 980, sueldoNetoLetras: "novecientos ochenta" };
const propia = { sueldoBasico: 2000, sueldoAdicional: 0, presentismo: 200, sueldoBruto: 2200, sueldoBrutoLetras: "dos mil doscientos", neto: 1782, sueldoNetoLetras: "mil setecientos ochenta y dos" };
// Modelo A/C: la escala es del GRUPO y la comparten sus categorías (0634/11, 0131/75 moderno).
test("sin escala propia, hereda la del grupo", () => {
    const e = escalaDeCategoria({ nombre: "DIRECTOR DE PROGRAMAS" }, grupo);
    assert.equal(e.sueldoBruto, 1210);
    assert.equal(e.origen, "grupo");
});
// Modelo B: ARCA no publica grupos (0322/75, 0102/90) y la escala vive en la categoría.
test("sin grupo, usa la escala propia", () => {
    const e = escalaDeCategoria({ nombre: "TIRA", ...propia }, null);
    assert.equal(e.sueldoBruto, 2200);
    assert.equal(e.origen, "categoria");
});
test("la escala propia le gana a la del grupo", () => {
    // El grupo es el default heredado; una escala cargada EN la categoría es una decisión explícita.
    const e = escalaDeCategoria({ ...propia }, grupo);
    assert.equal(e.sueldoBruto, 2200);
    assert.equal(e.origen, "categoria");
});
/*
  «Sin escala» NO es «cobra $0». La diferencia decide si el alta se puede generar: un contrato sin
  retribución no se puede declarar ante ARCA, y mostrar $ 0,00 como si fuera un sueldo esconde
  exactamente eso. Es el caso de los 218 códigos de 0131/75 y los 8 de actores al escribir esto.
*/
test("sin escala en ningún lado, lo dice en vez de devolver 0 como si fuera un sueldo", () => {
    const e = escalaDeCategoria({ nombre: "ASISTENTE DE DIRECCION" }, null);
    assert.equal(e.sueldoBruto, 0);
    assert.equal(e.origen, null);
    assert.equal(tieneEscalaResuelta({ nombre: "X" }, null), false);
});
test("un grupo con bruto 0 no cuenta como escala cargada", () => {
    // Los 73 grupos de 0131/75 existían con importes en cero: tener grupo no es tener paritaria.
    const e = escalaDeCategoria({ nombre: "X" }, { sueldoBruto: 0, sueldoBasico: 0 });
    assert.equal(e.origen, null);
});
test("una categoría sin grupo y sin escala no rompe", () => {
    // `grupoId` pasó a ser opcional: el caso «sin grupo» es válido y esperado, no un error.
    assert.doesNotThrow(() => escalaDeCategoria({ nombre: "X" }));
    assert.equal(escalaDeCategoria({ nombre: "X" }).origen, null);
});
test("los importes llegan completos, no solo el bruto", () => {
    const e = escalaDeCategoria({}, grupo);
    assert.equal(e.sueldoBasico, 1000);
    assert.equal(e.presentismo, 110);
    assert.equal(e.neto, 980);
    assert.equal(e.sueldoBrutoLetras, "mil doscientos diez");
});
