/**
 * Tests de la vigencia de una escala.
 *
 * Run with:
 *   npx tsx --test src/utils/escalaAFecha.test.ts
 *   – o –
 *   npm run test:escalas-634
 *
 * Los períodos son los reales del acuerdo 2025-2026 de 634/11: abril–mayo y junio de 2026, más el
 * tramo vigente que arranca el 15/09/2026 sin vencimiento declarado.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { periodoVigente, periodosSuperpuestos, rigeEn, diaAnterior, vigenciaIncoherente, ordenarPorVigencia } from "./escalaAFecha.js";
const ABRIL = { nombre: "abril", desde: "2026-04-01", hasta: "2026-05-31" };
const JUNIO = { nombre: "junio", desde: "2026-06-01", hasta: "2026-06-30" };
const VIGENTE = { nombre: "vigente", desde: "2026-09-15", hasta: null };
const TRAMOS = [JUNIO, VIGENTE, ABRIL]; // desordenados a propósito: el orden de entrada no decide
describe("periodoVigente", () => {
    it("el 15 de mayo rige abril", () => {
        assert.equal(periodoVigente(TRAMOS, "2026-05-15")?.nombre, "abril");
    });
    it("el 1 de junio ya rige junio", () => {
        assert.equal(periodoVigente(TRAMOS, "2026-06-01")?.nombre, "junio");
    });
    it("EL 30 DE JUNIO TODAVÍA RIGE JUNIO: `hasta` es inclusivo", () => {
        // Es la diferencia con los tramos semiabiertos de las valoraciones. El acta dice "hasta el 30 de
        // junio" y ese día se cobra la escala de junio.
        assert.equal(periodoVigente(TRAMOS, "2026-06-30")?.nombre, "junio");
    });
    it("el 1 de julio no rige ninguno: el tramo siguiente no está cargado", () => {
        // Devolver `null` es correcto y es el aviso: entre el 1/7 y el 14/9 no hay escala cargada.
        assert.equal(periodoVigente(TRAMOS, "2026-07-01"), null);
    });
    it("después del 15/09 rige el vigente, que no declara vencimiento", () => {
        assert.equal(periodoVigente(TRAMOS, "2027-03-01")?.nombre, "vigente");
    });
    it("antes del primer período no rige nada", () => {
        assert.equal(periodoVigente(TRAMOS, "2026-03-31"), null);
    });
    it("con vigencias superpuestas gana el `desde` más reciente", () => {
        const viejo = { nombre: "viejo", desde: "2026-01-01", hasta: null };
        const nuevo = { nombre: "nuevo", desde: "2026-06-01", hasta: null };
        assert.equal(periodoVigente([viejo, nuevo], "2026-08-01")?.nombre, "nuevo");
    });
    it("un `desde` ilegible no rige nunca", () => {
        assert.equal(rigeEn({ desde: "", hasta: "2026-12-31" }, "2026-06-01"), false);
        assert.equal(rigeEn({ desde: null }, "2026-06-01"), false);
    });
    it("acepta Date, que es lo que llega de Mongo", () => {
        const conDate = [{ nombre: "junio", desde: new Date("2026-06-01T00:00:00Z"), hasta: new Date("2026-06-30T00:00:00Z") }];
        assert.equal(periodoVigente(conDate, "2026-06-15")?.nombre, "junio");
    });
});
describe("periodosSuperpuestos — la validación del ABM", () => {
    it("los tramos reales no se pisan", () => {
        assert.deepEqual(periodosSuperpuestos(TRAMOS), []);
    });
    it("detecta el día compartido", () => {
        const pisa = { desde: "2026-05-31", hasta: "2026-06-30" };
        const sup = periodosSuperpuestos([ABRIL, pisa]);
        assert.equal(sup.length, 1);
        assert.equal(sup[0].desde, "2026-05-31");
    });
    it("un período sin `hasta` pisa a todo lo que venga después", () => {
        // Por eso al crear un tramo nuevo hay que CERRAR el anterior, y no dejar los dos abiertos.
        const abierto = { desde: "2026-04-01", hasta: null };
        assert.equal(periodosSuperpuestos([abierto, JUNIO]).length, 1);
    });
});
describe("diaAnterior — así se cierra el tramo viejo", () => {
    it("el día antes del 1 de junio es el 31 de mayo", () => {
        assert.equal(diaAnterior("2026-06-01"), "2026-05-31");
    });
    it("cruza el año", () => {
        assert.equal(diaAnterior("2026-01-01"), "2025-12-31");
    });
});
describe("vigenciaIncoherente", () => {
    it("cazá el caso real de producción: desde 15/09/2026 y hasta 30/06/2026", () => {
        // Los 12 grupos de 0634/11 están así (la plantilla de junio con los importes de septiembre), y por
        // eso el banner los muestra vencidos sin estarlo.
        assert.equal(vigenciaIncoherente({ desde: "2026-09-15", hasta: "2026-06-30" }), true);
    });
    it("un período normal no es incoherente", () => {
        assert.equal(vigenciaIncoherente(JUNIO), false);
        assert.equal(vigenciaIncoherente(VIGENTE), false);
    });
});
describe("ordenarPorVigencia", () => {
    it("el más nuevo primero, que es como se lee un historial", () => {
        assert.deepEqual(ordenarPorVigencia(TRAMOS).map((p) => p.nombre), ["vigente", "junio", "abril"]);
    });
});
