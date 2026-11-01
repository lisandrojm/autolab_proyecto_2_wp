import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AltaPresentada, RelacionArcaResumida } from "./altasVigentes.js";
import { CONFIG_POR_DEFECTO, momentoDeCorrida } from "./horarioAltasAutomaticas.js";
import {
  bloqueoPorVigencia,
  esperanSuTurno,
  fechasDelRegistro,
  mandaFechaFin,
  momentoTrasBaja,
  rechazoAltaActivaDestrabado,
  vueltasPorPersona,
  type ContratoPendiente,
  type PendienteEnSecuencia,
} from "./secuenciaPorPersona.js";

const contrato = (o: Partial<ContratoPendiente> = {}): ContratoPendiente => ({ userId: "u1", userProjectId: "up1", contractIndex: 1, empresaId: "e1", alta: "2026-11-10", baja: "2026-11-10", ...o });
const presentada = (o: Partial<AltaPresentada> = {}): AltaPresentada => ({ userId: "u1", userProjectId: "up1", contractIndex: 0, empresaId: "e1", alta: "2026-11-01", baja: "2026-11-15", ...o });
const relacion = (o: Partial<RelacionArcaResumida> = {}): RelacionArcaResumida => ({ cuil: "20111111112", empleadoraCuit: "30700000001", inicio: "2026-11-01", fin: "", ...o });
const pendiente = (o: Partial<PendienteEnSecuencia> = {}): PendienteEnSecuencia => ({ cuil: "20111111112", empresaId: "e1", fechaAlta: "2026-11-10", fechaBaja: "2026-11-10", presentable: true, ocupaTurno: true, mandaFin: true, ...o });

/** Un registro de 85 con esas fechas (ddmmyyyy; fin en blanco = tiempo indeterminado). */
const registro85 = (inicio: string, fin: string) => "0".repeat(47) + inicio + (fin || " ".repeat(8)) + " ".repeat(22);

describe("vigencia según WeProdu y según ARCA", () => {
  it("una presentada de WeProdu sin baja bloquea, sin fecha de destrabe", () => {
    const b = bloqueoPorVigencia(contrato(), [presentada({ baja: "" })], []);
    assert.equal(b?.tipo, "vigente_weprodu");
    assert.equal(b?.hasta, "");
    assert.match(b!.motivo, /^Ya tiene un alta presentada/);
  });
  it("una presentada de WeProdu con baja bloquea hasta esa baja", () => {
    const b = bloqueoPorVigencia(contrato(), [presentada()], []);
    assert.equal(b?.hasta, "2026-11-15");
  });
  it("una relación SÓLO en ARCA (no presentada por WeProdu) abierta bloquea, y espera la baja de ARCA", () => {
    const b = bloqueoPorVigencia(contrato(), [], [relacion()]);
    assert.equal(b?.tipo, "vigente_arca");
    assert.equal(b?.hasta, "");
    assert.match(b!.motivo, /no tiene baja: se presenta cuando ARCA informe la baja \(sync de Relaciones Laborales\)/);
  });
  it("una relación sólo en ARCA cerrada bloquea hasta su fin", () => {
    const b = bloqueoPorVigencia(contrato(), [], [relacion({ fin: "2026-11-12" })]);
    assert.equal(b?.hasta, "2026-11-12");
  });
  it("una relación de ARCA cerrada antes del alta no bloquea", () => {
    assert.equal(bloqueoPorVigencia(contrato(), [], [relacion({ fin: "2026-11-09" })]), null);
  });
  it("si lo pisan las dos, manda la que termina más tarde (abierta gana)", () => {
    const b = bloqueoPorVigencia(contrato(), [presentada({ baja: "2026-11-20" })], [relacion({ fin: "" })]);
    assert.equal(b?.tipo, "vigente_arca");
    assert.equal(b?.hasta, "");
    const c = bloqueoPorVigencia(contrato(), [presentada({ baja: "2026-11-20" })], [relacion({ fin: "2026-11-12" })]);
    assert.equal(c?.tipo, "vigente_weprodu");
    assert.equal(c?.hasta, "2026-11-20");
  });
  it("la relación de ARCA del mismo día es la misma alta ya hecha: no se presenta y queda para revisar", () => {
    const b = bloqueoPorVigencia(contrato(), [], [relacion({ inicio: "2026-11-10", fin: "2026-11-10" })]);
    assert.equal(b?.tipo, "mismo_dia_arca");
    assert.match(b!.motivo, /revisar si esta alta ya está hecha/);
  });
  it("con nada vigente, null", () => {
    assert.equal(bloqueoPorVigencia(contrato(), [presentada({ empresaId: "e2" })], []), null);
  });
});

describe("el turno por persona y empleadora", () => {
  it("dos pendientes de la misma persona que se pisan: va la más temprana, la otra espera", () => {
    const cs = [pendiente({ fechaAlta: "2026-11-12", fechaBaja: "2026-11-20" }), pendiente({ fechaAlta: "2026-11-10", fechaBaja: "2026-11-15" })];
    const e = esperanSuTurno(cs);
    assert.equal(e.size, 1);
    assert.equal(e.get(0)?.antes, 1);
    assert.match(e.get(0)!.motivo, /Espera su turno: antes va el alta del 10\/11\/2026/);
    assert.equal(e.get(0)?.desdeDia, "2026-11-16");
  });
  it("jornadas de un día encadenadas, con fecha de fin a ARCA: salen todas en la misma corrida", () => {
    const cs = ["2026-11-10", "2026-11-11", "2026-11-12"].map((d) => pendiente({ fechaAlta: d, fechaBaja: d }));
    assert.equal(esperanSuTurno(cs).size, 0);
  });
  it("encadenadas pero sin fecha de fin a ARCA (indeterminado): turno estricto", () => {
    const cs = ["2026-11-10", "2026-11-11"].map((d) => pendiente({ fechaAlta: d, fechaBaja: d, mandaFin: false }));
    const e = esperanSuTurno(cs);
    assert.equal(e.size, 1);
    assert.equal(e.get(1)?.desdeDia, "");
    assert.match(e.get(1)!.desbloqueo, /ARCA informe su baja/);
  });
  it("si la primera está bloqueada por algo vigente, las siguientes esperan aunque encadenen", () => {
    const cs = [pendiente({ fechaAlta: "2026-11-10", presentable: false }), pendiente({ fechaAlta: "2026-11-11", fechaBaja: "2026-11-11" })];
    assert.equal(esperanSuTurno(cs).get(1)?.antes, 0);
  });
  it("una a la que le faltan datos no ocupa turno: no traba a las demás", () => {
    const cs = [pendiente({ fechaAlta: "2026-11-10", fechaBaja: "2026-11-30", presentable: false, ocupaTurno: false }), pendiente({ fechaAlta: "2026-11-11" })];
    assert.equal(esperanSuTurno(cs).size, 0);
  });
  it("la misma persona con dos empleadoras distintas no se bloquea entre sí", () => {
    const cs = [pendiente({ empresaId: "e1", fechaBaja: "2026-11-30" }), pendiente({ empresaId: "e2", fechaBaja: "2026-11-30" })];
    assert.equal(esperanSuTurno(cs).size, 0);
  });
  it("cortada la fila, todas las siguientes esperan, cada una detrás de la anterior", () => {
    const cs = [pendiente({ fechaAlta: "2026-11-10", fechaBaja: "2026-11-20" }), pendiente({ fechaAlta: "2026-11-12", fechaBaja: "2026-11-12" }), pendiente({ fechaAlta: "2026-11-25", fechaBaja: "2026-11-25" })];
    const e = esperanSuTurno(cs);
    assert.equal(e.get(1)?.antes, 0);
    assert.equal(e.get(2)?.antes, 1);
    assert.equal(e.get(2)?.desdeDia, "");
  });
});

describe("la fecha prevista después de una baja", () => {
  const cfg = CONFIG_POR_DEFECTO;
  const ahora = new Date("2026-11-01T15:00:00-03:00");
  it("la primera corrida del día siguiente a la baja", () => {
    assert.equal(momentoTrasBaja("2026-10-20", "2026-11-05", cfg, ahora, "2026-11-01")?.toISOString(), momentoDeCorrida("2026-11-06", cfg).toISOString());
  });
  it("si su propio turno es más tarde, manda el turno", () => {
    assert.equal(momentoTrasBaja("2026-11-20", "2026-11-05", cfg, ahora, "2026-11-01")?.toISOString(), momentoDeCorrida("2026-11-20", cfg).toISOString());
  });
  it("con anticipación, la corrida del día siguiente a la baja igual (no antes)", () => {
    const c2 = { ...cfg, diasAntes: 2 };
    assert.equal(momentoTrasBaja("2026-10-20", "2026-11-05", c2, ahora, "2026-11-01")?.toISOString(), momentoDeCorrida("2026-11-06", c2).toISOString());
  });
  it("si la baja ya pasó, la próxima corrida", () => {
    assert.equal(momentoTrasBaja("2026-10-20", "2026-10-25", cfg, ahora, "2026-11-01")?.toISOString(), momentoDeCorrida("2026-11-02", cfg).toISOString());
  });
});

describe("el rechazo por alta activa", () => {
  const reg = registro85("10112026", "10112026");
  it("sin sincronización posterior ni cambio de fechas, sigue trabado", () => {
    assert.equal(rechazoAltaActivaDestrabado({ rechazadaEl: "2026-11-01T17:00:00Z", registroAlRechazo: reg, registroActual: reg, ultimaSyncOk: "2026-11-01T09:00:00Z" }), false);
  });
  it("una sincronización de Relaciones Laborales posterior al rechazo lo destraba", () => {
    assert.equal(rechazoAltaActivaDestrabado({ rechazadaEl: "2026-11-01T17:00:00Z", ultimaSyncOk: "2026-11-02T09:00:00Z" }), true);
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
