import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { colocacionDe, esTextoDeLimite, guardDeEnvio, motivoSinColocacion, nombreDeFirmante, tipoDeDocumento } from "./reglas.js";
const ALTA = "426_LN+_PEREZ_AltaAFIP_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000123.pdf";
const JORNADA = "426_LN+_PEREZ_Contrato_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000124.pdf";
const PLAZO = "426_LN+_PEREZ_Contrato_Plazo-fijo-6x6_D-20261010_H-20261210_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000125.pdf";
const RELEASE = "426_LN+_PEREZ_Release_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000126.pdf";
describe("tipo y colocación por nombre de archivo", () => {
    it("los cuatro tipos soportados, con su página y su destino", () => {
        assert.equal(colocacionDe(ALTA)?.pagina, "primera");
        assert.deepEqual(colocacionDe(ALTA)?.destino, { x: 900, y: 478 });
        assert.equal(colocacionDe(JORNADA)?.pagina, "ultima");
        assert.deepEqual(colocacionDe(JORNADA)?.destino, { x: 543, y: 280 });
        assert.equal(colocacionDe(JORNADA)?.scroll?.direccion, "arriba");
        assert.deepEqual(colocacionDe(PLAZO)?.destino, { x: 543, y: 446 });
        assert.equal(colocacionDe(RELEASE)?.scroll, null);
        assert.deepEqual(colocacionDe(RELEASE)?.destino, { x: 465, y: 418 });
    });
    it("cualquier otro tipo es null: CCM, Contrato_Servicios, Release_Servicios", () => {
        for (const a of ["701_X_PEREZ_CCM_Jornada_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000001.pdf", "99_PRODUCTORA_PEREZ_Contrato_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000002.pdf", "99_PRODUCTORA_PEREZ_Release_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000003.pdf"]) {
            assert.equal(tipoDeDocumento(a), null, a);
            assert.equal(colocacionDe(a), null, a);
            assert.match(motivoSinColocacion(a), /sin regla de colocación/);
        }
    });
    it("REC_SUELDO se reconoce pero está pendiente: sin colocación, con su motivo propio", () => {
        const a = "99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_PEREZ_Juan_a-ARROBA-b.com_20273130293_ID-000004.pdf";
        assert.equal(tipoDeDocumento(a), "REC_SUELDO");
        assert.equal(colocacionDe(a), null);
        assert.equal(motivoSinColocacion(a), "Tipo REC_SUELDO: falta definir posición de firma");
        assert.equal(motivoSinColocacion(JORNADA), null);
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
        const r = guardDeEnvio({ ...base, titulo: `${JORNADA}: Firma solicitada por Frame Zero` });
        assert.equal(r.ok, false);
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
    it("bloquea tipo desconocido aunque el resto cierre", () => {
        const a = "99_PRODUCTORA_PEREZ_Contrato_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000002.pdf";
        assert.equal(guardDeEnvio({ ...base, archivo: a, titulo: a }).ok, false);
    });
    it("reconoce el texto del límite antiabuso", () => {
        assert.ok(esTextoDeLimite("Se detectó el siguiente error:\nDebido a la seguridad de la cuenta, no puedes enviar más solicitudes de firma hasta mañana"));
        assert.ok(!esTextoDeLimite("Solicitud de firma enviada"));
    });
});
