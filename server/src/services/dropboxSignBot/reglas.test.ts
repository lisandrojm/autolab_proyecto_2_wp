import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { esTextoDeLimite, guardDeEnvio, motivoSinColocacion, nombreDeFirmante, tieneRegla, tipoDeDocumento } from "./reglas.js";
import { REGLAS_BASE, type ReglaColocacion } from "../../compartido/reglasColocacionFirma.js";

const JORNADA = "426_LN+_PEREZ_Contrato_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000124.pdf";
const CCM = "701_X_PEREZ_CCM_Jornada_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000001.pdf";
const RECIBO = "99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_PEREZ_Juan_a-ARROBA-b.com_20273130293_ID-000004.pdf";

describe("tipo por nombre de archivo (delegado en compartido/reglasColocacionFirma)", () => {
  it("los siete tipos del catálogo tienen regla activa", () => {
    assert.equal(tipoDeDocumento("426_LN+_PEREZ_AltaAFIP_Jornada_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000123.pdf"), "AltaAFIP");
    assert.equal(tipoDeDocumento(JORNADA), "Contrato_Jornada");
    assert.equal(tipoDeDocumento("426_LN+_PEREZ_Contrato_Plazo-fijo-6x6_D-20261010_H-20261210_20273130293_a-ARROBA-b.com_ID-000125.pdf"), "Contrato_Plazo-fijo");
    assert.equal(tipoDeDocumento("99_PRODUCTORA_PEREZ_Contrato_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000002.pdf"), "Contrato_Servicios");
    assert.equal(tipoDeDocumento("426_LN+_PEREZ_Release_Jornada_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000126.pdf"), "Release");
    assert.equal(tipoDeDocumento("99_PRODUCTORA_PEREZ_Release_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000003.pdf"), "Release_Servicios");
    assert.equal(tipoDeDocumento(RECIBO), "REC_SUELDO");
    for (const a of [JORNADA, RECIBO]) {
      assert.equal(tieneRegla(a), true, a);
      assert.equal(motivoSinColocacion(a), null, a);
    }
  });
  it("CCM no tiene regla: el motivo nombra los patrones conocidos", () => {
    assert.equal(tipoDeDocumento(CCM), null);
    assert.match(motivoSinColocacion(CCM)!, /sin regla de colocación/);
    assert.equal(tieneRegla(CCM), false);
  });
  it("con las reglas del tenant: una regla pendiente frena con su motivo, y una regla nueva habilita un tipo", () => {
    const delTenant: ReglaColocacion[] = [
      ...REGLAS_BASE.map((r) => (r.tipo === "REC_SUELDO" ? { ...r, estado: "pendiente" as const, motivoPendiente: "en revisión por RRHH" } : r)),
      { tipo: "CCM", patronNombre: "_CCM_", estado: "activo", pagina: "ultima", anclas: [{ tipo: "derechaDelRotulo", rotulo: "Firma:", ocurrencia: "ultima", excluir: ["Empleador"], offset: { dx: 0, dy: 0 } }], ocr: null, campo: { alto: 45, anchoFijo: 170 }, validaciones: [], descripcion: "" },
    ];
    assert.equal(motivoSinColocacion(RECIBO, delTenant), "Tipo REC_SUELDO: en revisión por RRHH");
    assert.equal(tieneRegla(CCM, delTenant), true);
    assert.equal(tipoDeDocumento(CCM, delTenant), "CCM");
  });
});

describe("el firmante", () => {
  it("primer nombre + apellidos, en mayúsculas", () => {
    assert.equal(nombreDeFirmante({ firstName: "Joaquín Ezequiel", lastName: "Navarro Martin" }), "JOAQUÍN NAVARRO MARTIN");
    assert.equal(nombreDeFirmante({ firstName: "  ana ", lastName: "pérez" }), "ANA PÉREZ");
  });
});

describe("el guard antes de «Enviar para firmar»", () => {
  const base = { archivo: JORNADA, titulo: JORNADA, cc: "framerecursoshumanos@gmail.com", ccEsperado: "framerecursoshumanos@gmail.com", firmanteNombre: "JUAN PEREZ", firmanteEmail: "fulano@gmail.com", textoPagina: "Revisar y enviar\nFirmantes\nJUAN PEREZ (fulano@gmail.com)\nCC framerecursoshumanos@gmail.com" };
  it("pasa cuando todo cierra", () => {
    assert.deepEqual(guardDeEnvio(base), { ok: true });
  });
  it("bloquea título distinto al archivo", () => {
    assert.equal(guardDeEnvio({ ...base, titulo: `${JORNADA}: Firma solicitada por Frame Zero` }).ok, false);
  });
  it("bloquea CC faltante o distinto", () => {
    assert.equal(guardDeEnvio({ ...base, cc: "" }).ok, false);
    assert.equal(guardDeEnvio({ ...base, cc: "otro@gmail.com" }).ok, false);
    assert.equal(guardDeEnvio({ ...base, ccEsperado: "" }).ok, false);
  });
  it("bloquea firmante ausente en la pantalla", () => {
    assert.equal(guardDeEnvio({ ...base, textoPagina: "Revisar y enviar" }).ok, false);
    assert.equal(guardDeEnvio({ ...base, firmanteEmail: "" }).ok, false);
  });
  it("bloquea un tipo desconocido aunque el resto cierre, y respeta las reglas del tenant", () => {
    assert.equal(guardDeEnvio({ ...base, archivo: CCM, titulo: CCM }).ok, false);
    const pendiente = REGLAS_BASE.map((r) => (r.tipo === "Contrato_Jornada" ? { ...r, estado: "pendiente" as const } : r));
    assert.equal(guardDeEnvio({ ...base, reglas: pendiente }).ok, false);
  });
  it("reconoce el texto del límite antiabuso", () => {
    assert.ok(esTextoDeLimite("Se detectó el siguiente error:\nDebido a la seguridad de la cuenta, no puedes enviar más solicitudes de firma hasta mañana"));
    assert.ok(!esTextoDeLimite("Solicitud de firma enviada"));
  });
});
