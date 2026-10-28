import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig } from "../services/dropboxService.js";
import { CARPETA_YA_ENVIADOS, conciliarOutbox } from "../services/conciliacionOutboxService.js";
/**
 * CONCILIAR EL OUTBOX A MANO (ver `utils/conciliacionOutbox.ts`): saca de Outbox («Para Firmar») las
 * copias de documentos cuyo código «ID-NNNNNN» ya está en Pendbox o en Requested signatures. Los MUEVE a
 * la carpeta hermana `Outbox_ya_enviados` —nunca borra— y cierra su registro de la cola de envío.
 *
 *   TENANT_SLUG=demo-tenant npm run outbox:conciliar:dry   ← lista qué se movería, no toca nada
 *   TENANT_SLUG=demo-tenant npm run outbox:conciliar       ← lo aplica
 *
 * `VER_TODOS=true` lista además los que se quedan (sin rastro o sin código). La primera pasada real deja
 * la conciliación habilitada en el escaneo de carpetas, que a partir de ahí la corre sola.
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const VER_TODOS = process.env.VER_TODOS === "true";
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    const slug = process.env.TENANT_SLUG;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
    if (!slug)
        throw new Error("Falta TENANT_SLUG");
    await mongoose.connect(uri, { dbName });
    console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Base ${dbName} · tenant ${slug}\n`);
    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant)
        throw new Error(`No existe el tenant ${slug}`);
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        throw new Error("El tenant no tiene Dropbox conectado");
    const r = await conciliarOutbox(String(tenant._id), cfg, { enSeco: DRY_RUN, log: (l) => console.log(l) });
    if (r.salteada === "sin_carpetas")
        console.log("Falta la carpeta Outbox, o Pendbox y Firmados (propósito sin resolver): no se hace nada.");
    else {
        if (VER_TODOS && r.plan.quedan.length) {
            console.log("\nSe quedan en Outbox:");
            for (const q of r.plan.quedan)
                console.log(`  ${q.motivo === "sin_codigo" ? "sin código " : "sin rastro "} ${q.archivo.name}`);
        }
        if (DRY_RUN)
            console.log(`\nNada se tocó. Destino de la pasada real: ${r.destino}`);
        else {
            console.log(`\nHecho: ${r.movidos} movido(s) a ${r.destino}, ${r.registrosCerrados} registro(s) de la cola cerrados, ${r.fallas.length} falla(s).`);
            for (const f of r.fallas)
                console.log(`  FALLA ${f.archivo} → ${f.error} (se queda en Outbox)`);
            if (r.fallas.length === 0) {
                await Tenant.updateOne({ _id: tenant._id }, { $set: { "integrations.dropbox.conciliacionOutboxConfirmadaAt": new Date() } });
                console.log(`Conciliación confirmada: desde ahora el escaneo de carpetas mueve solo a ${CARPETA_YA_ENVIADOS} lo que ya se envió.`);
            }
        }
    }
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
