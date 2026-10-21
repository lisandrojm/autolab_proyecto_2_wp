import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { leerRecibo, periodoDelTexto, agruparPaginas } from "./reciboDeSueldo.js";
const HOJA_1 = `
LA NACION S.A.                         CUIT: 30-50012345-8
RECIBO DE HABERES                      Período: Agosto 2026
Apellido y Nombre: GONZALEZ ROTSTEIN, JUAN MANUEL      Legajo: 1042
CUIL: 20-33150102-7        Fecha de ingreso: 10/08/2026
Sueldo básico                1.200.000,00
NETO A COBRAR                  985.432,10
`;
const HOJA_2 = `
Detalle de aportes y contribuciones
CUIL 20331501027
`;
const OTRA = `
RECIBO DE HABERES   Periodo 08/2026
Apellido y Nombre: PEREZ, ANA
CUIL: 27-30111222-5
`;
describe("leer un recibo de sueldo", () => {
    it("saca el CUIL de la persona, la empleadora, el nombre, el período, el legajo y el neto", () => {
        const d = leerRecibo(HOJA_1);
        assert.equal(d.cuil, "20331501027");
        assert.equal(d.empleadorCuit, "30500123458");
        assert.equal(d.nombre, "GONZALEZ ROTSTEIN, JUAN MANUEL");
        assert.equal(d.periodo, "2026-08");
        assert.equal(d.legajo, "1042");
        assert.equal(d.neto, "985.432,10");
    });
    it("lo que no está queda vacío, no inventado", () => {
        const d = leerRecibo("Hoja sin nada útil 12345");
        assert.deepEqual([d.cuil, d.nombre, d.periodo, d.legajo, d.neto], ["", "", "", "", ""]);
    });
    it("el período en sus formas", () => {
        assert.equal(periodoDelTexto("Período: 08/2026"), "2026-08");
        assert.equal(periodoDelTexto("PERIODO 2026-09"), "2026-09");
        assert.equal(periodoDelTexto("Liquidación SEPTIEMBRE/2026"), "2026-09");
        assert.equal(periodoDelTexto("Mes de pago: Noviembre de 2026"), "2026-11");
    });
});
describe("partir la sábana en recibos", () => {
    it("dos hojas por persona: la segunda sin CUIL o con el mismo se pega a la primera", () => {
        assert.deepEqual(agruparPaginas([HOJA_1, HOJA_2, OTRA, "detalle"]), [[0, 1], [2, 3]]);
        assert.deepEqual(agruparPaginas([HOJA_1, HOJA_1, OTRA, OTRA]), [[0, 1], [2, 3]]);
    });
    it("un recibo de una sola hoja seguido de otra persona no se mezcla", () => {
        assert.deepEqual(agruparPaginas([HOJA_1, OTRA, "detalle"]), [[0], [1, 2]]);
    });
    it("la misma persona dos veces seguidas son dos recibos", () => {
        assert.deepEqual(agruparPaginas([HOJA_1, HOJA_2, HOJA_1, HOJA_2]), [[0, 1], [2, 3]]);
    });
    it("sin texto legible se parte a ciegas de a dos", () => {
        assert.deepEqual(agruparPaginas(["", "", "", "", ""]), [[0, 1], [2, 3], [4]]);
    });
});
