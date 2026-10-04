import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { puestoParaGuardar } from "./puestosDesempenados.js";
const AQUI = dirname(fileURLToPath(import.meta.url));
/** Catálogo de mentira: sólo existen y están activos estos dos. */
const existe = async (codigo) => ["2455", "4132"].includes(codigo);
describe("puestoParaGuardar: el default de puesto que llega del ABM", () => {
    it("si no vino, no se toca", async () => assert.deepEqual(await puestoParaGuardar(undefined, existe), {}));
    it("vacío o sin dígitos lo quita", async () => {
        assert.deepEqual(await puestoParaGuardar("", existe), { valor: "" });
        assert.deepEqual(await puestoParaGuardar(null, existe), { valor: "" });
        assert.deepEqual(await puestoParaGuardar("sin puesto", existe), { valor: "" });
    });
    it("un código del catálogo se guarda normalizado a 4 dígitos", async () => {
        assert.deepEqual(await puestoParaGuardar("4132", existe), { valor: "4132" });
        assert.deepEqual(await puestoParaGuardar(2455, existe), { valor: "2455" });
        assert.deepEqual(await puestoParaGuardar(" 4132 ", existe), { valor: "4132" });
    });
    it("un código que no está (o está desactivado) se rechaza con la instrucción, y no se guarda", async () => {
        const r = await puestoParaGuardar("9999", existe);
        assert.equal(r.valor, undefined);
        assert.match(String(r.error), /9999 no existe o está desactivado/);
        assert.match(String(r.error), /Puestos Desempeñados/);
    });
});
describe("Convenios guarda el puesto por defecto con esa validación, y fuera del import", () => {
    const ruta = readFileSync(resolve(AQUI, "../../routes/convenios.ts"), "utf8");
    const router = readFileSync(resolve(AQUI, "../../routes/_simpleCatalogRouter.ts"), "utf8");
    it("el campo va por `extraValidatedFields` con `puestoParaGuardar`", () => {
        assert.match(ruta, /extraValidatedFields: \[\{ key: 'puestoDesempenadoDefault', resolver: \(bruto\) => puestoParaGuardar\(bruto\) \}\]/);
    });
    it("no está entre los campos de texto que entran en el import de Excel", () => {
        const strings = ruta.slice(ruta.indexOf("extraStringFields"), ruta.indexOf("]", ruta.indexOf("extraStringFields")));
        assert.ok(!strings.includes("puestoDesempenadoDefault"));
    });
    it("el router lo acepta en el body y lo aplica en el alta y en la edición, cortando con 400 si no valida", () => {
        assert.match(router, /\.\.\.\(config\.extraValidatedFields \|\| \[\]\)\.map\(\(f\) => f\.key\),/);
        assert.equal(router.split("for (const f of config.extraValidatedFields || [])").length - 1, 2, "alta y edición");
        assert.match(router, /if \(r\.valor !== undefined\) newItem\[f\.key\] = r\.valor;/);
        assert.match(router, /if \(r\.valor !== undefined\) item\[f\.key\] = r\.valor;/);
    });
});
