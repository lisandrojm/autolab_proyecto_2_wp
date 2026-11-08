import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { ConstanciaArca } from "../models/ConstanciaArca.js";
import UserProject from "../models/UserProject.js";
import { getTenantDropboxConfig } from "../services/dropboxService.js";
import { actualizarUbicaciones, planDeRedescarga, volverABajar } from "../services/arca/constanciasArca.js";

/**
 * «VOLVER A BAJAR» DESDE LA CONSOLA (07/11/2026): lo mismo que el botón de A.R.C.A Descargas, para las
 * constancias en revisión por documento no ubicado. EN SECO POR DEFECTO: mira Dropbox (sin escribir) y
 * dice qué haría con cada una. Con `--aplicar`, las pide: limpia `altaConstancia.validadaEl` del contrato
 * (anotada en el intento) y las deja en la cola como nuevas. No abre ARCA.
 *
 * Uso (desde server/):
 *   npx dotenv -e .env.production -- tsx src/scripts/volverABajarConstancias.ts                  → todas las no ubicadas, en seco
 *   npx dotenv -e .env.production -- tsx src/scripts/volverABajarConstancias.ts 20327243994 …    → sólo esos CUIL
 *   … --aplicar                                                                                 → escribe
 */

const APLICAR = process.argv.includes("--aplicar");
const CUILS = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((a) => a.replace(/\D/g, ""));

async function main() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const filtro: Record<string, unknown> = { estado: "requiere_revision", "documento.noUbicadoDesde": { $ne: null } };
  if (CUILS.length > 0) filtro.cuil = { $in: CUILS };
  const filas: any[] = await ConstanciaArca.find(filtro).select("-historial").lean();
  console.log(`${filas.length} constancia(s) en revisión por documento no ubicado${CUILS.length ? ` (de ${CUILS.join(", ")})` : ""}. ${APLICAR ? "APLICANDO." : "En seco."}\n`);
  const porTenant = new Map<string, any[]>();
  for (const f of filas) porTenant.set(String(f.tenantId), [...(porTenant.get(String(f.tenantId)) || []), f]);
  for (const [tenantId, docs] of porTenant) {
    const cfg = getTenantDropboxConfig(await Tenant.findById(tenantId).lean());
    if (!APLICAR) {
      // Lo mismo que hace el botón antes de pedir: si el documento reapareció, sale de revisión y no se toca.
      const u = cfg ? await actualizarUbicaciones(tenantId, cfg, { enSeco: true, docs }) : null;
      const reaparecen = new Map((u?.cambios || []).filter((c) => c.a !== "requiere_revision").map((c) => [c.clave, c]));
      for (const d of docs) {
        const up: any = await UserProject.findById(d.userProjectId).select({ contracts: { $slice: [d.contractIndex, 1] } }).lean();
        const otra = reaparecen.get(d.clave);
        const plan = otra ? null : planDeRedescarga(d, up?.contracts?.[0], { ahora: new Date() });
        console.log(`${d.nombre} · ${d.cuil} · alta ${d.fechaAlta} · ${d.empresaRazonSocial}`);
        console.log(`   ahora: ${d.estado} · ${d.documento?.codigo || "sin código"} · ${d.motivoRevision}`);
        console.log(`   haría: ${otra ? `nada, el documento reapareció (${otra.motivo})` : plan!.ok ? `volver a bajarla → presentada (Re-descarga). ${plan!.intento.detalle}` : `nada: ${(plan as any).motivo}`}\n`);
      }
      continue;
    }
    const r = await volverABajar(new mongoose.Types.ObjectId(tenantId), docs.map((d) => d.clave), { cfg, porUsuarioId: null, log: (l) => console.log(l) });
    for (const x of r) console.log(`${x.nombre} · ${x.cuil}: ${x.pedida ? "PEDIDA" : "salteada"} · ${x.motivo}`);
  }
  if (APLICAR && filas.length > 0) {
    console.log("\nCómo quedaron:");
    const despues: any[] = await ConstanciaArca.find({ _id: { $in: filas.map((f) => f._id) } }).lean();
    for (const d of despues) {
      const up: any = await UserProject.findById(d.userProjectId).select({ contracts: { $slice: [d.contractIndex, 1] } }).lean();
      const k = up?.contracts?.[0];
      console.log(`\n${d.nombre} · ${d.cuil} · alta ${d.fechaAlta}`);
      console.log(`   estado: ${d.estado} · re-descarga en curso: ${!!d.redescarga?.enCurso} · documento anterior: ${d.redescarga?.documentoAnterior?.codigo || "—"}`);
      console.log(`   último intento: ${JSON.stringify(d.intentos?.slice(-1)[0] || null)}`);
      console.log(`   historial: ${(d.historial || []).slice(-1).map((h: any) => `${h.estado} — ${h.motivo}`).join("")}`);
      console.log(`   contrato: altaConstancia.validadaEl = ${k?.altaConstancia?.validadaEl ?? "(vacío)"} · antes: ${d.redescarga?.validadaElAnterior ? new Date(d.redescarga.validadaElAnterior).toISOString() : "—"}`);
    }
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
