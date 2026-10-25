import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ESPERA_REINTENTO_MS, MAX_REINTENTOS, siguienteReintento } from "./sincronizacionRelacionesCronService.js";
/** Los reintentos de la sincronización automática de relaciones (25/10/2026). */
describe("siguienteReintento", () => {
    const ahora = new Date("2026-10-25T09:00:00Z");
    const PORTAL = "Abrí «Simplificación Registral» desde el portal pero la pantalla que apareció no es la del servicio (login): https://portalcf.cloud.afip.gob.ar/portal/app/";
    it("el error real del 25/10 se reintenta en una hora", () => {
        const r = siguienteReintento(PORTAL, 0, ahora);
        assert.ok(r);
        assert.equal(r.numero, 1);
        assert.equal(r.desde.getTime(), ahora.getTime() + ESPERA_REINTENTO_MS);
    });
    it("como mucho MAX_REINTENTOS por día", () => {
        assert.ok(siguienteReintento(PORTAL, MAX_REINTENTOS - 1, ahora));
        assert.equal(siguienteReintento(PORTAL, MAX_REINTENTOS, ahora), null);
    });
    it("si salió bien no hay reintento", () => {
        assert.equal(siguienteReintento(undefined, 0, ahora), null);
    });
    it("NUNCA reintenta lo que puede bloquear la clave fiscal o no se arregla solo", () => {
        for (const e of [
            "AFIP rechazó la clave. Ojo: varios intentos fallidos bloquean la cuenta, así que corregila antes de volver a correr.",
            "AFIP pidió un segundo factor o un captcha. Esta automatización no los resuelve a propósito.",
            "AFIP no reconoce el CUIT 20123456789. Tiene que ser el del usuario con clave fiscal.",
            "Entré a AFIP con ese usuario, pero «Simplificación Registral» no aparece entre sus servicios en el portal.",
        ])
            assert.equal(siguienteReintento(e, 0, ahora), null, e);
    });
});
