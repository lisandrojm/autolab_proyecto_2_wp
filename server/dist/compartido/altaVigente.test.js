import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoSinFechas, decidirAltaVigente, liquidacionDeCodigo, liquidacionDeTextoArca, liquidacionDelAlta, mensajeMismaEmpleadora, mensajeSoloServicios } from "./altaVigente.js";
const alta = (x = {}) => ({ proyectoNombre: "La Nación | LN+", desde: "2026-11-01", hasta: "2026-11-22", empresaId: "E1", empresaNombre: "2030 S.R.L.", liquidacion: "mensual", ...x });
test("liquidación por código: 8 es jornal; 1 es mensual; vacío no se sabe", () => {
    assert.equal(liquidacionDeCodigo("8"), "jornal");
    assert.equal(liquidacionDeCodigo("08"), "jornal");
    assert.equal(liquidacionDeCodigo("1"), "mensual");
    assert.equal(liquidacionDeCodigo(""), null);
    assert.equal(liquidacionDeCodigo(undefined), null);
});
test("liquidación por texto de ARCA", () => {
    assert.equal(liquidacionDeTextoArca("MES"), "mensual");
    assert.equal(liquidacionDeTextoArca("JORNAL"), "jornal");
    assert.equal(liquidacionDeTextoArca("8 - Jornal"), "jornal");
    assert.equal(liquidacionDeTextoArca("  "), null);
});
test("ARCA manda sobre el tipo; sin ninguno, mensual", () => {
    assert.deepEqual(liquidacionDelAlta("JORNAL", "1"), { liquidacion: "jornal", origen: "arca" });
    assert.deepEqual(liquidacionDelAlta("MES", "8"), { liquidacion: "mensual", origen: "arca" });
    assert.deepEqual(liquidacionDelAlta("", "8"), { liquidacion: "jornal", origen: "tipo" });
    assert.deepEqual(liquidacionDelAlta(null, null), { liquidacion: "mensual", origen: "sin_dato" });
});
test("un alta mensual en esas fechas: sólo Servicios, con cualquier empresa", () => {
    const a = alta();
    assert.equal(decidirAltaVigente([a], "E1").soloServicios, a);
    assert.equal(decidirAltaVigente([a], "E2").soloServicios, a);
    assert.equal(decidirAltaVigente([a]).soloServicios, a);
});
test("un alta por jornada: misma empresa frena, otra empresa deja", () => {
    const j = alta({ liquidacion: "jornal" });
    assert.deepEqual(decidirAltaVigente([j], "E1"), { soloServicios: null, mismaEmpleadora: j });
    assert.deepEqual(decidirAltaVigente([j], "E2"), { soloServicios: null, mismaEmpleadora: null });
    // Sin saber la empresa del contrato nuevo, esa parte no frena (la mira la aprobación).
    assert.deepEqual(decidirAltaVigente([j]), { soloServicios: null, mismaEmpleadora: null });
});
test("sin altas en las fechas, nada", () => {
    assert.deepEqual(decidirAltaVigente([], "E1"), { soloServicios: null, mismaEmpleadora: null });
});
test("mensajes", () => {
    assert.match(mensajeSoloServicios(alta()), /mensual en esas fechas .*del 01\/11\/2026 al 22\/11\/2026.*Servicios/);
    assert.match(mensajeSoloServicios(alta({ hasta: "" })), /sin fecha de baja/);
    assert.match(mensajeMismaEmpleadora(alta({ liquidacion: "jornal" })), /jornada con 2030 S\.R\.L\..*una sola alta activa por empleadora/);
    assert.match(avisoSinFechas(alta()), /hasta el 22\/11\/2026.*sólo se va a poder contratar por Servicios/);
    assert.match(avisoSinFechas(alta({ liquidacion: "jornal" })), /por jornada.*misma empresa/);
});
