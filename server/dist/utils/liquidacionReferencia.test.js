/**
 * Tests de la liquidación de referencia.
 *
 * Run with:
 *   npx tsx --test src/utils/liquidacionReferencia.test.ts
 *   – o –
 *   npm run test:escalas-634
 *
 * Escala del grupo 1 de junio 2026 y los adicionales de ese mismo tramo, los dos del acta. Lo que estos
 * tests protegen no es la suma —es fácil— sino las dos cosas que NO se pueden inventar: el carácter
 * remunerativo y el factor del neto.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { liquidacionDeReferencia } from "./liquidacionReferencia.js";
/** Grupo 1, tramo 01/06/2026. */
const ESCALA_G1_JUNIO = { basico: 1187208.59, adicionalMonto: 742005.37, presentismoMonto: 192921.4, total: 2122135.35 };
const ANTIGUEDAD = { codigo: "antiguedad", nombre: "Antigüedad", tipoCalculo: "por_anio_antiguedad", remunerativo: null, confirmado: false, monto: 10570.92, unidad: "por año" };
const COMIDAS = { codigo: "comidas", nombre: "Comidas", tipoCalculo: "por_evento", remunerativo: null, confirmado: false, monto: 7836.14, unidad: "por comida" };
const GUARDERIA = { codigo: "guarderia", nombre: "Guardería", tipoCalculo: "mensual", remunerativo: null, confirmado: false, monto: 111786.76 };
describe("liquidacionDeReferencia — grupo 1, junio 2026", () => {
    it("sin adicionales devengados, el bruto es la escala", () => {
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [ANTIGUEDAD, COMIDAS, GUARDERIA], {});
        assert.deepEqual(l.lineas, []);
        assert.equal(l.bruto, 2122135.35);
        assert.equal(l.brutoRemunerativo, 2122135.35);
        assert.equal(l.netoSugerido, 1718929.63); // 2.122.135,35 × 0,81
    });
    it("3 años de antigüedad y 2 comidas", () => {
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [ANTIGUEDAD, COMIDAS], { aniosAntiguedad: 3, cantidades: { comidas: 2 } });
        assert.equal(l.lineas.length, 2);
        assert.deepEqual(l.lineas.map((x) => [x.codigo, x.cantidad, x.monto]), [
            ["antiguedad", 3, 31712.76],
            ["comidas", 2, 15672.28],
        ]);
        assert.equal(l.bruto, 2169520.39);
        // El neto NO se calcula sobre el bruto entero: lo sin clasificar se suma entero al final.
        assert.equal(l.netoSugerido, 1766314.67);
    });
    it("la escala siempre es remunerativa; los adicionales sin clasificar van aparte", () => {
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [ANTIGUEDAD], { aniosAntiguedad: 1 });
        assert.equal(l.brutoRemunerativo, 2122135.35);
        assert.equal(l.sinClasificar, 10570.92);
        assert.equal(l.brutoNoRemunerativo, 0);
        assert.match(l.advertencias.join(" "), /no se sabe si es remunerativo/);
    });
    it("un adicional confirmado como remunerativo sí entra en la base", () => {
        const confirmado = { ...ANTIGUEDAD, remunerativo: true, confirmado: true };
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [confirmado], { aniosAntiguedad: 2 });
        assert.equal(l.sinClasificar, 0);
        assert.equal(l.brutoRemunerativo, 2143277.19); // 2.122.135,35 + 21.141,84
        assert.equal(l.netoSugerido, 1736054.52);
    });
    it("uno no remunerativo se paga y no tributa", () => {
        const noRem = { ...COMIDAS, remunerativo: false, confirmado: true };
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [noRem], { cantidades: { comidas: 1 } });
        assert.equal(l.brutoNoRemunerativo, 7836.14);
        assert.equal(l.brutoRemunerativo, 2122135.35);
        assert.equal(l.bruto, 2129971.49);
    });
});
describe("cómo se cuenta cada tipo de cálculo", () => {
    it("un mensual no se multiplica por la cantidad", () => {
        // Guardería 2 no es el doble de guardería. Cualquier cantidad > 0 lo incluye una vez.
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [GUARDERIA], { cantidades: { guarderia: 2 } });
        assert.equal(l.lineas[0].cantidad, 1);
        assert.equal(l.lineas[0].monto, 111786.76);
    });
    it("un por_evento sí se multiplica", () => {
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [COMIDAS], { cantidades: { comidas: 12 } });
        assert.equal(l.lineas[0].monto, 94033.68);
    });
    it("la antigüedad sale de los años, no de `cantidades`", () => {
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [ANTIGUEDAD], { aniosAntiguedad: 5, cantidades: { antiguedad: 99 } });
        assert.equal(l.lineas[0].cantidad, 5);
    });
    it("un porcentaje se calcula sobre la base que se le diga", () => {
        const porBasico = { codigo: "x", nombre: "Título", tipoCalculo: "porcentaje", remunerativo: true, confirmado: true, monto: null, porcentaje: 10, base: "basico" };
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [porBasico], { cantidades: { x: 1 } });
        assert.equal(l.lineas[0].monto, 118720.86);
        const porTotal = { ...porBasico, base: "total" };
        const l2 = liquidacionDeReferencia(ESCALA_G1_JUNIO, [porTotal], { cantidades: { x: 1 } });
        assert.equal(l2.lineas[0].monto, 212213.54);
    });
    it("un porcentaje sin porcentaje cargado queda afuera y se avisa", () => {
        const roto = { codigo: "x", nombre: "Título", tipoCalculo: "porcentaje", remunerativo: true, monto: null, porcentaje: null, base: "basico" };
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [roto], { cantidades: { x: 1 } });
        assert.deepEqual(l.lineas, []);
        assert.match(l.advertencias.join(" "), /quedó afuera de la cuenta/);
    });
    it("un adicional sin importe para esa fecha queda afuera y se avisa", () => {
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [{ ...COMIDAS, monto: null }], { cantidades: { comidas: 3 } });
        assert.deepEqual(l.lineas, []);
        assert.match(l.advertencias.join(" "), /no tiene importe para esa fecha/);
    });
});
describe("las advertencias", () => {
    it("el supuesto del neto se dice siempre, incluso sin adicionales", () => {
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [], {});
        assert.match(l.advertencias.join(" "), /factor 0\.81/);
    });
    it("los «a confirmar» se nombran, y una sola vez cada uno", () => {
        const l = liquidacionDeReferencia(ESCALA_G1_JUNIO, [ANTIGUEDAD, COMIDAS], { aniosAntiguedad: 2, cantidades: { comidas: 2 } });
        const aConfirmar = l.advertencias.filter((a) => a.includes("a confirmar"));
        assert.equal(aConfirmar.length, 2);
        assert.equal(new Set(l.advertencias).size, l.advertencias.length);
    });
    it("el factor del neto se puede cambiar por período", () => {
        const l = liquidacionDeReferencia({ ...ESCALA_G1_JUNIO, netoFactor: 0.83 }, [], {});
        assert.equal(l.netoFactor, 0.83);
        assert.equal(l.netoSugerido, 1761372.34);
    });
});
