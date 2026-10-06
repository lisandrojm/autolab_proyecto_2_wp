/**
 * El motivo que se muestra cuando falla la casilla de Dropbox Sign.
 *
 *   npx tsx --test src/services/dropboxSignMailService.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { motivoFalloImap } from "./dropboxSignMailService.js";

/** Como lo arma `imapflow` (lib/imap-flow.js + commands/login.js). */
const errorImap = (campos: Record<string, unknown>) => Object.assign(new Error("Command failed"), campos);

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

import { extraerArchivoDeAsunto, documentosDelAvisoEnOutbox, extraerIdentidadDeArchivo } from "./dropboxSignMailService.js";

describe("aviso «Se inició el proceso de firma de …-Frame Firma Digital» (06/10/2026)", () => {
  const ASUNTO = "Se inició el proceso de firma de 426_LN+_AQUINO_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-30717068374-Frame Firma Digital";
  const archivo = extraerArchivoDeAsunto(ASUNTO);
  const ident = extraerIdentidadDeArchivo(archivo);
  const f = (name: string) => ({ tag: "file", name, path: `/Outbox/${name}` });
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

  it("mueve el sobre entero de esa persona y período: alta, contrato y release", () => {
    const sobre = documentosDelAvisoEnOutbox(OUTBOX, archivo, ident).map((d) => d.name.split("_")[3]);
    assert.deepEqual(sobre.sort(), ["AltaAFIP", "Contrato", "Release"]);
  });

  it("sin anclas, el archivo cuyo nombre es el principio del título", () => {
    const sinAnclas = { ...ident, cuit: "", email: "", fechas: [] as string[] };
    const r = documentosDelAvisoEnOutbox([f("Contrato-especial-de-Fulano-de-Tal.pdf"), f("Otro.pdf")], "Contrato-especial-de-Fulano-de-Tal-Frame Firma Digital", sinAnclas);
    assert.deepEqual(r.map((d) => d.name), ["Contrato-especial-de-Fulano-de-Tal.pdf"]);
  });
});
