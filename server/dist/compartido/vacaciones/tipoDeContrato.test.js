import { test } from "node:test";
import assert from "node:assert/strict";
import { tipoDelCatalogo, tipoDeLaRegla, tiposSinVacaciones } from "./tipoDeContrato.js";
const TI = "6a6a6d75bcadd1748056908d";
const JORNADA = "6a6a6d74bcadd1748056906e";
const PF5x7 = "6a6a6d74bcadd1748056907b";
const PART = "6a6a6d75bcadd17480569084";
const MUSICO = "6a6a6d75bcadd17480569096";
const CATALOGO = [
    { _id: TI, name: "Tiempo Indeterminado" },
    { _id: JORNADA, name: "Jornada" },
    { _id: PF5x7, name: "Plazo fijo 5x7" },
    { _id: PART, name: "Plazo fijo 5x7 part-time" },
    { _id: MUSICO, name: "Eventual Musico Reelshort" },
];
const PLANTILLAS = [
    { name: "Jornada", data: { id: 3 }, contratoId: JORNADA },
    { name: "Eventual Musico Reelshort", data: { id: 8 }, contratoId: MUSICO },
    // Hay varias «Eventual …» que no se anidan: «Eventual» a secas es ambiguo (como en la base real).
    { name: "Eventual Crew Surrender", data: { id: 17 }, contratoId: "6a6a6d75bcadd174805690b5" },
];
test("lo creado en WeProdu: el tipo es su contrato_id, aunque tipo_contrato_id sea 0 y el nombre diga otra cosa", () => {
    assert.equal(tipoDelCatalogo({ contrato_id: JORNADA, tipo_contrato_id: 0, nombre_contrato: "Jornada" }, CATALOGO, PLANTILLAS), JORNADA);
    assert.equal(tipoDelCatalogo({ contrato_id: TI, tipo_contrato_id: 0, nombre_contrato: "Tiempo Indeterminado" }, CATALOGO), TI);
    // Un contrato_id que no está en el catálogo no se toma: se sigue por el nombre.
    assert.equal(tipoDelCatalogo({ contrato_id: "000000000000000000000000", nombre_contrato: "Jornada" }, CATALOGO), JORNADA);
});
test("lo importado de FRAME: por el nombre, con el sufijo de la empleadora y sin confundir 5x7 con 5x7 part-time", () => {
    assert.equal(tipoDelCatalogo({ tipo_contrato_id: 4, nombre_contrato: "Tiempo Indeterminado" }, CATALOGO), TI);
    assert.equal(tipoDelCatalogo({ tipo_contrato_id: 3, nombre_contrato: "Jornada 2030 S.R.L." }, CATALOGO), JORNADA);
    assert.equal(tipoDelCatalogo({ tipo_contrato_id: 10, nombre_contrato: "Plazo fijo 5x7 part-time 2030 SRL" }, CATALOGO), PART);
    assert.equal(tipoDelCatalogo({ tipo_contrato_id: 1, nombre_contrato: "Plazo fijo 5x7" }, CATALOGO), PF5x7);
});
test("sin nombre que coincida, por la plantilla (su nombre o su número si es mayor que 0)", () => {
    assert.equal(tipoDelCatalogo({ tipo_contrato_id: 8, nombre_contrato: "Eventual Musico" }, CATALOGO, PLANTILLAS), MUSICO);
    assert.equal(tipoDelCatalogo({ tipo_contrato_id: 3, nombre_contrato: "" }, CATALOGO, PLANTILLAS), JORNADA);
    // El 0 no es un número de plantilla: no se adivina.
    assert.equal(tipoDelCatalogo({ tipo_contrato_id: 0, nombre_contrato: "" }, CATALOGO, [...PLANTILLAS, { name: "x", data: { id: 0 }, contratoId: TI }]), null);
    assert.equal(tipoDelCatalogo({ tipo_contrato_id: null, nombre_contrato: "Contrato custom" }, CATALOGO, PLANTILLAS), null);
});
test("las reglas viejas de Visibilidad (número y nombre de FRAME) se traducen al tipo del catálogo", () => {
    assert.equal(tipoDeLaRegla({ contractId: 4, contractName: "Tiempo indeterminado", vacationsEnabled: true }, CATALOGO, PLANTILLAS), TI);
    assert.equal(tipoDeLaRegla({ contractId: 3, contractName: "Jornada", vacationsEnabled: false }, CATALOGO, PLANTILLAS), JORNADA);
    assert.equal(tipoDeLaRegla({ contractId: 8, contractName: "Eventual Musico ", vacationsEnabled: false }, CATALOGO, PLANTILLAS), MUSICO);
    // La nueva trae el tipo: gana sobre lo demás.
    assert.equal(tipoDeLaRegla({ tipoContratoId: PF5x7, contractId: 3, contractName: "Jornada" }, CATALOGO, PLANTILLAS), PF5x7);
    // «Eventual» a secas no es ningún tipo del catálogo: no se inventa.
    assert.equal(tipoDeLaRegla({ contractId: 5, contractName: "Eventual" }, CATALOGO, PLANTILLAS), null);
});
test("los tipos sin vacaciones: sólo las reglas apagadas, sin repetir", () => {
    const reglas = [
        { contractId: 3, contractName: "Jornada", vacationsEnabled: false },
        { tipoContratoId: JORNADA, vacationsEnabled: false },
        { contractId: 4, contractName: "Tiempo indeterminado", vacationsEnabled: true },
        { contractId: 5, contractName: "Eventual", vacationsEnabled: false },
    ];
    assert.deepEqual(tiposSinVacaciones(reglas, CATALOGO, PLANTILLAS), [JORNADA]);
    assert.deepEqual(tiposSinVacaciones(undefined, CATALOGO), []);
});
