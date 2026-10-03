import { test } from "node:test";
import assert from "node:assert/strict";
import { momentoDeCarga, motivoParaDescartarArchivo } from "./archivoDeContrato.js";
/* El caso real: contrato nuevo del 01/10 (Pedido de AFIP), recibo de sueldo de julio en «Requested
   signatures» modificado el 30/08, sin fechas en el nombre. Antes lo avanzaba a «Disponible». */
test("un archivo anterior a la carga del contrato se descarta", () => {
    const contrato = { creadoEl: momentoDeCarga("2026-10-01T20:02:02.933Z"), fechaAlta: "20261001", fechaBaja: "20261031" };
    assert.equal(motivoParaDescartarArchivo({ modificadoEl: "2026-08-30T21:40:01Z" }, contrato, []), "anterior_al_contrato");
});
test("un archivo posterior a la carga, sin fechas en el nombre, es plausible", () => {
    const contrato = { creadoEl: momentoDeCarga("2026-10-01T20:02:02.933Z"), fechaAlta: "20261001", fechaBaja: "20261031" };
    assert.equal(motivoParaDescartarArchivo({ modificadoEl: "2026-10-02T10:00:00Z" }, contrato, []), null);
});
test("si el nombre trae fechas, alguna tiene que ser la del contrato", () => {
    const contrato = { creadoEl: momentoDeCarga("2026-10-01T20:02:02.933Z"), fechaAlta: "20261001", fechaBaja: "20261031" };
    // Contrato firmado de septiembre, subido después (p. ej. re-subido): es de OTRO contrato de la persona.
    assert.equal(motivoParaDescartarArchivo({ modificadoEl: "2026-10-05T10:00:00Z" }, contrato, ["20260901", "20260930"]), "fechas_de_otro_contrato");
    assert.equal(motivoParaDescartarArchivo({ modificadoEl: "2026-10-05T10:00:00Z" }, contrato, ["20261001", "20261031"]), null);
    // Alcanza con una: el alta sola también identifica.
    assert.equal(motivoParaDescartarArchivo({ modificadoEl: "2026-10-05T10:00:00Z" }, contrato, ["20261001"]), null);
});
test("sin dato no se opina", () => {
    // Sin fecha de modificación → la regla 1 no aplica; sin fechas en el contrato → la regla 2 no aplica.
    assert.equal(motivoParaDescartarArchivo({}, { creadoEl: momentoDeCarga("2026-10-01T00:00:00Z"), fechaAlta: "", fechaBaja: "" }, ["20260901"]), null);
    // Contrato viejo sin fecha_carga → la regla 1 no aplica.
    assert.equal(motivoParaDescartarArchivo({ modificadoEl: "2026-08-30T21:40:01Z" }, { creadoEl: null, fechaAlta: "20261001", fechaBaja: "20261031" }, []), null);
    assert.equal(momentoDeCarga(undefined), null);
    assert.equal(momentoDeCarga("no es fecha"), null);
    assert.equal(momentoDeCarga(new Date("2026-10-01T00:00:00Z")), Date.parse("2026-10-01T00:00:00Z"));
});
test("la regla 1 se aplica a cualquier vía de identificación: también con CUIT en el nombre", () => {
    // Un contrato firmado viejo de la misma persona, con su CUIT y SIN fechas, tampoco puede avanzar al nuevo.
    const contrato = { creadoEl: momentoDeCarga("2026-10-01T20:02:02.933Z"), fechaAlta: "20261001", fechaBaja: "20261031" };
    assert.equal(motivoParaDescartarArchivo({ modificadoEl: "2026-07-20T13:55:02Z" }, contrato, []), "anterior_al_contrato");
});
