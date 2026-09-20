/**
 * Verifica el padrón de un período contra la base real. SÓLO LECTURA.
 *
 *   npx tsx src/scripts/verificarPadron.ts <tenantId> [periodo AAAA-MM]
 *
 * Es el criterio de cierre de la fase 0 hecho ejecutable: cuántas filas salen enteras —con legajo,
 * empresa, centro de costo y régimen— y qué queda sin resolver, agrupado por motivo. Mientras el
 * anexo tenga casos, esos casos son el trabajo pendiente; el número solo no dice nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { armarPadron } from "../services/liquidacion/padron.js";
import { Regimen } from "../utils/liquidacion/contratos.js";

const kb = (x: unknown) => (Buffer.byteLength(JSON.stringify(x ?? null)) / 1024).toFixed(1);

async function main() {
  const tenantId = new Types.ObjectId(process.argv[2]);
  const periodo = process.argv[3] || "2026-08";
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });

  for (const regimen of [undefined, "mensual", "jornalero"] as (Regimen | undefined)[]) {
    const t = Date.now();
    const padron = await armarPadron(tenantId, periodo, regimen ? { regimen } : {});
    const ms = Date.now() - t;

    console.log(`\n${"═".repeat(78)}`);
    console.log(`PADRÓN ${periodo}   régimen: ${regimen || "todos"}   ${ms} ms   ${kb(padron)} KB`);
    console.log("═".repeat(78));
    console.log(`Contratos: ${padron.resumen.contratos}   ·   personas: ${padron.resumen.personas}`);
    console.log(`Filas completas (legajo + empresa + CC + régimen): ${padron.resumen.completos}`);
    console.log(`Por régimen: ${JSON.stringify(padron.resumen.porRegimen)}`);

    const porTipo = new Map<string, number>();
    padron.excepciones.forEach((e) => porTipo.set(e.tipo, (porTipo.get(e.tipo) || 0) + 1));
    if (porTipo.size) {
      console.log("\nExcepciones:");
      [...porTipo.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`   · ${t}: ${n}`));
    }

    if (!regimen) {
      const origenes = new Map<string, number>();
      padron.filas.forEach((f) => {
        const clave = `empresa=${f.origen.empresa || "—"} legajo=${f.origen.legajo || "—"} regimen=${f.origen.regimen || "—"}`;
        origenes.set(clave, (origenes.get(clave) || 0) + 1);
      });
      console.log("\nDe dónde salió cada dato:");
      [...origenes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([o, n]) => console.log(`   ${String(n).padStart(4)}   ${o}`));

      console.log("\nPrimeras 5 filas completas:");
      padron.filas
        .filter((f) => f.legajo && f.empresaId && f.ccCodigo && f.regimen)
        .slice(0, 5)
        .forEach((f) => console.log(`   ${f.legajo}  ${f.apellidoYNombre.padEnd(34)}  ${f.empresaNombre}  CC ${f.ccCodigo}  ${f.regimen}`));
    }
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
