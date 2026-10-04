import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planSucursalesPorEmpresa } from "./planSucursalesPorEmpresa.js";
import { SUCURSALES_POR_EMPRESA_ARCA } from "../scripts/datos/sucursalesPorEmpresaArca.js";
const TRONADOR = "d00000000000000000000002";
const RUIZ = "d00000000000000000000003";
const catalogo = [
    { _id: "d00000000000000000000001", domicilio: "ZAPIOLA 392", codigo: "00001" },
    { _id: TRONADOR, domicilio: "TRONADOR 671", codigo: "00002" },
    { _id: RUIZ, domicilio: "RUIZ HUIDOBRO 4365", codigo: "00003" },
    { _id: "d00000000000000000000004", domicilio: "VALDENEGRO 4867", codigo: "00004" },
];
const nomenclador = ["921430", "900030", "591110", "591120", "602900", "620100"];
const empresas = () => [
    { _id: "e-fzero", cuit: "30-71029583-9", razonSocial: "FZERO S.R.L", sucursalIds: catalogo.map((d) => d._id), sucursalActividades: [], habitualId: RUIZ },
    { _id: "e-2030", cuit: "30-71706837-4", razonSocial: "2030 S.R.L.", sucursalIds: [RUIZ], sucursalActividades: [{ sucursalId: RUIZ, actividades: [{ codigo: "591110" }] }], habitualId: RUIZ },
    { _id: "e-grini", cuit: "33-71767374-9", razonSocial: "GRINI S.R.L.", sucursalIds: [RUIZ], sucursalActividades: [], habitualId: RUIZ },
];
/** Los datos de ARCA, con la habitual de 2030 en Ruiz Huidobro puesta (o no). */
const datosCon = (habitualDe2030) => SUCURSALES_POR_EMPRESA_ARCA.map((e) => (e.cuit === "30-71706837-4" ? { ...e, sucursales: e.sucursales.map((s) => ({ ...s, ...(habitualDe2030 ? { actividadHabitual: habitualDe2030 } : {}) })) } : e));
const planear = (datos, es = empresas()) => planSucursalesPorEmpresa({ datos, empresas: es, catalogo, actividadesDelNomenclador: nomenclador, quitar: true });
const fila = (p, cuit, sucursalId) => p.empresas.find((e) => e.cuit === cuit).sucursalActividades.find((f) => f.sucursalId === sucursalId);
const aplicar = (es, p) => es.map((e) => ({ ...e, sucursalIds: p.empresas.find((x) => x.empresaId === e._id).sucursalIds, sucursalActividades: p.empresas.find((x) => x.empresaId === e._id).sucursalActividades }));
describe("la carga deja marcada la actividad habitual", () => {
    it("2030 en Ruiz Huidobro: se marca la que traigan los datos", () => {
        for (const h of ["591110", "602900"]) {
            const p = planear(datosCon(h));
            assert.equal(fila(p, "30-71706837-4", RUIZ).actividadHabitual, h);
            assert.ok(p.empresas.find((e) => e.cuit === "30-71706837-4").cambios.some((c) => c.includes(`actividad habitual`) && c.includes(h)));
            assert.ok(!p.sinHabitual.some((s) => s.cuit === "30-71706837-4"));
        }
    });
    it("FZERO en Tronador tiene dos y los datos no marcan ninguna: queda sin habitual y se lista", () => {
        const p = planear(datosCon("591110"));
        assert.equal(fila(p, "30-71029583-9", TRONADOR).actividadHabitual, "");
        assert.deepEqual(p.sinHabitual.map((s) => `${s.razonSocial}:${s.sucursal}`), ["FZERO S.R.L:00002 TRONADOR 671"]);
    });
    it("los datos que están en el repo NO traen la habitual de 2030: quedó pendiente de definir, no se infiere", () => {
        const p = planear(SUCURSALES_POR_EMPRESA_ARCA);
        assert.equal(fila(p, "30-71706837-4", RUIZ).actividadHabitual, "");
        assert.ok(p.sinHabitual.some((s) => s.cuit === "30-71706837-4" && s.actividades.join("+") === "602900+591110"));
    });
    it("con una sola actividad no se marca nada: rige esa", () => {
        const p = planear(datosCon("591110"));
        assert.equal(fila(p, "33-71767374-9", RUIZ).actividadHabitual, "");
        assert.ok(!p.sinHabitual.some((s) => s.cuit === "33-71767374-9"));
    });
    it("una habitual pedida que no está entre las de esa sucursal se avisa y no se marca", () => {
        const p = planear(datosCon("620100"));
        assert.deepEqual(p.habitualesInvalidas, [{ cuit: "30-71706837-4", sucursal: "00001 RUIZ HUIDOBRO 4365", codigo: "620100" }]);
        assert.equal(fila(p, "30-71706837-4", RUIZ).actividadHabitual, "");
    });
    it("si los datos no dicen nada, la que ya estaba marcada a mano se conserva (y no se pisa)", () => {
        const conMarca = empresas().map((e) => (e._id === "e-fzero" ? { ...e, sucursalActividades: [{ sucursalId: TRONADOR, codigo: "00002", origen: "arca", actividadHabitual: "921430", actividades: [{ codigo: "900030" }, { codigo: "921430" }] }] } : e));
        const p = planear(datosCon("591110"), conMarca);
        assert.equal(fila(p, "30-71029583-9", TRONADOR).actividadHabitual, "921430");
        assert.equal(p.sinHabitual.length, 0);
    });
    it("es idempotente también con la habitual", () => {
        const primera = planear(datosCon("591110"));
        const despues = aplicar(empresas(), primera);
        const segunda = planear(datosCon("591110"), despues);
        assert.ok(segunda.empresas.every((e) => !e.cambia), JSON.stringify(segunda.empresas.filter((e) => e.cambia).map((e) => e.cambios)));
    });
    it("cambiar la habitual en los datos es un cambio para aplicar", () => {
        const despues = aplicar(empresas(), planear(datosCon("591110")));
        const p = planear(datosCon("602900"), despues);
        const e = p.empresas.find((x) => x.cuit === "30-71706837-4");
        assert.equal(e.cambia, true);
        assert.deepEqual(e.cambios, ["actividad habitual de 00001 RUIZ HUIDOBRO 4365: 591110 ⇒ 602900"]);
    });
});
