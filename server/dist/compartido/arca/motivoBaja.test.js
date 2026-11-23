import test from "node:test";
import assert from "node:assert/strict";
import { faltaParaPresentar, motivoDeBajaParaGuardar } from "./motivoBaja.js";
const CATALOGO = new Set(["21", "26", "99"]);
test("sin motivo no se guarda nada: nunca hay un motivo por defecto", () => {
    assert.deepEqual(motivoDeBajaParaGuardar({}), { motivoBajaArca: "", fechaTelegramaBaja: "" });
    // Una fecha de telegrama sin motivo tampoco queda.
    assert.deepEqual(motivoDeBajaParaGuardar({ motivo: " ", fechaTelegrama: "2026-11-10" }), { motivoBajaArca: "", fechaTelegramaBaja: "" });
});
test("la fecha de telegrama sólo existe con renuncia: con otro motivo se descarta sin validarla", () => {
    assert.deepEqual(motivoDeBajaParaGuardar({ motivo: "21", fechaTelegrama: "2026-11-10" }, CATALOGO), { motivoBajaArca: "21", fechaTelegramaBaja: "2026-11-10" });
    assert.deepEqual(motivoDeBajaParaGuardar({ motivo: "99", fechaTelegrama: "2026-11-10" }, CATALOGO), { motivoBajaArca: "99", fechaTelegramaBaja: "" });
    assert.deepEqual(motivoDeBajaParaGuardar({ motivo: "99", fechaTelegrama: "cualquier cosa" }, CATALOGO), { motivoBajaArca: "99", fechaTelegramaBaja: "" });
    // La renuncia se puede guardar sin telegrama (no es obligatorio al cargar): queda como «falta la fecha de telegrama».
    assert.deepEqual(motivoDeBajaParaGuardar({ motivo: "21" }, CATALOGO), { motivoBajaArca: "21", fechaTelegramaBaja: "" });
});
test("lo que no se puede guardar: un código que no está en la tabla, o un telegrama de renuncia que no es fecha", () => {
    assert.throws(() => motivoDeBajaParaGuardar({ motivo: "77" }, CATALOGO), /no está en la tabla/);
    assert.throws(() => motivoDeBajaParaGuardar({ motivo: "21", fechaTelegrama: "10/11/2026" }, CATALOGO), /fecha del telegrama/);
    assert.throws(() => motivoDeBajaParaGuardar({ motivo: "21", fechaTelegrama: "2026-13-40" }, CATALOGO), /fecha del telegrama/);
    // Con la tabla vacía (sin sembrar) no se puede validar el código: se guarda.
    assert.equal(motivoDeBajaParaGuardar({ motivo: "77" }, new Set()).motivoBajaArca, "77");
});
test("qué falta para presentar: el motivo, o el telegrama si es renuncia", () => {
    assert.equal(faltaParaPresentar({}), "motivo");
    assert.equal(faltaParaPresentar({ motivoBajaArca: "", fechaTelegramaBaja: "2026-11-10" }), "motivo");
    assert.equal(faltaParaPresentar({ motivoBajaArca: "21" }), "telegrama");
    assert.equal(faltaParaPresentar({ motivoBajaArca: "21", fechaTelegramaBaja: "2026-11-10" }), "");
    assert.equal(faltaParaPresentar({ motivoBajaArca: "99" }), "");
});
