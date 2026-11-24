import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { centroDeCostoDeSabana, elegirContratoDelRecibo } from "./contratoDelRecibo.js";

const HOY = "2026-11-24";
const vig = (alta: string, baja = "") => ({ estadoContrato: "VIGENTE", fecha_alta_contrato: alta, fecha_baja_contrato: baja });
const fin = (alta: string, baja: string) => ({ estadoContrato: "FINALIZADO", fecha_alta_contrato: alta, fecha_baja_contrato: baja });
const vinculo = (nombre: string, centroDeCosto: string, contracts: any[]) => ({ up: { _id: nombre, projectId: nombre, contracts }, centroDeCosto });

describe("centro de costo de la sábana", () => {
  it("el número pegado al primer «_»", () => {
    assert.equal(centroDeCostoDeSabana("99_PRODUCTORA_REC_SUELDO_2026_PERIODO_10_MES.pdf"), "99");
    assert.equal(centroDeCostoDeSabana("426_LA NACION_REC_SUELDO_2026_PERIODO_09_MES - JORNALEROS.pdf"), "426");
    assert.equal(centroDeCostoDeSabana("2030_GRINI_REC_SUELDO_2026_PERIODO_10_MES.pdf"), "2030");
  });
  it("también después de un prefijo de empresa sin «_»", () => {
    assert.equal(centroDeCostoDeSabana("FZERO SRL - 426_LA NACION_REC_SUELDO_2026_PERIODO_10_MES.pdf"), "426");
  });
  it("sin centro adelante no inventa uno con el año", () => {
    assert.equal(centroDeCostoDeSabana("REC_SUELDO_2026_PERIODO_10_MES.pdf"), "");
    assert.equal(centroDeCostoDeSabana("sabana.pdf"), "");
    assert.equal(centroDeCostoDeSabana(""), "");
  });
});

describe("qué contrato lleva el recibo", () => {
  // Cinco contratos vigentes de la misma fecha, uno guardado como «2024-02-01» y los demás como ISO completo.
  const cinco = [
    vinculo("PRODUCTORA", "99", [vig("2024-02-01")]),
    vinculo("RAMON", "726", [vig("2024-02-01T00:00:00.000Z")]),
    vinculo("TESORO", "716", [vig("2024-02-01T00:00:00.000Z")]),
    vinculo("CCM", "701", [vig("2024-02-01T00:00:00.000Z")]),
    vinculo("OFFLINE", "718", [vig("2024-02-01T00:00:00.000Z")]),
  ];
  it("la sábana manda: el contrato en el proyecto de su centro de costo", () => {
    const e = elegirContratoDelRecibo(cinco, { hoy: HOY, centroDeCosto: "99" })!;
    assert.equal(e.up._id, "PRODUCTORA");
    assert.equal(e.idx, 0);
    assert.equal(e.vigente, true);
    assert.equal(e.enElCentro, true);
    assert.equal(elegirContratoDelRecibo(cinco, { hoy: HOY, centroDeCosto: "716" })!.up._id, "TESORO");
  });
  it("sin centro en la sábana, el empate de fechas no lo decide el formato del string", () => {
    const e = elegirContratoDelRecibo(cinco, { hoy: HOY })!;
    assert.equal(e.up._id, "PRODUCTORA");
    assert.equal(e.enElCentro, false);
    // El vínculo con alta realmente más nueva gana, venga como venga escrita.
    const conUnoNuevo = [...cinco, vinculo("NUEVO", "800", [vig("01/03/2025")])];
    assert.equal(elegirContratoDelRecibo(conUnoNuevo, { hoy: HOY })!.up._id, "NUEVO");
  });
  it("un contrato terminado con alta más nueva no le gana a uno vigente", () => {
    const v = [vinculo("LN", "426", [vig("2023-06-01T00:00:00.000Z"), fin("2026-10-24", "2026-10-24")]), vinculo("REEL", "700", [fin("2025-11-03T00:00:00.000Z", "2025-11-08T00:00:00.000Z")])];
    const e = elegirContratoDelRecibo(v, { hoy: HOY })!;
    assert.equal(e.up._id, "LN");
    assert.equal(e.idx, 0);
    assert.equal(e.vigente, true);
    assert.equal(elegirContratoDelRecibo(v, { hoy: HOY, centroDeCosto: "426" })!.up._id, "LN");
  });
  it("en el centro de la sábana, un contrato terminado le gana a uno vigente de otro proyecto", () => {
    const v = [vinculo("PRODUCTORA", "99", [fin("2026-09-01", "2026-09-30")]), vinculo("OTRO", "703", [vig("2026-11-01", "2026-11-30")])];
    const e = elegirContratoDelRecibo(v, { hoy: HOY, centroDeCosto: "99" })!;
    assert.equal(e.up._id, "PRODUCTORA");
    assert.equal(e.vigente, false);
    assert.equal(e.enElCentro, true);
  });
  it("sin contrato en el centro de la sábana, cae a la regla general y lo marca", () => {
    const v = [vinculo("OTRO", "703", [fin("2026-09-01", "2026-09-30"), fin("2026-10-01", "2026-10-31"), vig("2026-11-01", "2026-11-30")])];
    const e = elegirContratoDelRecibo(v, { hoy: HOY, centroDeCosto: "99" })!;
    assert.equal(e.up._id, "OTRO");
    assert.equal(e.idx, 2);
    assert.equal(e.vigente, true);
    assert.equal(e.enElCentro, false);
  });
  it("sin ningún vigente va con el último contrato; las lápidas no cuentan; sin contratos, null", () => {
    const v = [vinculo("A", "99", [fin("2026-01-01", "2026-01-31"), fin("2026-05-01", "2026-05-31")]), vinculo("B", "99", [{ estadoContrato: "ANULADO" }])];
    const e = elegirContratoDelRecibo(v, { hoy: HOY, centroDeCosto: "99" })!;
    assert.equal(e.up._id, "A");
    assert.equal(e.idx, 1);
    assert.equal(e.vigente, false);
    assert.equal(elegirContratoDelRecibo([vinculo("B", "99", [{ estadoContrato: "ANULADO" }]), vinculo("C", "99", [])], { hoy: HOY }), null);
  });
  it("dentro de un vínculo, el de tiempo indeterminado vigente manda sobre los a plazo", () => {
    const v = [vinculo("LN", "426", [vig("2026-11-20", "2026-11-21"), vig("2023-06-01")])];
    const e = elegirContratoDelRecibo(v, { hoy: HOY, centroDeCosto: "426" })!;
    assert.equal(e.idx, 1);
  });
});
