import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { asegurarPlantillasCustom } from "../services/plantillasCustomSistema.js";

/**
 * Crea (o marca como del sistema) «Contrato custom» y «Release custom» para un tenant.
 *
 *   TENANT_SLUG=demo-tenant npm run plantillas-custom:crear
 *
 * Ya no hace falta correrlo: el server los asegura solo al arrancar y al abrir las pantallas (ver
 * `services/plantillasCustomSistema.ts`). Queda para forzarlo a mano. Es idempotente.
 */
async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  const slug = process.env.TENANT_SLUG?.trim();
  if (!slug) throw new Error("Falta TENANT_SLUG=<slug>");
  if (process.env.DRY_RUN === "true") throw new Error("Este script ya no tiene modo de prueba: es idempotente y sólo crea lo que falta.");
  await mongoose.connect(uri, { dbName });
  const tenant = await Tenant.findOne({ slug }).lean();
  if (!tenant) throw new Error(`No existe el tenant «${slug}»`);
  await asegurarPlantillasCustom(tenant._id);
  console.log(`Listo: «Contrato custom» y «Release custom» asegurados para ${slug}.`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("❌", e?.message || e);
  await mongoose.disconnect();
  process.exit(1);
});
