/**
 * Los números de las bandejas de Contratación que viven en la base.
 *
 * Run with:
 *   npx tsx --test src/utils/contadoresContratacion.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contarBandejasDeLaBase, noPoseeCuit } from "./contadoresContratacion.js";
const HOY = "2026-11-11";
const ESTADOS = [
    { name: "AFIP", tipoImpositivo: "alta_temprana_afip" },
    { name: "Servicios", tipoImpositivo: "constancia_cuit" },
];
const contar = (vinculos, sinCuit = []) => contarBandejasDeLaBase(vinculos, { estadosImpositivos: ESTADOS, estadoEnvio: "Envío de documentación", sinCuitDe: (id) => sinCuit.includes(id), hoy: HOY });
const c = (x) => ({ fecha_alta_contrato: "2026-11-01", fecha_baja_contrato: "2026-11-30", delSistema: true, ...x });
describe("contarBandejasDeLaBase", () => {
    it("cuenta cada contrato en su trámite: alta temprana, constancia de CUIT y generar documentos", () => {
        const r = contar([
            { userId: "a", contracts: [c({ nombre_estado_empleado: "AFIP" })] },
            { userId: "b", contracts: [c({ nombre_estado_empleado: "Servicios" })] },
            { userId: "c", contracts: [c({ nombre_estado_empleado: "Envío de documentación" })] },
            { userId: "d", contracts: [c({ nombre_estado_empleado: "Contratado" })] },
        ]);
        assert.deepEqual(r, { alta: 1, cuit: 1, sinCuit: 0, generarDocumentos: 1 });
    });
    it("los nombres viejos del mismo estado cuentan igual («Falta pedido de AFIP» es AFIP)", () => {
        assert.equal(contar([{ userId: "a", contracts: [c({ nombre_estado_empleado: "Falta pedido de AFIP" })] }]).alta, 1);
        assert.equal(contar([{ userId: "a", contracts: [c({ nombre_estado_empleado: "Pedido de Servicios" })] }]).cuit, 1);
    });
    it("quien no tiene CUIT va a «Sin CUIT», cualquiera sea su trámite, y no infla los otros dos", () => {
        const r = contar([
            { userId: "a", contracts: [c({ nombre_estado_empleado: "AFIP" })] },
            { userId: "b", contracts: [c({ nombre_estado_empleado: "Servicios" })] },
        ], ["a", "b"]);
        assert.deepEqual(r, { alta: 0, cuit: 0, sinCuit: 2, generarDocumentos: 0 });
    });
    it("los importados de FRAME/WP no son trabajo de acá", () => {
        assert.equal(contar([{ userId: "a", contracts: [c({ nombre_estado_empleado: "AFIP", delSistema: false })] }]).alta, 0);
    });
    it("varios contratos de la misma persona cuentan cada uno (jornadas)", () => {
        const r = contar([{ userId: "a", contracts: [c({ nombre_estado_empleado: "AFIP", fecha_alta_contrato: "2026-11-10", fecha_baja_contrato: "2026-11-10" }), c({ nombre_estado_empleado: "AFIP", fecha_alta_contrato: "2026-11-12", fecha_baja_contrato: "2026-11-12" })] }]);
        assert.equal(r.alta, 2);
    });
    it("un contrato viejo que quedó en trámite no cuenta, salvo que sea el que rige", () => {
        const viejo = c({ nombre_estado_empleado: "AFIP", fecha_alta_contrato: "2026-01-10", fecha_baja_contrato: "2026-01-10" });
        // Con otro contrato vigente al lado, el viejo queda fuera de la ventana de 90 días.
        assert.equal(contar([{ userId: "a", contracts: [viejo, c({ nombre_estado_empleado: "Contratado" })] }]).alta, 0);
        // Solo, es el que rige (el más reciente): se sigue viendo.
        assert.equal(contar([{ userId: "a", contracts: [viejo] }]).alta, 1);
    });
    it("lo ya enviado a firmar salió de Generar documentos", () => {
        const r = contar([{ userId: "a", contracts: [c({ nombre_estado_empleado: "Envío de documentación", firmaEnviadaAt: "2026-11-05T12:00:00Z" })] }]);
        assert.equal(r.generarDocumentos, 0);
    });
    it("sin estado de envío configurado, Generar documentos da 0 y el resto se cuenta", () => {
        const r = contarBandejasDeLaBase([{ userId: "a", contracts: [c({ nombre_estado_empleado: "AFIP" })] }], { estadosImpositivos: ESTADOS, estadoEnvio: null, sinCuitDe: () => false, hoy: HOY });
        assert.deepEqual(r, { alta: 1, cuit: 0, sinCuit: 0, generarDocumentos: 0 });
    });
});
describe("noPoseeCuit", () => {
    it("marcado, vacío o todo el mismo dígito es sin CUIT", () => {
        assert.equal(noPoseeCuit("20-12345678-9", true), true);
        assert.equal(noPoseeCuit("", false), true);
        assert.equal(noPoseeCuit("00-00000000-0", false), true);
        assert.equal(noPoseeCuit("20-12345678-9", false), false);
    });
});
