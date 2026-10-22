import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { esTextoDeLimite, guardDeEnvio, motivoSinColocacion, nombreDeFirmante, tieneRegla, tipoDeDocumento, TIPOS_PENDIENTES } from "./reglas.js";
const JORNADA = "426_LN+_PEREZ_Contrato_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000124.pdf";
describe("tipo por nombre de archivo (delegado en compartido/reglasColocacionFirma)", () => {
    it("los cuatro tipos activos y el pendiente", () => {
        assert.equal(tipoDeDocumento("426_LN+_PEREZ_AltaAFIP_Jornada_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000123.pdf"), "AltaAFIP");
        assert.equal(tipoDeDocumento(JORNADA), "Contrato_Jornada");
        assert.equal(tipoDeDocumento("426_LN+_PEREZ_Contrato_Plazo-fijo-6x6_D-20261010_H-20261210_20273130293_a-ARROBA-b.com_ID-000125.pdf"), "Contrato_Plazo-fijo");
        assert.equal(tipoDeDocumento("426_LN+_PEREZ_Release_Jornada_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000126.pdf"), "Release");
        assert.equal(tipoDeDocumento("99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_PEREZ_Juan_a-ARROBA-b.com_20273130293_ID-000004.pdf"), "REC_SUELDO");
        assert.ok(TIPOS_PENDIENTES.REC_SUELDO);
        assert.equal(tieneRegla(JORNADA), true);
    });
    it("CCM, Contrato_Servicios y Release_Servicios no tienen regla; REC_SUELDO está pendiente", () => {
        for (const a of ["701_X_PEREZ_CCM_Jornada_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000001.pdf", "99_PRODUCTORA_PEREZ_Contrato_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000002.pdf", "99_PRODUCTORA_PEREZ_Release_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000003.pdf"]) {
            assert.equal(tipoDeDocumento(a), null, a);
            assert.match(motivoSinColocacion(a), /sin regla de colocación/);
        }
        assert.equal(motivoSinColocacion("99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_PEREZ_Juan_a-ARROBA-b.com_20273130293_ID-000004.pdf"), "Tipo REC_SUELDO: Falta definir posición de firma del recibo");
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
    it("bloquea tipo desconocido o pendiente aunque el resto cierre", () => {
        const a = "99_PRODUCTORA_PEREZ_Contrato_Servicios_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000002.pdf";
        assert.equal(guardDeEnvio({ ...base, archivo: a, titulo: a }).ok, false);
        const r = "99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_PEREZ_Juan_a-ARROBA-b.com_20273130293_ID-000004.pdf";
        assert.equal(guardDeEnvio({ ...base, archivo: r, titulo: r }).ok, false);
    });
    it("reconoce el texto del límite antiabuso", () => {
        assert.ok(esTextoDeLimite("Se detectó el siguiente error:\nDebido a la seguridad de la cuenta, no puedes enviar más solicitudes de firma hasta mañana"));
        assert.ok(!esTextoDeLimite("Solicitud de firma enviada"));
    });
});
