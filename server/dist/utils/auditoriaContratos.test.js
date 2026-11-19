import { test } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import { camposTocados, diferenciasDeContratos, normalizar, proyeccionPara } from "./auditoriaContratos.js";
import { contextoActual, enContexto } from "./contextoAuditoria.js";
const K1 = new Types.ObjectId();
const K2 = new Types.ObjectId();
const K3 = new Types.ObjectId();
const c = (k, extra = {}) => ({ contratoKey: k, nombre_contrato: "Plazo fijo", fecha_alta_contrato: "2026-10-01", fecha_baja_contrato: "2026-12-31", ...extra });
test("vacíos equivalen: undefined, null, \"\" y [] no son un cambio", () => {
    assert.equal(normalizar(""), null);
    assert.equal(normalizar([]), null);
    assert.deepEqual(diferenciasDeContratos([c(K1, { x: "" })], [c(K1, { x: null, y: [] })]), []);
});
test("fecha como Date o como texto ISO: se compara igual", () => {
    assert.deepEqual(diferenciasDeContratos([c(K1, { d: new Date("2026-10-01T00:00:00.000Z") })], [c(K1, { d: "2026-10-01T00:00:00.000Z" })]), []);
});
test("campo cambiado: un evento modificado con antes y después", () => {
    const ev = diferenciasDeContratos([c(K1, { empresaContratoId: "a" })], [c(K1, { empresaContratoId: "b" })]);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].tipo, "modificado");
    assert.deepEqual(ev[0].cambios, [{ campo: "empresaContratoId", antes: "a", despues: "b" }]);
    assert.equal(ev[0].contratoKey, String(K1));
});
test("se compara por clave, no por posición: mover no es cambiar; quitar uno del medio es UN quitado", () => {
    assert.deepEqual(diferenciasDeContratos([c(K1), c(K2)], [c(K2), c(K1)]), []);
    const ev = diferenciasDeContratos([c(K1), c(K2), c(K3)], [c(K1), c(K3)]);
    assert.deepEqual(ev.map((e) => [e.tipo, e.contratoKey]), [["quitado", String(K2)]]);
});
test("contrato agregado: creado con su resumen", () => {
    const ev = diferenciasDeContratos([c(K1)], [c(K1), c(K2, { fecha_alta_contrato: new Date("2026-11-01T00:00:00Z") })]);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].tipo, "creado");
    assert.equal(ev[0].posicion, 1);
    assert.equal(ev[0].resumen.fecha_alta_contrato, "2026-11-01");
});
test("anulación: un evento anulado con el motivo de la lápida y el resumen del contrato que era", () => {
    const lapida = { contratoKey: K1, estadoContrato: "ANULADO", anulacion: { motivo: "duplicado" } };
    const ev = diferenciasDeContratos([c(K1)], [lapida]);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].tipo, "anulado");
    assert.equal(ev[0].motivo, "duplicado");
    assert.equal(ev[0].resumen.nombre_contrato, "Plazo fijo");
    assert.deepEqual(ev[0].cambios, []);
});
test("vínculo borrado: todos quitados con el motivo", () => {
    const ev = diferenciasDeContratos([c(K1), c(K2)], null, { motivoQuitado: "vínculo eliminado" });
    assert.deepEqual(ev.map((e) => [e.tipo, e.motivo]), [["quitado", "vínculo eliminado"], ["quitado", "vínculo eliminado"]]);
});
test("sin estado anterior: se registra que se escribió, sin inventar cambios", () => {
    const ev = diferenciasDeContratos(null, [c(K1)]);
    assert.equal(ev[0].tipo, "modificado");
    assert.match(ev[0].nota, /sin estado anterior/);
});
test("con campos restringidos (proyección), sólo compara ésos", () => {
    const ev = diferenciasDeContratos([c(K1, { a: 1 })], [c(K1, { a: 2, b: 9 })], { campos: ["a"] });
    assert.deepEqual(ev[0].cambios.map((x) => x.campo), ["a"]);
});
test("texto largo: se guarda recortado, con el largo", () => {
    const largo = "x".repeat(5000);
    const ev = diferenciasDeContratos([c(K1, { contenidoCustomContrato: "" })], [c(K1, { contenidoCustomContrato: largo })]);
    assert.match(String(ev[0].cambios[0].despues), /5000 caracteres/);
});
test("camposTocados: posicional con campo, array filters, push, reemplazo y lo que no toca", () => {
    assert.deepEqual(camposTocados({ $set: { "contracts.$[c].empresaContratoId": 1, "contracts.$[c].nombre_empresa_contrato": "x" } }), { toca: true, todo: false, campos: ["empresaContratoId", "nombre_empresa_contrato"] });
    assert.deepEqual(camposTocados({ $set: { "contracts.3.firmaEnviadaAt": 1 } }), { toca: true, todo: false, campos: ["firmaEnviadaAt"] });
    assert.equal(camposTocados({ $push: { contracts: {} } }).todo, true);
    assert.equal(camposTocados({ $set: { "contracts.$": {} } }).todo, true);
    assert.equal(camposTocados({ $set: { nombre_rol_frame: "x" } }).toca, false);
    assert.equal(camposTocados({ "contracts.0.x": 1 }).toca, true); // $set implícito
    assert.equal(camposTocados([{ $set: { a: 1 } }]).todo, true); // pipeline
    assert.equal(camposTocados({ nombre_proyecto: "x" }, true).todo, true); // reemplazo
});
test("proyección: sin choque entre anulacion y anulacion.motivo", () => {
    const p = proyeccionPara({ toca: true, todo: false, campos: ["anulacion"] });
    assert.equal("contracts.anulacion.motivo" in p, false);
    assert.equal(p["contracts.anulacion"], 1);
});
test("contexto: se hereda y se pisa sólo lo dicho", async () => {
    assert.equal(contextoActual(), null);
    await enContexto({ origen: "app", por: { userId: "u1" }, detalle: "POST /x" }, async () => {
        await new Promise((r) => setTimeout(r, 1));
        assert.equal(contextoActual()?.por?.userId, "u1");
        enContexto({ motivo: "m" }, () => {
            assert.equal(contextoActual()?.detalle, "POST /x");
            assert.equal(contextoActual()?.motivo, "m");
        });
    });
});
