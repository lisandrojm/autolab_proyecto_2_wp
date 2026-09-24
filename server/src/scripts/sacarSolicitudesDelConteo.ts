import fs from "fs";
import path from "path";
import mongoose, { Types } from "mongoose";

import { User } from "../models/User.js";
import { Tenant } from "../models/Tenant.js";
import UserProject from "../models/UserProject.js";

/**
 * LAS SOLICITUDES DE CONTRATACIÓN DEJAN DE CONTAR COMO USUARIOS ACTIVOS DEL TENANT.
 *
 * Hasta ahora cada solicitud (un `User` de paso con `metadata.isSolicitud`) nacía con `metadata.activo:
 * true` y sumaba en `Tenant.userIds` / `usage.users.current`, y así quedaba para siempre aunque se
 * rechazara o cancelara. El código ya no lo hace (ver `services/conteoUsuariosTenant.ts`); esto arregla
 * las que ya existen.
 *
 * QUÉ DOCUMENTOS TOCA (los que no son una persona):
 *   1. Solicitudes abiertas o cerradas sin aprobar: `metadata.isSolicitud: true`.
 *   2. Solicitudes APROBADAS que apuntaban a otra persona (`solicitudUserId` ≠ su `_id`) y no tienen
 *      asignaciones propias: el contrato fue a la persona real y este documento quedó de paso. Es el
 *      mismo criterio con el que `DELETE /users/:id/solicitud` decide si el documento «es la persona».
 *   Una solicitud aprobada que SE CONVIRTIÓ en la persona (sin `solicitudUserId`, o con asignaciones)
 *   no se toca: es un usuario de verdad.
 *
 * A cada uno: `metadata.activo = false` y fuera de `Tenant.userIds`. Después, `usage.users.current` de
 * cada tenant tocado se recalcula como `userIds.length` (mismo criterio que `routes/tenants.ts`).
 *
 * Uso (desde server/):
 *   npm run solicitudes-conteo:dry
 *   npm run solicitudes-conteo
 *   npm run solicitudes-conteo:revertir -- logs/solicitudes-conteo-<fecha>.json
 */

const DRY_RUN = process.env.DRY_RUN === "true";

interface Respaldo {
  usuarios: { _id: string; tenantId: string; activoAntes: boolean | null; motivo: string }[];
  tenants: { _id: string; userIdsAntes: string[]; usageAntes: number | null }[];
}

async function conectar() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  return dbName;
}

async function run() {
  const dbName = await conectar();
  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const abiertas: any[] = await User.find({ "metadata.isSolicitud": true }).select("_id tenantId metadata.activo metadata.solicitudStatus").lean();
  const aprobadasDePaso: any[] = [];
  const aprobadas: any[] = await User.find({ "metadata.isSolicitud": { $ne: true }, "metadata.solicitudStatus": "aprobada", "metadata.solicitudUserId": { $exists: true, $ne: null } })
    .select("_id tenantId metadata.activo metadata.solicitudUserId")
    .lean();
  for (const a of aprobadas) {
    if (String(a.metadata?.solicitudUserId) === String(a._id)) continue;
    if (await UserProject.exists({ userId: a._id })) continue;
    aprobadasDePaso.push(a);
  }

  const objetivo = [...abiertas.map((u) => ({ u, motivo: `solicitud ${u.metadata?.solicitudStatus || "pendiente"}` })), ...aprobadasDePaso.map((u) => ({ u, motivo: "aprobada, de paso (el contrato fue a otra persona)" }))];
  const respaldo: Respaldo = { usuarios: [], tenants: [] };
  const porTenant = new Map<string, Types.ObjectId[]>();
  for (const { u, motivo } of objetivo) {
    respaldo.usuarios.push({ _id: String(u._id), tenantId: String(u.tenantId), activoAntes: typeof u.metadata?.activo === "boolean" ? u.metadata.activo : null, motivo });
    const lista = porTenant.get(String(u.tenantId)) || [];
    lista.push(u._id);
    porTenant.set(String(u.tenantId), lista);
  }

  const cuenta = (motivo: string) => objetivo.filter((o) => o.motivo.startsWith(motivo)).length;
  console.log(`Solicitudes sin aprobar: ${abiertas.length} (${abiertas.filter((u) => u.metadata?.activo !== false).length} figuraban activas)`);
  console.log(`Aprobadas de paso:       ${aprobadasDePaso.length} (${aprobadasDePaso.filter((u) => u.metadata?.activo !== false).length} figuraban activas)`);

  for (const [tenantId, ids] of porTenant) {
    const t: any = await Tenant.findById(tenantId).select("name userIds usage").lean();
    if (!t) continue;
    const antes = (t.userIds || []).map(String);
    const sacar = new Set(ids.map(String));
    const despues = antes.filter((id: string) => !sacar.has(id));
    respaldo.tenants.push({ _id: tenantId, userIdsAntes: antes, usageAntes: t.usage?.users?.current ?? null });
    console.log(`\nTenant ${t.name || tenantId}: userIds ${antes.length} → ${despues.length} · usage.users.current ${t.usage?.users?.current ?? "—"} → ${despues.length}`);
    if (!DRY_RUN) await Tenant.updateOne({ _id: tenantId }, { $set: { userIds: despues.map((id: string) => new Types.ObjectId(id)), "usage.users.current": despues.length } });
  }

  if (!DRY_RUN && objetivo.length) {
    await User.updateMany({ _id: { $in: objetivo.map((o) => o.u._id) } }, { $set: { "metadata.activo": false } });
    const dir = path.resolve(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const archivo = path.join(dir, `solicitudes-conteo-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
    fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2));
    console.log(`\nRespaldo reversible: ${archivo}`);
  }

  console.log(`\n${DRY_RUN ? "Se marcarían" : "Se marcaron"} ${objetivo.length} documento(s) como inactivos y fuera del conteo (${cuenta("solicitud")} sin aprobar, ${cuenta("aprobada")} aprobadas de paso).\n`);
  await mongoose.disconnect();
}

/** Revertir = devolver a cada usuario su `activo` de antes, y a cada tenant sus `userIds` y su uso. */
async function revertir(archivo: string) {
  const dbName = await conectar();
  const ruta = path.resolve(process.cwd(), archivo);
  if (!fs.existsSync(ruta)) throw new Error(`No existe el respaldo: ${ruta}`);
  const r: Respaldo = JSON.parse(fs.readFileSync(ruta, "utf8"));
  console.log(`\nDB: ${dbName}   |   revirtiendo ${r.usuarios.length} usuario(s) y ${r.tenants.length} tenant(s) desde ${path.basename(ruta)}\n`);

  for (const u of r.usuarios) {
    await User.updateOne({ _id: u._id }, u.activoAntes === null ? { $unset: { "metadata.activo": "" } } : { $set: { "metadata.activo": u.activoAntes } });
  }
  for (const t of r.tenants) {
    await Tenant.updateOne({ _id: t._id }, { $set: { userIds: t.userIdsAntes.map((id) => new Types.ObjectId(id)), ...(t.usageAntes === null ? {} : { "usage.users.current": t.usageAntes }) } });
  }
  console.log("Listo: usuarios y tenants como estaban antes de la migración.\n");
  await mongoose.disconnect();
}

const archivo = process.argv[2];
(archivo ? revertir(archivo) : run()).catch((e) => {
  console.error("\n❌", e?.message || e, "\n");
  process.exit(1);
});
