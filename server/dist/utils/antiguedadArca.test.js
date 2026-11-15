/**
 *   npx tsx --test src/utils/antiguedadArca.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { antiguedadDe, antiguedadesDe, baseDeAntiguedad, diasEntre, empresaDeComputo, empresaVigenteCuit, empresaVigenteDe, fusionarTramos, tramoTrabajado } from "./antiguedadArca.js";
const HOY = "2026-10-12";
const FZERO = "30710295839";
const DOS_MIL_TREINTA = "30717068374";
const r = (inicio, fin, empleadoraCuit = FZERO, apellidoNombre = "ROMERO GABRIELA AGUEDA") => ({ empleadoraCuit, fechaInicio: inicio, fechaFin: fin, apellidoNombre });
describe("fusionar tramos", () => {
    it("dos relaciones solapadas son un tramo: los días en común se cuentan una vez", () => {
        assert.deepEqual(fusionarTramos([{ desde: "2024-08-04", hasta: "2024-08-09" }, { desde: "2024-08-04", hasta: "2024-08-04" }]), [{ desde: "2024-08-04", hasta: "2024-08-09" }]);
        assert.deepEqual(fusionarTramos([{ desde: "2021-03-01", hasta: "2021-03-31" }, { desde: "2021-03-15", hasta: "2021-04-10" }]), [{ desde: "2021-03-01", hasta: "2021-04-10" }]);
    });
    it("consecutivas (31/03 y 01/04) se pegan; con un día de hueco quedan separadas", () => {
        assert.equal(fusionarTramos([{ desde: "2021-03-01", hasta: "2021-03-31" }, { desde: "2021-04-01", hasta: "2021-04-02" }]).length, 1);
        assert.equal(fusionarTramos([{ desde: "2021-03-01", hasta: "2021-03-31" }, { desde: "2021-04-02", hasta: "2021-04-02" }]).length, 2);
    });
    it("un tramo con fin anterior al inicio se ignora", () => {
        assert.deepEqual(fusionarTramos([{ desde: "2021-03-05", hasta: "2021-03-01" }]), []);
    });
});
describe("el tramo trabajado al día de hoy", () => {
    it("abierta: hasta hoy", () => assert.deepEqual(tramoTrabajado(r("2026-08-10", null), HOY), { desde: "2026-08-10", hasta: HOY }));
    it("termina en el futuro: hasta hoy", () => assert.deepEqual(tramoTrabajado(r("2026-10-01", "2026-12-31"), HOY), { desde: "2026-10-01", hasta: HOY }));
    it("todavía no empezó: nada", () => assert.equal(tramoTrabajado(r("2026-11-01", "2026-11-30"), HOY), null));
});
describe("la antigüedad de una persona", () => {
    it("ROMERO GABRIELA: una relación de tres días (31/03 → 02/04/2021)", () => {
        const m = antiguedadDe([r("2021-03-31", "2021-04-02")], HOY);
        assert.equal(m.primeraAlta, "2021-03-31");
        assert.equal(m.ultimaFecha, "2021-04-02");
        assert.equal(m.diasTrabajados, 3);
        assert.equal(m.cantidadContratos, 1);
        assert.equal(m.tieneRelacionAbierta, false);
        assert.equal(m.antiguedadDesdePrimeraAlta.dias, diasEntre("2021-03-31", HOY));
        assert.equal(m.antiguedadDesdePrimeraAlta.anios, 5.53);
        assert.deepEqual(m.empresas, [FZERO]);
    });
    it("solapadas (BRUKALO 04/08→04/08 y 04/08→09/08/2024): 6 días, no 7; dos contratos", () => {
        const m = antiguedadDe([r("2024-08-04", "2024-08-04"), r("2024-08-04", "2024-08-09")], HOY);
        assert.equal(m.diasTrabajados, 6);
        assert.equal(m.cantidadContratos, 2);
    });
    it("con huecos: la antigüedad desde la primera alta los incluye; los días trabajados no", () => {
        const m = antiguedadDe([r("2021-03-01", "2021-03-31"), r("2021-06-01", "2021-06-30")], HOY);
        assert.equal(m.diasTrabajados, 31 + 30);
        assert.equal(m.antiguedadDesdePrimeraAlta.dias, diasEntre("2021-03-01", HOY));
        assert.equal(m.ultimaFecha, "2021-06-30");
    });
    it("con una relación abierta: cuenta hasta hoy y la última fecha es hoy", () => {
        const m = antiguedadDe([r("2026-08-10", null, DOS_MIL_TREINTA)], HOY);
        assert.equal(m.tieneRelacionAbierta, true);
        assert.equal(m.ultimaFecha, HOY);
        assert.equal(m.diasTrabajados, diasEntre("2026-08-10", HOY) + 1);
    });
    it("el nombre es el de la relación más reciente", () => {
        const m = antiguedadDe([r("2021-03-31", "2021-04-02", FZERO, "ROMERO GABRIELA"), r("2024-05-01", "2024-05-31", FZERO, "ROMERO GABRIELA AGUEDA")], HOY);
        assert.equal(m.apellidoNombre, "ROMERO GABRIELA AGUEDA");
    });
    it("sin relaciones no hay antigüedad", () => assert.equal(antiguedadDe([], HOY), null));
});
describe("una fila por empleadora más la global", () => {
    it("dos empresas que se solapan: la global no cuenta doble y dice qué CUIT aportan", () => {
        const filas = antiguedadesDe([r("2021-03-01", "2021-03-31", FZERO), r("2021-03-15", "2021-04-15", DOS_MIL_TREINTA)], HOY);
        assert.deepEqual(filas.map((f) => f.empleadoraCuit), [null, FZERO, DOS_MIL_TREINTA]);
        const global = filas[0].metricas;
        assert.equal(global.diasTrabajados, 46); // 01/03 → 15/04
        assert.equal(global.cantidadContratos, 2);
        assert.deepEqual(global.empresas, [FZERO, DOS_MIL_TREINTA]);
        assert.equal(filas[1].metricas.diasTrabajados, 31);
        assert.equal(filas[2].metricas.diasTrabajados, 32);
    });
    it("correr el cálculo dos veces da lo mismo (no infla nada)", () => {
        const rel = [r("2021-03-31", "2021-04-02"), r("2021-03-31", "2021-04-02")];
        assert.equal(antiguedadDe(rel, HOY).diasTrabajados, 3);
    });
});
describe("de qué empleadora se toma la antigüedad (vacaciones, 15/11/2026)", () => {
    const GRINI = "33717673749";
    const f = (empleadoraCuit, primeraAlta, ultimaFecha, tieneRelacionAbierta = false) => ({ empleadoraCuit, primeraAlta, ultimaFecha, tieneRelacionAbierta });
    it("la abierta gana aunque la otra tenga más días", () => {
        const filas = [f(FZERO, "2015-01-01", "2026-03-31"), f(DOS_MIL_TREINTA, "2026-04-01", HOY, true)];
        assert.equal(empresaVigenteDe(filas, HOY).empleadoraCuit, DOS_MIL_TREINTA);
    });
    it("sin abiertas, la de última fecha mayor", () => {
        const filas = [f(DOS_MIL_TREINTA, "2025-01-01", "2026-05-31"), f(GRINI, "2024-01-01", "2026-08-31")];
        assert.equal(empresaVigenteDe(filas, HOY).empleadoraCuit, GRINI);
    });
    it("un fin futuro cuenta como vigente", () => {
        const filas = [f(FZERO, "2020-01-01", "2026-12-31"), f(GRINI, "2026-01-01", HOY, true)];
        // Las dos vigentes: gana la de última fecha mayor (FZERO termina el 31/12).
        assert.equal(empresaVigenteDe(filas, HOY).empleadoraCuit, FZERO);
    });
    it("dos abiertas el mismo día: desempata la primera alta mayor (la nueva)", () => {
        const filas = [f(FZERO, "2015-01-01", HOY, true), f(DOS_MIL_TREINTA, "2026-04-01", HOY, true)];
        assert.equal(empresaVigenteDe(filas, HOY).empleadoraCuit, DOS_MIL_TREINTA);
    });
    it("sin filas no hay empresa", () => assert.equal(empresaVigenteDe([], HOY), null));
    it("sólo FZERO: FZERO, motivo «unica»", () => {
        const r = empresaDeComputo([f(FZERO, "2015-01-01", "2026-03-31")], HOY);
        assert.equal(r.fila.empleadoraCuit, FZERO);
        assert.equal(r.motivo, "unica");
    });
    it("FZERO vieja + 2030 nueva: 2030, motivo «vigente»", () => {
        const r = empresaDeComputo([f(FZERO, "2015-01-01", "2026-03-31"), f(DOS_MIL_TREINTA, "2026-04-01", HOY, true)], HOY);
        assert.equal(r.fila.empleadoraCuit, DOS_MIL_TREINTA);
        assert.equal(r.motivo, "vigente");
    });
    it("precedencia manual: la primera de la lista que tenga, aunque no sea la vigente", () => {
        const filas = [f(FZERO, "2015-01-01", "2026-03-31"), f(DOS_MIL_TREINTA, "2026-04-01", HOY, true)];
        const r = empresaDeComputo(filas, HOY, { modo: "precedenciaManual", precedencia: [GRINI, FZERO, DOS_MIL_TREINTA] });
        assert.equal(r.fila.empleadoraCuit, FZERO);
        assert.equal(r.motivo, "precedencia");
    });
    it("precedencia manual sin ninguna de la lista: la vigente", () => {
        const filas = [f(FZERO, "2015-01-01", "2026-03-31"), f(DOS_MIL_TREINTA, "2026-04-01", HOY, true)];
        assert.equal(empresaDeComputo(filas, HOY, { modo: "precedenciaManual", precedencia: [GRINI] }).motivo, "vigente");
    });
    it("la precedencia sólo vale en modo manual", () => {
        const filas = [f(FZERO, "2015-01-01", "2026-03-31"), f(DOS_MIL_TREINTA, "2026-04-01", HOY, true)];
        assert.equal(empresaDeComputo(filas, HOY, { modo: "empresaVigente", precedencia: [FZERO] }).fila.empleadoraCuit, DOS_MIL_TREINTA);
    });
});
describe("la base de antigüedad de las vacaciones (15/11/2026)", () => {
    const GRINI = "33717673749";
    const e = (empleadoraCuit, dias, primeraAlta, ultimaFecha, tieneRelacionAbierta = false) => ({ empleadoraCuit, dias, primeraAlta, ultimaFecha, tieneRelacionAbierta });
    const FZERO_VIEJA = e(FZERO, 3000, "2018-01-01", "2026-03-31");
    const DOSMIL_NUEVA = e(DOS_MIL_TREINTA, 195, "2026-04-01", HOY, true);
    const base = { hayArca: true, porContratos: null, motivoSuma: null, hoy: HOY };
    it("FZERO + 2030 (ARCA): usa los días de 2030 e ignora los de FZERO", () => {
        const r = baseDeAntiguedad({ ...base, diasSumados: 3195, porArca: [FZERO_VIEJA, DOSMIL_NUEVA] });
        assert.equal(r.dias, 195);
        assert.equal(r.elegida.fila.empleadoraCuit, DOS_MIL_TREINTA);
        assert.equal(r.elegida.motivo, "vigente");
        assert.equal(r.elegida.consideradas.length, 2);
    });
    it("sólo FZERO: FZERO, y el número no cambia respecto de la suma", () => {
        const r = baseDeAntiguedad({ ...base, diasSumados: 3000, porArca: [FZERO_VIEJA] });
        assert.equal(r.dias, 3000);
        assert.equal(r.elegida.motivo, "unica");
    });
    it("2030 + GRINI: la vigente", () => {
        const r = baseDeAntiguedad({ ...base, diasSumados: 500, porArca: [e(DOS_MIL_TREINTA, 300, "2025-01-01", "2026-06-30"), e(GRINI, 200, "2026-07-01", HOY, true)] });
        assert.equal(r.dias, 200);
        assert.equal(r.elegida.fila.empleadoraCuit, GRINI);
    });
    it("sumarEntreEmpresas = true reproduce el número viejo (la suma)", () => {
        const r = baseDeAntiguedad({ ...base, diasSumados: 3195, porArca: [FZERO_VIEJA, DOSMIL_NUEVA], motivoSuma: "config" });
        assert.equal(r.dias, 3195);
        assert.equal(r.elegida, null);
    });
    it("un período cerrado conserva la suma", () => {
        assert.equal(baseDeAntiguedad({ ...base, diasSumados: 3195, porArca: [FZERO_VIEJA, DOSMIL_NUEVA], motivoSuma: "periodoCerrado" }).dias, 3195);
    });
    it("sin ARCA: los contratos de WeProdu agrupados por empresa, misma regla", () => {
        const r = baseDeAntiguedad({ ...base, hayArca: false, diasSumados: 400, porArca: [], porContratos: [e(FZERO, 350, "2025-01-01", "2026-02-28"), e(DOS_MIL_TREINTA, 50, "2026-09-01", HOY, true)] });
        assert.equal(r.dias, 50);
        assert.equal(r.elegida.fuente, "contratos");
    });
    it("sin ARCA y con un contrato sin empresa: se suma como antes", () => {
        const r = baseDeAntiguedad({ ...base, hayArca: false, diasSumados: 400, porArca: [], porContratos: null });
        assert.equal(r.dias, 400);
        assert.equal(r.elegida, null);
    });
});
describe("empresaVigenteCuit (la forma corta)", () => {
    const GRINI = "33717673749";
    const f = (empleadoraCuit, primeraAlta, ultimaFecha, tieneRelacionAbierta = false) => ({ empleadoraCuit, primeraAlta, ultimaFecha, tieneRelacionAbierta });
    it("abierta gana", () => assert.equal(empresaVigenteCuit([f(FZERO, "2015-01-01", "2026-03-31"), f(DOS_MIL_TREINTA, "2026-04-01", HOY, true)], "empresaVigente", [], HOY), DOS_MIL_TREINTA));
    it("sin abiertas, la última fecha mayor", () => assert.equal(empresaVigenteCuit([f(DOS_MIL_TREINTA, "2025-01-01", "2026-05-31"), f(GRINI, "2024-01-01", "2026-08-31")], "empresaVigente", [], HOY), GRINI));
    it("empate de última fecha: la primera alta mayor", () => assert.equal(empresaVigenteCuit([f(FZERO, "2015-01-01", "2026-08-31"), f(GRINI, "2024-01-01", "2026-08-31")], "empresaVigente", [], HOY), GRINI));
    it("precedencia manual", () => assert.equal(empresaVigenteCuit([f(FZERO, "2015-01-01", "2026-03-31"), f(DOS_MIL_TREINTA, "2026-04-01", HOY, true)], "precedenciaManual", [FZERO], HOY), FZERO));
    it("sin filas", () => assert.equal(empresaVigenteCuit([]), null));
});
