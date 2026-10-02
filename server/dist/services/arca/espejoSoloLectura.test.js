/**
 * El espejo de ARCA no se edita a mano: ninguna ruta de ABM puede escribir en él.
 *
 *   npx tsx --test src/services/arca/espejoSoloLectura.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const RUTAS = resolve(dirname(fileURLToPath(import.meta.url)), "../../routes");
/** Las únicas que pueden tocarlo: la de lecturas (aplicar con confirmación). */
const PERMITIDAS = ["arcaCatalogo.ts"];
test("ninguna ruta, salvo la de lecturas confirmadas, escribe en arca_catalogo", () => {
    for (const f of readdirSync(RUTAS).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
        const fuente = readFileSync(resolve(RUTAS, f), "utf8");
        const escribe = /ArcaCatalogo\.(create|insertMany|updateOne|updateMany|deleteOne|deleteMany|findOneAndUpdate|findByIdAndUpdate|bulkWrite|replaceOne|collection)|aplicarFilas\(|collection\(["']arca_catalogo["']\)/.test(fuente);
        if (PERMITIDAS.includes(f))
            continue;
        assert.ok(!escribe, `${f} escribe en el espejo de ARCA`);
    }
});
test("la ruta de lecturas solo escribe a través de aplicarLectura (con confirmar: true)", () => {
    const fuente = readFileSync(resolve(RUTAS, "arcaCatalogo.ts"), "utf8");
    assert.doesNotMatch(fuente, /ArcaCatalogo\.(create|insertMany|update|delete|bulkWrite)|aplicarFilas\(/);
    assert.match(fuente, /req\.body\?\.confirmar !== true/);
});
