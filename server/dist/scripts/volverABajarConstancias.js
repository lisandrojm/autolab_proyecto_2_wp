import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { ConstanciaArca } from "../models/ConstanciaArca.js";
import UserProject from "../models/UserProject.js";
import { getTenantDropboxConfig, ubicarArchivo } from "../services/dropboxService.js";
import { actualizarUbicaciones, planDeRedescarga, retomarCircuito, retomarElCircuito, volverABajar } from "../services/arca/constanciasArca.js";
/**
 * LAS CONSTANCIAS EN REVISIÓN POR SU DOCUMENTO, DESDE LA CONSOLA (07/11/2026): lo mismo que los botones
 * de A.R.C.A Descargas.
 *
 *   · Documento no ubicado (se borró): «Volver a bajar» — limpia `altaConstancia.validadaEl` y la deja en
 *     la cola como nueva.
 *   · Documento fuera del circuito (se movió del Outbox a otra carpeta): «Retomar el circuito» — valida el
 *     PDF contra el contrato y lo copia al Outbox; si no es la constancia, la vuelve a bajar.
 *   · Las que quedaron en revisión con el motivo viejo de «no ubicado» aunque el escaneo ya había
 *     re-encontrado el archivo (el bug del 07/11/2026): se re-ubican y caen en una de las dos de arriba.
 *
 * EN SECO POR DEFECTO: mira Dropbox y lee los PDF (sin escribir nada) y dice qué haría con cada una. Con
 * `--aplicar`, lo hace. No abre ARCA.
 *
 * Uso (desde server/):
 *   npx dotenv -e .env.production -- tsx src/scripts/volverABajarConstancias.ts                  → todas, en seco
 *   npx dotenv -e .env.production -- tsx src/scripts/volverABajarConstancias.ts 20327243994 …    → sólo esos CUIL
 *   … --aplicar                                                                                 → escribe
 */
const APLICAR = process.argv.includes("--aplicar");
const CUILS = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((a) => a.replace(/\D/g, ""));
async function main() {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const filtro = {
        estado: "requiere_revision",
        documento: { $ne: null },
        $or: [{ "documento.noUbicadoDesde": { $ne: null } }, { "documento.fueraDelCircuito": true }, { motivoRevision: /no ubicado|fuera del circuito/i }],
    };
    if (CUILS.length > 0)
        filtro.cuil = { $in: CUILS };
    const filas = await ConstanciaArca.find(filtro).select("-historial").lean();
    console.log(`${filas.length} constancia(s) en revisión por su documento${CUILS.length ? ` (de ${CUILS.join(", ")})` : ""}. ${APLICAR ? "APLICANDO." : "En seco."}\n`);
    if (CUILS.length > 0) {
        // Las pedidas que no están en revisión: dónde están, para que se vea por qué no se tocan.
        const otras = await ConstanciaArca.find({ cuil: { $in: CUILS }, _id: { $nin: filas.map((f) => f._id) } }).select("nombre cuil fechaAlta estado documento motivoRevision").lean();
        for (const d of otras)
            console.log(`(no está en revisión) ${d.nombre} · ${d.cuil} · alta ${d.fechaAlta} · ${d.estado} · ${d.documento?.codigo || "sin documento"} · ${d.documento?.path || "—"}\n`);
    }
    const porTenant = new Map();
    for (const f of filas)
        porTenant.set(String(f.tenantId), [...(porTenant.get(String(f.tenantId)) || []), f]);
    for (const [tenantId, docs] of porTenant) {
        const cfg = getTenantDropboxConfig(await Tenant.findById(tenantId).lean());
        if (!cfg) {
            console.log(`Tenant ${tenantId}: Dropbox no está conectado, no se puede mirar.`);
            continue;
        }
        if (!APLICAR) {
            // Lo mismo que hacen los botones antes de actuar: dónde está hoy cada documento.
            const u = await actualizarUbicaciones(tenantId, cfg, { enSeco: true, docs });
            const cambio = new Map(u.cambios.map((c) => [c.clave, c]));
            for (const d of docs) {
                const c = cambio.get(d.clave);
                const hoy = d.documento?.dropboxId || d.documento?.path ? await ubicarArchivo(tenantId, cfg, d.documento.dropboxId || d.documento.path, { borrados: true }).catch(() => null) : null;
                console.log(`${d.nombre} · ${d.cuil} · alta ${d.fechaAlta} · ${d.empresaRazonSocial}`);
                console.log(`   ahora: ${d.estado} · ${d.documento?.codigo || "sin código"} · ${d.motivoRevision}`);
                console.log(`   el archivo: ${!hoy ? "no existe" : hoy.borrado ? `borrado (${hoy.path})` : hoy.path}`);
                const fuera = d.documento?.fueraDelCircuito || (c?.a === "requiere_revision" && /fuera del circuito/.test(c.motivo));
                let haria;
                if (c && c.a !== "requiere_revision")
                    haria = `nada: volvió al circuito (${c.motivo})`;
                else if (fuera) {
                    const enFuera = { ...d, documento: { ...d.documento, fueraDelCircuito: true, path: hoy?.path || d.documento.path, nombre: hoy?.name || d.documento.nombre } };
                    const [r] = await retomarCircuito(tenantId, cfg, { docs: [enFuera], enSeco: true });
                    haria = r.resultado === "retomada" ? `retomar el circuito → copiar a ${r.hacia} (${r.estado})` : r.resultado === "no_sirve" ? `volver a bajarla de ARCA: ${r.motivo}` : `nada: ${r.motivo}`;
                }
                else {
                    const up = await UserProject.findById(d.userProjectId).select({ contracts: { $slice: [d.contractIndex, 1] } }).lean();
                    const plan = planDeRedescarga(d, up?.contracts?.[0], { ahora: new Date() });
                    haria = plan.ok ? `volver a bajarla → presentada (Re-descarga). ${plan.intento.detalle}` : `nada: ${plan.motivo}`;
                }
                console.log(`   haría: ${haria}\n`);
            }
            continue;
        }
        const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
        // Primero se re-ubica todo: las del limbo pasan a «fuera del circuito» o a «no ubicado».
        await actualizarUbicaciones(tenantId, cfg, { docs, log: (l) => console.log(l) });
        const hoy = await ConstanciaArca.find({ _id: { $in: docs.map((d) => d._id) } }).select("clave documento estado").lean();
        const fuera = hoy.filter((d) => d.estado === "requiere_revision" && d.documento?.fueraDelCircuito).map((d) => d.clave);
        const perdidas = hoy.filter((d) => d.estado === "requiere_revision" && d.documento?.noUbicadoDesde).map((d) => d.clave);
        for (const x of await retomarElCircuito(tenantObjectId, fuera, { cfg, porUsuarioId: null, log: (l) => console.log(l) }))
            console.log(`${x.nombre} · ${x.cuil}: RETOMAR ${x.resultado} · ${x.motivo}`);
        for (const x of await volverABajar(tenantObjectId, perdidas, { cfg, porUsuarioId: null }))
            console.log(`${x.nombre} · ${x.cuil}: VOLVER A BAJAR ${x.pedida ? "pedida" : "salteada"} · ${x.motivo}`);
    }
    if (APLICAR && filas.length > 0) {
        console.log("\nCómo quedaron:");
        for (const d of await ConstanciaArca.find({ _id: { $in: filas.map((f) => f._id) } }).lean()) {
            console.log(`\n${d.nombre} · ${d.cuil} · alta ${d.fechaAlta}`);
            console.log(`   estado: ${d.estado} · ${d.documento?.codigo || "sin documento"} · ${d.documento?.path || "—"}${d.redescarga?.enCurso ? " · re-descarga en curso" : ""}`);
            console.log(`   último: ${(d.historial || []).slice(-1).map((h) => `${h.estado} — ${h.motivo}`).join("")}`);
        }
    }
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
