import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fechaFirmaDeNombre, formatearFechaFirma } from "./fechaFirmaDropboxSign.js";

/**
 * Nombres reales de «Requested signatures» (anonimizados). El sello es UTC: para el primero, el mail
 * «ALVARO MARTINEZ firmó …» llegó el 2026-10-07T19:07:35Z y el sello dice 19h07m43s.
 */
const CON_SELLO = "426_LN+_MARTINEZ_Contrato_Plazo-fijo-6x6_D-20261001_H-20261031_20365478792_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000003.pdf_ Firma solicit Wed, 07 Oct 2026 19h07m43s.pdf";
const SIN_SELLO = "426_LN+_MARTINEZ_Contrato_Plazo-fijo-6x6_D-20261001_H-20261031_20365478792_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000003.pdf";

describe("fechaFirmaDeNombre", () => {
  it("lee el sello del nombre como UTC", () => {
    assert.equal(fechaFirmaDeNombre(CON_SELLO)?.toISOString(), "2026-10-07T19:07:43.000Z");
  });
  it("también sin el día de la semana y con la cola larga «Firma solicitada por …»", () => {
    assert.equal(fechaFirmaDeNombre("x_ID-000006.pdf_ Firma solicitada por Tue, 06 Oct 2026 20h46m25s.pdf")?.toISOString(), "2026-10-06T20:46:25.000Z");
    assert.equal(fechaFirmaDeNombre("x.pdf 06 Oct 2026 20h46m25s.pdf")?.toISOString(), "2026-10-06T20:46:25.000Z");
  });
  it("sin sello no inventa nada: el original de Pendbox y una carpeta dan null", () => {
    assert.equal(fechaFirmaDeNombre(SIN_SELLO), null);
    assert.equal(fechaFirmaDeNombre("Requested signatures"), null);
    assert.equal(fechaFirmaDeNombre(""), null);
  });
});

describe("formatearFechaFirma", () => {
  it("muestra el instante en hora argentina (UTC-3), con fecha y hora", () => {
    assert.equal(formatearFechaFirma(fechaFirmaDeNombre(CON_SELLO)), "07/10/2026 16:07");
  });
  it("cruza la medianoche hacia atrás cuando el sello UTC es de madrugada", () => {
    assert.equal(formatearFechaFirma(fechaFirmaDeNombre("x Thu, 08 Oct 2026 01h30m00s.pdf")), "07/10/2026 22:30");
  });
  it("vacío sin fecha", () => {
    assert.equal(formatearFechaFirma(null), "");
  });
});
