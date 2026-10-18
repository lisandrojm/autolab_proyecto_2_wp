/**
 *   npx tsx --test src/utils/areasRoles.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rolesFrameDe, payloadDeArea } from "./areasRoles";

const A = "64a1b2c3d4e5f60718293a4b";
const B = "64a1b2c3d4e5f60718293a4c";

describe("los roles empresa de un área, leídos de la respuesta del server", () => {
  it("conserva los ids tal como vienen (strings)", () => {
    assert.deepEqual(rolesFrameDe({ name: "Técnica", rolesFrame: [A, B] }), [A, B]);
  });
  it("acepta ids poblados (documentos con _id) y repetidos", () => {
    assert.deepEqual(rolesFrameDe({ rolesFrame: [{ _id: A, name: "Editor" }, B, A] }), [A, B]);
  });
  it("sin el campo (server viejo) devuelve undefined, que no es lo mismo que «sin roles»", () => {
    assert.equal(rolesFrameDe({ name: "Técnica" }), undefined);
    assert.deepEqual(rolesFrameDe({ rolesFrame: [] }), []);
  });
  it("descarta lo que no es un id", () => {
    assert.deepEqual(rolesFrameDe({ rolesFrame: ["", null, "no-es-id", A] }), [A]);
  });
});

describe("lo que se manda al guardar un área", () => {
  const form = { name: "Técnica", description: "", rolesFrame: [A] };
  it("al crear, los roles viajan", () => {
    assert.deepEqual(payloadDeArea(form, null), form);
  });
  it("al editar un área hidratada, viajan los roles del formulario (tildar y destildar cambia la asignación)", () => {
    assert.deepEqual(payloadDeArea({ ...form, rolesFrame: [] }, { rolesFrame: [A, B] }), { ...form, rolesFrame: [] });
    assert.deepEqual(payloadDeArea(form, { rolesFrame: [] }), form);
  });
  it("al editar un área que NO venía con el campo, `rolesFrame` se omite: guardar el nombre no borra los roles", () => {
    const p = payloadDeArea({ ...form, rolesFrame: [] }, { rolesFrame: undefined });
    assert.equal("rolesFrame" in p, false);
    assert.equal(p.name, "Técnica");
  });
});
