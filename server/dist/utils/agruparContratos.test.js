/**
 * Tests del agrupado por documento.
 *
 *   npm run test:agrupar-contratos
 *
 * Lo que se prueba acá es una sola cosa, y es la que se pierde en silencio: que dos contratos de la
 * MISMA persona en el MISMO proyecto caigan juntos. Si se separan, cada uno lee y guarda el mismo
 * documento de Mongo y el último `save()` pisa al anterior — se borra uno solo y los demás vuelven
 * intactos, sin ningún error. La pantalla diría «3 quitados» y la base tendría 1.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agruparContratosPorDocumento, partirClaveDocumento } from "./agruparContratos.js";
describe("agrupar contratos por documento", () => {
    it("dos contratos de la misma persona en el mismo proyecto van JUNTOS", () => {
        const { porDocumento } = agruparContratosPorDocumento([
            { projectId: "p1", userId: "u1", contratoId: "c1" },
            { projectId: "p1", userId: "u1", contratoId: "c2" },
        ]);
        assert.equal(porDocumento.size, 1, "es un solo documento de Mongo: tiene que leerse y guardarse una vez");
        assert.equal(porDocumento.get("p1|u1").length, 2);
    });
    it("la misma persona en OTRO proyecto es otro documento", () => {
        const { porDocumento } = agruparContratosPorDocumento([
            { projectId: "p1", userId: "u1", contratoId: "c1" },
            { projectId: "p2", userId: "u1", contratoId: "c9" },
        ]);
        assert.equal(porDocumento.size, 2);
    });
    it("personas distintas en el mismo proyecto son documentos distintos", () => {
        const { porDocumento } = agruparContratosPorDocumento([
            { projectId: "p1", userId: "u1", contratoId: "c1" },
            { projectId: "p1", userId: "u2", contratoId: "c1" },
        ]);
        assert.equal(porDocumento.size, 2);
    });
    /** Lo incompleto se aparta y se REPORTA: descartarlo en silencio haría que el total no cierre. */
    it("lo que viene sin datos no se busca, se aparta", () => {
        const { porDocumento, invalidos } = agruparContratosPorDocumento([
            { projectId: "p1", userId: "u1", contratoId: "c1" },
            { projectId: "", userId: "u1", contratoId: "c2" },
            { projectId: "p1", userId: "u1" },
        ]);
        assert.equal(porDocumento.size, 1);
        assert.equal(invalidos.length, 2);
    });
    it("no explota con algo que no sea una lista", () => {
        assert.equal(agruparContratosPorDocumento(undefined).porDocumento.size, 0);
        assert.equal(agruparContratosPorDocumento("nada").invalidos.length, 0);
    });
    it("la clave se puede volver a partir en sus dos mitades", () => {
        assert.deepEqual(partirClaveDocumento("p1|u1"), { projectId: "p1", userId: "u1" });
    });
});
