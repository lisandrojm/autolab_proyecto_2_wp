/**
 * Tests de la resolución automática de valoración por MARGEN (en porcentaje).
 *
 * Run with:
 *   npx tsx --test src/utils/valoracionAutomatica.test.ts
 *   – o –
 *   npm run test:valoracion
 *
 * Usa el runner de Node (node:test + node:assert), igual que el resto de los utils.
 *
 * Por qué existen: de esta función sale qué categorías se le ofrecen a un contrato, o sea cuánto
 * cobra alguien. Un borde mal resuelto —el porcentaje exacto del tope, un rango abierto, dos rangos
 * que se tocan— no falla: devuelve la valoración equivocada y el error aparece recién en el sueldo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolverValoracion } from "./valoracionAutomatica.js";
/** El caso real de la pantalla: Plata hasta 20 % de margen, Oro del 20 % para arriba. */
const PLATA = { _id: "plata", orden: 1, margenDesde: null, margenHasta: 20, esDefault: true, activo: true };
const ORO = { _id: "oro", orden: 2, margenDesde: 20, margenHasta: null, esDefault: false, activo: true };
const ESCALA = [PLATA, ORO];
const nombre = (v) => (v ? String(v._id) : null);
describe("resolverValoracion — el rango", () => {
    it("un monto adentro del rango cae en su valoración", () => {
        assert.equal(nombre(resolverValoracion(8, ESCALA)), "plata");
        assert.equal(nombre(resolverValoracion(35, ESCALA)), "oro");
    });
    it("EL TOPE ES ABIERTO: el monto exacto pasa al siguiente nivel", () => {
        // Es el borde que decide si un proyecto con 20 % clavado es Plata u Oro, y el número redondo es
        // justamente el que alguien va a cargar.
        assert.equal(nombre(resolverValoracion(20, ESCALA)), "oro");
        assert.equal(nombre(resolverValoracion(19.99, ESCALA)), "plata");
    });
    it("los extremos nulos son abiertos, no cero", () => {
        // Plata no tiene mínimo: un margen chico —incluso negativo, un proyecto a pérdida— entra igual.
        assert.equal(nombre(resolverValoracion(-5, ESCALA)), "plata");
        assert.equal(nombre(resolverValoracion(300, ESCALA)), "oro");
    });
    it("0 es un margen válido —trabajar sin ganancia— y entra por rango, no por default", () => {
        const conMinimo = [
            { _id: "base", orden: 1, margenDesde: 0, margenHasta: 10, activo: true },
            { _id: "otra", orden: 2, margenDesde: 10, margenHasta: null, esDefault: true, activo: true },
        ];
        assert.equal(nombre(resolverValoracion(0, conMinimo)), "base");
    });
});
describe("resolverValoracion — la default", () => {
    it("sin margen cargado, la default", () => {
        assert.equal(nombre(resolverValoracion(null, ESCALA)), "plata");
        assert.equal(nombre(resolverValoracion(undefined, ESCALA)), "plata");
    });
    it("un margen que no entra en ningún rango cae en la default", () => {
        const conHueco = [
            { _id: "baja", orden: 1, margenDesde: 0, margenHasta: 10, activo: true },
            { _id: "alta", orden: 2, margenDesde: 30, margenHasta: null, activo: true },
            { _id: "default", orden: 3, margenDesde: null, margenHasta: null, esDefault: true, activo: true },
        ];
        assert.equal(nombre(resolverValoracion(20, conHueco)), "default");
    });
    it("una valoración SIN rango no se come todos los montos", () => {
        // Los dos extremos nulos serían un rango infinito: con `orden` bajo se quedaría con todo y las
        // demás no se alcanzarían nunca. Sólo vale como default.
        const conComodin = [
            { _id: "comodin", orden: 1, margenDesde: null, margenHasta: null, esDefault: true, activo: true },
            { _id: "alta", orden: 2, margenDesde: 30, margenHasta: null, activo: true },
        ];
        assert.equal(nombre(resolverValoracion(50, conComodin)), "alta");
    });
    it("sin rango que aplique y sin default, null: no se inventa una", () => {
        const sinDefault = [{ _id: "alta", orden: 1, margenDesde: 30, margenHasta: null, activo: true }];
        assert.equal(resolverValoracion(10, sinDefault), null);
        assert.equal(resolverValoracion(null, sinDefault), null);
    });
    it("sin valoraciones cargadas, null", () => {
        assert.equal(resolverValoracion(25, []), null);
    });
});
describe("resolverValoracion — inactivas y orden", () => {
    it("una valoración inactiva no se elige, aunque su rango contenga el margen", () => {
        const conApagada = [{ _id: "apagada", orden: 1, margenDesde: 0, margenHasta: 100, activo: false }, ORO];
        assert.equal(nombre(resolverValoracion(35, conApagada)), "oro");
    });
    it("`activo` ausente cuenta como activa", () => {
        // Lo cargado antes de que existiera el campo no puede quedar fuera del cálculo de golpe.
        const sinCampo = [{ _id: "vieja", orden: 1, margenDesde: 0, margenHasta: null }];
        assert.equal(nombre(resolverValoracion(12, sinCampo)), "vieja");
    });
    it("con dos rangos que se tocan, gana el de `orden` más bajo", () => {
        // El ABM no deja guardarlos así, pero los datos viejos pueden estar solapados: el resultado
        // tiene que ser estable y no depender de cómo los devolvió Mongo.
        const solapadas = [
            { _id: "segunda", orden: 2, margenDesde: 0, margenHasta: 50, activo: true },
            { _id: "primera", orden: 1, margenDesde: 0, margenHasta: 50, activo: true },
        ];
        assert.equal(nombre(resolverValoracion(25, solapadas)), "primera");
    });
    it("las que no tienen `orden` van al final", () => {
        const sinOrden = [
            { _id: "sinOrden", margenDesde: 0, margenHasta: 50, activo: true },
            { _id: "conOrden", orden: 1, margenDesde: 0, margenHasta: 50, activo: true },
        ];
        assert.equal(nombre(resolverValoracion(25, sinOrden)), "conOrden");
    });
});
