import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDeGrupo } from "./planVacaciones.js";

/*
  La clave del grupo del plan (área × turno × rol) no puede cambiar para los planes ya guardados:
  sin sede tiene que dar exactamente lo de antes. Con sede suma "::s<sede>" antes del rol, así
  Edición · Huidobro y Edición · Libertador son dos grupos aunque compartan turno y rol.
*/
test("claveDeGrupo: sin sede, igual que antes", () => {
  assert.equal(claveDeGrupo({ areaId: "a1", shiftId: "t1", rolFrameId: "r1" }), "a1::t1::r1");
  assert.equal(claveDeGrupo({ areaId: "a1", shiftId: "t1", rolFrameId: null, nombreRol: "Editor" }), "a1::t1::nombre:Editor");
  assert.equal(claveDeGrupo({ areaId: "a1", shiftId: "t1", sedeId: null, rolFrameId: "r1" }), "a1::t1::r1");
});

test("claveDeGrupo: con sede, un grupo por sede", () => {
  const huidobro = claveDeGrupo({ areaId: "a1", shiftId: "t1", sedeId: 3, rolFrameId: "r1" });
  const libertador = claveDeGrupo({ areaId: "a1", shiftId: "t1", sedeId: 7, rolFrameId: "r1" });
  assert.equal(huidobro, "a1::t1::s3::r1");
  assert.notEqual(huidobro, libertador);
});
