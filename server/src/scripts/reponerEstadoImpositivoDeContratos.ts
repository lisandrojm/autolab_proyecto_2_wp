/**
 * REPARACIÓN: volver contratos al estado impositivo de su plantilla (p. ej. de «Disponible» a «Pedido de
 * AFIP»), para los que el cron de Dropbox avanzó por un archivo viejo que sólo nombraba a la persona
 * (ver `utils/archivoDeContrato.ts`). Deja el resto del contrato intacto.
 *
 *   EN SECO (no escribe):
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/reponerEstadoImpositivoDeContratos.ts <tenantId> <UserProjectId:índice> [...]
 *
 *   APLICAR:
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/reponerEstadoImpositivoDeContratos.ts <tenantId> --aplicar <UserProjectId:índice> [...]
 *
 * Las referencias `UserProjectId:índice` las da `diagContratosNacidosDeSolicitud.ts` (columna `ref`).
 * El estado destino se resuelve como lo hace el formulario: tipo de contrato del contrato → sus
 * plantillas (`contratos-frame`, por `contratoId`/`contratoIds`) → el estado con `esImpositivo` que tenga esa plantilla en
 * `contratoFrameIds`. Si no hay uno solo, el contrato se saltea y se dice por qué: acá no se adivina.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Info } from "../models/Info.js";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const [tenantId, ...refs] = args.filter((a) => a !== "--aplicar");
if (!tenantId || !Types.ObjectId.isValid(tenantId) || refs.length === 0 || !refs.every((r) => /^[0-9a-f]{24}:\d+$/i.test(r))) {
  console.error("Uso: <tenantId> [--aplicar] <UserProjectId:índice> [...]");
  process.exit(1);
}

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const estados: any[] = await Info.find({ type: "estado-empleado", "data.esImpositivo": true }).lean();
  const plantillas: any[] = await ContratoFrame.find({}).select("_id name contratoId contratoIds").lean();
  const plantillasDe = (contratoId: string) => plantillas.filter((cf) => String(cf.contratoId || "") === contratoId || (cf.contratoIds || []).some((id: any) => String(id) === contratoId));
  const impositivoDePlantilla = (cfId: string) => estados.filter((e) => (e.data?.contratoFrameIds || []).some((id: any) => String(id) === cfId));

  const proyectosDelTenant = new Set((await Project.find({ tenantId: new Types.ObjectId(tenantId) }).select("_id").lean()).map((p: any) => String(p._id)));
  console.log(aplicar ? "MODO APLICAR: se escribe en la base." : "EN SECO: no se escribe nada (agregá --aplicar para escribir).");
  for (const ref of refs) {
    const [upId, idxTexto] = ref.split(":");
    const idx = Number(idxTexto);
    const up: any = await UserProject.findById(upId);
    if (!up) { console.log(`✗ ${ref}: no existe el UserProject`); continue; }
    if (!proyectosDelTenant.has(String(up.projectId))) { console.log(`✗ ${ref}: el proyecto no es del tenant ${tenantId}`); continue; }
    const c: any = up.contracts?.[idx];
    if (!c) { console.log(`✗ ${ref}: no existe el contrato [${idx}]`); continue; }
    const contratoId = String(c.contrato_id || "");
    const cfs = plantillasDe(contratoId);
    const candidatos = [...new Map(cfs.flatMap((cf) => impositivoDePlantilla(String(cf._id))).map((e) => [String(e._id), e])).values()];
    const desc = `${ref} · persona ${up.userId} · ${c.nombre_contrato || "?"} ${String(c.fecha_alta_contrato || "").slice(0, 10)}→${String(c.fecha_baja_contrato || "").slice(0, 10)} · estado actual «${c.nombre_estado_empleado || "-"}» (${c.estado_id ?? "-"})`;
    if (!contratoId) { console.log(`✗ ${desc}: sin contrato_id, no se puede resolver la plantilla`); continue; }
    if (candidatos.length !== 1) { console.log(`✗ ${desc}: ${candidatos.length === 0 ? "ninguna plantilla del tipo tiene estado impositivo" : `ambiguo: ${candidatos.map((e) => e.name).join(" / ")}`} (plantillas: ${cfs.map((cf) => cf.name).join(", ") || "ninguna"})`); continue; }
    const destino = candidatos[0];
    if (Number(c.estado_id) === Number(destino.data.id)) { console.log(`= ${desc}: ya está en «${destino.name}»`); continue; }
    console.log(`${aplicar ? "→" : "·"} ${desc} ⇒ «${destino.name}» (${destino.data.id})`);
    if (!aplicar) continue;
    const r = await UserProject.updateOne(
      { _id: up._id, [`contracts.${idx}.estado_id`]: c.estado_id ?? null },
      { $set: { [`contracts.${idx}.estado_id`]: destino.data.id, [`contracts.${idx}.nombre_estado_empleado`]: destino.name } },
    );
    console.log(r.modifiedCount === 1 ? "   escrito" : "   NO se escribió (el contrato cambió mientras tanto; volver a correr)");
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
