import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planPuestoPorConvenio, PUESTOS_POR_CONVENIO } from "./planPuestoPorConvenio.js";
const convenios = () => [
    { externalId: "0102/90", name: "ACTORES", puestoDesempenadoDefault: "" },
    { externalId: "0322/75", name: "ACTORES" },
    { externalId: "0634/11", name: "TELEVISIÓN", puestoDesempenadoDefault: null },
    { externalId: "9999/99", name: "EXCLUIDO DE CONVENIO" },
    { externalId: "0131/75", name: "TELEVISIÓN (SATSAID)" },
];
const activos = ["2455", "4132"];
const enUso = [
    { cct: "0634/11", contratos: 7038, categorias: 106 },
    { cct: "0322/75", contratos: 154, categorias: 4 },
    { cct: "9999/99", contratos: 6, categorias: 1 },
    { cct: "0102/90", contratos: 0, categorias: 4 },
    { cct: "0131/75", contratos: 0, categorias: 218 },
];
describe("sembrar el puesto desempeñado por convenio", () => {
    it("la lista pedida: actores (0102/90 y 0322/75) → 2455, televisión (0634/11) → 4132", () => {
        assert.deepEqual(PUESTOS_POR_CONVENIO.map((p) => `${p.cct}=${p.puesto}`), ["0102/90=2455", "0322/75=2455", "0634/11=4132"]);
    });
    it("con todo vacío aplica los tres y deja listados los que quedan sin default", () => {
        const p = planPuestoPorConvenio({ convenios: convenios(), puestosActivos: activos, enUso });
        assert.deepEqual(p.aplicar.map((a) => `${a.cct}:${a.de || "∅"}→${a.a}`), ["0102/90:∅→2455", "0322/75:∅→2455", "0634/11:∅→4132"]);
        assert.deepEqual(p.respetados, []);
        assert.deepEqual(p.puestosFaltantes, []);
        assert.deepEqual(p.conveniosFaltantes, []);
        // 9999/99 primero: tiene contratos. A ninguno se le asigna nada.
        assert.deepEqual(p.sinDefault.map((s) => s.cct), ["9999/99", "0131/75"]);
    });
    it("es idempotente: aplicado una vez, la segunda no tiene nada que hacer", () => {
        const cs = convenios();
        const primera = planPuestoPorConvenio({ convenios: cs, puestosActivos: activos, enUso });
        for (const a of primera.aplicar)
            cs.find((c) => c.externalId === a.cct).puestoDesempenadoDefault = a.a;
        const segunda = planPuestoPorConvenio({ convenios: cs, puestosActivos: activos, enUso });
        assert.deepEqual(segunda.aplicar, []);
        assert.equal(segunda.yaEstaban.length, 3);
        assert.deepEqual(segunda.sinDefault.map((s) => s.cct), ["9999/99", "0131/75"]);
    });
    it("un valor ya cargado no se pisa… salvo con el flag explícito", () => {
        const cs = convenios();
        cs[2].puestoDesempenadoDefault = "9001";
        const sin = planPuestoPorConvenio({ convenios: cs, puestosActivos: activos, enUso });
        assert.deepEqual(sin.respetados, [{ cct: "0634/11", actual: "9001", deseado: "4132" }]);
        assert.ok(!sin.aplicar.some((a) => a.cct === "0634/11"));
        // Tiene default (el suyo): no figura como «sin default».
        assert.ok(!sin.sinDefault.some((s) => s.cct === "0634/11"));
        const con = planPuestoPorConvenio({ convenios: cs, puestosActivos: activos, enUso, pisar: true });
        assert.deepEqual(con.respetados, []);
        assert.deepEqual(con.aplicar.find((a) => a.cct === "0634/11"), { cct: "0634/11", nombre: "TELEVISIÓN", de: "9001", a: "4132" });
    });
    it("si el código no está en el catálogo, avisa y NO toca esos convenios (ni crea el puesto)", () => {
        const p = planPuestoPorConvenio({ convenios: convenios(), puestosActivos: ["4132"], enUso });
        assert.deepEqual(p.puestosFaltantes, [{ puesto: "2455", ccts: ["0102/90", "0322/75"] }]);
        assert.deepEqual(p.aplicar.map((a) => a.cct), ["0634/11"]);
        // Los de actores quedan sin default y se listan: alguien tiene que decidir.
        assert.ok(p.sinDefault.some((s) => s.cct === "0322/75"));
    });
    it("un convenio de la lista que no está en el ABM se avisa", () => {
        const p = planPuestoPorConvenio({ convenios: convenios().filter((c) => c.externalId !== "0102/90"), puestosActivos: activos });
        assert.deepEqual(p.conveniosFaltantes, ["0102/90"]);
        assert.deepEqual(p.aplicar.map((a) => a.cct), ["0322/75", "0634/11"]);
    });
    it("compara normalizado: «4132 » ya cargado es el mismo que 4132", () => {
        const cs = convenios();
        cs[2].puestoDesempenadoDefault = " 4132 ";
        const p = planPuestoPorConvenio({ convenios: cs, puestosActivos: activos });
        assert.deepEqual(p.yaEstaban, [{ cct: "0634/11", puesto: "4132" }]);
    });
});
