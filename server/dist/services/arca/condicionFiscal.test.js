/**
 * La regla que este archivo protege: **«no es monotributista» y «no se pudo averiguar» no son lo
 * mismo**.
 *
 * ARCA contesta `errorMonotributo` cuando alguien NO es monotributista. Si eso se lee como una
 * consulta fallida, el caso más común del padrón de talentos —un CUIL de empleado en relación de
 * dependencia— queda marcado como error, y media base aparece con un problema que no tiene. Al
 * revés es igual de caro: si un timeout se lee como «sin actividad», se afirma sobre la persona algo
 * que ARCA nunca dijo, y alguien deja de pedirle factura a un monotributista.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { derivarCondicionFiscal, condicionFiscalFallida } from "./condicionFiscal.js";
const CONSULTA = { consultadoEn: new Date("2026-09-04T15:22:11.000Z"), fuente: "ws_sr_padron_a5" };
const generales = (extra = {}) => ({ idPersona: 27371836646, tipoPersona: "FISICA", tipoClave: "CUIT", estadoClave: "ACTIVO", ...extra });
describe("§6.1 — monotributista", () => {
    const persona = {
        datosGenerales: generales(),
        datosMonotributo: {
            categoriaMonotributo: { idCategoria: 2, descripcionCategoria: "Locaciones y/o prestaciones de servicios - Categoría B", periodo: 202601 },
            actividadMonotributista: { idActividad: 620100, descripcionActividad: "SERVICIOS DE CONSULTORES EN INFORMÁTICA", nomenclador: 883, orden: 1 },
        },
    };
    it("deriva MONOTRIBUTO con la categoría", () => {
        const r = derivarCondicionFiscal(persona, CONSULTA);
        assert.equal(r.tipo, "MONOTRIBUTO");
        assert.equal(r.monotributo?.categoria, "B");
        assert.equal(r.monotributo?.categoriaId, 2);
        assert.equal(r.descripcion, "Monotributo — Categoría B");
    });
    it("trae la actividad principal, que es lo que dice de qué factura", () => {
        const r = derivarCondicionFiscal(persona, CONSULTA);
        assert.equal(r.monotributo?.actividadPrincipal?.id, 620100);
        assert.match(String(r.monotributo?.actividadPrincipal?.descripcion), /CONSULTORES/);
    });
    it("gana sobre un régimen general viejo: define cómo factura HOY", () => {
        const r = derivarCondicionFiscal({ ...persona, datosRegimenGeneral: { impuesto: { idImpuesto: 30, descripcionImpuesto: "IVA", estadoImpuesto: "AC" } } }, CONSULTA);
        assert.equal(r.tipo, "MONOTRIBUTO");
    });
});
describe("§6.2 — responsable inscripto", () => {
    it("con IVA activo y sin bloque de monotributo", () => {
        const r = derivarCondicionFiscal({ datosGenerales: generales(), datosRegimenGeneral: { impuesto: [{ idImpuesto: 30, descripcionImpuesto: "IVA", estadoImpuesto: "AC", periodo: 201501 }] }, errorMonotributo: { mensaje: "No cumple con las condiciones" } }, CONSULTA);
        assert.equal(r.tipo, "RESPONSABLE_INSCRIPTO");
        assert.equal(r.regimenGeneral?.impuestos[0]?.id, 30);
        assert.equal(r.monotributo, null);
    });
    it("reconoce el IVA por descripción cuando el id no vino", () => {
        // Pasa en respuestas reales, y sin este fallback un responsable inscripto quedaría NO_ALCANZADO
        // —justo al revés— porque el filtro por id 30 no encontraría nada.
        const r = derivarCondicionFiscal({ datosGenerales: generales(), datosRegimenGeneral: { impuesto: [{ descripcionImpuesto: "IVA", estadoImpuesto: "AC" }] } }, CONSULTA);
        assert.equal(r.tipo, "RESPONSABLE_INSCRIPTO");
    });
    it("con IVA exento, es EXENTO y no responsable inscripto", () => {
        const r = derivarCondicionFiscal({ datosGenerales: generales(), datosRegimenGeneral: { impuesto: [{ idImpuesto: 30, descripcionImpuesto: "IVA", estadoImpuesto: "EX" }] } }, CONSULTA);
        assert.equal(r.tipo, "EXENTO");
    });
    it("con régimen general pero sin IVA, es NO_ALCANZADO", () => {
        const r = derivarCondicionFiscal({ datosGenerales: generales(), datosRegimenGeneral: { impuesto: [{ idImpuesto: 20, descripcionImpuesto: "GANANCIAS", estadoImpuesto: "AC" }] } }, CONSULTA);
        assert.equal(r.tipo, "NO_ALCANZADO");
    });
});
describe("§6.3 — CUIL de empleado: el caso más común, y NO es un error", () => {
    it("con los dos errores, es SIN_ACTIVIDAD", () => {
        const r = derivarCondicionFiscal({ datosGenerales: generales({ tipoClave: "CUIL" }), errorMonotributo: { mensaje: "No cumple con las condiciones para enviar datos monotributo" }, errorRegimenGeneral: { mensaje: "No cumple con las condiciones para enviar datos regimen general" } }, CONSULTA);
        assert.equal(r.tipo, "SIN_ACTIVIDAD");
        // Explícitamente distinto de DESCONOCIDO: ARCA contestó, y contestó que no tiene actividad.
        assert.notEqual(r.tipo, "DESCONOCIDO");
        assert.equal(r.error, undefined, "no lleva error: la consulta salió bien");
        assert.equal(r.claveInactiva, false, "sin actividad no implica clave dada de baja");
    });
});
describe("§6.4 — extranjero", () => {
    it("sin bloques fiscales no rompe y queda SIN_ACTIVIDAD", () => {
        const r = derivarCondicionFiscal({ datosGenerales: generales({ tipoClave: "CDI" }), errorMonotributo: {}, errorRegimenGeneral: {} }, CONSULTA);
        assert.equal(r.tipo, "SIN_ACTIVIDAD");
        assert.equal(r.tipoClave, "CDI");
    });
});
describe("§6.5 — clave inactiva", () => {
    it("marca claveInactiva SIN cortar la derivación", () => {
        // Se puede ser monotributista y tener la clave de baja a la vez. Devolver solo una de las dos
        // cosas esconde justo la que hay que resolver antes de facturar.
        const r = derivarCondicionFiscal({ datosGenerales: generales({ estadoClave: "INACTIVO" }), datosMonotributo: { categoriaMonotributo: { idCategoria: 3, descripcionCategoria: "Categoría C" } } }, CONSULTA);
        assert.equal(r.claveInactiva, true);
        assert.equal(r.tipo, "MONOTRIBUTO", "la condición se sigue derivando");
        assert.equal(r.monotributo?.categoria, "C");
    });
    it("con la clave activa, la bandera queda en false", () => {
        assert.equal(derivarCondicionFiscal({ datosGenerales: generales(), errorMonotributo: {}, errorRegimenGeneral: {} }, CONSULTA).claveInactiva, false);
    });
});
describe("§6.6 — persona jurídica", () => {
    it("no inventa categoría de monotributo", () => {
        const r = derivarCondicionFiscal({ datosGenerales: generales({ tipoPersona: "JURIDICA", razonSocial: "GRINI S.R.L." }), datosRegimenGeneral: { impuesto: [{ idImpuesto: 30, descripcionImpuesto: "IVA", estadoImpuesto: "AC" }] } }, CONSULTA);
        assert.equal(r.tipo, "RESPONSABLE_INSCRIPTO");
        assert.equal(r.monotributo, null);
    });
});
describe("§6.7 — ARCA caído: no se afirma nada sobre la persona", () => {
    it("una consulta fallida es DESCONOCIDO y lleva el motivo", () => {
        const r = condicionFiscalFallida("timeout", CONSULTA);
        assert.equal(r.tipo, "DESCONOCIDO");
        assert.equal(r.error, "timeout");
        assert.equal(r.monotributo, null);
    });
    it("DESCONOCIDO nunca se confunde con SIN_ACTIVIDAD", () => {
        // El error importa: «no pudimos preguntar» no puede leerse como «no tiene actividad», que es una
        // afirmación sobre la persona que ARCA nunca hizo.
        assert.notEqual(condicionFiscalFallida("servicio no autorizado", CONSULTA).tipo, "SIN_ACTIVIDAD");
    });
    it("una respuesta vacía tampoco afirma nada", () => {
        assert.equal(derivarCondicionFiscal({}, CONSULTA).tipo, "DESCONOCIDO");
        assert.equal(derivarCondicionFiscal(null, CONSULTA).tipo, "DESCONOCIDO");
    });
});
describe("formas en que ARCA devuelve lo mismo", () => {
    it("acepta un impuesto suelto o una lista", () => {
        // El XML trae un objeto cuando hay UNO y un array cuando hay varios: sin normalizar, el caso de
        // un solo impuesto —el más común— se perdía entero.
        const suelto = derivarCondicionFiscal({ datosRegimenGeneral: { impuesto: { idImpuesto: 30, descripcionImpuesto: "IVA", estadoImpuesto: "AC" } } }, CONSULTA);
        const lista = derivarCondicionFiscal({ datosRegimenGeneral: { impuesto: [{ idImpuesto: 30, descripcionImpuesto: "IVA", estadoImpuesto: "AC" }] } }, CONSULTA);
        assert.equal(suelto.tipo, lista.tipo);
        assert.equal(suelto.regimenGeneral?.impuestos.length, 1);
    });
    it("saca la letra de la categoría escrita de varias formas", () => {
        const conLetra = (desc) => derivarCondicionFiscal({ datosMonotributo: { categoriaMonotributo: { descripcionCategoria: desc } } }, CONSULTA).monotributo?.categoria;
        assert.equal(conLetra("Categoría B"), "B");
        assert.equal(conLetra("CAT. D"), "D");
        assert.equal(conLetra("Locaciones y/o prestaciones de servicios - Categoría F"), "F");
    });
    it("sin poder leer la letra, la deja vacía en vez de inventarla", () => {
        // Una categoría equivocada define mal cuánto puede facturar alguien: es peor que no tenerla.
        const r = derivarCondicionFiscal({ datosMonotributo: { categoriaMonotributo: { idCategoria: 7 } } }, CONSULTA);
        assert.equal(r.tipo, "MONOTRIBUTO");
        assert.equal(r.monotributo?.categoria, undefined);
        assert.equal(r.descripcion, "Monotributo");
    });
    it("lee los datos generales también cuando vienen sueltos (forma del A13)", () => {
        const r = derivarCondicionFiscal({ persona: { estadoClave: "INACTIVO", tipoClave: "CUIT" }, errorMonotributo: {}, errorRegimenGeneral: {} }, CONSULTA);
        assert.equal(r.claveInactiva, true);
        assert.equal(r.tipo, "SIN_ACTIVIDAD");
    });
});
