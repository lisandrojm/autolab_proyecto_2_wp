import { test } from "node:test";
import assert from "node:assert/strict";
import { aprobadoresDe, estadoDeNivel, etapaDe, esCoordinadorDeLaCadena, nivelQueFalta, puedeAprobarEtapa, type VacacionConCadena } from "./etapaDeAprobacion.js";

const cadena = (...proyectos: { s?: string[]; c?: string[] }[]) => ({ proyectos: proyectos.map((p, i) => ({ projectId: `p${i}`, supervisores: p.s || [], coordinadores: p.c || [] })) });
const ok = (userId: string) => ({ userId, at: "2026-11-15" });

test("sin cadena: va directo al admin", () => {
  const v: VacacionConCadena = { status: "pending", cadena: cadena({}) };
  assert.equal(etapaDe(v), "admin");
  assert.equal(nivelQueFalta(v), "admin");
  assert.equal(estadoDeNivel(v, "supervisor"), "sin_nadie");
  assert.equal(estadoDeNivel(v, "coordinador"), "sin_nadie");
});

test("vieja sin campo cadena: es del admin", () => {
  assert.equal(etapaDe({ status: "pending" }), "admin");
  assert.equal(etapaDe({ status: "pre_approved" }), "admin");
});

test("sólo supervisor: después del supervisor va al admin", () => {
  const v: VacacionConCadena = { status: "pending", cadena: cadena({ s: ["S"] }) };
  assert.equal(etapaDe(v), "supervisor");
  assert.equal(puedeAprobarEtapa(v, "S"), "supervisor");
  assert.equal(nivelQueFalta({ ...v, aprobaciones: { supervisor: ok("S") } }), "admin");
});

test("sólo coordinador: arranca en el coordinador", () => {
  const v: VacacionConCadena = { status: "pending", cadena: cadena({ c: ["C"] }) };
  assert.equal(etapaDe(v), "coordinador");
  assert.equal(estadoDeNivel(v, "supervisor"), "sin_nadie");
  assert.equal(estadoDeNivel(v, "coordinador"), "pendiente");
});

test("supervisor y coordinador: el coordinador espera al supervisor", () => {
  const v: VacacionConCadena = { status: "pending", cadena: cadena({ s: ["S"], c: ["C"] }) };
  assert.equal(etapaDe(v), "supervisor");
  assert.equal(puedeAprobarEtapa(v, "C"), null, "el coordinador no aprueba por el supervisor");
  assert.equal(esCoordinadorDeLaCadena(v, "C"), true);
  assert.equal(estadoDeNivel(v, "coordinador"), "esperando");
  const conSupervisor = { ...v, aprobaciones: { supervisor: ok("S") } };
  assert.equal(etapaDe(conSupervisor), "coordinador");
  assert.equal(puedeAprobarEtapa(conSupervisor, "C"), "coordinador");
  assert.equal(puedeAprobarEtapa(conSupervisor, "S"), null, "el supervisor ya aprobó lo suyo");
  assert.equal(estadoDeNivel(conSupervisor, "supervisor"), "aprobado");
});

test("varios proyectos: cualquiera de cualquier proyecto aprueba su nivel", () => {
  const v: VacacionConCadena = { status: "pending", cadena: cadena({ s: ["S1"], c: ["C1"] }, { s: ["S2"] }, { c: ["C3"] }) };
  assert.deepEqual(aprobadoresDe(v.cadena, "supervisor").sort(), ["S1", "S2"]);
  assert.equal(puedeAprobarEtapa(v, "S2"), "supervisor");
  const conSupervisor = { ...v, aprobaciones: { supervisor: ok("S2") } };
  assert.equal(puedeAprobarEtapa(conSupervisor, "C3"), "coordinador");
});

test("niveles en proyectos distintos: hacen falta los dos", () => {
  const v: VacacionConCadena = { status: "pending", cadena: cadena({ s: ["S"] }, { c: ["C"] }) };
  assert.equal(etapaDe(v), "supervisor");
  assert.equal(etapaDe({ ...v, aprobaciones: { supervisor: ok("S") } }), "coordinador");
});

test("fuera de turno o ya resuelta: nadie aprueba", () => {
  const v: VacacionConCadena = { status: "pending", cadena: cadena({ s: ["S"], c: ["C"] }) };
  assert.equal(puedeAprobarEtapa(v, "X"), null);
  assert.equal(puedeAprobarEtapa({ ...v, status: "pre_approved" }, "S"), null);
  assert.equal(puedeAprobarEtapa({ ...v, status: "rejected" }, "S"), null);
  assert.equal(etapaDe({ ...v, status: "approved" }), null);
});

test("del plan: aprobó el coordinador directo, el supervisor no intervino", () => {
  const v: VacacionConCadena = { status: "pre_approved", cadena: cadena({ s: ["S"], c: ["C"] }), aprobaciones: { coordinador: ok("C") } };
  assert.equal(etapaDe(v), "admin");
  assert.equal(estadoDeNivel(v, "supervisor"), "no_intervino");
  assert.equal(estadoDeNivel(v, "coordinador"), "aprobado");
  assert.equal(estadoDeNivel({ ...v, status: "rejected", aprobaciones: {} }, "coordinador"), "no_intervino");
});
