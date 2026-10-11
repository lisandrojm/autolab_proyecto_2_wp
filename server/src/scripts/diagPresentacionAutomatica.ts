/**
 * DIAGNÓSTICO, SÓLO LECTURA: qué presentaría la automática de las 14 h y con qué registro.
 *
 * Arma los candidatos con el mismo código que usa el servidor (`candidatosDeAlta`) y los imprime: sirve
 * para comparar el registro armado en el servidor con el que muestra la pantalla de Contratos.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagPresentacionAutomatica.ts            (lista los tenants)
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagPresentacionAutomatica.ts <tenantId> [desde YYYY-MM-DD]
 *
 * No escribe nada y no toca ARCA.
 */
import mongoose, { Types } from "mongoose";
import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { candidatosDeAlta } from "../services/arca/presentacionAutomatica.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";

const [tenantId, desdeArg] = process.argv.slice(2);

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  if (!tenantId) {
    const ts: any[] = await Tenant.find().select("_id name slug").lean();
    for (const t of ts) console.log(String(t._id), t.name || t.slug || "");
    await mongoose.disconnect();
    return;
  }
  if (!Types.ObjectId.isValid(tenantId)) throw new Error("tenantId inválido");
  const desde = desdeArg || hoyArgentina();
  const cs = await candidatosDeAlta(new Types.ObjectId(tenantId), { desde });
  console.log(`${cs.length} alta(s) pendientes desde ${desde}`);
  for (const c of cs) {
    console.log(`\n${c.nombre} · ${c.cuil} · alta ${c.fechaAlta} baja ${c.fechaBaja || "—"} · ${c.tipoContrato} · ${c.empresa?.razonSocial || "sin empresa"}`);
    console.log(c.presentable ? `  registro: ${c.registro}` : `  NO: ${c.motivo}`);
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
