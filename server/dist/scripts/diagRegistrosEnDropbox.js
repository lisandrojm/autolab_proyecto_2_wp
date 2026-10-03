/**
 * DIAGNÓSTICO, SÓLO LECTURA: qué quedó en `/WEPRODU/Registros` de Dropbox (un .json por CUIT con lo que
 * ARCA contestó al registrarse la persona), y si esa persona existe hoy en la base. Sirve para cotejar
 * el contador de usos de un link de registro con las personas que efectivamente quedaron.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagRegistrosEnDropbox.ts <tenantId>
 *
 * No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";
import { downloadFileContent, getTenantDropboxConfig, listFolder } from "../services/dropboxService.js";
import { BASE_REGISTROS } from "../services/espejoDropboxRegistros.js";
const [tenantId] = process.argv.slice(2);
if (!tenantId || !Types.ObjectId.isValid(tenantId)) {
    console.error("Uso: <tenantId>");
    process.exit(1);
}
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const tenant = await Tenant.findById(tenantId);
    const cfg = tenant ? getTenantDropboxConfig(tenant) : null;
    if (!cfg)
        throw new Error("El tenant no tiene Dropbox conectado");
    const { entries } = await listFolder(tenantId, cfg, BASE_REGISTROS);
    const archivos = entries.filter((e) => e.tag === "file").sort((a, b) => String(a.serverModified).localeCompare(String(b.serverModified)));
    console.log(`${BASE_REGISTROS}: ${archivos.length} archivo(s)`);
    for (const f of archivos) {
        let resumen = "";
        try {
            const j = JSON.parse((await downloadFileContent(tenantId, cfg, f.path)).toString("utf8"));
            const cuit = String(j.cuit || "").replace(/\D/g, "");
            const persona = cuit ? await User.findOne({ tenantId: new Types.ObjectId(tenantId), "metadata.cuit": { $in: [cuit, j.cuit] } }).select("firstName lastName email createdAt metadata.registro").lean() : null;
            resumen = `momento=${j.momento || "-"} cuit=${j.cuit || "-"} linkId=${j.linkId || "-"} nombreArca=${j.nombre || j.nombreArca || j.razonSocial || JSON.stringify(j).slice(0, 80)} · hoy en la base: ${persona ? `${persona.firstName} ${persona.lastName} (${persona.email}, creado ${new Date(persona.createdAt).toISOString()}, registro=${JSON.stringify(persona.metadata?.registro || null)})` : "NO EXISTE"}`;
        }
        catch (e) {
            resumen = `(no se pudo leer: ${e?.message || e})`;
        }
        console.log(`  ${f.serverModified}  ${f.name}\n      ${resumen}`);
    }
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
