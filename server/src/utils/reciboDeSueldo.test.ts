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

/** Lo que devuelve el OCR de un recibo de MEMOSOFT: sin los rótulos (van en gris), con ORIGINAL/COPIA arriba. */
const OCR_ORIGINAL = `ORIGINAL
2030 S.R.L. STOLTZING, Micaela Sol 00070
27-40073687-7 1123646. 21 01/11/2021 | 5ams |
RUIZ HUIDOBRO 4365 -  - CABA - CAPITAL FEDERAL
C.U.I.T. : 30-71706837-4 [Productora |A Tiempo completo indeterminado /Tr
108/2026 10/09/2026 | GALICIA SEPTIEMBRE 2026
CONTRIBUCIONES EMPRESA
1101 Previsional Contribucion 286.619,41`;
const OCR_COPIA = OCR_ORIGINAL.replace("ORIGINAL", "COPIA");

describe("un recibo de MEMOSOFT leído por OCR (sin rótulos)", () => {
  it("nombre y legajo de la línea «APELLIDO, Nombres legajo»; el período liquidado y no el del depósito", () => {
    const d = leerRecibo(OCR_ORIGINAL);
    assert.equal(d.cuil, "27400736877");
    assert.equal(d.empleadorCuit, "30717068374");
    assert.equal(d.nombre, "STOLTZING, Micaela Sol");
    assert.equal(d.legajo, "00070");
    assert.equal(d.periodo, "2026-09", "«SEPTIEMBRE 2026», no «08/2026» del depósito de aportes");
  });
  it("un CUIL al que el OCR le perdió el verificador se completa: «20-37008740-» → 20-37008740-X", () => {
    const d = leerRecibo("ORIGINAL\n2030 S.R.L. CORDOBA, Mart n Fernando 00077\n20-37008740- 2623570.7: 20/10/2021 | 5ams |");
    assert.equal(d.cuil.length, 11);
    assert.equal(d.cuil.slice(0, 10), "2037008740");
    assert.equal(d.nombre, "CORDOBA, Mart n Fernando");
    // Y una línea de nombre sin legajo o con una coma suelta igual se lee.
    assert.equal(leerRecibo("2030 S.R.L. SANTANGELO, Agustina\n27-43321099-4").nombre, "SANTANGELO, Agustina");
    assert.equal(leerRecibo("2030 S.R.L. MANIA, Cinthia Jimena 00094,\n27-27727589-4").legajo, "00094");
    // La nota del pie («SIPA, Fondo Nacional de Empleo…») no es una persona, y la línea con legajo gana aunque venga después.
    const t = "Nota: Seguridad social del empleador incluye SIPA, Fondo Nacional de Empleo y Asignaciones Familiares\nAPELLIDO Y NUMBRE> LEGAJO\nPELLEGRINI, Valentina 00483\n27-47028505-8 734833.56";
    assert.equal(leerRecibo(t).nombre, "PELLEGRINI, Valentina");
    assert.equal(leerRecibo(t).legajo, "00483");
    // Apellido compuesto, nombres en mayúsculas, y el rótulo LEGAJO que en la tabla queda seguido de otro rótulo.
    assert.equal(leerRecibo("APELLIDO Y NUMBRE> LEGAJO\nCOCA GRADASCHI, CAROLINA 01862\n27-46026728-0").nombre, "COCA GRADASCHI, CAROLINA");
    assert.equal(leerRecibo("APELLIDO Y NUMBRE> LEGAJO\nDE FEO, Pablo Nicolas 00446").legajo, "00446");
    const tabla = "APELLIDO Y NUMBRE>\nPALOMINO MATEO, Esthefany Omayra\nC.U.T.L. BASICO\nLEGAJO\nINGRESO ANTIGUEDAD\n27-94231772-2 890985.22";
    assert.equal(leerRecibo(tabla).nombre, "PALOMINO MATEO, Esthefany Omayra");
    assert.equal(leerRecibo(tabla).legajo, "");
  });
  it("ORIGINAL abre el recibo y COPIA se le pega, aunque las dos hojas traigan el mismo CUIL", () => {
    assert.deepEqual(agruparPaginas([OCR_ORIGINAL, OCR_COPIA, OCR_ORIGINAL, OCR_COPIA]), [[0, 1], [2, 3]]);
    // Sin COPIA en la segunda hoja, un ORIGINAL siempre empieza uno nuevo.
    assert.deepEqual(agruparPaginas([OCR_ORIGINAL, OCR_ORIGINAL, OCR_ORIGINAL]), [[0], [1], [2]]);
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
