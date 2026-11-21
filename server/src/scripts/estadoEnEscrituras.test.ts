/**
 * TODA ESCRITURA QUE CREA CONTRATOS O LES CAMBIA ALTA, BAJA O TIPO PONE EL ESTADO (etapa 3, 19/11/2026).
 *
 * `save()` lo hace solo (hook `instalarEstadoAlGuardar`). Un `updateOne` / `updateMany` / el driver no
 * pasan por el hook: si crean contratos (`$push` a `contracts`) o les tocan `fecha_alta_contrato`,
 * `fecha_baja_contrato`, `contrato_id` o `nombre_contrato`, tienen que poner `estadoContrato` ellos
 * (con `estadoAlEscribir` / `conEstadoCalculado`, el mismo cálculo que el hook). Si no, el contrato queda
 * sin estado hasta la barrida y un contrato de un día puede no regir nunca (pedido del usuario: que un
 * camino nuevo no reabra el agujero sin que nada avise).
 *
 * Mira todo `src` menos los tests. HISTORICOS: scripts que ya corrieron antes del estado; si se vuelven a
 * usar, se los pasa al cálculo compartido y se los saca de acá. No agregar código nuevo a la lista.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HISTORICOS = new Set<string>([]);

const LLAMADA = /(UserProject\s*\.\s*(?:updateOne|updateMany|findOneAndUpdate|findByIdAndUpdate)|escribirContratosAuditado|users_&_projects["'`]\)\s*\.\s*(?:updateOne|updateMany|findOneAndUpdate))\s*\(/g;
const CAMPO = /contracts\.[^"'`\s]*\.?(fecha_alta_contrato|fecha_baja_contrato|contrato_id|nombre_contrato)["'`]\s*\]?\s*:/;
const PONE_ESTADO = /estadoContrato|conEstadoCalculado|estadoAlEscribir|\.\.\.\s*\w*Estado\b/; // `...setEstado` = armado con el cálculo compartido

/** Los argumentos de nivel 0 de la llamada que abre en `desde` (justo después del paréntesis). */
function argumentos(s: string, desde: number): string[] {
  const args: string[] = [];
  let prof = 0, i = desde, ini = desde, cadena: string | null = null;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (cadena) { if (ch === "\\") i++; else if (ch === cadena) cadena = null; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { cadena = ch; continue; }
    if ("([{".includes(ch)) prof++;
    else if (")]}".includes(ch)) { if (prof === 0) { args.push(s.slice(ini, i)); return args; } prof--; }
    else if (ch === "," && prof === 0) { args.push(s.slice(ini, i)); ini = i + 1; }
  }
  return args;
}

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? archivos(p) : p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.endsWith(".d.ts") ? [p] : [];
  });
}

test("las escrituras por updateOne que crean contratos o cambian alta/baja/tipo ponen el estado", () => {
  const faltan: string[] = [];
  for (const f of archivos(SRC)) {
    if (HISTORICOS.has(path.basename(f))) continue;
    const s = fs.readFileSync(f, "utf8");
    for (const m of s.matchAll(LLAMADA)) {
      const args = argumentos(s, m.index! + m[0].length);
      const update = m[1].startsWith("escribirContratosAuditado") ? args[2] : args[1];
      if (update && CAMPO.test(update) && !PONE_ESTADO.test(update)) faltan.push(`${path.relative(SRC, f)}:${s.slice(0, m.index).split("\n").length}`);
    }
    // `$push` de contratos armado aparte (el import de FRAME).
    s.split("\n").forEach((l, n) => {
      if (/\$push\s*[=:]\s*\{\s*contracts\s*:/.test(l) && !PONE_ESTADO.test(l)) faltan.push(`${path.relative(SRC, f)}:${n + 1} ($push)`);
    });
  }
  assert.deepEqual(faltan, [], `Escrituras que no ponen estadoContrato: ${faltan.join(", ")}. Usar estadoAlEscribir / conEstadoCalculado (services/estadoContratoAlGuardar.ts).`);
});

test("el detector ve las escrituras que debería ver", () => {
  const ve = (codigo: string) => { const m = [...codigo.matchAll(LLAMADA)][0]; const a = argumentos(codigo, m.index! + m[0].length); return CAMPO.test(a[1]) && !PONE_ESTADO.test(a[1]); };
  assert.equal(ve(`UserProject.updateOne({ _id }, { $set: { "contracts.$[c].fecha_baja_contrato": fin } }, { arrayFilters })`), true);
  assert.equal(ve(`UserProject.updateOne({ _id }, { $set: { "contracts.$[c].fecha_baja_contrato": fin, "contracts.$[c].estadoContrato": e } })`), false);
  assert.equal(ve(`UserProject.updateOne({ [\`\${k}.fecha_alta_contrato\`]: x }, { $set: { [\`\${k}.altaConstancia\`]: 1 } })`), false); // en el filtro no cuenta
  assert.equal(ve(`UserProject.updateOne({ _id }, { $set: { [\`contracts.\${i}.fecha_alta_contrato\`]: a } })`), true);
});
