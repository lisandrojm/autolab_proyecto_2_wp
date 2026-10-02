/**
 * El cotejo del lote de altas: cada campo adulterado tiene que rechazarse.
 *
 *   npx tsx --test src/services/arca/cotejoAltas.test.ts   (o `npm run test:arca-altas`)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cotejarRegistro, problemasDeForma } from "./cotejoAltas.js";
import { tomarCandado, soltarCandado, quienTiene, CandadoArcaOcupado } from "./candadoArca.js";
// El mismo contrato que `afipTxt85.test.ts` / `afipTxt.test.ts` del frontend, ya armado.
const R85 = ["23276025759", "126205", "00001", "921430", "2455", "021", "1", "02122135", "35", "0", "01082026", "31012027", "0634/11   ", "035283", "001", "0", "01"].join("");
const R130 = "01AT23276025759N0212026/08/012027/01/31126205" + " ".repeat(12) + "000000212213535" + "100001921430" + " ".repeat(16) + "035283001" + " ".repeat(21);
const esperado = (over = {}) => ({
    etiqueta: "MARTINEZ (contrato 1)",
    cuil: "23276025759",
    fechaInicio: "2026-08-01",
    fechaFin: "2027-01-31",
    categoria: "035283",
    convenio: "0634/11",
    retribucion: 2122135.35,
    rnos: "126205",
    puesto: "2455",
    situacionRevista: "01",
    ...over,
});
const cat = () => ({
    modalidadesContrato: new Set(["021", "008"]),
    modalidadesLiquidacion: new Set(["1"]),
    tiposServicio: new Set(["001"]),
    sucursales: new Map([["00001", new Set(["921430"])]]),
});
/** Reemplaza un tramo 1-based. */
const con = (r, desde, valor) => r.slice(0, desde - 1) + valor + r.slice(desde - 1 + valor.length);
describe("fixtures", () => {
    it("los dos registros de prueba tienen el largo de su formato", () => {
        assert.equal(R85.length, 85);
        assert.equal(R130.length, 130);
    });
});
describe("cotejarRegistro — 85", () => {
    it("el registro correcto pasa", () => assert.deepEqual(cotejarRegistro("altas_masivas", R85, esperado(), cat()), []));
    const casos = [
        ["CUIL", 1, "20111111112"],
        ["Obra social", 12, "999999"],
        ["Sucursal", 18, "00002"],
        ["Actividad", 23, "111111"],
        ["Puesto desempeñado", 29, "9999"],
        ["Modalidad de contratación", 33, "999"],
        ["Modalidad de liquidación", 36, "9"],
        ["Retribución", 37, "09999999"],
        ["Marca agropecuario", 47, "1"],
        ["Fecha de inicio", 48, "02082026"],
        ["Fecha de fin", 56, "        "],
        ["Convenio", 64, "0131/75   "],
        ["Categoría", 74, "035284"],
        ["Tipo de servicio", 80, "999"],
        ["Marca CCG", 83, "2"],
        ["Situación de revista", 84, "12"],
    ];
    for (const [campo, desde, valor] of casos) {
        it(`rechaza ${campo} adulterado`, () => {
            const dif = cotejarRegistro("altas_masivas", con(R85, desde, valor), esperado(), cat());
            assert.ok(dif.some((d) => d.campo === campo), `esperaba diferencia en ${campo}, hubo: ${dif.map((d) => d.campo).join(", ")}`);
        });
    }
    it("sin obra social validada se rechaza aunque el registro traiga una", () => {
        const dif = cotejarRegistro("altas_masivas", R85, esperado({ rnos: "", rnosMotivo: "sin validar" }), cat());
        assert.ok(dif.some((d) => d.campo === "Obra social"));
    });
});
describe("cotejarRegistro — 130", () => {
    it("el registro correcto pasa", () => assert.deepEqual(cotejarRegistro("carga_masiva", R130, esperado(), cat()), []));
    it("rechaza la retribución × 100", () => {
        const dif = cotejarRegistro("carga_masiva", con(R130, 58, "021221353500000"), esperado(), cat());
        assert.ok(dif.some((d) => d.campo === "Retribución"));
    });
    it("rechaza otro movimiento que no sea alta", () => {
        assert.ok(cotejarRegistro("carga_masiva", con(R130, 3, "BA"), esperado(), cat()).some((d) => d.campo === "Movimiento"));
    });
    it("rechaza la fecha de inicio corrida un día", () => {
        assert.ok(cotejarRegistro("carga_masiva", con(R130, 20, "2026/08/02"), esperado(), cat()).some((d) => d.campo === "Fecha de inicio"));
    });
});
describe("problemasDeForma", () => {
    it("Altas Masivas: más de 9 no", () => assert.ok(problemasDeForma("altas_masivas", Array(10).fill(R85)).some((p) => /hasta 9/.test(p))));
    it("largo y charset", () => {
        assert.ok(problemasDeForma("altas_masivas", [R85 + " "]).length > 0);
        assert.ok(problemasDeForma("carga_masiva", [R130.replace("N", "ñ")]).length > 0);
        assert.ok(problemasDeForma("carga_masiva", [R130.slice(0, 129) + "\r"]).length > 0);
        assert.deepEqual(problemasDeForma("carga_masiva", [R130]), []);
    });
    it("lote vacío no", () => assert.ok(problemasDeForma("carga_masiva", []).length > 0));
});
describe("candado de ARCA — una corrida por tenant, cualquiera sea", () => {
    it("obras sociales y altas se excluyen", () => {
        tomarCandado("t1", "obras_sociales");
        assert.throws(() => tomarCandado("t1", "altas_masivas"), CandadoArcaOcupado);
        assert.throws(() => tomarCandado("t1", "carga_masiva"), /validación de obras sociales/);
        // Soltar con OTRO tipo no la libera.
        soltarCandado("t1", "altas_masivas");
        assert.equal(quienTiene("t1")?.tipo, "obras_sociales");
        soltarCandado("t1", "obras_sociales");
        assert.equal(quienTiene("t1"), null);
        tomarCandado("t1", "carga_masiva");
        soltarCandado("t1", "carga_masiva");
    });
    it("dos tenants no se estorban", () => {
        tomarCandado("a", "altas_masivas");
        tomarCandado("b", "altas_masivas");
        soltarCandado("a", "altas_masivas");
        soltarCandado("b", "altas_masivas");
    });
});
