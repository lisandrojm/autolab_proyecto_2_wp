/**
 *   npx tsx --test src/compartido/sucursalesDeEmpresa.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { actividadHabitualDe, actividadesDeSucursalParaEmpresa, codigoActividad, codigoDeSucursalParaEmpresa, codigoSucursal, problemaDeSucursalYActividad } from "./sucursalesDeEmpresa.js";
const AQUI = dirname(fileURLToPath(import.meta.url));
// El mismo domicilio (Ruiz Huidobro 4365), declarado por tres empresas con códigos y actividades propios.
const RUIZ = "aaaaaaaaaaaaaaaaaaaaaa03";
const ZAPIOLA = "aaaaaaaaaaaaaaaaaaaaaa01";
const TRONADOR = "aaaaaaaaaaaaaaaaaaaaaa02";
const DE_2030 = [{ sucursalId: RUIZ, codigo: "00001", actividades: [{ codigo: "602900" }, { codigo: "591110" }], origen: "arca" }];
const DE_GRINI = [{ sucursalId: RUIZ, codigo: "00003", actividades: [{ codigo: "620100" }], origen: "arca" }];
const DE_FZERO = [
    { sucursalId: ZAPIOLA, codigo: "00001", actividades: [{ codigo: "921430" }] },
    { sucursalId: TRONADOR, codigo: "00002", actividades: [{ codigo: "900030" }, { codigo: "921430" }] },
    { sucursalId: RUIZ, codigo: "00003", actividades: [{ codigo: "591110" }] },
];
describe("el código de sucursal es de cada empresa", () => {
    it("el mismo domicilio tiene un código por empresa", () => {
        // El catálogo dice 00003 (el de FZERO): para 2030 es la 00001.
        assert.deepEqual(codigoDeSucursalParaEmpresa(DE_2030, RUIZ, "00003"), { codigo: "00001", origen: "empresa" });
        assert.deepEqual(codigoDeSucursalParaEmpresa(DE_GRINI, RUIZ, "00003"), { codigo: "00003", origen: "empresa" });
        assert.deepEqual(codigoDeSucursalParaEmpresa(DE_FZERO, RUIZ, "00003"), { codigo: "00003", origen: "empresa" });
    });
    it("sin código propio rige el del catálogo, como hasta ahora: lo que salía bien sale igual", () => {
        const sinCodigo = [{ sucursalId: RUIZ, actividades: [{ codigo: "591110" }] }];
        assert.deepEqual(codigoDeSucursalParaEmpresa(sinCodigo, RUIZ, "00003"), { codigo: "00003", origen: "catalogo" });
        assert.deepEqual(codigoDeSucursalParaEmpresa([], RUIZ, "00003"), { codigo: "00003", origen: "catalogo" });
        assert.deepEqual(codigoDeSucursalParaEmpresa(undefined, RUIZ, 3), { codigo: "00003", origen: "catalogo" });
    });
    it("sin ninguno de los dos, ninguno: no se inventa", () => {
        assert.deepEqual(codigoDeSucursalParaEmpresa([], RUIZ, ""), { codigo: "", origen: "ninguno" });
        assert.deepEqual(codigoDeSucursalParaEmpresa(DE_2030, "", "00003"), { codigo: "00003", origen: "catalogo" });
    });
    it("acepta el id como string, como ObjectId o poblado", () => {
        const comoObjeto = { toString: () => RUIZ };
        assert.equal(codigoDeSucursalParaEmpresa([{ sucursalId: comoObjeto, codigo: "1" }], RUIZ).codigo, "00001");
        assert.equal(codigoDeSucursalParaEmpresa(DE_2030, { _id: RUIZ }).codigo, "00001");
    });
    it("normaliza: 5 dígitos la sucursal, 6 la actividad", () => {
        assert.equal(codigoSucursal("1"), "00001");
        assert.equal(codigoSucursal(" 00003 "), "00003");
        assert.equal(codigoSucursal(""), "");
        assert.equal(codigoActividad("591110"), "591110");
        assert.equal(codigoActividad(1234), "001234");
    });
});
describe("las actividades son las de esa empresa en esa sucursal", () => {
    it("cada empresa ve las suyas en el mismo domicilio", () => {
        assert.deepEqual(actividadesDeSucursalParaEmpresa(DE_2030, RUIZ).map((a) => a.codigo), ["602900", "591110"]);
        assert.deepEqual(actividadesDeSucursalParaEmpresa(DE_GRINI, RUIZ).map((a) => a.codigo), ["620100"]);
        assert.deepEqual(actividadesDeSucursalParaEmpresa(DE_FZERO, RUIZ).map((a) => a.codigo), ["591110"]);
    });
    it("sin fila para ese domicilio no hay ninguna: no se hereda de otra empresa", () => {
        assert.deepEqual(actividadesDeSucursalParaEmpresa(DE_2030, ZAPIOLA), []);
        assert.deepEqual(actividadesDeSucursalParaEmpresa(undefined, RUIZ), []);
    });
    it("900030 y 921430 tienen la misma descripción y son dos códigos distintos", () => {
        const mismaDescripcion = [{ sucursalId: TRONADOR, codigo: "00002", actividades: [{ codigo: "900030", descripcion: "SERVICIOS CONEXOS" }, { codigo: "921430", descripcion: "SERVICIOS CONEXOS" }] }];
        assert.deepEqual(actividadesDeSucursalParaEmpresa(mismaDescripcion, TRONADOR).map((a) => a.codigo), ["900030", "921430"]);
    });
});
describe("validación previa a generar: sucursal y actividad contra SU empresa", () => {
    const de2030 = { sucursalIdsDeLaEmpresa: [RUIZ], asociaciones: DE_2030, codigoDelCatalogo: "00003" };
    const deGrini = { sucursalIdsDeLaEmpresa: [RUIZ], asociaciones: DE_GRINI, codigoDelCatalogo: "00003" };
    const deFzero = { sucursalIdsDeLaEmpresa: [ZAPIOLA, TRONADOR, RUIZ], asociaciones: DE_FZERO, codigoDelCatalogo: "" };
    it("la sucursal no es de esa empresa", () => {
        assert.equal(problemaDeSucursalYActividad({ ...de2030, sucursalId: ZAPIOLA, actividad: "921430" }), "sucursal_ajena");
        assert.equal(problemaDeSucursalYActividad({ ...deGrini, sucursalId: TRONADOR }), "sucursal_ajena");
    });
    it("la actividad no está habilitada en esa sucursal para esa empresa", () => {
        // 591110 vale para 2030 y para FZERO en Ruiz Huidobro, pero NO para GRINI.
        assert.equal(problemaDeSucursalYActividad({ ...deGrini, sucursalId: RUIZ, actividad: "591110" }), "actividad_no_habilitada");
        assert.equal(problemaDeSucursalYActividad({ ...de2030, sucursalId: RUIZ, actividad: "591110" }), null);
        assert.equal(problemaDeSucursalYActividad({ ...de2030, sucursalId: RUIZ, actividad: "602900" }), null);
        assert.equal(problemaDeSucursalYActividad({ ...de2030, sucursalId: RUIZ, actividad: "620100" }), "actividad_no_habilitada");
    });
    it("con una sola habilitada se hereda; con varias hay que elegir", () => {
        assert.equal(problemaDeSucursalYActividad({ ...deGrini, sucursalId: RUIZ, actividad: "" }), null);
        assert.equal(problemaDeSucursalYActividad({ ...de2030, sucursalId: RUIZ, actividad: "" }), "actividad_sin_elegir");
        assert.equal(problemaDeSucursalYActividad({ ...deFzero, sucursalId: TRONADOR }), "actividad_sin_elegir");
        assert.equal(problemaDeSucursalYActividad({ ...deFzero, sucursalId: ZAPIOLA }), null);
    });
    it("sin actividades habilitadas, o sin código de ningún lado", () => {
        assert.equal(problemaDeSucursalYActividad({ sucursalIdsDeLaEmpresa: [RUIZ], asociaciones: [{ sucursalId: RUIZ, codigo: "00001", actividades: [] }], sucursalId: RUIZ }), "sin_actividades");
        assert.equal(problemaDeSucursalYActividad({ sucursalIdsDeLaEmpresa: [RUIZ], asociaciones: [{ sucursalId: RUIZ, actividades: [{ codigo: "591110" }] }], sucursalId: RUIZ, codigoDelCatalogo: "" }), "sin_codigo");
    });
    it("sin sucursal resuelta no opina: «todavía no eligió» lo dice el checklist", () => {
        assert.equal(problemaDeSucursalYActividad({ ...de2030, sucursalId: "" }), null);
    });
});
describe("una sola resolución para el generador y para el cotejo del lote", () => {
    const front = readFileSync(resolve(AQUI, "../../../frontend/src/components/contratos/afipCompleteness.ts"), "utf8");
    const server = readFileSync(resolve(AQUI, "../services/arca/validarLoteAltas.ts"), "utf8");
    it("los dos importan la resolución compartida", () => {
        assert.match(front, /from "@compartido\/sucursalesDeEmpresa"/);
        assert.match(server, /from "\.\.\/\.\.\/compartido\/sucursalesDeEmpresa\.js"/);
    });
    it("los dos sacan el código de `codigoDeSucursalParaEmpresa` y las actividades de `actividadesDeSucursalParaEmpresa`", () => {
        for (const [quien, fuente] of [["afipCompleteness", front], ["validarLoteAltas", server]]) {
            assert.ok(fuente.includes("codigoDeSucursalParaEmpresa("), `${quien} no resuelve el código por empresa`);
            assert.ok(fuente.includes("actividadesDeSucursalParaEmpresa("), `${quien} no resuelve las actividades por empresa`);
        }
    });
});
describe("la actividad habitual de la empresa en una sucursal", () => {
    const dos = (actividadHabitual) => [{ sucursalId: RUIZ, codigo: "00001", actividades: [{ codigo: "602900" }, { codigo: "591110" }], actividadHabitual }];
    it("con una sola habilitada, es esa sin marcar nada", () => {
        assert.equal(actividadHabitualDe(DE_GRINI, RUIZ), "620100");
        assert.equal(actividadHabitualDe(DE_FZERO, ZAPIOLA), "921430");
    });
    it("con varias, la que marcó la empresa", () => {
        assert.equal(actividadHabitualDe(dos("591110"), RUIZ), "591110");
        assert.equal(actividadHabitualDe(dos("602900"), RUIZ), "602900");
    });
    it("con varias y sin marca, ninguna: se elige en cada contrato (FZERO en Tronador)", () => {
        assert.equal(actividadHabitualDe(dos(), RUIZ), "");
        assert.equal(actividadHabitualDe(DE_FZERO, TRONADOR), "");
    });
    it("una marca que quedó apuntando a una actividad que ya no tiene no se usa", () => {
        assert.equal(actividadHabitualDe(dos("620100"), RUIZ), "");
    });
    it("sin actividades o sin fila, ninguna", () => {
        assert.equal(actividadHabitualDe([{ sucursalId: RUIZ, actividades: [] }], RUIZ), "");
        assert.equal(actividadHabitualDe(DE_2030, ZAPIOLA), "");
    });
    it("la validación previa deja pasar al contrato que no eligió si hay habitual, y sigue frenando lo mal cargado", () => {
        const base = { sucursalIdsDeLaEmpresa: [RUIZ], codigoDelCatalogo: "00003", sucursalId: RUIZ };
        assert.equal(problemaDeSucursalYActividad({ ...base, asociaciones: dos("591110"), actividad: "" }), null);
        assert.equal(problemaDeSucursalYActividad({ ...base, asociaciones: dos(), actividad: "" }), "actividad_sin_elegir");
        // Elegir otra habilitada en la fila vale; una que no está habilitada sigue siendo un error.
        assert.equal(problemaDeSucursalYActividad({ ...base, asociaciones: dos("591110"), actividad: "602900" }), null);
        assert.equal(problemaDeSucursalYActividad({ ...base, asociaciones: dos("591110"), actividad: "620100" }), "actividad_no_habilitada");
    });
});
