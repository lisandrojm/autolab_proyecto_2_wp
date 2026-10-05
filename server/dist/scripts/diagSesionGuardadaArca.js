/**
 * DIAGNÓSTICO, SÓLO LECTURA Y SIN TOCAR ARCA: qué hay en la sesión de ARCA guardada del tenant.
 *
 * Los logs de las corridas muestran `seLogueo: true` SIEMPRE: la sesión guardada se prueba, no entra, y
 * se paga el login entero (6 a 12 s) en cada validación. Esto muestra de qué está hecha esa sesión —las
 * cookies por dominio, cuáles son de sesión y cuáles tienen vencimiento— sin imprimir ningún valor, y
 * cuándo se guardó y cuándo fue el último login, para ver si lo que vence es la cookie o la sesión del
 * lado de AFIP.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagSesionGuardadaArca.ts <tenantId>
 *
 * No escribe nada y no abre ningún navegador.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { decryptSecret } from "../utils/secretCrypto.js";
const [tenantId] = process.argv.slice(2);
if (!tenantId || !Types.ObjectId.isValid(tenantId)) {
    console.error("Uso: <tenantId>");
    process.exit(1);
}
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const t = await Tenant.findById(tenantId).select("integrations.arcaSimplificacion").lean();
    const cfg = t?.integrations?.arcaSimplificacion || {};
    console.log(`sesión guardada el: ${cfg.sesionGuardadaAt ? new Date(cfg.sesionGuardadaAt).toISOString() : "-"} · último login: ${cfg.ultimoLoginAt ? new Date(cfg.ultimoLoginAt).toISOString() : "-"} · ahora: ${new Date().toISOString()}`);
    console.log(`último error: ${cfg.ultimoError || "-"}`);
    const plano = decryptSecret(cfg.sesionEnc);
    if (!plano) {
        console.log("No hay sesión guardada (o no se pudo descifrar con la clave de este entorno).");
    }
    else {
        const estado = JSON.parse(plano);
        const cookies = estado.cookies || [];
        console.log(`cookies: ${cookies.length} · orígenes con localStorage: ${(estado.origins || []).length}`);
        const ahora = Date.now() / 1000;
        for (const c of cookies) {
            const deSesion = !c.expires || c.expires < 0;
            const vence = deSesion ? "de sesión (sin vencimiento propio)" : c.expires < ahora ? `VENCIDA hace ${Math.round((ahora - c.expires) / 60)} min` : `vence en ${Math.round((c.expires - ahora) / 60)} min`;
            console.log(`  ${String(c.domain).padEnd(34)} ${String(c.name).padEnd(28)} ${vence}${c.httpOnly ? " · httpOnly" : ""}${c.secure ? " · secure" : ""}`);
        }
    }
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
