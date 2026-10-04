import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { enCola, encolarSiCorresponde, encolarValidacionObraSocial, olvidarColas, vaciarCola, validacionAutomaticaActiva } from "./colaObrasSociales.js";
import { CandadoArcaOcupado } from "./candadoArca.js";
const AQUI = dirname(fileURLToPath(import.meta.url));
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const T = "tenant1";
const E1 = "aaaaaaaaaaaaaaaaaaaaaaa1";
const E2 = "aaaaaaaaaaaaaaaaaaaaaaa2";
const A = "20111111112";
const B = "27222222223";
const C = "20333333334";
/** Dependencias de mentira: registran con qué se arrancó, y dejan decidir pendientes y candado. */
const armar = (o = {}) => {
    const arranques = [];
    const deps = {
        pendientes: async (_t, empresaId) => (o.pendientes ? o.pendientes[empresaId] || [] : [A, B, C]).map((cuil) => ({ cuil })),
        arrancar: async (x) => {
            if (o.arrancar)
                await o.arrancar();
            arranques.push({ grupos: x.grupos, usuarioId: x.usuarioId });
        },
        ocupado: o.ocupado || (() => false),
        esperaMs: o.esperaMs ?? 60_000,
        reintentoMs: o.reintentoMs ?? 60_000,
        maxIntentos: o.maxIntentos ?? 3,
    };
    return { deps, arranques };
};
const encolar = (deps, empresaId, cuil, usuarioId) => encolarValidacionObraSocial({ tenantId: T, tenantObjectId: T, empresaId, cuil, usuarioId }, deps);
afterEach(() => olvidarColas());
describe("cola de validación de obras sociales", () => {
    it("varios contratos seguidos salen en UNA corrida, agrupados por empleadora", async () => {
        const { deps, arranques } = armar();
        encolar(deps, E1, A);
        encolar(deps, E1, B);
        encolar(deps, E2, C, "usuario9");
        assert.equal(await vaciarCola(T, deps), "arrancada");
        assert.equal(arranques.length, 1);
        assert.deepEqual(arranques[0].grupos, [
            { empresaId: E1, cuils: [A, B] },
            { empresaId: E2, cuils: [C] },
        ]);
        assert.equal(arranques[0].usuarioId, "usuario9");
        assert.deepEqual(enCola(T), [], "lo que entró a la corrida sale de la cola");
    });
    it("la misma persona encolada dos veces se valida una", async () => {
        const { deps, arranques } = armar();
        encolar(deps, E1, A);
        encolar(deps, E1, "20-11111111-2");
        await vaciarCola(T, deps);
        assert.deepEqual(arranques[0].grupos, [{ empresaId: E1, cuils: [A] }]);
    });
    it("sólo se valida a quien sigue pendiente: lo ya constatado no se vuelve a consultar", async () => {
        const { deps, arranques } = armar({ pendientes: { [E1]: [B] } });
        encolar(deps, E1, A);
        encolar(deps, E1, B);
        assert.equal(await vaciarCola(T, deps), "arrancada");
        assert.deepEqual(arranques[0].grupos, [{ empresaId: E1, cuils: [B] }]);
    });
    it("si nadie sigue pendiente no se abre ARCA", async () => {
        const { deps, arranques } = armar({ pendientes: { [E1]: [] } });
        encolar(deps, E1, A);
        assert.equal(await vaciarCola(T, deps), "nada_pendiente");
        assert.equal(arranques.length, 0);
        assert.deepEqual(enCola(T), []);
    });
    it("con ARCA ocupada no dispara nada y lo encolado se conserva", async () => {
        let ocupado = true;
        const { deps, arranques } = armar({ ocupado: () => ocupado });
        encolar(deps, E1, A);
        assert.equal(await vaciarCola(T, deps), "ocupado");
        assert.equal(arranques.length, 0);
        assert.deepEqual(enCola(T), [{ empresaId: E1, cuils: [A] }]);
        ocupado = false;
        assert.equal(await vaciarCola(T, deps), "arrancada");
        assert.equal(arranques.length, 1);
    });
    it("si otra corrida tomó el candado justo al arrancar, se reintenta sin perder a nadie", async () => {
        let primera = true;
        const { deps, arranques } = armar({
            arrancar: async () => {
                if (primera) {
                    primera = false;
                    throw new CandadoArcaOcupado("carga_masiva");
                }
            },
        });
        encolar(deps, E1, A);
        assert.equal(await vaciarCola(T, deps), "ocupado");
        assert.deepEqual(enCola(T), [{ empresaId: E1, cuils: [A] }]);
        assert.equal(await vaciarCola(T, deps), "arrancada");
        assert.equal(arranques.length, 1);
    });
    it("después de los intentos máximos suelta la cola: quedan pendientes para el botón", async () => {
        const { deps, arranques } = armar({ ocupado: () => true, maxIntentos: 2 });
        encolar(deps, E1, A);
        assert.equal(await vaciarCola(T, deps), "ocupado");
        assert.equal(await vaciarCola(T, deps), "ocupado");
        assert.equal(await vaciarCola(T, deps), "abandonada");
        assert.equal(arranques.length, 0);
        assert.deepEqual(enCola(T), []);
    });
    it("un arranque que falla por otra cosa (faltan credenciales) no se reintenta", async () => {
        const { deps } = armar({
            arrancar: async () => {
                throw new Error("Faltan las credenciales de ARCA.");
            },
        });
        encolar(deps, E1, A);
        assert.equal(await vaciarCola(T, deps), "fallo");
        assert.deepEqual(enCola(T), []);
    });
    it("lo que se encola mientras se está vaciando queda para la vuelta siguiente", async () => {
        const { deps, arranques } = armar();
        const lentas = {
            ...deps,
            pendientes: async (t, e) => {
                // Llega otro contrato justo mientras se resuelven los pendientes.
                encolar(lentas, E1, B);
                return deps.pendientes(t, e);
            },
        };
        encolar(lentas, E1, A);
        assert.equal(await vaciarCola(T, lentas), "arrancada");
        assert.deepEqual(arranques[0].grupos, [{ empresaId: E1, cuils: [A] }]);
        assert.deepEqual(enCola(T), [{ empresaId: E1, cuils: [B] }]);
    });
    it("el temporizador vacía la cola solo, una vez, pasada la ventana", async () => {
        const { deps, arranques } = armar({ esperaMs: 20 });
        encolar(deps, E1, A);
        encolar(deps, E1, B);
        assert.equal(arranques.length, 0, "no dispara al encolar");
        await espera(80);
        assert.equal(arranques.length, 1);
        assert.deepEqual(arranques[0].grupos, [{ empresaId: E1, cuils: [A, B] }]);
    });
    it("ocupada, reintenta sola hasta que ARCA se libera", async () => {
        let ocupado = true;
        const { deps, arranques } = armar({ ocupado: () => ocupado, esperaMs: 10, reintentoMs: 15, maxIntentos: 50 });
        encolar(deps, E1, A);
        await espera(40);
        assert.equal(arranques.length, 0);
        ocupado = false;
        await espera(60);
        assert.equal(arranques.length, 1);
    });
    it("no encola sin empleadora ni con un CUIL que no tiene 11 dígitos", () => {
        const { deps } = armar();
        assert.equal(encolar(deps, "", A), false);
        assert.equal(encolar(deps, E1, "123"), false);
        assert.deepEqual(enCola(T), []);
    });
});
describe("el gancho de las rutas", () => {
    const contrato = { empresaContratoId: E1, categoria_sat_id: 147 };
    it("encola un contrato con empleadora, categoría y CUIL", () => {
        const { deps } = armar();
        assert.equal(encolarSiCorresponde({ tenantObjectId: T, cuit: "20-11111111-2", contrato }, deps), true);
        assert.deepEqual(enCola(T), [{ empresaId: E1, cuils: [A] }]);
    });
    it("no encola sin empleadora, sin categoría (servicios) ni sin CUIL", () => {
        const { deps } = armar();
        assert.equal(encolarSiCorresponde({ tenantObjectId: T, cuit: A, contrato: { categoria_sat_id: 147 } }, deps), false);
        assert.equal(encolarSiCorresponde({ tenantObjectId: T, cuit: A, contrato: { empresaContratoId: E1 } }, deps), false);
        assert.equal(encolarSiCorresponde({ tenantObjectId: T, cuit: "", contrato }, deps), false);
        assert.deepEqual(enCola(T), []);
    });
    it("lo ya constatado en ARCA no se encola: no se pisa ni se vuelve a consultar", () => {
        const { deps } = armar();
        assert.equal(encolarSiCorresponde({ tenantObjectId: T, cuit: A, contrato: { ...contrato, obraSocialBloqueada: true } }, deps), false);
        assert.equal(encolarSiCorresponde({ tenantObjectId: T, cuit: A, contrato: { ...contrato, obraSocialConstatadaEn: "arca", obraSocialNoFigura: true } }, deps), false);
        assert.deepEqual(enCola(T), []);
    });
    it("se apaga con ARCA_VALIDACION_AUTOMATICA=0, y el server local lo trae apagado", () => {
        assert.equal(validacionAutomaticaActiva(undefined), true);
        assert.equal(validacionAutomaticaActiva("1"), true);
        assert.equal(validacionAutomaticaActiva("0"), false);
        const pkg = JSON.parse(readFileSync(resolve(AQUI, "../../../package.json"), "utf8"));
        assert.match(pkg.scripts.local, /ARCA_VALIDACION_AUTOMATICA=0/);
    });
    it("las dos rutas que crean un contrato o le asignan empleadora encolan DESPUÉS de guardar", () => {
        const rutas = readFileSync(resolve(AQUI, "../../routes/projects.ts"), "utf8");
        const alta = rutas.indexOf("await userProject.save();");
        assert.ok(alta > 0 && rutas.indexOf("encolarSiCorresponde(", alta) > alta && rutas.indexOf("encolarSiCorresponde(", alta) - alta < 1500, "assign-member encola tras guardar");
        const patch = rutas.indexOf('router.patch("/projects/:projectId/members/:userId/contracts/:index/empresa-contrato"');
        const guarda = rutas.indexOf("await up.save();", patch);
        assert.ok(patch > 0 && guarda > patch && rutas.indexOf("encolarSiCorresponde(", guarda) > guarda && rutas.indexOf("encolarSiCorresponde(", guarda) - guarda < 1500, "empresa-contrato encola tras guardar");
    });
});
