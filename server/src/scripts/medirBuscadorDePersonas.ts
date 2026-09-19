/**
 * Qué cuesta el BUSCADOR DE PERSONAS de la solicitud de contratación. SÓLO LECTURA.
 *
 *   npx tsx src/scripts/medirBuscadorDePersonas.ts <tenantId>
 *
 * Mide las tres consultas que lo sostienen: la página del selector, el contrato que rige de esas
 * personas y el conteo por rol. Sirve de control: si alguna vuelve a crecer, se ve acá.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { contratosQueRigenDeLasPersonas } from "../utils/contratosQueRigen.js";
import "../models/Role.js";

const kb = (x: any) => Buffer.byteLength(JSON.stringify(x ?? null)) / 1024;

async function main() {
  const tenantId = process.argv[2];
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  await User.findOne({}).select("_id").lean().exec();

  const filter: any = { tenantId: new Types.ObjectId(tenantId), "metadata.activo": true };

  let t = Date.now();
  const pagina: any[] = await User.find(filter)
    .sort({ _id: -1 })
    .limit(50)
    .select("firstName lastName email metadata.id metadata.activo metadata.documento metadata.fullName metadata.projects metadata.roles_frame")
    .populate({ path: "metadata.projects", model: UserProject, select: "projectId nombre_rol_frame nombre_sede" })
    .populate({ path: "metadata.roles_frame", select: "name", model: RoleFrame })
    .lean();
  const msPagina = Date.now() - t;

  t = Date.now();
  const rige = await contratosQueRigenDeLasPersonas(pagina.map((u) => u._id), new Date().toISOString().slice(0, 10));
  const msRige = Date.now() - t;

  const conFechas = pagina.map((u: any) => ({ ...u, contratoQueRige: rige.get(String(u._id)) ?? null }));
  console.log(`picker NUEVO: pagina de 50          ${String(msPagina).padStart(6)} ms  ${kb(pagina).toFixed(1).padStart(8)} KB`);
  console.log(`  + contrato que rige (agregación)  ${String(msRige).padStart(6)} ms  ${kb([...rige]).toFixed(1).padStart(8)} KB`);
  console.log(`  = lo que recibe el front          ${String(msPagina + msRige).padStart(6)} ms  ${kb(conFechas).toFixed(1).padStart(8)} KB`);
  console.log(`  con contrato que rige: ${[...rige.values()].filter(Boolean).length} de ${pagina.length}`);
  console.log(`  ejemplo: ${JSON.stringify(conFechas[0]?.contratoQueRige)}`);

  t = Date.now();
  const counts: any[] = await User.aggregate([
    { $match: filter },
    { $lookup: { from: UserProject.collection.name, localField: "metadata.projects", foreignField: "_id", as: "_ups", pipeline: [{ $project: { _id: 0, r: "$nombre_rol_frame", cr: { $map: { input: { $ifNull: ["$contracts", []] }, as: "c", in: "$$c.nombre_rol_frame" } } } }] } },
    { $lookup: { from: RoleFrame.collection.name, localField: "metadata.roles_frame", foreignField: "_id", as: "_rfs", pipeline: [{ $project: { _id: 0, name: 1 } }] } },
    { $project: { roles: { $setUnion: [{ $ifNull: ["$_ups.r", []] }, { $reduce: { input: { $ifNull: ["$_ups.cr", []] }, initialValue: [], in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] } } }, { $ifNull: ["$_rfs.name", []] }] } } },
    { $unwind: "$roles" },
    { $match: { roles: { $nin: [null, ""] } } },
    { $group: { _id: "$roles", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log(`\nroles-frame-counts                  ${String(Date.now() - t).padStart(6)} ms  ${kb(counts).toFixed(1).padStart(8)} KB   ${counts.length} roles`);
  console.log(`  top: ${counts.slice(0, 5).map((c) => `${c._id} (${c.count})`).join(", ")}`);

  // Filtro por rol, como lo resuelve el endpoint
  const nombre = counts[0]?._id;
  if (nombre) {
    t = Date.now();
    const [porProyecto, propios] = await Promise.all([
      UserProject.find({ $or: [{ nombre_rol_frame: { $in: [nombre] } }, { "contracts.nombre_rol_frame": { $in: [nombre] } }] }).distinct("userId"),
      RoleFrame.find({ name: { $in: [nombre] } }).distinct("_id"),
    ]);
    const total = await User.countDocuments({ $and: [filter, { $or: [{ _id: { $in: porProyecto } }, { "metadata.roles_frame": { $in: propios } }] }] });
    console.log(`filtro rolFrame="${nombre}"          ${String(Date.now() - t).padStart(6)} ms                ${total} personas (el conteo dice ${counts[0].count})`);
  }

  // Búsqueda por texto
  t = Date.now();
  const busq = await User.countDocuments({ $and: [filter, { $or: [{ firstName: { $regex: "mar", $options: "i" } }, { lastName: { $regex: "mar", $options: "i" } }, { email: { $regex: "mar", $options: "i" } }] }] });
  console.log(`búsqueda "mar"                      ${String(Date.now() - t).padStart(6)} ms                ${busq} personas`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
