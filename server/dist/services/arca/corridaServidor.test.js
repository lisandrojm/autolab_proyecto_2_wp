import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ordenarPorPuntaje, resumirTiempos } from "./corridaServidor.js";
const FUENTE = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "corridaServidor.ts"), "utf8");
describe("reintento por «alta activa»: en qué orden se prueban las otras empleadoras", () => {
    const otras = [
        { _id: "a", cuit: "30-11111111-1", razonSocial: "A" },
        { _id: "b", cuit: "30-22222222-2", razonSocial: "B" },
        { _id: "c", cuit: "30-33333333-3", razonSocial: "C" },
    ];
    it("primero la que más resolvió antes", () => {
        const orden = ordenarPorPuntaje(otras, new Map([["30333333333", 7], ["30111111111", 2]]), []);
        assert.deepEqual(orden.map((o) => o.razonSocial), ["C", "A", "B"]);
    });
    it("sin historial, las de la selección primero; si no, el orden de siempre", () => {
        assert.deepEqual(ordenarPorPuntaje(otras, new Map(), ["30222222222"]).map((o) => o.razonSocial), ["B", "A", "C"]);
        assert.deepEqual(ordenarPorPuntaje(otras, new Map(), []).map((o) => o.razonSocial), ["A", "B", "C"]);
    });
    it("corta apenas no queda nadie, y no reabre el navegador para cambiar de empleadora", () => {
        assert.match(FUENTE, /if \(pendientes\.size === 0 \|\| corrida\.señal\.cortada \|\| sinSesion\) break;/);
        // El reintento pasa por `leerCon` con esperaMin 0: misma página; sesión nueva solo si eso falla.
        assert.match(FUENTE, /await leerCon\(otraCuit, razonSocial, elegibles, 0\)/);
    });
});
describe("la corrida valida SOLO obra social", () => {
    it("no compara, consulta ni escribe nombres", () => {
        assert.ok(!/confirmarNombresConElPadron|aplicarNombreDeArca|mismoNombre|nombreArca/.test(FUENTE), "los nombres se validan desde Usuarios");
        assert.ok(!/tipo: "nombres"/.test(FUENTE));
    });
    it("lo leído se guarda contra la empleadora del contrato", () => {
        assert.match(FUENTE, /aplicarLoteObrasSociales\(\{ tenantObjectId, empresaId: g\.empresaId, filas/);
    });
});
describe("resumen de tiempos", () => {
    it("separa las personas leídas de los rechazos", () => {
        const r = resumirTiempos({
            aperturas: [{ lanzarMs: 800, sesionGuardadaMs: 2200, loginMs: 0 }],
            grupos: [
                {
                    empresaCuit: "30111111111",
                    razonSocial: "A",
                    cuils: 3,
                    prepararMs: 3000,
                    vaciarInicialMs: 50,
                    porCuil: [
                        { cuil: "1", agregarMs: 1200, leerMs: 30, vaciarMs: 900, desenlace: "leido", vaciarCon: "x" },
                        { cuil: "2", agregarMs: 1400, leerMs: 50, vaciarMs: 1100, desenlace: "leido", vaciarCon: "x" },
                        { cuil: "3", agregarMs: 1000, leerMs: 0, vaciarMs: 0, desenlace: "rechazo", vaciarCon: null },
                    ],
                },
            ],
            reintentos: [],
            guardarMs: 400,
            totalMs: 10_000,
        });
        assert.equal(r.abrirSesionMs, 3000);
        assert.equal(r.prepararMs, 3050);
        assert.equal(r.leidas, 2);
        assert.equal(r.rechazos, 1);
        assert.deepEqual(r.porLeidaMs, { agregar: 1300, leer: 40, vaciar: 1000, total: 2340 });
        assert.equal(r.porRechazoMs.total, 1000);
        assert.deepEqual(r.vaciarCon, ["x"]);
    });
});
