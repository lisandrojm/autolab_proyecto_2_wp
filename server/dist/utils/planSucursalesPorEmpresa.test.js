import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarDomicilio, planSucursalesPorEmpresa } from "./planSucursalesPorEmpresa.js";
import { SUCURSALES_POR_EMPRESA_ARCA } from "../scripts/datos/sucursalesPorEmpresaArca.js";
// El catálogo de domicilios como está hoy: cuatro, con UN código cada uno (el de FZERO).
const ZAPIOLA = "d00000000000000000000001";
const TRONADOR = "d00000000000000000000002";
const RUIZ = "d00000000000000000000003";
const VALDENEGRO = "d00000000000000000000004";
const catalogo = [
    { _id: ZAPIOLA, domicilio: "ZAPIOLA 392", codigo: "00001" },
    { _id: TRONADOR, domicilio: "TRONADOR 671", codigo: "00002" },
    { _id: RUIZ, domicilio: "RUIZ HUIDOBRO 4365", codigo: "00003" },
    { _id: VALDENEGRO, domicilio: "VALDENEGRO 4867", codigo: "00004" },
];
const nomenclador = ["921430", "900030", "591110", "591120", "602900", "620100"];
const act = (codigo, descripcion = "") => ({ codigo, descripcion });
/** Las tres empresas como están hoy en la base (antes de cargar). */
const hoy = () => [
    {
        _id: "e-fzero",
        cuit: "30-71029583-9",
        razonSocial: "FZERO S.R.L",
        sucursalIds: [ZAPIOLA, TRONADOR, RUIZ, VALDENEGRO],
        sucursalActividades: [
            { sucursalId: ZAPIOLA, actividades: [act("921430")] },
            { sucursalId: TRONADOR, actividades: [act("900030"), act("921430")] },
            { sucursalId: RUIZ, actividades: [act("591110")] },
            { sucursalId: VALDENEGRO, actividades: [act("591120")] },
        ],
        habitualId: RUIZ,
    },
    { _id: "e-2030", cuit: "30-71706837-4", razonSocial: "2030 S.R.L.", sucursalIds: [RUIZ], sucursalActividades: [{ sucursalId: RUIZ, actividades: [act("591110")] }], habitualId: RUIZ },
    { _id: "e-grini", cuit: "33-71767374-9", razonSocial: "GRINI S.R.L.", sucursalIds: [RUIZ, ZAPIOLA, TRONADOR, VALDENEGRO], sucursalActividades: [{ sucursalId: RUIZ, actividades: [act("591110")] }], habitualId: RUIZ },
];
const planear = (empresas, quitar = false) => planSucursalesPorEmpresa({ datos: SUCURSALES_POR_EMPRESA_ARCA, empresas, catalogo, actividadesDelNomenclador: nomenclador, quitar });
const de = (p, cuit) => p.empresas.find((e) => e.cuit === cuit);
/** Aplica el plan sobre las empresas, como haría el script. */
const aplicar = (empresas, p) => empresas.map((e) => {
    const pe = p.empresas.find((x) => x.empresaId === e._id);
    return pe ? { ...e, sucursalIds: pe.sucursalIds, sucursalActividades: pe.sucursalActividades, habitualId: pe.habitual.accion === "cambia" ? pe.habitual.a : e.habitualId } : e;
});
describe("cargar sucursales, códigos y actividades por empresa", () => {
    it("2030: Ruiz Huidobro pasa a ser SU 00001, con sus dos actividades", () => {
        const e = de(planear(hoy()), "30-71706837-4");
        assert.deepEqual(e.sucursalIds, [RUIZ]);
        assert.equal(e.sucursalActividades.length, 1);
        assert.equal(e.sucursalActividades[0].codigo, "00001");
        assert.equal(e.sucursalActividades[0].origen, "arca");
        assert.deepEqual(e.sucursalActividades[0].actividades.map((a) => a.codigo), ["602900", "591110"]);
        assert.equal(e.cambia, true);
        assert.equal(e.habitual.accion, "queda");
    });
    it("FZERO: los cuatro domicilios con sus códigos; Tronador con 900030 Y 921430 (misma descripción, dos códigos)", () => {
        const e = de(planear(hoy()), "30-71029583-9");
        assert.deepEqual(e.sucursalActividades.map((f) => `${f.codigo}:${f.actividades.map((a) => a.codigo).join("+")}`), ["00001:921430", "00002:900030+921430", "00003:591110", "00004:591120"]);
        assert.deepEqual(e.sobran, []);
    });
    it("GRINI: sólo Ruiz Huidobro (00003) con 620100; las otras tres se LISTAN y no se quitan sin el flag", () => {
        const e = de(planear(hoy()), "33-71767374-9");
        assert.deepEqual(e.sobran.map((s) => s.domicilio).sort(), ["TRONADOR 671", "VALDENEGRO 4867", "ZAPIOLA 392"]);
        assert.ok(e.sobran.every((s) => !s.quitada));
        // Sin el flag siguen asociadas…
        assert.deepEqual([...e.sucursalIds].sort(), [RUIZ, ZAPIOLA, TRONADOR, VALDENEGRO].sort());
        // …pero Ruiz Huidobro ya queda con lo de ARCA.
        const ruiz = e.sucursalActividades.find((f) => f.sucursalId === RUIZ);
        assert.equal(ruiz.codigo, "00003");
        assert.deepEqual(ruiz.actividades.map((a) => a.codigo), ["620100"]);
        assert.ok(e.cambios.some((c) => c.startsWith("! ZAPIOLA 392")));
    });
    it("con el flag se quitan, y queda exactamente lo de ARCA", () => {
        const e = de(planear(hoy(), true), "33-71767374-9");
        assert.deepEqual(e.sucursalIds, [RUIZ]);
        assert.deepEqual(e.sucursalActividades.map((f) => f.sucursalId), [RUIZ]);
        assert.ok(e.sobran.every((s) => s.quitada));
    });
    it("es idempotente: aplicado una vez, la segunda corrida no cambia nada", () => {
        for (const quitar of [false, true]) {
            const primera = planear(hoy(), quitar);
            const despues = aplicar(hoy(), primera);
            const segunda = planear(despues, quitar);
            assert.ok(segunda.empresas.every((e) => !e.cambia), `quitar=${quitar}: ${JSON.stringify(segunda.empresas.filter((e) => e.cambia).map((e) => e.cambios))}`);
            // Y lo que dejó es lo mismo otra vez.
            assert.deepEqual(aplicar(despues, segunda), despues);
        }
    });
    it("el dry-run no modifica lo que recibe", () => {
        const empresas = hoy();
        const copia = JSON.parse(JSON.stringify(empresas));
        planear(empresas, true);
        assert.deepEqual(empresas, copia);
    });
    it("domicilio habitual: si le queda UNA sola sucursal pasa a ser esa; con varias, se informa y no se elige", () => {
        // GRINI con la habitual en Zapiola, que ARCA no tiene: al quitar le queda sólo Ruiz Huidobro.
        const conZapiola = hoy().map((e) => (e._id === "e-grini" ? { ...e, habitualId: ZAPIOLA } : e));
        const g = de(planear(conZapiola, true), "33-71767374-9");
        assert.equal(g.habitual.accion, "cambia");
        assert.equal(g.habitual.a, RUIZ);
        assert.equal(g.cambia, true);
        // Sin quitar, Zapiola sigue asociada: la habitual queda.
        assert.equal(de(planear(conZapiola, false), "33-71767374-9").habitual.accion, "queda");
        // FZERO con la habitual en un domicilio que no tiene y cuatro sucursales: no se elige por ella.
        const fzeroRara = hoy().map((e) => (e._id === "e-fzero" ? { ...e, habitualId: "d00000000000000000000099" } : e));
        const f = de(planear(fzeroRara, true), "30-71029583-9");
        assert.equal(f.habitual.accion, "sin_resolver");
        assert.equal(f.habitual.a, null);
        assert.ok(f.cambios.some((c) => c.startsWith("! domicilio habitual")));
    });
    it("una actividad que no está en el nomenclador se avisa, no se crea", () => {
        const p = planSucursalesPorEmpresa({ datos: SUCURSALES_POR_EMPRESA_ARCA, empresas: hoy(), catalogo, actividadesDelNomenclador: nomenclador.filter((c) => c !== "602900") });
        assert.deepEqual(p.actividadesFaltantes.map((a) => `${a.cuit}:${a.codigo}`), ["30-71706837-4:602900"]);
    });
    it("un domicilio que no está en el catálogo se avisa y esa sucursal no se carga; nada de parecidos", () => {
        const p = planSucursalesPorEmpresa({ datos: SUCURSALES_POR_EMPRESA_ARCA, empresas: hoy(), catalogo: catalogo.map((d) => (d._id === TRONADOR ? { ...d, domicilio: "TRONADOR 617" } : d)), actividadesDelNomenclador: nomenclador });
        assert.deepEqual(p.domiciliosFaltantes, [{ cuit: "30-71029583-9", codigo: "00002", domicilio: "TRONADOR 671" }]);
        assert.ok(!de(p, "30-71029583-9").sucursalActividades.some((f) => f.codigo === "00002"));
    });
    it("una empresa que no está en la base (por CUIT) se avisa", () => {
        const p = planear(hoy().filter((e) => e._id !== "e-grini"));
        assert.deepEqual(p.empresasFaltantes, [{ cuit: "33-71767374-9", razonSocial: "GRINI S.R.L." }]);
        assert.equal(p.empresas.length, 2);
    });
    it("el CUIT se compara por sus dígitos y el domicilio normalizado, exacto", () => {
        assert.equal(normalizarDomicilio("  Ruiz   Huidobro 4365 "), "RUIZ HUIDOBRO 4365");
        assert.equal(normalizarDomicilio("Valdenégro 4867"), "VALDENEGRO 4867");
        const p = planear(hoy().map((e) => ({ ...e, cuit: e.cuit.replace(/-/g, "") })));
        assert.equal(p.empresasFaltantes.length, 0);
    });
});
