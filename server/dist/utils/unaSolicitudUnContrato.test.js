import { test } from "node:test";
import assert from "node:assert/strict";
import { contratoQueYaTieneLaSolicitud as frena } from "./unaSolicitudUnContrato.js";
const S = "64b000000000000000000001";
const OTRA = "64b000000000000000000002";
const lapida = { contratoKey: "k", estadoContrato: "ANULADO", solicitudId: S };
test("aprobar de nuevo (agregar) una solicitud que ya tiene contrato: frena y dice cuál", () => {
    assert.equal(frena([{ solicitudId: OTRA }, { solicitudId: S }], S, -1), 1);
});
test("editar ESE contrato con la misma solicitud: pasa", () => {
    assert.equal(frena([{}, { solicitudId: S }], S, 1), -1);
});
test("guardar la solicitud sobre OTRO contrato del vínculo: frena", () => {
    assert.equal(frena([{}, { solicitudId: S }], S, 0), 1);
});
test("primera aprobación (nadie la tiene): pasa", () => {
    assert.equal(frena([{ solicitudId: OTRA }, {}], S, -1), -1);
});
test("la que la tenía está anulada: pasa", () => {
    assert.equal(frena([lapida], S, -1), -1);
});
test("sin solicitud (agregar miembro a mano): nunca frena", () => {
    assert.equal(frena([{ solicitudId: S }], "", -1), -1);
});
test("compara como texto (ObjectId vs string)", () => {
    assert.equal(frena([{ solicitudId: { toString: () => S } }], S, -1), 0);
});
