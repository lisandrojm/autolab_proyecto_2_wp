/**
 * DIAGNÓSTICO, SÓLO LECTURA: de dónde vienen los contratos del tenant, por cómo quedaron marcados.
 *
 *   · solicitud      → tiene `solicitudId` (aprobado desde Solicitudes)
 *   · agregar        → `fecha_carga` ISO completo (alta desde «Agregar miembro» del proyecto)
 *   · fecha corta    → `fecha_carga` YYYY-MM-DD sin `solicitudId` (otros caminos del sistema)
 *   · sin fecha      → sin `fecha_carga`: importados (FRAME / WP)
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagOrigenDeContratos.ts <tenantId>
 *
 * No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";

const [tenantId] = process.argv.slice(2);
if (!tenantId || !Types.ObjectId.isValid(tenantId)) {
  console.error("Uso: <tenantId>");
  process.exit(1);
}

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const proyectos = await Project.find({ tenantId: new Types.ObjectId(tenantId) }).select("_id").lean();
  const ups: any[] = await UserProject.find({ projectId: { $in: proyectos.map((p: any) => p._id) } })
    .select("contracts.solicitudId contracts.fecha_carga contracts.nombre_estado_empleado contracts.fecha_alta_contrato")
    .lean();
  const cuenta: Record<string, { total: number; porEstado: Record<string, number>; ultimaAlta: string }> = {};
  for (const up of ups) {
    for (const c of up.contracts || []) {
      const g = String(c.fecha_carga || "");
      const origen = c.solicitudId ? "solicitud" : /T\d{2}:/.test(g) ? "agregar" : /^\d{4}-\d{2}-\d{2}$/.test(g) ? "fecha corta" : g ? `otro (${g.slice(0, 12)})` : "sin fecha";
      const t = (cuenta[origen] ||= { total: 0, porEstado: {}, ultimaAlta: "" });
      t.total++;
      const e = String(c.nombre_estado_empleado || "sin estado");
      t.porEstado[e] = (t.porEstado[e] || 0) + 1;
      const alta = String(c.fecha_alta_contrato || "").slice(0, 10);
      if (alta > t.ultimaAlta) t.ultimaAlta = alta;
    }
  }
  for (const [origen, t] of Object.entries(cuenta).sort((a, b) => b[1].total - a[1].total)) {
    console.log(`\n${origen}: ${t.total} contrato(s) · alta más reciente ${t.ultimaAlta || "—"}`);
    for (const [e, n] of Object.entries(t.porEstado).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(5)}  ${e}`);
  }
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error("Error:", e?.message || e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
