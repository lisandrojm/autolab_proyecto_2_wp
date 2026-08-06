/**
 * Diagnóstico de solo lectura: consulta el Padrón A13 de AFIP para un CUIT puntual y vuelca la
 * respuesta cruda completa (raw), para comparar contra lo que muestra la Constancia de Opción
 * pública de ARCA cuando el estado que devuelve `consultarPadron` no coincide con lo esperado.
 *
 * No escribe nada en la base — solo lee la config de AFIP del tenant y llama al webservice.
 *
 * Uso: TENANT_SLUG=demo-tenant CUIT=23276025759 npm run debug:afip-padron
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { Tenant } from "../models/Tenant.js";
import { getTenantAfipConfig, consultarPadron } from "../services/afipService.js";

dotenv.config({ path: path.resolve(process.cwd(), process.env.ENV_FILE || ".env.development") });

const run = async () => {
  const tenantSlug = process.env.TENANT_SLUG;
  const cuit = process.env.CUIT;
  if (!cuit) {
    process.stdout.write("Uso: TENANT_SLUG=<slug> CUIT=<11 dígitos> npm run debug:afip-padron\n");
    process.exitCode = 1;
    return;
  }
  await mongoose.connect(process.env.MONGO_URI as string, { dbName: process.env.MONGO_DB_NAME });
  try {
    if (!tenantSlug) {
      const tenants = await Tenant.find({}).select("_id slug name").lean();
      process.stdout.write("Tenants disponibles:\n" + JSON.stringify(tenants, null, 2) + "\n");
      return;
    }
    const tenant = await Tenant.findOne({ slug: tenantSlug }).lean();
    if (!tenant) throw new Error(`Tenant "${tenantSlug}" no encontrado`);
    const cfg = getTenantAfipConfig(tenant);
    if (!cfg) throw new Error("AFIP no está conectado para este tenant");
    process.stdout.write(`Consultando CUIT ${cuit} contra AFIP (ambiente: ${cfg.ambiente})...\n`);
    const resultado = await consultarPadron(String((tenant as any)._id), cfg, cuit);
    process.stdout.write("\n--- Resultado mapeado ---\n");
    process.stdout.write(JSON.stringify({ cuit: resultado.cuit, encontrado: resultado.encontrado, estado: resultado.estado, tipoPersona: resultado.tipoPersona, denominacion: resultado.denominacion }, null, 2) + "\n");
    process.stdout.write("\n--- raw completo (getPersonaReturn) ---\n");
    process.stdout.write(JSON.stringify(resultado.raw, null, 2) + "\n");
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
