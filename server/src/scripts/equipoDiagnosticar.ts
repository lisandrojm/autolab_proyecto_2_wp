import mongoose from "mongoose";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { esContratoVigente, hoyArgentina } from "../utils/contratoVigencia.js";
import { firmaDeAreas, tieneRol } from "../compartido/configDelEquipo.js";

/**
 * QUÉ ESTÁ DESALINEADO HOY ENTRE EL EQUIPO Y LOS CONTRATOS (fase 3, 30/10/2026). Sólo lectura.
 *
 *  · Área: el contrato vigente dice un área y el equipo otra (puede ser correcto —una jornada en otra
 *    área— o un resto de cuando el wizard pisaba).
 *  · Rol: el rol del equipo (tabla) y el del contrato vigente difieren.
 *  · Huérfanas: filas del equipo de personas que ya no tienen vínculo con el proyecto.
 *
 *   npm run equipo:diagnosticar
 */
async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
  await mongoose.connect(uri, { dbName });
  console.log(`Base ${dbName} · solo lectura\n`);
  const hoy = hoyArgentina();
  const proyectos: any[] = await Project.find({}).select("name teamConfig").lean();
  const tot = { area: 0, rol: 0, huerfanas: 0 };
  for (const p of proyectos) {
    const contratoDe = await contratosQueRigenDelProyecto(String(p._id), hoy, ["nombre_rol_frame"]);
    const vinculos: any[] = await UserProject.find({ projectId: p._id }).select("userId nombre_rol_frame").lean();
    const rolEquipo = new Map(vinculos.map((v) => [String(v.userId), v.nombre_rol_frame]));
    const conVinculo = new Set(vinculos.map((v) => String(v.userId)));
    const filas: any[] = p.teamConfig || [];
    const lineas: string[] = [];
    for (const f of filas) {
      const uid = String(f.userId);
      if (!conVinculo.has(uid)) {
        tot.huerfanas++;
        lineas.push(`  huérfana: ${uid}`);
        continue;
      }
      const c = contratoDe.get(uid);
      if (!c || !esContratoVigente(c, hoy)) continue;
      const fe = firmaDeAreas(f.areaShiftAssignments), fc = firmaDeAreas(c.areaShiftAssignments);
      if (fe !== "[]" && fc !== "[]" && fe !== fc) {
        tot.area++;
        lineas.push(`  área: ${uid} equipo ${fe} · contrato vigente ${fc}`);
      }
      const re = rolEquipo.get(uid), rc = c.nombre_rol_frame;
      if (tieneRol(re) && tieneRol(rc) && String(re).trim() !== String(rc).trim()) {
        tot.rol++;
        lineas.push(`  rol: ${uid} equipo «${re}» · contrato vigente «${rc}»`);
      }
    }
    if (lineas.length) {
      const ids = [...new Set(lineas.map((l) => /([0-9a-f]{24})/.exec(l)?.[1]).filter(Boolean))];
      const nombres = new Map(((await User.find({ _id: { $in: ids } }).select("firstName lastName").lean()) as any[]).map((u) => [String(u._id), `${u.firstName || ""} ${u.lastName || ""}`.trim()]));
      console.log(`${p.name} (${p._id}): ${lineas.length}`);
      lineas.slice(0, 20).forEach((l) => console.log(l.replace(/([0-9a-f]{24})/, (id) => `${nombres.get(id) || "?"} (${id})`)));
      if (lineas.length > 20) console.log(`  … y ${lineas.length - 20} más`);
    }
  }
  console.log(`\nÁrea distinta del contrato vigente: ${tot.area} · rol distinto: ${tot.rol} · filas huérfanas: ${tot.huerfanas}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
