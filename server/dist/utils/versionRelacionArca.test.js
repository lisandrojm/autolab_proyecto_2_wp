/**
 *   npx tsx --test src/utils/versionRelacionArca.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aplicaBaja, ganaLaNueva, unaPorClave } from "./versionRelacionArca.js";
describe("en seed, gana la versión más nueva por contenido", () => {
    it("una baja cierra una relación abierta", () => assert.equal(ganaLaNueva({ fechaFin: null }, { fechaFin: "2023-04-30" }, "seed"), true));
    it("una versión abierta no reabre una cerrada", () => assert.equal(ganaLaNueva({ fechaFin: "2023-04-30" }, { fechaFin: null }, "seed"), false));
    it("la prórroga (fin más tarde) gana: 30/04/2023 → 31/07/2023", () => {
        assert.equal(ganaLaNueva({ fechaFin: "2023-04-30" }, { fechaFin: "2023-07-31" }, "seed"), true);
        assert.equal(ganaLaNueva({ fechaFin: "2023-07-31" }, { fechaFin: "2023-04-30" }, "seed"), false);
    });
    it("a igual fin gana la que llega (GARCIA MANUEL 04/08/2024, sueldo distinto)", () => assert.equal(ganaLaNueva({ fechaFin: "2024-08-04" }, { fechaFin: "2024-08-04" }, "seed"), true));
    it("dos abiertas: gana la que llega", () => assert.equal(ganaLaNueva({ fechaFin: null }, { fechaFin: null }, "seed"), true));
});
describe("en sync, lo que acaba de leerse de ARCA gana siempre", () => {
    it("incluso si parece más vieja", () => {
        assert.equal(ganaLaNueva({ fechaFin: "2023-07-31" }, { fechaFin: "2023-04-30" }, "sync"), true);
        assert.equal(ganaLaNueva({ fechaFin: "2023-07-31" }, { fechaFin: null }, "sync"), true);
    });
});
describe("una por clave", () => {
    const filas = [
        { cuil: "20303756109", fechaInicio: "2021-11-01", fechaFin: "2023-04-30", retrib: 192686.78 },
        { cuil: "20303756109", fechaInicio: "2021-11-01", fechaFin: "2023-07-31", retrib: 209832.63 },
        { cuil: "27204809696", fechaInicio: "2021-03-31", fechaFin: "2021-04-02", retrib: 51337.27 },
    ];
    const clave = (f) => `${f.cuil}|${f.fechaInicio}`;
    it("se queda con la prórroga, sin importar el orden", () => {
        const a = unaPorClave(filas, clave, "seed");
        assert.equal(a.size, 2);
        assert.equal(a.get("20303756109|2021-11-01").fechaFin, "2023-07-31");
        const b = unaPorClave([...filas].reverse(), clave, "seed");
        assert.equal(b.get("20303756109|2021-11-01").fechaFin, "2023-07-31");
    });
    it("una baja es aplicar fin a una relación que estaba abierta", () => {
        assert.equal(aplicaBaja({ fechaFin: null }, { fechaFin: "2026-10-01" }), true);
        assert.equal(aplicaBaja({ fechaFin: "2026-09-01" }, { fechaFin: "2026-10-01" }), false);
        assert.equal(aplicaBaja(null, { fechaFin: "2026-10-01" }), false);
    });
});
