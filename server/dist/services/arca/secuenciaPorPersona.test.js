import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_POR_DEFECTO, momentoDeCorrida } from "./horarioAltasAutomaticas.js";
import { bloqueoPorVigencia, esperanSuTurno, fechasDelRegistro, mandaFechaFin, momentoDetrasDe, momentoTrasBaja, rechazoAltaActivaDestrabado, vueltasPorPersona, } from "./secuenciaPorPersona.js";
const contrato = (o = {}) => ({ userId: "u1", userProjectId: "up1", contractIndex: 1, empresaId: "e1", alta: "2026-11-10", baja: "2026-11-10", ...o });
const presentada = (o = {}) => ({ userId: "u1", userProjectId: "up1", contractIndex: 0, empresaId: "e1", alta: "2026-11-01", baja: "2026-11-01", presentadaEl: "2026-11-01T17:00:00.000Z", ...o });
const relacion = (o = {}) => ({ cuil: "20111111112", empleadoraCuit: "30700000001", inicio: "2026-11-01", fin: "", cerrada: false, ...o });
const pendiente = (o = {}) => ({ cuil: "20111111112", empresaId: "e1", fechaAlta: "2026-11-10", fechaBaja: "2026-11-10", presentable: true, ocupaTurno: true, mandaFin: true, ...o });
/** La sincronización de la mañana del 01/11, antes de la corrida de las 14. */
const SYNC_ANTES = "2026-11-01T09:00:00.000Z";
const SYNC_DESPUES = "2026-11-02T09:00:00.000Z";
/** Un registro de 85 con esas fechas (ddmmyyyy; fin en blanco = tiempo indeterminado). */
const registro85 = (inicio, fin) => "0".repeat(47) + inicio + (fin || " ".repeat(8)) + " ".repeat(22);
describe("lo activo en ARCA y lo recién presentado desde WeProdu", () => {
    const H = { hoy: "2026-11-01" };
    it("una relación SÓLO en ARCA (no presentada por WeProdu) abierta traba, sin fecha de destrabe", () => {
        const b = bloqueoPorVigencia(contrato(), [], [relacion()], H);
        assert.equal(b?.tipo, "activa_arca");
        assert.equal(b?.hasta, "");
        assert.match(b.motivo, /no tiene baja: se presenta cuando ARCA informe la baja \(sync de Relaciones Laborales\)/);
    });
    it("una relación de ARCA con fin pero SIN baja procesada sigue activa, aunque no se pise (el caso del 01/11)", () => {
        const b = bloqueoPorVigencia(contrato({ alta: "2026-10-31", baja: "2026-10-31" }), [], [relacion({ inicio: "2026-10-24", fin: "2026-10-24" })], H);
        assert.equal(b?.tipo, "activa_arca");
        assert.equal(b?.hasta, "2026-10-24");
        assert.match(b.motivo, /todavía no procesó esa baja/);
    });
    it("una relación de ARCA con la baja procesada (cerrada) no traba", () => {
        assert.equal(bloqueoPorVigencia(contrato(), [], [relacion({ fin: "2026-11-05", cerrada: true })], H), null);
    });
    it("presentada desde WeProdu hoy, aunque su baja sea vieja: activa hasta la noche de hoy (el caso del 01/11)", () => {
        const b = bloqueoPorVigencia(contrato({ alta: "2026-10-31", baja: "2026-10-31" }), [presentada({ alta: "2026-10-24", baja: "2026-10-24" })], [], H);
        assert.equal(b?.tipo, "presentada");
        assert.equal(b?.hasta, "2026-11-01");
        assert.match(b.desbloqueo, /Desde el 02\/11\/2026/);
    });
    it("presentada desde WeProdu con baja futura: activa hasta esa baja", () => {
        assert.equal(bloqueoPorVigencia(contrato(), [presentada({ alta: "2026-10-28", baja: "2026-11-05" })], [], H)?.hasta, "2026-11-05");
    });
    it("presentada desde WeProdu que ya venció antes de hoy: ARCA ya la cerró, no traba", () => {
        assert.equal(bloqueoPorVigencia(contrato(), [presentada({ alta: "2026-10-20", baja: "2026-10-20", presentadaEl: "2026-10-20T17:00:00.000Z" })], [], H), null);
    });
    it("una presentada de WeProdu sin baja traba sin fecha de destrabe", () => {
        const b = bloqueoPorVigencia(contrato(), [presentada({ baja: "" })], [], H);
        assert.equal(b?.tipo, "presentada");
        assert.equal(b?.hasta, "");
    });
    it("si ARCA ya lista la presentada, decide ARCA: con la baja procesada no traba, sin procesar sí", () => {
        assert.equal(bloqueoPorVigencia(contrato(), [presentada()], [relacion({ fin: "2026-11-01", cerrada: true })], H), null);
        assert.equal(bloqueoPorVigencia(contrato(), [presentada({ presentadaEl: "2026-10-01T17:00:00.000Z" })], [relacion({ fin: "2026-11-01" })], H)?.tipo, "activa_arca");
    });
    it("si la traban varias, manda la que termina más tarde (abierta gana)", () => {
        const b = bloqueoPorVigencia(contrato(), [presentada({ baja: "2026-11-20" })], [relacion({ inicio: "2026-10-01", fin: "" })], H);
        assert.equal(b?.tipo, "activa_arca");
        const c = bloqueoPorVigencia(contrato(), [presentada({ baja: "2026-11-20" })], [relacion({ inicio: "2026-10-01", fin: "2026-11-05" })], H);
        assert.equal(c?.tipo, "presentada");
        assert.equal(c?.hasta, "2026-11-20");
    });
    it("la relación de ARCA del mismo día es la misma alta ya hecha: no se presenta y queda para revisar", () => {
        const b = bloqueoPorVigencia(contrato(), [], [relacion({ inicio: "2026-11-10", fin: "2026-11-10", cerrada: true })], H);
        assert.equal(b?.tipo, "mismo_dia");
        assert.match(b.motivo, /revisar si esta alta ya está hecha/);
    });
    it("otro contrato presentado desde WeProdu del mismo día es un duplicado", () => {
        const b = bloqueoPorVigencia(contrato(), [presentada({ alta: "2026-11-10", baja: "2026-11-10" })], [], H);
        assert.equal(b?.tipo, "mismo_dia");
        assert.match(b.motivo, /duplicado/);
    });
    it("la misma persona con otra empleadora no traba; el mismo contrato tampoco", () => {
        assert.equal(bloqueoPorVigencia(contrato(), [presentada({ empresaId: "e2" })], [], H), null);
        assert.equal(bloqueoPorVigencia(contrato({ contractIndex: 0 }), [presentada()], [], H), null);
    });
});
describe("el turno por persona y empleadora", () => {
    it("dos pendientes de la misma persona: va la más temprana, la otra espera", () => {
        const cs = [pendiente({ fechaAlta: "2026-11-12", fechaBaja: "2026-11-20" }), pendiente({ fechaAlta: "2026-11-10", fechaBaja: "2026-11-15" })];
        const e = esperanSuTurno(cs);
        assert.equal(e.size, 1);
        assert.equal(e.get(0)?.antes, 1);
        assert.match(e.get(0).motivo, /Espera su turno: antes va el alta del 10\/11\/2026/);
        assert.equal(e.get(0)?.desdeDia, "2026-11-16");
    });
    it("jornadas de un día encadenadas día tras día: una por corrida, cada una detrás de la anterior", () => {
        const cs = ["2026-11-10", "2026-11-11", "2026-11-12"].map((d) => pendiente({ fechaAlta: d, fechaBaja: d }));
        const e = esperanSuTurno(cs);
        assert.equal(e.size, 2);
        assert.equal(e.get(1)?.antes, 0);
        assert.equal(e.get(2)?.antes, 1);
        assert.equal(e.get(1)?.desdeDia, "2026-11-11");
    });
    it("si la anterior no le manda fin a ARCA (indeterminado), sin día previsto", () => {
        const cs = ["2026-11-10", "2026-11-11"].map((d) => pendiente({ fechaAlta: d, fechaBaja: d, mandaFin: false }));
        assert.equal(esperanSuTurno(cs).get(1)?.desdeDia, "");
    });
    it("si la primera está trabada por algo activo, igual ocupa el turno", () => {
        const cs = [pendiente({ fechaAlta: "2026-11-10", presentable: false }), pendiente({ fechaAlta: "2026-11-20", fechaBaja: "2026-11-20" })];
        assert.equal(esperanSuTurno(cs).get(1)?.antes, 0);
    });
    it("una a la que le faltan datos no ocupa turno: no traba a las demás", () => {
        const cs = [pendiente({ fechaAlta: "2026-11-10", presentable: false, ocupaTurno: false }), pendiente({ fechaAlta: "2026-11-11" })];
        assert.equal(esperanSuTurno(cs).size, 0);
    });
    it("la misma persona con dos empleadoras distintas no se bloquea entre sí", () => {
        const cs = [pendiente({ empresaId: "e1" }), pendiente({ empresaId: "e2" })];
        assert.equal(esperanSuTurno(cs).size, 0);
    });
});
describe("la fecha prevista", () => {
    const cfg = CONFIG_POR_DEFECTO;
    const ahora = new Date("2026-11-01T15:00:00-03:00");
    const hoy = "2026-11-01";
    it("trabada por algo activo con baja futura: la primera corrida del día siguiente a la baja", () => {
        assert.equal(momentoTrasBaja("2026-10-20", "2026-11-05", cfg, ahora, hoy)?.toISOString(), momentoDeCorrida("2026-11-06", cfg).toISOString());
    });
    it("con la baja ya pasada (ARCA no la procesó): no antes de mañana, cuando la trae la sincronización", () => {
        assert.equal(momentoTrasBaja("2026-10-31", "2026-10-24", cfg, ahora, hoy)?.toISOString(), momentoDeCorrida("2026-11-02", cfg).toISOString());
    });
    it("si su propio turno es más tarde, manda el turno", () => {
        assert.equal(momentoTrasBaja("2026-11-20", "2026-11-05", cfg, ahora, hoy)?.toISOString(), momentoDeCorrida("2026-11-20", cfg).toISOString());
    });
    it("con anticipación, igual no antes del día siguiente a la baja", () => {
        const c2 = { ...cfg, diasAntes: 2 };
        assert.equal(momentoTrasBaja("2026-10-20", "2026-11-05", c2, ahora, hoy)?.toISOString(), momentoDeCorrida("2026-11-06", c2).toISOString());
    });
    it("detrás de otra: el día siguiente a la corrida de la anterior", () => {
        const espera = { antes: 0, motivo: "", desbloqueo: "", desdeDia: "2026-10-25" };
        assert.equal(momentoDetrasDe("2026-10-25", espera, momentoDeCorrida("2026-11-02", cfg), cfg, ahora, hoy)?.toISOString(), momentoDeCorrida("2026-11-03", cfg).toISOString());
    });
    it("detrás de otra sin fecha, o que espera una baja que hay que informar: sin fecha", () => {
        assert.equal(momentoDetrasDe("2026-10-25", { antes: 0, motivo: "", desbloqueo: "", desdeDia: "2026-10-25" }, null, cfg, ahora, hoy), null);
        assert.equal(momentoDetrasDe("2026-10-25", { antes: 0, motivo: "", desbloqueo: "", desdeDia: "" }, momentoDeCorrida("2026-11-02", cfg), cfg, ahora, hoy), null);
    });
});
describe("el rechazo por alta activa", () => {
    const reg = registro85("10112026", "10112026");
    it("sin sincronización posterior ni cambio de fechas, sigue trabado", () => {
        assert.equal(rechazoAltaActivaDestrabado({ rechazadaEl: "2026-11-01T17:00:00Z", registroAlRechazo: reg, registroActual: reg, ultimaSyncOk: SYNC_ANTES }), false);
    });
    it("una sincronización de Relaciones Laborales posterior al rechazo lo destraba", () => {
        assert.equal(rechazoAltaActivaDestrabado({ rechazadaEl: "2026-11-01T17:00:00Z", ultimaSyncOk: SYNC_DESPUES }), true);
    });
    it("si cambiaron las fechas que van a ARCA, se destraba", () => {
        assert.equal(rechazoAltaActivaDestrabado({ rechazadaEl: "2026-11-01T17:00:00Z", registroAlRechazo: reg, registroActual: registro85("11112026", "11112026") }), true);
    });
    it("lo demás del registro no cuenta como cambio", () => {
        const otro = "1" + reg.slice(1);
        assert.equal(fechasDelRegistro(otro), fechasDelRegistro(reg));
        assert.equal(rechazoAltaActivaDestrabado({ rechazadaEl: "2026-11-01T17:00:00Z", registroAlRechazo: reg, registroActual: otro }), false);
    });
});
describe("el registro de 85 y las vueltas", () => {
    it("lee si le manda fecha de fin a ARCA", () => {
        assert.equal(mandaFechaFin(registro85("10112026", "10112026")), true);
        assert.equal(mandaFechaFin(registro85("10112026", "")), false);
        assert.equal(mandaFechaFin(null), false);
    });
    it("la k-ésima alta de cada persona va en la vuelta k, por fecha, aunque llegue al final", () => {
        const a = { cuil: "A", fechaAlta: "2026-11-11" };
        const b = { cuil: "B", fechaAlta: "2026-11-10" };
        const a0 = { cuil: "A", fechaAlta: "2026-11-10" };
        assert.deepEqual(vueltasPorPersona([a, b, a0]), [[b, a0], [a]]);
    });
});
