/**
 * Cuándo una escala está vencida, y —sobre todo— cuándo NO hay que decir que lo está.
 *
 * El riesgo de este chequeo no es que se le escape una vencida: es que grite de más. Un aviso rojo
 * permanente sobre convenios que están bien se aprende a ignorar en dos días, y el día que aparezca
 * uno real nadie lo va a mirar. Por eso la mitad de estos tests son sobre silencios.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { escalasVencidas, vencidasPorConvenio } from "./auditoriaEscalas.js";
const HOY = "2026-09-15";
const g = (over = {}) => ({ convenio: "0322/75", donde: "categoria", nombre: "TIRA", sueldoBruto: 100000, vigenciaHasta: "2026-08-31", ...over });
describe("qué cuenta como vencida", () => {
    it("una vigencia que ya pasó", () => {
        const [v] = escalasVencidas([g()], HOY);
        assert.equal(v.vigenciaHasta, "2026-08-31");
        assert.equal(v.diasVencida, 15);
    });
    it("el día exacto del vencimiento TODAVÍA rige", () => {
        // «vence el 31 de agosto» quiere decir que el 31 la escala vale. Avisar ese día sería avisar de
        // algo que no pasó.
        assert.deepEqual(escalasVencidas([g({ vigenciaHasta: "2026-09-15" })], HOY), []);
    });
    it("una vigencia futura no dice nada", () => {
        assert.deepEqual(escalasVencidas([g({ vigenciaHasta: "2026-12-31" })], HOY), []);
    });
    it("acepta la fecha como Date y como texto", () => {
        assert.equal(escalasVencidas([g({ vigenciaHasta: new Date("2026-08-31T00:00:00Z") })], HOY).length, 1);
    });
});
describe("cuándo se calla", () => {
    /**
     * Sin `vigenciaHasta` no se infiere nada. Una escala de hace tres meses puede estar perfectamente
     * vigente y una de hace tres semanas puede haber vencido ayer: la antigüedad no dice nada, y
     * ponerle un plazo por nuestra cuenta sería inventar una paritaria.
     */
    it("sin vigenciaHasta, no hay vencimiento que reportar", () => {
        assert.deepEqual(escalasVencidas([g({ vigenciaHasta: undefined })], HOY), []);
        assert.deepEqual(escalasVencidas([g({ vigenciaHasta: "" })], HOY), []);
    });
    /**
     * Una escala en cero no está vencida: está SIN CARGAR, que ya lo dice el indicador «Sin escala:
     * bloquea el alta». Contarla acá haría que arreglar un problema tapara el otro.
     */
    it("una escala sin cargar no es una escala vencida", () => {
        assert.deepEqual(escalasVencidas([g({ sueldoBruto: 0 })], HOY), []);
        assert.deepEqual(escalasVencidas([g({ sueldoBruto: undefined })], HOY), []);
    });
    it("una fecha ilegible se ignora en vez de contarse como vencida", () => {
        // Un dato que no se entiende no es evidencia de nada. Tratarlo como vencido sería fabricar un
        // aviso a partir de un error de carga.
        assert.deepEqual(escalasVencidas([g({ vigenciaHasta: "agosto" })], HOY), []);
    });
});
describe("cómo se agrupa para mostrarlo", () => {
    it("por convenio, con la más vieja al frente", () => {
        const filas = escalasVencidas([g({ convenio: "0322/75", vigenciaHasta: "2026-08-31" }), g({ convenio: "0322/75", nombre: "UNITARIO", vigenciaHasta: "2026-08-31" }), g({ convenio: "0102/90", nombre: "PROTAGONISTA A", vigenciaHasta: "2026-06-30" })], HOY);
        const porConv = vencidasPorConvenio(filas);
        // El problema es del CCT, no de cada fila: dos escalas de 0322/75 son un solo aviso.
        assert.deepEqual(porConv.map((c) => [c.convenio, c.escalas]), [
            ["0102/90", 1],
            ["0322/75", 2],
        ]);
        assert.equal(porConv[0].diasVencida, 77);
    });
});
