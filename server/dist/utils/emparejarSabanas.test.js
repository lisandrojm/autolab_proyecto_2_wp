import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emparejarSabanas, nombreBase } from "./emparejarSabanas.js";
describe("emparejar sábanas PDF con sus TXT", () => {
    it("el nombre comparable ignora extensión, « (1)», tildes y separadores", () => {
        assert.equal(nombreBase("426_LA NACION_REC_SUELDO_2026_PERIODO_09_MES - JORNALEROS (1).txt"), nombreBase("426_LA NACIÓN_REC_SUELDO_2026_PERIODO_09_MES - JORNALEROS.pdf"));
    });
    it("por nombre primero, aunque haya otro PDF del mismo tamaño", () => {
        const r = emparejarSabanas([{ nombre: "A_MES.pdf", paginas: 4 }, { nombre: "B_MES.pdf", paginas: 4 }], [{ nombre: "B_MES.txt", hojas: 4 }, { nombre: "A_MES (1).txt", hojas: 4 }]);
        assert.deepEqual(r.pares.map((p) => [p.pdf, p.txt, p.por]), [["B_MES.pdf", "B_MES.txt", "nombre"], ["A_MES.pdf", "A_MES (1).txt", "nombre"]]);
    });
    it("por cantidad de páginas cuando el TXT se renombró", () => {
        const r = emparejarSabanas([{ nombre: "99_PRODUCTORA_MES.pdf", paginas: 54 }, { nombre: "426_LA NACION_MES.pdf", paginas: 122 }, { nombre: "703_JUAN SE ALQUILA.pdf", paginas: 4 }], [{ nombre: "recibos productora.txt", hojas: 54 }, { nombre: "la nacion.txt", hojas: 122 }]);
        assert.deepEqual(r.pares.map((p) => [p.pdf, p.por]), [["99_PRODUCTORA_MES.pdf", "paginas"], ["426_LA NACION_MES.pdf", "paginas"]]);
        assert.deepEqual(r.pdfsSinTxt, ["703_JUAN SE ALQUILA.pdf"]);
    });
    it("dos del mismo tamaño se desempatan por palabras del nombre", () => {
        const r = emparejarSabanas([{ nombre: "703_JUAN SE ALQUILA.pdf", paginas: 4 }, { nombre: "2030_GRINI.pdf", paginas: 4 }], [{ nombre: "grini recibos.txt", hojas: 4 }, { nombre: "juan se alquila.txt", hojas: 4 }]);
        assert.deepEqual(r.pares.map((p) => [p.pdf, p.txt]).sort(), [["2030_GRINI.pdf", "grini recibos.txt"], ["703_JUAN SE ALQUILA.pdf", "juan se alquila.txt"]]);
    });
    it("si no hay forma de saberlo, no adivina", () => {
        const r = emparejarSabanas([{ nombre: "x.pdf", paginas: 2 }, { nombre: "y.pdf", paginas: 2 }], [{ nombre: "a.txt", hojas: 2 }, { nombre: "b.txt", hojas: 2 }]);
        assert.equal(r.pares.length, 0);
        assert.match(r.txtsSinPdf[0].motivo, /no se puede saber/);
    });
    it("un solo PDF y un solo TXT van juntos (la subida verifica el tamaño)", () => {
        const r = emparejarSabanas([{ nombre: "x.pdf", paginas: 6 }], [{ nombre: "a.txt", hojas: 4 }]);
        assert.deepEqual(r.pares, [{ pdf: "x.pdf", txt: "a.txt", por: "unicos" }]);
    });
    it("en una subida masiva, los sobrantes de distinto tamaño no se juntan", () => {
        const r = emparejarSabanas([{ nombre: "P.pdf", paginas: 54 }, { nombre: "R.pdf", paginas: 2 }], [{ nombre: "p.txt", hojas: 54 }, { nombre: "j.txt", hojas: 112 }]);
        assert.deepEqual(r.pares.map((p) => p.pdf), ["P.pdf"]);
        assert.deepEqual(r.pdfsSinTxt, ["R.pdf"]);
        assert.equal(r.txtsSinPdf[0].nombre, "j.txt");
    });
});
