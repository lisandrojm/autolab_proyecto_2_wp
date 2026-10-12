/**
 * DIAGNÓSTICO, SÓLO LECTURA: qué tomaría el barrido de obras sociales de un tenant.
 *
 * Lista los contratos creados en WeProdu en los últimos 30 días que siguen sin obra social constatada
 * en ARCA (ver `services/arca/barridoObrasSociales.ts`), agrupados como los mandaría a la corrida.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagPendientesObraSocial.ts <tenantId>
 *
 * No escribe nada y no toca ARCA.
 */
import mongoose, { Types } from "mongoose";
import { env } from "../config/env.js";
import { Company } from "../models/Company.js";
import { contratosSinValidar, planBarrido, validacionAutomaticaActivaEn } from "../services/arca/barridoObrasSociales.js";
const [tenantId] = process.argv.slice(2);
if (!tenantId || !Types.ObjectId.isValid(tenantId)) {
    console.error("Uso: <tenantId>");
    process.exit(1);
}
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const t = new Types.ObjectId(tenantId);
    console.log(`Validación automática del tenant: ${(await validacionAutomaticaActivaEn(t)) ? "activa" : "APAGADA"} · entorno: ${String(process.env.ARCA_VALIDACION_AUTOMATICA ?? "").trim() === "0" ? "APAGADA (ARCA_VALIDACION_AUTOMATICA=0)" : "activa"}`);
    const sinValidar = await contratosSinValidar(t);
    console.log(`${sinValidar.length} contrato(s) del sistema de los últimos 30 días sin obra social constatada`);
    const empresas = await Company.find({ _id: { $in: [...new Set(sinValidar.map((c) => c.empresaId))] } }).select("razonSocial").lean();
    const nombre = new Map(empresas.map((e) => [String(e._id), e.razonSocial]));
    for (const c of sinValidar)
        console.log(`  ${c.nombre.padEnd(32)} ${c.cuil}  ${String(nombre.get(c.empresaId) || c.empresaId).padEnd(14)}  cargado ${c.fechaCarga}`);
    const plan = planBarrido(sinValidar, new Map(), Date.now(), 0);
    console.log(`\nIría a ARCA en ${plan.grupos.length} grupo(s):`);
    for (const g of plan.grupos)
        console.log(`  ${nombre.get(g.empresaId) || g.empresaId}: ${g.cuils.length} persona(s)`);
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error("Error:", e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
