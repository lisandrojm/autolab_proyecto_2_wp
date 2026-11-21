/**
 * TODA PROYECCIÓN DE CONTRATOS QUE TRAE LAS FECHAS TRAE TAMBIÉN EL ESTADO (etapa 3, 19/11/2026).
 *
 * Desde que la vigencia sale de `estadoContrato` (`utils/contratoVigencia.ts`), un contrato proyectado
 * sin ese campo NO RIGE, aunque sus fechas digan que sí. Un `.select("… contracts.fecha_alta_contrato
 * contracts.fecha_baja_contrato …")` o un `$project` / `$map` con `$$c.fecha_baja_contrato` que no pida
 * `estadoContrato` es un bug silencioso: alguien desaparece de una pantalla. Este test lo encuentra
 * antes. Si una proyección de verdad no decide vigencia (mira fechas para otra cosa), se la marca con un
 * comentario `// sin-estado: <por qué>` en la línea o la de arriba.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function archivos(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? archivos(p) : p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.endsWith(".d.ts") ? [p] : [];
    });
}
test("los select con las dos fechas del contrato piden también contracts.estadoContrato", () => {
    const faltan = [];
    for (const f of archivos(SRC)) {
        const s = fs.readFileSync(f, "utf8");
        for (const m of s.matchAll(/\.select\(\s*["'`]([^"'`]*)["'`]/g)) {
            const campos = m[1];
            if (!campos.includes("contracts.fecha_alta_contrato") || !campos.includes("contracts.fecha_baja_contrato"))
                continue;
            if (campos.includes("contracts.estadoContrato"))
                continue;
            const linea = s.slice(0, m.index).split("\n").length;
            const lineas = s.split("\n");
            if (/sin-estado:/.test(`${lineas[linea - 2] || ""}\n${lineas[linea - 1] || ""}`))
                continue;
            faltan.push(`${path.relative(SRC, f)}:${linea}`);
        }
    }
    assert.deepEqual(faltan, [], `Proyecciones con fechas y sin estadoContrato: ${faltan.join(", ")}. Agregar contracts.estadoContrato (o marcar con «// sin-estado: <por qué>» si no decide vigencia).`);
});
test("las proyecciones de agregación con $$c.fecha_baja_contrato o $contracts.fecha_baja_contrato llevan el estado cerca", () => {
    const faltan = [];
    for (const f of archivos(SRC)) {
        const lineas = fs.readFileSync(f, "utf8").split("\n");
        lineas.forEach((l, i) => {
            if (!/["'`]\$(\$c|contracts)\.fecha_baja_contrato["'`]/.test(l))
                return;
            const ventana = lineas.slice(Math.max(0, i - 8), i + 4).join("\n");
            if (/estadoContrato|sin-estado:/.test(ventana))
                return;
            faltan.push(`${path.relative(SRC, f)}:${i + 1}`);
        });
    }
    assert.deepEqual(faltan, [], `Proyecciones de agregación con la baja y sin estadoContrato: ${faltan.join(", ")}.`);
});
