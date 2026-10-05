import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { faultEsCuitInactivo } from "../afipService.js";
/**
 * CUIT INACTIVO ≠ CUIT INEXISTENTE.
 *
 * El padrón A13 contesta los dos casos con un SOAP Fault, y hasta acá los dos caían en el mismo
 * "desconocido": el alta se cortaba con un 404 y el mensaje mandaba a corregir el número. Con el CUIT
 * inactivo eso era un consejo inútil —el número estaba bien— y dejaba a la persona sin poder darse de
 * alta hasta regularizar su situación ante el organismo, que no es algo que se resuelva desde la app.
 *
 * Las dos primeras frases son LITERALES del log de producción (`afip_logs`), seis apariciones cada
 * una sobre 273 consultas reales. Son el contrato observado, no una suposición sobre la documentación.
 */
describe("faultEsCuitInactivo — los dos faults reales del padrón", () => {
    it("reconoce el fault de CUIT INACTIVO tal cual lo devuelve ARCA", () => {
        assert.equal(faultEsCuitInactivo("La clave (CUIT/CUIL) consultada se encuentra INACTIVA"), true);
    });
    it("NO confunde el de CUIT inexistente, que sí tiene que frenar el alta", () => {
        assert.equal(faultEsCuitInactivo("La Clave (CUIT/CUIL) consultada es inexistente"), false);
    });
    it("aguanta cambios de mayúsculas y de redacción del organismo", () => {
        assert.equal(faultEsCuitInactivo("CUIT inactivo"), true);
        assert.equal(faultEsCuitInactivo("La CLAVE se encuentra Inactiva."), true);
        assert.equal(faultEsCuitInactivo("El contribuyente está INACTIVO en el padrón"), true);
    });
    it("no se cuelga con vacío, null ni undefined", () => {
        assert.equal(faultEsCuitInactivo(""), false);
        assert.equal(faultEsCuitInactivo(null), false);
        assert.equal(faultEsCuitInactivo(undefined), false);
    });
    it("no marca inactivo a otros errores del servicio", () => {
        // Los que aparecen cuando el certificado no tiene el A13 autorizado, o el CUIT va mal formado.
        assert.equal(faultEsCuitInactivo("El CUIT representado no se encuentra autorizado"), false);
        assert.equal(faultEsCuitInactivo("Error de formato en el idPersona"), false);
        assert.equal(faultEsCuitInactivo("ns1:cms.sign.invalid"), false);
    });
});
