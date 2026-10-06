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
