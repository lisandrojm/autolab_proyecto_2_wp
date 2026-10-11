import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig } from "../services/dropboxService.js";
import { limpiarPendbox } from "../services/limpiezaPendboxService.js";
/**
 * LIMPIAR PENDBOX A MANO: lo mismo que hace el escaneo de carpetas en cada pasada
 * (`services/limpiezaPendboxService.ts`), sobre lo que ya está acumulado. Por cada firmado de
 * Requested signatures busca su original en Pendbox; si el firmado no trae código se lo pone
 * (renombra) y después borra el original. Lo que no se puede emparejar se lista con su motivo.
 *
 *   TENANT_SLUG=demo-tenant npm run pendbox:limpiar:dry     ← muestra el plan, no toca nada
 *   TENANT_SLUG=demo-tenant npm run pendbox:limpiar         ← lo aplica
 *
 * En seco no escribe nada: sólo lista las dos carpetas.
 */
const DRY_RUN = process.env.DRY_RUN === "true";
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    const slug = process.env.TENANT_SLUG;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
    if (!slug)
        throw new Error("Falta TENANT_SLUG");
    await mongoose.connect(uri, { dbName });
    console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Base ${dbName} · tenant ${slug}`);
    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant)
        throw new Error(`No existe el tenant ${slug}`);
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        throw new Error("El tenant no tiene Dropbox conectado");
    const r = await limpiarPendbox(String(tenant._id), cfg, { enSeco: DRY_RUN, log: (l) => console.log("  " + l) });
    if (r.salteada === "sin_carpetas")
        console.log("Falta la carpeta Pendbox o la de Firmados (propósito sin resolver): no se hace nada.");
    else if (r.salteada === "firmados_vacia")
        console.log("Requested signatures está vacía: nada que emparejar.");
    else {
        const renombres = r.plan.acciones.filter((a) => a.renombrarA).length;
        console.log(`\nPlan: ${r.plan.acciones.length} original(es) a borrar, ${renombres} firmado(s) a renombrar, ${r.plan.omitidos.length} omitido(s).`);
        if (!DRY_RUN) {
            console.log(`Hecho: ${r.renombrados} renombrado(s), ${r.borrados} borrado(s), ${r.fallas.length} falla(s).`);
            for (const f of r.fallas)
                console.log(`  FALLA ${f.paso}: ${f.firmado} → ${f.error}`);
        }
    }
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
