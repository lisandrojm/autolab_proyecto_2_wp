/**
 * NINGÚN SCRIPT NUEVO ESCRIBE CONTRATOS SIN AUDITORÍA (etapa 3, 19/11/2026).
 *
 * Los scripts que usan el modelo `UserProject` quedan auditados solos (hooks del modelo, y el nombre del
 * script sale de `process.argv`). Los que escriben `users_&_projects` con el DRIVER no pasan por los
 * hooks: tienen que usar `escribirContratosAuditado` (services/auditoriaContratos.ts).
 *
 * HISTORICOS: los que ya corrieron antes de que existiera la auditoría. Se dejan como estaban (sirven de
 * registro de lo que se hizo y algunos tienen `--revertir`). Si alguno se vuelve a usar, se lo pasa al
 * helper y se lo saca de la lista. No agregar scripts nuevos acá.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HISTORICOS = new Set([
  "backfillClaveEnReferencias.ts", // escribe las colecciones de referencias; de contratos sólo lee
  "backfillReplacementAreaShifts.ts",
  "completarClaveIdentidadLapidas.ts", // 18/11, 7 lápidas
  "corregirCodigosCategorias.ts",
  "eliminarCargosNiveles.ts",
  "limpiarAlcancePuesto.ts",
  "nombresProyectoEnVinculos.ts",
  "repararCategoriasHuerfanas.ts",
  "repararFuncionesFrame.ts",
  "repararPunterosCategoria.ts",
  "sedeEnAsignaciones.ts",
  "unificarTiposDeContrato.ts",
]);

const ESCRIBE = /\.(updateOne|updateMany|bulkWrite|replaceOne|deleteOne|deleteMany|insertOne|insertMany|findOneAndUpdate)\(/;

test("los scripts que escriben users_&_projects con el driver pasan por escribirContratosAuditado", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const sinAuditoria = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !HISTORICOS.has(f))
    .filter((f) => {
      const s = fs.readFileSync(path.join(dir, f), "utf8");
      return s.includes("users_&_projects") && ESCRIBE.test(s) && !s.includes("escribirContratosAuditado");
    });
  assert.deepEqual(sinAuditoria, [], `Escriben users_&_projects sin auditoría: ${sinAuditoria.join(", ")}. Usar escribirContratosAuditado (o el modelo UserProject).`);
});

test("la lista de históricos no tiene nombres que ya no existen", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const f of HISTORICOS) assert.ok(fs.existsSync(path.join(dir, f)), `${f} ya no existe: sacarlo de HISTORICOS`);
});
