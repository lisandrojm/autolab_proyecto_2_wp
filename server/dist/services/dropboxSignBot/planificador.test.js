import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_POR_DEFECTO, estimarEnvios, instanteArgentino, planificar, puedeCorrer, validarEncolado } from "./planificador.js";
import { REGLAS_BASE } from "../../compartido/reglasColocacionFirma.js";
const archivo = (n, tipo = "Contrato_Jornada", prefijo = "426_LN+") => `${prefijo}_PEREZ_${tipo}_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-${String(n).padStart(6, "0")}.pdf`;
const item = (n, orden = n) => ({ archivo: archivo(n), codigo: `ID-${String(n).padStart(6, "0")}`, tipo: "Contrato_Jornada", email: "fulano@gmail.com", firmante: "JUAN PEREZ", orden });
const FIRMANTE = { nombre: "JUAN PEREZ", email: "fulano@gmail.com" };
// Un martes a las 12:00 de Argentina (UTC-3).
const AHORA = new Date("2026-10-20T15:00:00Z");
const limpio = { contadorDia: { fecha: "2026-10-20", enviados: 0 }, enfriadoHasta: null, ultimaCorridaAt: null };
const config = { ...CONFIG_POR_DEFECTO, activo: true };
describe("validar el encolado", () => {
    const ok = { enOutbox: true, registroPrevio: null, firmante: FIRMANTE };
    it("pasa con archivo en Outbox, código, tipo con regla y firmante", () => {
        const r = validarEncolado(archivo(1), ok);
        assert.ok(r.ok && r.codigo === "ID-000001" && r.tipo === "Contrato_Jornada");
    });
    it("un enviado jamás se re-encola; un en_cola o limite tampoco se duplica", () => {
        for (const estado of ["enviado", "en_cola", "limite"]) {
            const r = validarEncolado(archivo(1), { ...ok, registroPrevio: { estado } });
            assert.ok(!r.ok && !r.reencolable, estado);
        }
        // Un error o un requiere_revision previo sí se puede volver a encolar.
        assert.ok(validarEncolado(archivo(1), { ...ok, registroPrevio: { estado: "error" } }).ok);
        assert.ok(validarEncolado(archivo(1), { ...ok, registroPrevio: { estado: "requiere_revision" } }).ok);
    });
    it("tipo desconocido, regla pendiente del tenant, sin código, sin usuario, fuera de Outbox", () => {
        const r1 = validarEncolado(archivo(2, "CCM"), ok);
        assert.ok(!r1.ok && /sin regla/.test(r1.motivo));
        // REC_SUELDO tiene regla en el catálogo: entra. Con las reglas del tenant marcándolo pendiente, frena con su motivo.
        const recibo = "99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_PEREZ_Juan_a-ARROBA-b.com_20273130293_ID-000004.pdf";
        assert.ok(validarEncolado(recibo, ok).ok);
        const pendiente = REGLAS_BASE.map((r) => (r.tipo === "REC_SUELDO" ? { ...r, estado: "pendiente", motivoPendiente: "falta definir posición de firma" } : r));
        const r2 = validarEncolado(recibo, { ...ok, reglas: pendiente });
        assert.ok(!r2.ok && /^Tipo REC_SUELDO: .*posición de firma/i.test(r2.motivo), r2.motivo);
        const r3 = validarEncolado("426_LN+_PEREZ_Contrato_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com.pdf", ok);
        assert.ok(!r3.ok && /c[oó]digo/.test(r3.motivo));
        const r4 = validarEncolado(archivo(5), { ...ok, firmante: null, motivoSinFirmante: "No hay usuario para el código ID-000005." });
        assert.ok(!r4.ok && /usuario/.test(r4.motivo));
        const r5 = validarEncolado(archivo(6), { ...ok, enOutbox: false });
        assert.ok(!r5.ok && /Outbox/.test(r5.motivo));
    });
});
describe("planificar la tanda desde la cola", () => {
    const outbox = new Set([1, 2, 3, 4, 5].map((n) => archivo(n)));
    it("sólo lo encolado, por orden de encolado, y respeta el tamaño de tanda", () => {
        const cola = [item(3, 1), item(1, 2), item(5, 3), item(2, 4), item(4, 5)];
        const plan = planificar(cola, outbox, { ...config, tamanoTanda: 3 }, limpio, AHORA);
        assert.deepEqual(plan.tanda.map((c) => c.codigo), ["ID-000003", "ID-000001", "ID-000005"]);
        assert.equal(plan.pendientesDespues, 2);
    });
    it("respeta el tope diario: con 38 enviados hoy y tope 40, la tanda es de 2; el contador de otro día no cuenta", () => {
        const cola = [1, 2, 3, 4, 5].map((n) => item(n));
        assert.equal(planificar(cola, outbox, config, { ...limpio, contadorDia: { fecha: "2026-10-20", enviados: 38 } }, AHORA).tanda.length, 2);
        assert.equal(planificar(cola, outbox, config, { ...limpio, contadorDia: { fecha: "2026-10-19", enviados: 38 } }, AHORA).tanda.length, 5);
    });
    it("lo encolado que ya no está en Outbox va a faltantes y no se envía", () => {
        const plan = planificar([item(1), item(9)], outbox, config, limpio, AHORA);
        assert.deepEqual(plan.tanda.map((c) => c.codigo), ["ID-000001"]);
        assert.deepEqual(plan.faltantes.map((c) => c.codigo), ["ID-000009"]);
    });
    it("un código repetido en la cola sale una sola vez", () => {
        assert.equal(planificar([item(1, 1), item(1, 2)], outbox, config, limpio, AHORA).tanda.length, 1);
    });
});
describe("cuándo saldría cada ítem de la cola (la cuenta regresiva)", () => {
    const cola = (n) => Array.from({ length: n }, (_, i) => item(i + 1));
    const iso = (d) => d?.toISOString();
    it("tandas de 10 cada 4 h desde ahora, dentro de la ventana; lo que cae fuera de la ventana pasa al día siguiente a la hora de inicio", () => {
        const e = estimarEnvios(cola(45), config, limpio, AHORA);
        assert.equal(iso(e.get("ID-000001")), "2026-10-20T15:00:00.000Z"); // ahora (12:00 AR)
        assert.equal(iso(e.get("ID-000010")), "2026-10-20T15:00:00.000Z");
        assert.equal(iso(e.get("ID-000011")), "2026-10-20T19:00:00.000Z"); // 16:00 AR
        assert.equal(iso(e.get("ID-000021")), "2026-10-20T23:00:00.000Z"); // 20:00 AR
        // La 4.ª tanda caería a las 00:00 AR: fuera de la ventana 8-22 → 08:00 AR del 21.
        assert.equal(iso(e.get("ID-000031")), "2026-10-21T11:00:00.000Z");
        assert.equal(iso(e.get("ID-000041")), "2026-10-21T15:00:00.000Z");
        assert.equal(iso(e.get("ID-000045")), "2026-10-21T15:00:00.000Z");
    });
    it("respeta el tope diario (con 35 enviados hoy salen 5 ahora y el resto mañana), el intervalo desde la última corrida y el enfriamiento", () => {
        const conTope = estimarEnvios(cola(12), config, { ...limpio, contadorDia: { fecha: "2026-10-20", enviados: 35 } }, AHORA);
        assert.equal(iso(conTope.get("ID-000005")), "2026-10-20T15:00:00.000Z");
        assert.equal(iso(conTope.get("ID-000006")), "2026-10-21T11:00:00.000Z");
        const conIntervalo = estimarEnvios(cola(1), config, { ...limpio, ultimaCorridaAt: new Date(AHORA.getTime() - 3600_000) }, AHORA);
        assert.equal(iso(conIntervalo.get("ID-000001")), "2026-10-20T18:00:00.000Z"); // 1 h atrás + 4 h
        const enfriado = estimarEnvios(cola(1), config, { ...limpio, enfriadoHasta: new Date(AHORA.getTime() + 2 * 3600_000) }, AHORA);
        assert.equal(iso(enfriado.get("ID-000001")), "2026-10-20T17:00:00.000Z");
    });
    it("sin envío automático no hay estimación; fuera de la ventana arranca al abrir; instanteArgentino es UTC-3", () => {
        assert.equal(estimarEnvios(cola(3), { ...config, activo: false }, limpio, AHORA).size, 0);
        const deNoche = estimarEnvios(cola(1), config, limpio, new Date("2026-10-21T02:30:00Z")); // 23:30 AR del 20
        assert.equal(iso(deNoche.get("ID-000001")), "2026-10-21T11:00:00.000Z");
        assert.equal(instanteArgentino("2026-10-21", 8).toISOString(), "2026-10-21T11:00:00.000Z");
    });
});
describe("cuándo corre el scheduler", () => {
    it("no corre desactivado, fuera de ventana, en enfriamiento, sin cupo o antes del intervalo", () => {
        assert.equal(puedeCorrer({ ...config, activo: false }, limpio, AHORA).ok, false);
        assert.equal(puedeCorrer(config, limpio, new Date("2026-10-20T04:00:00Z")).ok, false, "01:00 AR está fuera de 8-22");
        assert.equal(puedeCorrer(config, { ...limpio, enfriadoHasta: new Date(AHORA.getTime() + 3600_000) }, AHORA).ok, false);
        assert.equal(puedeCorrer(config, { ...limpio, contadorDia: { fecha: "2026-10-20", enviados: 40 } }, AHORA).ok, false);
        assert.equal(puedeCorrer(config, { ...limpio, ultimaCorridaAt: new Date(AHORA.getTime() - 3600_000) }, AHORA).ok, false);
        assert.equal(puedeCorrer(config, { ...limpio, ultimaCorridaAt: new Date(AHORA.getTime() - 5 * 3600_000) }, AHORA).ok, true);
    });
    it("el botón manual sólo respeta el enfriamiento y el cupo", () => {
        assert.equal(puedeCorrer({ ...config, activo: false }, limpio, new Date("2026-10-20T04:00:00Z"), { manual: true }).ok, true);
        assert.equal(puedeCorrer(config, { ...limpio, enfriadoHasta: new Date(AHORA.getTime() + 3600_000) }, AHORA, { manual: true }).ok, false);
    });
});
describe("encolar un documento con posición DECLARADA por la plantilla (25/10/2026)", () => {
    // Plantilla nueva: su nombre no matchea ninguna regla del catálogo.
    const NUEVA = "426_LN+_PEREZ_Contrato_Eventual-Talento_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000777.pdf";
    const ok = { enOutbox: true, registroPrevio: null, firmante: FIRMANTE };
    it("sin posición declarada queda «sin regla»", () => {
        assert.equal(validarEncolado(NUEVA, ok).ok, false);
    });
    it("con posición declarada se encola sin regla por nombre, con el tipo de la plantilla", () => {
        const r = validarEncolado(NUEVA, { ...ok, posicionDeclarada: { plantillaNombre: "Eventual Talento" } });
        assert.equal(r.ok, true);
        assert.equal(r.tipo, "Plantilla «Eventual Talento»");
    });
    it("lo demás sigue mandando: sin firmante, o ya enviado, no se encola", () => {
        assert.equal(validarEncolado(NUEVA, { ...ok, firmante: null, posicionDeclarada: { plantillaNombre: "X" } }).ok, false);
        assert.equal(validarEncolado(NUEVA, { ...ok, registroPrevio: { estado: "enviado" }, posicionDeclarada: { plantillaNombre: "X" } }).ok, false);
    });
});
