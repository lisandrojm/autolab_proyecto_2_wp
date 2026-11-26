/**
 *   npx tsx --test src/services/cambioDeTurno.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validarCambioDeTurno } from "./cambioDeTurno.js";
import { REGLAS_CAMBIO_TURNO_POR_DEFECTO, reglasCambioTurnoDe, sumarDias, rangosSePisan } from "../compartido/cambioDeTurno.js";
const PROYECTO = "64a000000000000000000001";
const EDICION = "64a000000000000000000002";
const MANANA = "64b000000000000000000001";
const TARDE = "64b000000000000000000002";
const NOCHE = "64b000000000000000000003";
const OTRO = "64b000000000000000000009";
const HOY = "2026-11-26";
/** Un contexto sano: está en Mañana, pide Tarde desde dentro de una semana, sin nada encima. */
const base = (cambios = {}, pedido = {}) => ({
    hoy: HOY,
    reglas: { ...REGLAS_CAMBIO_TURNO_POR_DEFECTO },
    pedido: { projectId: PROYECTO, areaId: EDICION, sedeId: null, shiftActualId: MANANA, shiftSolicitadoId: TARDE, fechaDesde: "2026-12-03", fechaHasta: null, motivo: "Estudio a la mañana", ...pedido },
    turnosActuales: [MANANA],
    turnosDeLaFila: [MANANA, TARDE, NOCHE],
    destinoExiste: true,
    otrosPedidos: [],
    ausencias: [],
    ocupacionDestino: null,
    ...cambios,
});
const codigos = (ctx) => validarCambioDeTurno(ctx).errores.map((e) => e.codigo);
describe("validar un pedido de cambio de turno", () => {
    it("un pedido sano pasa", () => {
        assert.deepEqual(validarCambioDeTurno(base()), { ok: true, errores: [] });
    });
    it("la persona tiene que tener turno en esa fila, y el que dice el pedido", () => {
        assert.deepEqual(codigos(base({ turnosActuales: [] })), ["sin_turno_actual"]);
        assert.deepEqual(codigos(base({ turnosActuales: [NOCHE] })), ["turno_actual_distinto"]);
        assert.deepEqual(codigos(base({ turnosDeLaFila: null })), ["fila_inexistente"]);
    });
    it("el destino existe, es de esa fila y es distinto del actual", () => {
        assert.deepEqual(codigos(base({ destinoExiste: false })), ["turno_destino_inexistente"]);
        assert.deepEqual(codigos(base({}, { shiftSolicitadoId: OTRO })), ["turno_fuera_del_area"]);
        assert.deepEqual(codigos(base({}, { shiftSolicitadoId: MANANA })), ["mismo_turno"]);
        // Con Mañana y Tarde a la vez, pedir Tarde es «ya estás».
        assert.deepEqual(codigos(base({ turnosActuales: [MANANA, TARDE] })), ["mismo_turno"]);
    });
    it("fechaDesde ≥ hoy + anticipación; el mensaje dice la primera fecha posible", () => {
        const r = validarCambioDeTurno(base({}, { fechaDesde: "2026-11-28" }));
        assert.deepEqual(r.errores.map((e) => e.codigo), ["anticipacion_insuficiente"]);
        assert.match(r.errores[0].mensaje, /29\/11\/2026/);
        assert.equal(validarCambioDeTurno(base({}, { fechaDesde: "2026-11-29" })).ok, true);
        // Sin anticipación, hoy vale y ayer no.
        const sinAnticipacion = { ...REGLAS_CAMBIO_TURNO_POR_DEFECTO, diasAnticipacion: 0 };
        assert.equal(validarCambioDeTurno(base({ reglas: sinAnticipacion }, { fechaDesde: HOY })).ok, true);
        assert.deepEqual(codigos(base({ reglas: sinAnticipacion }, { fechaDesde: "2026-11-25" })), ["anticipacion_insuficiente"]);
        assert.deepEqual(codigos(base({}, { fechaDesde: "" })), ["fecha_desde_invalida"]);
    });
    it("fechaHasta ≥ fechaDesde, y sólo si el tipo permite temporales", () => {
        assert.equal(validarCambioDeTurno(base({}, { fechaHasta: "2026-12-10" })).ok, true);
        assert.deepEqual(codigos(base({}, { fechaHasta: "2026-12-02" })), ["fecha_hasta_invalida"]);
        assert.deepEqual(codigos(base({}, { fechaHasta: "mañana" })), ["fecha_hasta_invalida"]);
        assert.deepEqual(codigos(base({ reglas: { ...REGLAS_CAMBIO_TURNO_POR_DEFECTO, permitirTemporal: false } }, { fechaHasta: "2026-12-10" })), ["temporal_no_permitido"]);
    });
    it("el motivo es obligatorio", () => {
        assert.deepEqual(codigos(base({}, { motivo: "   " })), ["motivo_requerido"]);
    });
    it("no se pisa con otro pedido en juego (uno permanente pisa todo lo que venga después)", () => {
        assert.deepEqual(codigos(base({ otrosPedidos: [{ desde: "2026-12-01", hasta: "2026-12-05" }] })), ["pedido_superpuesto"]);
        assert.deepEqual(codigos(base({ otrosPedidos: [{ desde: "2026-11-01", hasta: null }] })), ["pedido_superpuesto"]);
        assert.equal(validarCambioDeTurno(base({ otrosPedidos: [{ desde: "2026-12-01", hasta: "2026-12-02" }] })).ok, true);
        // El pedido permanente pisa un pedido futuro.
        assert.deepEqual(codigos(base({ otrosPedidos: [{ desde: "2027-01-10", hasta: "2027-01-20" }] })), ["pedido_superpuesto"]);
        assert.equal(validarCambioDeTurno(base({ otrosPedidos: [{ desde: "2027-01-10", hasta: "2027-01-20" }] }, { fechaHasta: "2026-12-31" })).ok, true);
    });
    it("no se pisa con vacaciones ni licencias aprobadas; el mensaje dice las fechas", () => {
        const r = validarCambioDeTurno(base({ ausencias: [{ tipo: "vacaciones", desde: "2026-12-03", hasta: "2026-12-17" }] }));
        assert.deepEqual(r.errores.map((e) => e.codigo), ["vacaciones_superpuestas"]);
        assert.match(r.errores[0].mensaje, /3\/12\/2026 al 17\/12\/2026/);
        assert.deepEqual(codigos(base({ ausencias: [{ tipo: "licencia", desde: "2026-12-20", hasta: "2026-12-22" }] })), ["licencia_superpuesta"]);
        assert.equal(validarCambioDeTurno(base({ ausencias: [{ tipo: "licencia", desde: "2026-12-20", hasta: "2026-12-22" }] }, { fechaHasta: "2026-12-19" })).ok, true);
    });
    it("cupo del destino: se frena cuando ya está lleno", () => {
        const conCupo = { ...REGLAS_CAMBIO_TURNO_POR_DEFECTO, cupoMaximoPorTurno: 2 };
        assert.deepEqual(codigos(base({ reglas: conCupo, ocupacionDestino: 2 })), ["cupo_excedido"]);
        assert.equal(validarCambioDeTurno(base({ reglas: conCupo, ocupacionDestino: 1 })).ok, true);
        // Sin cupo configurado la ocupación no se mira.
        assert.equal(validarCambioDeTurno(base({ ocupacionDestino: 50 })).ok, true);
    });
    it("devuelve TODOS los errores juntos", () => {
        const r = validarCambioDeTurno(base({ turnosActuales: [] }, { fechaDesde: "2026-11-27", motivo: "" }));
        assert.deepEqual(r.errores.map((e) => e.codigo).sort(), ["anticipacion_insuficiente", "motivo_requerido", "sin_turno_actual"]);
    });
});
describe("helpers compartidos del cambio de turno", () => {
    it("reglasCambioTurnoDe completa con los defaults y descarta basura", () => {
        assert.deepEqual(reglasCambioTurnoDe(undefined), REGLAS_CAMBIO_TURNO_POR_DEFECTO);
        assert.deepEqual(reglasCambioTurnoDe({ reglasCambioTurno: { diasAnticipacion: 7, permitirTemporal: false, cupoMaximoPorTurno: 4 } }), { diasAnticipacion: 7, permitirTemporal: false, cupoMaximoPorTurno: 4 });
        assert.deepEqual(reglasCambioTurnoDe({ reglasCambioTurno: { diasAnticipacion: -1, cupoMaximoPorTurno: 0 } }), REGLAS_CAMBIO_TURNO_POR_DEFECTO);
    });
    it("sumarDias no se corre de día por la zona horaria", () => {
        assert.equal(sumarDias("2026-11-26", 3), "2026-11-29");
        assert.equal(sumarDias("2026-12-30", 3), "2027-01-02");
        assert.equal(sumarDias("2026-11-26", 0), "2026-11-26");
    });
    it("rangosSePisan es inclusivo y entiende el hasta abierto", () => {
        assert.equal(rangosSePisan({ desde: "2026-12-01", hasta: "2026-12-05" }, { desde: "2026-12-05", hasta: "2026-12-09" }), true);
        assert.equal(rangosSePisan({ desde: "2026-12-01", hasta: "2026-12-05" }, { desde: "2026-12-06", hasta: "2026-12-09" }), false);
        assert.equal(rangosSePisan({ desde: "2026-12-01", hasta: null }, { desde: "2030-01-01", hasta: "2030-01-02" }), true);
        assert.equal(rangosSePisan({ desde: "2026-12-01", hasta: null }, { desde: "2026-11-01", hasta: "2026-11-30" }), false);
    });
});
