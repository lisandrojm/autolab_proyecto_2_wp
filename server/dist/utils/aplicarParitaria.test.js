/**
 * Tests de «aplicar paritaria».
 *
 * Run with:
 *   npx tsx --test src/utils/aplicarParitaria.test.ts
 *   – o –
 *   npm run test:escalas-634
 *
 * Lo que fija este archivo es hasta dónde llega el automatismo: el básico se reproduce exacto con el
 * porcentaje, los adicionales NO. Si alguien algún día hace que el preview se guarde solo, estos tests
 * son los que explican por qué no se puede.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aumentar, proponerEscala, proponerMontos, porcentajeAcumulado } from "./aplicarParitaria.js";
/** El 2.º tramo del acuerdo: +4,8 % sobre mayo, que rige desde el 01/06/2026. */
const TRAMO_JUNIO = 4.8;
describe("el básico sí se reproduce con el porcentaje", () => {
    it("abril × 1,048 = junio, al centavo, en el grupo 1", () => {
        // Abril (acta, Anexo A) → junio (importe cargado en el sistema). Es el dato que valida que el
        // aumento se aplica sobre el básico y no sobre el total.
        assert.equal(aumentar(1132832.62, TRAMO_JUNIO), 1187208.59);
    });
    it("la escala entera de junio sale del básico de abril", () => {
        const [fila] = proponerEscala([{ grupo: 1, basico: 1132832.62, adicionalPct: 62.5, total: 2024938.31 }], TRAMO_JUNIO);
        assert.equal(fila.basicoPropuesto, 1187208.59);
        assert.equal(fila.propuesta.adicionalMonto, 742005.37);
        assert.equal(fila.propuesta.presentismoMonto, 192921.4);
        assert.equal(fila.propuesta.total, 2122135.35);
        assert.deepEqual(fila.avisos, []);
        // El "actual → propuesto" que muestra la pantalla.
        assert.equal(fila.basicoActual, 1132832.62);
        assert.equal(fila.totalActual, 2024938.31);
    });
    it("el % adicional NO se toca: es del grupo, no del tramo", () => {
        const [fila] = proponerEscala([{ grupo: 3, basico: 1008675.31, adicionalPct: 38 }], TRAMO_JUNIO);
        assert.equal(fila.propuesta.adicionalPct, 38);
    });
    it("cuando se le pasa el acta, avisa si no coincide", () => {
        const [fila] = proponerEscala([{ grupo: 1, basico: 1132832.62, adicionalPct: 62.5 }], TRAMO_JUNIO, [{ grupo: 1, basico: 1187208.6 }]);
        assert.equal(fila.avisos.length, 1);
        assert.match(fila.avisos[0], /difiere en 0\.01/);
    });
    it("sin % adicional escala cada importe y lo dice", () => {
        // Es el caso de los convenios de actores: la escala vive en la categoría y no hay B de donde
        // derivar. Se calcula igual, pero el aviso viaja hasta la pantalla.
        const [fila] = proponerEscala([{ grupo: null, basico: 1000000, adicionalPct: null, adicionalMonto: 200000, presentismoMonto: 120000, total: 1320000, neto: 1069200 }], 10);
        assert.equal(fila.basicoPropuesto, 1100000);
        assert.equal(fila.propuesta.total, 1452000);
        assert.match(fila.avisos[0], /no tiene % adicional/);
    });
});
describe("los adicionales NO se reproducen con el porcentaje", () => {
    /**
     * Los siete adicionales del acta, abril y junio, los dos juegos literales del Anexo A. Seis dan un
     * centavo de diferencia contra `abril × 1,048`; sólo Exteriores coincide.
     */
    const ADICIONALES = [
        { clave: "antiguedad", abril: 10086.75, junio: 10570.92, propuesto: 10570.91 },
        { clave: "comidas", abril: 7477.24, junio: 7836.14, propuesto: 7836.15 },
        { clave: "meriendas", abril: 2468.21, junio: 2586.69, propuesto: 2586.68 },
        { clave: "exteriores", abril: 9312.84, junio: 9759.86, propuesto: 9759.86 },
        { clave: "subida_torre", abril: 2468.21, junio: 2586.69, propuesto: 2586.68 },
        { clave: "guarderia", abril: 106666.75, junio: 111786.76, propuesto: 111786.75 },
        { clave: "ropa", abril: 213333.87, junio: 223573.89, propuesto: 223573.9 },
    ];
    it("el porcentaje da lo que da, y se puede predecir", () => {
        const propuestos = proponerMontos(ADICIONALES.map((a) => ({ clave: a.clave, monto: a.abril })), TRAMO_JUNIO);
        assert.deepEqual(propuestos.map((p) => p.montoPropuesto), ADICIONALES.map((a) => a.propuesto));
    });
    it("cotejado con el acta, avisa en los seis que no cierran", () => {
        const propuestos = proponerMontos(ADICIONALES.map((a) => ({ clave: a.clave, monto: a.abril })), TRAMO_JUNIO, ADICIONALES.map((a) => ({ clave: a.clave, monto: a.junio })));
        const conAviso = propuestos.filter((p) => p.avisos.length).map((p) => p.clave);
        assert.deepEqual(conAviso, ["antiguedad", "comidas", "meriendas", "subida_torre", "guarderia", "ropa"]);
        assert.match(propuestos[0].avisos[0], /10570\.92/);
    });
    it("un adicional sin importe vigente no se inventa", () => {
        const [p] = proponerMontos([{ clave: "ropa", monto: null }], TRAMO_JUNIO);
        assert.equal(p.montoPropuesto, null);
        assert.match(p.avisos[0], /Sin importe vigente/);
    });
    it("distingue el mismo adicional por grupo", () => {
        const propuestos = proponerMontos([
            { clave: "antiguedad", grupo: 1, monto: 100 },
            { clave: "antiguedad", grupo: 2, monto: 200 },
        ], 10, [{ clave: "antiguedad", grupo: 2, monto: 220 }]);
        assert.deepEqual(propuestos[0].avisos, []);
        assert.deepEqual(propuestos[1].avisos, []);
        assert.equal(propuestos[1].montoPropuesto, 220);
    });
});
describe("porcentajeAcumulado", () => {
    it("los dos tramos del acuerdo dan el 14,76 % que declara el acta", () => {
        // 1,095 × 1,048 = 1,14756. El acta lo redondea a 14,76 %; acá queda el número exacto para no
        // tener el redondeo escrito a mano.
        assert.equal(porcentajeAcumulado([9.5, 4.8]), 14.756);
    });
    it("el régimen alternativo absorbe: 7 % y después 9,5 % sobre marzo no suman 16,5 %", () => {
        // El 9,5 % del régimen alternativo se calcula sobre marzo y ABSORBE el 7 % de abril, así que la
        // cadena no aplica. Este test fija que `porcentajeAcumulado` no se use para ese caso: encadenar
        // daría 17,165 %, que no es lo que dice el acta.
        assert.equal(porcentajeAcumulado([7, 9.5]), 17.165);
    });
    it("sin tramos, cero", () => {
        assert.equal(porcentajeAcumulado([]), 0);
    });
});
