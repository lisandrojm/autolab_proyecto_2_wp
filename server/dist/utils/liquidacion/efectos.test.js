/**
 * Tests del mapeo motivo → concepto de Memosoft.
 *
 *   npm run test:liquidacion-efectos
 *
 * Lo que se prueba es lo que no se ve hasta que sale el recibo: que liquidar un mes viejo use las
 * reglas de ese mes, que un efecto de una empresa no se aplique en otra, y que no se pueda guardar
 * un mapeo que pone días donde el concepto espera pesos.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { efectosVigentesEn, validarEfecto, reemplazarVigentes } from "./efectos.js";
import { claveDeMotivo, indexarPorNombre } from "./nombresDeMotivo.js";
const efecto = (extra = {}) => ({
    conceptoCodigo: "0012",
    param: "par1",
    unidad: "cantidad",
    fuente: "jornadas",
    aplicaA: "titular",
    soloRegimen: null,
    empresaId: null,
    vigenteDesde: "2026-01-01",
    vigenteHasta: null,
    ...extra,
});
/** 0012 Licencia por Enfermedad: usa par1 y ahí va una cantidad de días. */
const LICENCIA = { codigo: "0012", descripcion: "Licencia por Enfermedad", usaPar1: true, usaPar2: false, unidadPar1: "cantidad", unidadPar2: null };
/** 0000 Jornal: usa par2, cantidad. Es el que cobra el reemplazante jornalero. */
const JORNAL = { codigo: "0000", descripcion: "Jornal", usaPar1: false, usaPar2: true, unidadPar1: null, unidadPar2: "cantidad" };
describe("liquidación · qué efectos rigen ese día", () => {
    it("el que todavía no empezó no rige", () => {
        const vigentes = efectosVigentesEn([efecto({ vigenteDesde: "2026-09-01" })], "2026-08-15");
        assert.equal(vigentes.length, 0, "un mapeo que arranca en septiembre no puede afectar agosto");
    });
    it("el que ya se cerró tampoco", () => {
        const vigentes = efectosVigentesEn([efecto({ vigenteDesde: "2025-01-01", vigenteHasta: "2026-07-31" })], "2026-08-15");
        assert.equal(vigentes.length, 0);
    });
    it("liquidar un mes viejo usa el mapeo de ese mes, no el de hoy", () => {
        /*
          Es la razón de ser de la vigencia. En agosto "Enfermedad" iba a 0012; en septiembre RRHH lo
          cambió a 0010. Reliquidar agosto tiene que dar 0012.
        */
        const historia = [
            efecto({ conceptoCodigo: "0012", vigenteDesde: "2025-01-01", vigenteHasta: "2026-08-31" }),
            efecto({ conceptoCodigo: "0010", vigenteDesde: "2026-09-01" }),
        ];
        assert.deepEqual(efectosVigentesEn(historia, "2026-08-15").map((e) => e.conceptoCodigo), ["0012"]);
        assert.deepEqual(efectosVigentesEn(historia, "2026-09-15").map((e) => e.conceptoCodigo), ["0010"]);
    });
    it("un efecto de una empresa no se aplica en otra", () => {
        const vigentes = efectosVigentesEn([efecto({ empresaId: "emp2030" })], "2026-08-15", { empresaId: "empFzero" });
        assert.equal(vigentes.length, 0);
    });
    it("un efecto de una empresa tampoco se aplica cuando no se sabe de qué empresa es el contrato", () => {
        // Aplicarlo "por las dudas" es lo que pone un concepto de 2030 en el recibo de alguien de FZERO.
        const vigentes = efectosVigentesEn([efecto({ empresaId: "emp2030" })], "2026-08-15", { empresaId: null });
        assert.equal(vigentes.length, 0);
    });
    it("el efecto sin empresa se aplica en todas", () => {
        const vigentes = efectosVigentesEn([efecto({ empresaId: null })], "2026-08-15", { empresaId: "empFzero" });
        assert.equal(vigentes.length, 1);
    });
    it("el jornal del reemplazante sólo sale si es jornalero", () => {
        const soloJornaleros = efecto({ conceptoCodigo: "0000", param: "par2", aplicaA: "reemplazante", soloRegimen: "jornalero" });
        assert.equal(efectosVigentesEn([soloJornaleros], "2026-08-15", { regimen: "jornalero" }).length, 1);
        assert.equal(efectosVigentesEn([soloJornaleros], "2026-08-15", { regimen: "mensual" }).length, 0);
    });
    it("se puede pedir sólo lo del titular o sólo lo del reemplazante", () => {
        const lista = [efecto({ aplicaA: "titular" }), efecto({ conceptoCodigo: "0000", param: "par2", aplicaA: "reemplazante" })];
        assert.deepEqual(efectosVigentesEn(lista, "2026-08-15", { aplicaA: "titular" }).map((e) => e.conceptoCodigo), ["0012"]);
        assert.deepEqual(efectosVigentesEn(lista, "2026-08-15", { aplicaA: "reemplazante" }).map((e) => e.conceptoCodigo), ["0000"]);
    });
    it("los efectos son aditivos: si matchean dos, salen los dos", () => {
        // Un motivo puede generar más de un concepto. El más específico NO tapa al general.
        const lista = [efecto({ conceptoCodigo: "0012" }), efecto({ conceptoCodigo: "0017", empresaId: "emp2030" })];
        assert.equal(efectosVigentesEn(lista, "2026-08-15", { empresaId: "emp2030" }).length, 2);
    });
});
describe("liquidación · validar el mapeo contra el catálogo", () => {
    it("un concepto que no está en el catálogo no se puede emitir", () => {
        assert.match(validarEfecto(efecto({ conceptoCodigo: "9999" }), undefined), /no está en el catálogo/);
    });
    it("no deja poner el número en la columna que el concepto ignora", () => {
        // Entraría como cero y la persona cobraría de menos, sin ningún error visible.
        const problema = validarEfecto(efecto({ param: "par2" }), LICENCIA);
        assert.match(problema, /no usa par2; usa par1/);
    });
    it("no deja poner días donde el concepto espera pesos", () => {
        const problema = validarEfecto(efecto({ unidad: "importe" }), LICENCIA);
        assert.match(problema, /espera cantidad en par1, no importe/);
    });
    it("el mapeo correcto pasa", () => {
        assert.equal(validarEfecto(efecto(), LICENCIA), null);
        assert.equal(validarEfecto(efecto({ conceptoCodigo: "0000", param: "par2", aplicaA: "reemplazante" }), JORNAL), null);
    });
    it("un valor fijo sin valor no es un valor fijo", () => {
        assert.match(validarEfecto(efecto({ fuente: "fijo" }), LICENCIA), /no tiene valor/);
    });
    it("una vigencia que termina antes de empezar no se guarda", () => {
        assert.match(validarEfecto(efecto({ vigenteDesde: "2026-08-01", vigenteHasta: "2026-07-01" }), LICENCIA), /termina antes de empezar/);
    });
    it("un concepto desactivado no se puede emitir", () => {
        assert.match(validarEfecto(efecto(), { ...LICENCIA, activo: false }), /desactivado/);
    });
});
describe("liquidación · cambiar el mapeo sin borrar historia", () => {
    it("cierra lo que regía el día anterior y abre lo nuevo", () => {
        const antes = [efecto({ conceptoCodigo: "0012", vigenteDesde: "2025-01-01" })];
        const despues = reemplazarVigentes(antes, [efecto({ conceptoCodigo: "0010" })], "2026-09-01");
        assert.equal(despues.length, 2, "lo viejo NO se borra: queda cerrado");
        assert.equal(despues[0].vigenteHasta, "2026-08-31");
        assert.equal(despues[1].conceptoCodigo, "0010");
        assert.equal(despues[1].vigenteDesde, "2026-09-01");
        assert.equal(despues[1].vigenteHasta, null);
    });
    it("después del cambio, cada fecha sigue resolviendo a lo que regía entonces", () => {
        const despues = reemplazarVigentes([efecto({ conceptoCodigo: "0012", vigenteDesde: "2025-01-01" })], [efecto({ conceptoCodigo: "0010" })], "2026-09-01");
        assert.deepEqual(efectosVigentesEn(despues, "2026-08-31").map((e) => e.conceptoCodigo), ["0012"]);
        assert.deepEqual(efectosVigentesEn(despues, "2026-09-01").map((e) => e.conceptoCodigo), ["0010"]);
    });
    it("lo que ya estaba cerrado no se vuelve a tocar", () => {
        const cerrado = efecto({ conceptoCodigo: "0011", vigenteDesde: "2024-01-01", vigenteHasta: "2024-12-31" });
        const despues = reemplazarVigentes([cerrado], [efecto()], "2026-09-01");
        assert.equal(despues[0].vigenteHasta, "2024-12-31");
    });
    it("un efecto que arrancaba hoy se reemplaza, no se cierra con fecha imposible", () => {
        // Cerrarlo ayer dejaría una vigencia que termina antes de empezar, guardada en la base.
        const reciente = efecto({ conceptoCodigo: "0017", vigenteDesde: "2026-09-01" });
        const despues = reemplazarVigentes([reciente], [efecto({ conceptoCodigo: "0012" })], "2026-09-01");
        assert.equal(despues.length, 1);
        assert.equal(despues[0].conceptoCodigo, "0012");
    });
    it("dejar el mapeo vacío cierra todo y no deja nada rigiendo", () => {
        // Es cómo se apaga un motivo: sin borrar lo que generó antes.
        const despues = reemplazarVigentes([efecto({ vigenteDesde: "2025-01-01" })], [], "2026-09-01");
        assert.equal(despues.length, 1);
        assert.equal(efectosVigentesEn(despues, "2026-09-15").length, 0);
    });
});
describe("liquidación · emparejar el motivo por nombre", () => {
    it("el plural y el singular son el mismo motivo", () => {
        /*
          No es una hipótesis: el 20/09/2026 alguien renombró "Compensatorios" a "Compensatorio" desde
          el ABM, y los 315 renglones ya cargados siguen guardando el texto viejo.
        */
        assert.equal(claveDeMotivo("Compensatorios"), claveDeMotivo("Compensatorio"));
        assert.equal(claveDeMotivo("Cambios de Turno"), claveDeMotivo("Cambio de Turno"));
    });
    it("las mayúsculas, los acentos y los espacios de más no separan", () => {
        assert.equal(claveDeMotivo("  ENFERMEDAD "), claveDeMotivo("Enfermedad"));
        assert.equal(claveDeMotivo("Vacación"), claveDeMotivo("vacacion"));
    });
    it("lo que mobile llama 'Presente (Adicional)' es 'Otros Presentes'", () => {
        assert.equal(claveDeMotivo("Presente (Adicional)"), claveDeMotivo("Otros Presentes"));
    });
    it("dos motivos distintos NO se confunden", () => {
        // El emparejamiento es tolerante con la escritura, no con el significado.
        assert.notEqual(claveDeMotivo("Enfermedad"), claveDeMotivo("Enfermería"));
        assert.notEqual(claveDeMotivo("Franco"), claveDeMotivo("Feriado"));
    });
    it("si dos motivos colapsan en la misma clave, se avisa en vez de elegir uno", () => {
        const { indice, colisiones } = indexarPorNombre([{ name: "Compensatorio" }, { name: "Compensatorios" }], (m) => m.name);
        assert.equal(indice.size, 1);
        assert.deepEqual(colisiones, ["Compensatorios"]);
    });
});
