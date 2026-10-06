/**
 * El motivo que se muestra cuando falla la casilla de Dropbox Sign.
 *
 *   npx tsx --test src/services/dropboxSignMailService.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { motivoFalloImap } from "./dropboxSignMailService.js";
/** Como lo arma `imapflow` (lib/imap-flow.js + commands/login.js). */
const errorImap = (campos) => Object.assign(new Error("Command failed"), campos);
describe("motivoFalloImap", () => {
    it("un login rechazado por Gmail dice qué hacer, no «Command failed»", () => {
        const m = motivoFalloImap(errorImap({ authenticationFailed: true, serverResponseCode: "AUTHENTICATIONFAILED", responseText: "Invalid credentials (Failure)" }));
        assert.match(m, /contraseña de aplicación/);
        assert.match(m, /Invalid credentials/);
        assert.doesNotMatch(m, /^Command failed$/);
    });
    it("reconoce el rechazo por el texto aunque falte la marca", () => {
        assert.match(motivoFalloImap(errorImap({ responseText: "[AUTHENTICATIONFAILED] Invalid credentials (Failure)" })), /contraseña de aplicación/);
    });
    it("cualquier otro NO/BAD muestra lo que dijo el servidor", () => {
        const m = motivoFalloImap(errorImap({ serverResponseCode: "NONEXISTENT", responseText: "Unknown Mailbox: INBOX" }));
        assert.equal(m, "Command failed: [NONEXISTENT] Unknown Mailbox: INBOX");
    });
    it("un error de red pasa tal cual", () => {
        assert.equal(motivoFalloImap(new Error("getaddrinfo ENOTFOUND imap.gmial.com")), "getaddrinfo ENOTFOUND imap.gmial.com");
    });
    it("nunca incluye el comando ejecutado (en un LOGIN lleva la contraseña)", () => {
        const m = motivoFalloImap(errorImap({ responseText: "algo", executedCommand: 'A1 LOGIN "user" "secreta"' }));
        assert.doesNotMatch(m, /secreta/);
    });
});
import { extraerArchivoDeAsunto, documentosDelAvisoEnOutbox, extraerIdentidadDeArchivo, yaEstaEnPendbox } from "./dropboxSignMailService.js";
describe("aviso «Se inició el proceso de firma de …-Frame Firma Digital» (06/10/2026)", () => {
    const ASUNTO = "Se inició el proceso de firma de 426_LN+_AQUINO_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-30717068374-Frame Firma Digital";
    const archivo = extraerArchivoDeAsunto(ASUNTO);
    const ident = extraerIdentidadDeArchivo(archivo);
    const f = (name) => ({ tag: "file", name, path: `/Outbox/${name}` });
    const OUTBOX = [
        f("426_LN+_AQUINO_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-30717068374.pdf"),
        f("426_LN+_AQUINO_Contrato_Plazo-fijo-6x6_D-20261001_H-20261031_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-30717068374.pdf"),
        f("426_LN+_AQUINO_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-30710295839.pdf"),
        // Otra persona y la misma persona en otro período: no son de este sobre.
        f("426_LN+_CASTRO_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20412923767_brianchicago.22-ARROBA-gmail.com_Empresa-30717068374.pdf"),
        f("426_LN+_AQUINO_Contrato_Jornada_D-20260901_H-20260901_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-30717068374.pdf"),
    ];
    it("el asunto se reconoce y trae persona y período pese al sufijo", () => {
        assert.ok(archivo.startsWith("426_LN+_AQUINO_AltaAFIP"));
        assert.equal(ident.cuit, "20442166987");
        assert.deepEqual(ident.fechas, ["20261001", "20261031"]);
    });
    it("mueve SOLO el archivo nombrado: no el contrato ni el release de la misma persona y período", () => {
        assert.deepEqual(documentosDelAvisoEnOutbox(OUTBOX, archivo, ident).map((d) => d.name), ["426_LN+_AQUINO_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-30717068374.pdf"]);
    });
    it("con el contrato ya en Pendbox, el aviso del alta NO es un duplicado", () => {
        assert.equal(yaEstaEnPendbox([OUTBOX[1], OUTBOX[2]], archivo, ident), false);
        assert.equal(yaEstaEnPendbox([OUTBOX[0]], archivo, ident), true);
    });
    it("un nombre que es el principio de otro no se confunde: después del nombre tiene que venir un separador", () => {
        const corto = f("426_LN+_AQUINO_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-3071706837.pdf");
        assert.deepEqual(documentosDelAvisoEnOutbox([corto], archivo, ident), []);
    });
    it("un nombre cualquiera, con algo agregado al final del título", () => {
        const r = documentosDelAvisoEnOutbox([f("Contrato-especial-de-Fulano-de-Tal.pdf"), f("Otro.pdf")], "Contrato-especial-de-Fulano-de-Tal-Frame Firma Digital");
        assert.deepEqual(r.map((d) => d.name), ["Contrato-especial-de-Fulano-de-Tal.pdf"]);
    });
});
describe("con código único (ID-000123): el aviso apunta a UN documento", () => {
    const f = (name) => ({ tag: "file", name, path: `/Outbox/${name}` });
    const base = "426_LN+_AQUINO_{T}_Plazo-fijo-6x6_D-20261001_H-20261031_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-30717068374";
    const OUTBOX = [f(`${base.replace("{T}", "AltaAFIP")}_ID-000201.pdf`), f(`${base.replace("{T}", "Contrato")}_ID-000202.pdf`), f(`${base.replace("{T}", "Release")}_ID-000203.pdf`)];
    const asunto = (codigo) => `Se inició el proceso de firma de ${base.replace("{T}", "AltaAFIP")}_${codigo}-Frame Firma Digital`;
    it("el código se lee del asunto aunque el título traiga algo pegado atrás", () => {
        assert.equal(extraerIdentidadDeArchivo(extraerArchivoDeAsunto(asunto("ID-000201"))).codigo, "ID-000201");
    });
    it("mueve solo el documento de ese código", () => {
        const archivo = extraerArchivoDeAsunto(asunto("ID-000201"));
        assert.deepEqual(documentosDelAvisoEnOutbox(OUTBOX, archivo).map((d) => d.name), [OUTBOX[0].name]);
    });
    it("un código que no está en Outbox no mueve nada, aunque el resto del nombre coincida", () => {
        assert.deepEqual(documentosDelAvisoEnOutbox(OUTBOX, extraerArchivoDeAsunto(asunto("ID-000999"))), []);
    });
    it("ya enviado = ese código en Pendbox; otro documento de Aquino en Pendbox no cuenta", () => {
        const archivo = extraerArchivoDeAsunto(asunto("ID-000201"));
        assert.equal(yaEstaEnPendbox([OUTBOX[1], OUTBOX[2]], archivo), false);
        assert.equal(yaEstaEnPendbox([OUTBOX[0]], archivo), true);
    });
});
