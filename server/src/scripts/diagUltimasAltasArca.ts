/**
 * DIAGNÓSTICO, SÓLO LECTURA: las últimas corridas de altas en ARCA de un tenant (`arca_altas_logs`),
 * con su resultado, el error, las tandas y qué pasó con cada contrato. Para ver por qué una corrida
 * «rebotó» sin tener que ir a los logs del servidor.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagUltimasAltasArca.ts <tenantId> [cuántas=5]
 *
 * No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { ArcaAltasLog } from "../models/ArcaAltasLog.js";

const [tenantId, cuantas] = process.argv.slice(2);
if (!tenantId || !Types.ObjectId.isValid(tenantId)) {
  console.error("Uso: <tenantId> [cuántas=5]");
  process.exit(1);
}

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const logs: any[] = await ArcaAltasLog.find({ tenantId: new Types.ObjectId(tenantId) })
    .sort({ createdAt: -1 })
    .limit(Number(cuantas) || 5)
    .select("-htmlResultado")
    .lean();
  for (const l of logs.reverse()) {
    console.log(`\n── ${new Date(l.createdAt).toISOString()} · ${l.tipo} · ${l.empresaRazonSocial} · ${l.enSeco ? "EN SECO" : "REAL"} · resultado «${l.resultado}»${l.motivoCorte ? ` · corte: ${l.motivoCorte}` : ""} · ${Math.round((l.duracionMs || 0) / 1000)} s`);
    if (l.topeUsado) console.log(`   tope: pantalla ${l.topeEnPantalla} · usado ${l.topeUsado}`);
    if (l.pasoFallido) console.log(`   paso fallido: ${l.pasoFallido}`);
    if (l.error) console.log(`   error: ${l.error}`);
    if (l.textoArca) console.log(`   ARCA dijo: ${l.textoArca}`);
    for (const d of l.dialogos || []) console.log(`   diálogo: ${d}`);
    for (const t of l.tandas || []) console.log(`   tanda ${t.n}: ${t.resultado} · ${t.cuils?.length} persona(s) · ${Math.round((t.duracionMs || 0) / 1000)} s${t.error ? ` · ${t.error}` : ""}`);
    for (const c of l.contratos || []) console.log(`     · ${String(c.nombre).padEnd(34)} ${String(c.resultado).padEnd(14)}${c.tanda ? ` tanda ${c.tanda}` : ""}${c.motivo ? ` · ${c.motivo}` : ""}`);
  }
  if (logs.length === 0) console.log("No hay corridas de altas registradas para ese tenant.");
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
