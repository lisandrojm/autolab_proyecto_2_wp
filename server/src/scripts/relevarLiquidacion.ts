/**
 * ═══════════════════════════════════════════════════════════════════════
 * RELEVAMIENTO PARA EL MOTOR DE LIQUIDACIÓN — SÓLO LECTURA
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/relevarLiquidacion.ts [periodo AAAA-MM]
 *
 * No escribe nada. Contesta las preguntas que hay que contestar ANTES de diseñar la fase 0:
 * cuántos empleados entran en un período, cuántos tienen legajo, si los legajos chocan dentro de
 * una misma empresa, qué motivos de novedad existen de verdad y de dónde sale el centro de costo.
 *
 * Existe porque el número que uno asume es el que después no cierra. Es más barato mirar.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { Request } from "../models/Request.js";
import { Company } from "../models/Company.js";
import { CentroCosto } from "../models/CentroCosto.js";
import { Project } from "../models/Project.js";

const linea = (t: string) => console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);

async function main() {
  const periodo = process.argv[2] || "2026-08";
  const desde = `${periodo}-01`;
  const hasta = `${periodo}-31`;

  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  console.log(`Base: ${env.MONGO_DB_NAME}   ·   Período: ${periodo}`);

  // El tenant con más gente: es el que importa para dimensionar.
  const porTenant = await User.aggregate([{ $group: { _id: "$tenantId", n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 3 }]);
  console.log(`\nTenants por cantidad de usuarios: ${porTenant.map((t: any) => `${t._id} (${t.n})`).join(", ")}`);
  const tenantId: Types.ObjectId = porTenant[0]._id;

  /* ── Empresas y centros de costo ── */
  linea("EMPRESAS Y CENTROS DE COSTO");
  const empresas: any[] = await Company.find({}).select("name cuit").lean();
  console.log(`Empresas (empleadoras): ${empresas.length}`);
  empresas.forEach((e: any) => console.log(`   · ${e.name}   cuit=${e.cuit || "—"}   ${e._id}`));

  const ccTotal = await CentroCosto.countDocuments({});
  const ccPorEmpresa = await CentroCosto.aggregate([{ $group: { _id: "$empresaNombre", n: { $sum: 1 } } }, { $sort: { n: -1 } }]);
  console.log(`\nCentros de costo: ${ccTotal}`);
  ccPorEmpresa.forEach((c: any) => console.log(`   · ${c._id || "(sin empresa)"}: ${c.n}`));

  const proyectosConCC = await Project.countDocuments({ tenantId, "metadata.centroCostoId": { $exists: true, $ne: null } });
  const proyectosTotal = await Project.countDocuments({ tenantId });
  console.log(`\nProyectos con centro de costo asignado: ${proyectosConCC} de ${proyectosTotal}`);

  /* ── Motivos de novedad ── */
  linea("MOTIVOS DE NOVEDAD (request-config)");
  const motivos: any[] = await RequestConfig.find({ tenantId }).select("name isActive requiresReplacement effects order").sort({ order: 1 }).lean();
  console.log(`Son ${motivos.length}:`);
  motivos.forEach((m: any) => {
    console.log(`   · "${m.name}"   activo=${m.isActive !== false}   requiereReemplazo=${!!m.requiresReplacement}   effects=${(m.effects || []).length}   ${m._id}`);
  });

  /* ── Qué motivos se usan de verdad en el período ── */
  linea(`MOTIVOS QUE APARECEN EN LOS PARTES DE ${periodo}`);
  const usoMotivos = await Request.aggregate([
    { $match: { tenantId, date: { $gte: desde, $lte: hasta } } },
    { $unwind: "$attendance" },
    { $group: { _id: { motivo: "$attendance.absenceReason", estado: "$attendance.status" }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]);
  const partesDelPeriodo = await Request.countDocuments({ tenantId, date: { $gte: desde, $lte: hasta } });
  console.log(`Partes en el período: ${partesDelPeriodo}`);
  if (usoMotivos.length === 0) console.log("   (no hay partes cargados en ese período)");
  usoMotivos.forEach((u: any) => console.log(`   · estado=${u._id.estado || "—"}   motivo="${u._id.motivo || "(vacío)"}"   ${u.n} renglones`));

  /* ── Cuánta gente entra en el período ── */
  linea(`GENTE CON ACTIVIDAD EN ${periodo}`);
  const conActividad = await Request.aggregate([
    { $match: { tenantId, date: { $gte: desde, $lte: hasta } } },
    { $project: { ids: { $setUnion: [{ $ifNull: ["$attendance.employeeId", []] }, { $ifNull: ["$attendance.replacementId", []] }] } } },
    { $unwind: "$ids" },
    { $group: { _id: "$ids" } },
    { $count: "n" },
  ]);
  console.log(`Personas que aparecen en algún parte del período: ${conActividad[0]?.n ?? 0}`);

  const contratosVigentes = await UserProject.aggregate([
    { $match: { "contracts.fecha_alta_contrato": { $lte: hasta } } },
    { $unwind: "$contracts" },
    { $match: { "contracts.fecha_alta_contrato": { $lte: hasta }, $or: [{ "contracts.fecha_baja_contrato": { $in: [null, ""] } }, { "contracts.fecha_baja_contrato": { $gte: desde } }] } },
    { $group: { _id: "$userId" } },
    { $count: "n" },
  ]);
  console.log(`Personas con al menos un contrato vigente en el período: ${contratosVigentes[0]?.n ?? 0}`);

  /* ── Legajos ── */
  linea("LEGAJOS (metadata.numeroLegajoTango)");
  const usuarios: any[] = await User.find({ tenantId, isSystem: { $ne: true } })
    .select("firstName lastName metadata.numeroLegajoTango metadata.activo")
    .lean();
  const conLegajo = usuarios.filter((u: any) => String(u.metadata?.numeroLegajoTango || "").trim());
  const activos = usuarios.filter((u: any) => u.metadata?.activo !== false);
  console.log(`Usuarios: ${usuarios.length}   ·   activos: ${activos.length}   ·   con legajo: ${conLegajo.length}`);

  const formatos = new Map<string, number>();
  conLegajo.forEach((u: any) => {
    const v = String(u.metadata.numeroLegajoTango).trim();
    const f = `${v.length} caracteres${/^\d+$/.test(v) ? "" : " (no son sólo dígitos)"}${/^0/.test(v) ? ", con cero adelante" : ""}`;
    formatos.set(f, (formatos.get(f) || 0) + 1);
  });
  console.log("Formato del legajo:");
  [...formatos.entries()].sort((a, b) => b[1] - a[1]).forEach(([f, n]) => console.log(`   · ${f}: ${n}`));

  const porLegajo = new Map<string, any[]>();
  conLegajo.forEach((u: any) => {
    const v = String(u.metadata.numeroLegajoTango).trim();
    porLegajo.set(v, [...(porLegajo.get(v) || []), u]);
  });
  const repetidos = [...porLegajo.entries()].filter(([, us]) => us.length > 1);
  console.log(`\nLegajos repetidos entre personas distintas: ${repetidos.length}`);
  repetidos.slice(0, 15).forEach(([v, us]) => console.log(`   · "${v}" → ${us.map((u: any) => `${u.lastName}, ${u.firstName}`).join(" | ")}`));
  if (repetidos.length > 15) console.log(`   … y ${repetidos.length - 15} más`);

  /* ── Empresa del contrato vigente ── */
  linea("EMPRESA EN LOS CONTRATOS");
  const porEmpresa = await UserProject.aggregate([
    { $unwind: "$contracts" },
    { $group: { _id: { $ifNull: ["$contracts.nombre_empresa_contrato", "(sin empresa)"] }, n: { $sum: 1 }, personas: { $addToSet: "$userId" } } },
    { $project: { n: 1, personas: { $size: "$personas" } } },
    { $sort: { n: -1 } },
  ]);
  porEmpresa.forEach((e: any) => console.log(`   · ${e._id}: ${e.n} contratos, ${e.personas} personas`));

  const sinTipo = await UserProject.aggregate([
    { $unwind: "$contracts" },
    { $match: { $or: [{ "contracts.tipo_contrato_id": { $exists: false } }, { "contracts.tipo_contrato_id": null }] } },
    { $count: "n" },
  ]);
  console.log(`\nContratos sin tipo_contrato_id: ${sinTipo[0]?.n ?? 0}`);

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
