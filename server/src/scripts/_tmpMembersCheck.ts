/* Solo lectura: corre la lógica de area-shift-members para un área/turno real. */
import mongoose from "mongoose";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";

function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}
function esContratoVigente(baja: string | undefined | null, hoy: string): boolean {
  return !baja || String(baja).substring(0, 10) >= hoy;
}
function claves(assignments: any[]): Set<string> {
  const keys = new Set<string>();
  for (const asa of assignments || []) {
    const areaId = asa?.areaId?._id || asa?.areaId;
    if (!areaId) continue;
    for (const sid of asa?.shiftIds || []) {
      const shiftId = sid?._id || sid;
      if (shiftId) keys.add(`${areaId}::${shiftId}`);
    }
  }
  return keys;
}

async function main() {
  await mongoose.connect(String(process.env.MONGO_URI), { dbName: String(process.env.MONGO_DB_NAME) });

  const p: any = await Project.findOne({ name: { $regex: "426_LN", $options: "i" } }).select("teamConfig").lean();
  const projectId = String(p._id);
  const area: any = await Area.findOne({ name: { $regex: "^Tecnica$", $options: "i" } }).lean();
  const shift: any = await Shift.findOne({ name: { $regex: "Tarde 12 a 18", $options: "i" } }).lean();
  console.log(`área=${area.name} (${area._id}) turno=${shift.name} (${shift._id})`);

  const members = await User.find({ projectIds: projectId })
    .select("_id firstName lastName email metadata.activo metadata.projects")
    .populate({
      path: "metadata.projects",
      model: UserProject,
      select: "projectId contracts.areaShiftAssignments contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.nombre_estado_empleado contracts.nombre_contrato",
    })
    .lean();

  const hoy = hoyArgentina();
  const configByUser = new Map<string, any>((p.teamConfig || []).map((c: any) => [String(c.userId), c]));
  const target = `${area._id}::${shift._id}`;
  const rows: any[] = [];

  for (const member of members) {
    const up: any = ((member as any).metadata?.projects || []).find((x: any) => x && String(x.projectId) === String(projectId));
    const contracts: any[] = up?.contracts || [];
    const ultimo = contracts.length > 0 ? contracts[contracts.length - 1] : null;
    let assignments: any[] = configByUser.get(String(member._id))?.areaShiftAssignments || [];
    if (assignments.length === 0) assignments = ultimo?.areaShiftAssignments || [];
    if (!claves(assignments).has(target)) continue;

    const activo = (member as any).metadata?.activo === true;
    const vigente = !!ultimo && esContratoVigente(ultimo.fecha_baja_contrato, hoy);
    rows.push({
      nombre: `${(member as any).firstName || ""} ${(member as any).lastName || ""}`.trim(),
      activo,
      vigente,
      estado: ultimo?.nombre_estado_empleado || "",
      alta: ultimo?.fecha_alta_contrato || "",
      baja: ultimo?.fecha_baja_contrato || "",
    });
  }

  rows.sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  console.log(`\ntotal=${rows.length} | cuentan=${rows.filter((r) => r.cuenta !== false && r.activo && r.vigente).length}\n`);
  for (const r of rows.slice(0, 12)) {
    console.log(`${r.nombre.padEnd(32)} activo=${String(r.activo).padEnd(5)} vigente=${String(r.vigente).padEnd(5)} estado=${(r.estado || "—").padEnd(22)} alta=${String(r.alta).substring(0, 10)} baja=${String(r.baja || "—").substring(0, 10)}`);
  }
  if (rows.length > 12) console.log(`... y ${rows.length - 12} más`);

  await mongoose.disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
