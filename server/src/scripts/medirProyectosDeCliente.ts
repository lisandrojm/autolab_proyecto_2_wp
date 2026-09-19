/**
 * ═══════════════════════════════════════════════════════════════════════
 * QUÉ TARDA EN `GET /clients/:clientId/projects` — medición, SÓLO LECTURA
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/medirProyectosDeCliente.ts <clientId> [userId]
 *
 * Repite, una por una, las consultas que hace el endpoint y dice cuánto tardó cada una y cuántos
 * bytes trajo. No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";
import { Info } from "../models/Info.js";
import { CentroCosto } from "../models/CentroCosto.js";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import "../models/Shift.js";
import "../models/Area.js";
import "../models/Role.js";

const pesos: { paso: string; ms: number; kb: number; detalle: string }[] = [];

async function medir<T>(paso: string, fn: () => Promise<T>, detalle: (r: T) => string = () => ""): Promise<T> {
  const t0 = Date.now();
  const r = await fn();
  const ms = Date.now() - t0;
  const kb = Buffer.byteLength(JSON.stringify(r ?? null)) / 1024;
  pesos.push({ paso, ms, kb, detalle: detalle(r) });
  return r;
}

async function main() {
  const clientId = process.argv[2];
  const userId = process.argv[3];
  if (!clientId) {
    console.error("Falta el clientId. Uso: npx tsx src/scripts/medirProyectosDeCliente.ts <clientId> [userId]");
    process.exit(1);
  }

  const t0 = Date.now();
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  console.log(`Conectado en ${Date.now() - t0} ms\n`);

  // Calentar la conexión: la primera consulta paga el handshake del pool y falsea la medición.
  await Project.findOne({}).select("_id").lean().exec();

  const clientObjectId = new Types.ObjectId(clientId);

  const client: any = await medir("Client.findOne (sin lean ni select)", () => Client.findOne({ _id: clientObjectId }).exec());
  if (!client) {
    console.error("No existe ese cliente.");
    await mongoose.disconnect();
    return;
  }
  const tenantId = client.tenantId;
  console.log(`Cliente: ${client.name} · tenant ${tenantId}\n`);

  const externalIdNum = client.externalId ? Number(client.externalId) : null;
  const filter: any = { tenantId };
  if (externalIdNum !== null && !isNaN(externalIdNum)) filter.$or = [{ clientId: clientObjectId }, { "metadata.clienteId": externalIdNum }];
  else filter.clientId = clientObjectId;

  if (userId) {
    const usuario: any = await medir("alcanceDeResponsable · User.findById", () => User.findById(userId).select("metadata.id").lean().exec());
    const idFrame = Number(usuario?.metadata?.id);
    if (Number.isFinite(idFrame)) {
      await medir("alcanceDeResponsable · Project.find(responsableId)", () => Project.find({ tenantId, "metadata.responsableId": idFrame }).select("_id clientId").lean().exec(), (r: any[]) => `${r.length} proyectos`);
    }
  }

  const projects = await medir(
    "Project.find + 4 populate + select(-objectives -workSchedule -teamConfig)",
    () =>
      Project.find(filter)
        .sort({ createdAt: -1 })
        .skip(0)
        .limit(12)
        .populate("clientId", "name")
        .populate("turnos", "name")
        .populate("areasConfig.areaId", "name")
        .populate("areasConfig.shiftIds", "name order startTime endTime days")
        .select("-objectives -workSchedule -teamConfig")
        .lean()
        .exec(),
    (r: any[]) => `${r.length} proyectos`,
  );

  await medir("Project.countDocuments", () => Project.countDocuments(filter).exec());

  // Los mismos proyectos, populate por populate, para ver cuál cuesta.
  await medir("  ↳ Project.find PELADO (sin populate)", () => Project.find(filter).sort({ createdAt: -1 }).limit(12).select("-objectives -workSchedule -teamConfig").lean().exec());
  await medir("  ↳ + populate clientId", () => Project.find(filter).sort({ createdAt: -1 }).limit(12).populate("clientId", "name").select("-objectives -workSchedule -teamConfig").lean().exec());
  await medir("  ↳ + populate turnos", () => Project.find(filter).sort({ createdAt: -1 }).limit(12).populate("turnos", "name").select("-objectives -workSchedule -teamConfig").lean().exec());
  await medir("  ↳ + populate areasConfig.areaId", () => Project.find(filter).sort({ createdAt: -1 }).limit(12).populate("areasConfig.areaId", "name").select("-objectives -workSchedule -teamConfig").lean().exec());
  await medir("  ↳ + populate areasConfig.shiftIds", () => Project.find(filter).sort({ createdAt: -1 }).limit(12).populate("areasConfig.shiftIds", "name order startTime endTime days").select("-objectives -workSchedule -teamConfig").lean().exec());
  await medir("  ↳ SIN assignedUsers ni coordinatorAssignments", () => Project.find(filter).sort({ createdAt: -1 }).limit(12).select("-objectives -workSchedule -teamConfig -assignedUsers -coordinatorAssignments").lean().exec());
  await medir("Client.findOne (lean + select name externalId) — en caliente", () => Client.findOne({ _id: clientObjectId }).select("name externalId tenantId").lean().exec());

  const sedeIds = [...new Set(projects.map((p: any) => p.metadata?.sedeId).filter(Boolean))].map(Number);
  if (sedeIds.length > 0) await medir("Info.find (sedes)", () => Info.find({ type: "sede", "data.id": { $in: sedeIds } }).lean().exec(), (r: any[]) => `${r.length} sedes`);

  const ccIds = [...new Set(projects.map((p: any) => p.metadata?.centroCostoId).filter(Boolean))].map(Number);
  if (ccIds.length > 0) await medir("CentroCosto.find (sin select)", () => CentroCosto.find({ $or: [{ idAuxiliar: { $in: ccIds } }, { "data.id": { $in: ccIds } }] }).lean().exec(), (r: any[]) => `${r.length} centros`);

  const ids = projects.map((p: any) => p._id);
  if (ids.length > 0) await medir("UserProject.aggregate (contador de personas)", () => UserProject.aggregate([{ $match: { projectId: { $in: ids } } }, { $group: { _id: "$projectId", count: { $sum: 1 } } }]).exec());

  console.log("PASO".padEnd(62) + "ms".padStart(8) + "KB".padStart(10) + "  detalle");
  console.log("-".repeat(100));
  let totalMs = 0;
  let totalKb = 0;
  for (const p of pesos) {
    totalMs += p.ms;
    totalKb += p.kb;
    console.log(p.paso.padEnd(62) + String(p.ms).padStart(8) + p.kb.toFixed(1).padStart(10) + "  " + p.detalle);
  }
  console.log("-".repeat(100));
  console.log("TOTAL".padEnd(62) + String(totalMs).padStart(8) + totalKb.toFixed(1).padStart(10));

  console.log("\nTamaño de cada proyecto que viaja al front:");
  projects.forEach((p: any) => {
    const kb = Buffer.byteLength(JSON.stringify(p)) / 1024;
    const campos = Object.entries(p)
      .map(([k, v]) => [k, Buffer.byteLength(JSON.stringify(v ?? null)) / 1024] as [string, number])
      .filter(([, k]) => k > 1)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${v.toFixed(1)}KB`)
      .join(", ");
    console.log(`  · ${p.name}: ${kb.toFixed(1)} KB  ${campos ? `→ ${campos}` : ""}`);
  });

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
