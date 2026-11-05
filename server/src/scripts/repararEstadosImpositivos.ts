import mongoose from "mongoose";
import { Info } from "../models/Info.js";
import UserProject from "../models/UserProject.js";
import { ESTADO_TYPE, ESTADOS_IMPOSITIVOS_SISTEMA } from "../utils/estadosImpositivosSistema.js";
import { planDeReparacion } from "../utils/reparacionEstadosImpositivos.js";

/**
 * UNE LOS ESTADOS IMPOSITIVOS DE SISTEMA QUE QUEDARON DOBLES (ver `utils/reparacionEstadosImpositivos.ts`).
 *
 *   npm run estados:reparar-impositivos              (en seco: sólo dice qué haría)
 *   APLICAR=1 npm run estados:reparar-impositivos    (escribe)
 *
 * Para cada trámite: el estado con los tipos de contrato vuelve al nombre de fábrica y el otro se borra.
 * Los contratos que apuntan al borrado (`estado_id`) pasan al que queda, y los creados mientras el
 * estado estuvo renombrado (`nombre_estado_empleado`) vuelven al nombre de fábrica.
 */
const APLICAR = process.env.APLICAR === "1";

async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
  await mongoose.connect(uri, { dbName });
  console.log(`Base ${dbName} · ${APLICAR ? "APLICANDO" : "EN SECO (no escribe nada)"}\n`);

  const estados: any[] = await Info.find({ type: ESTADO_TYPE }).lean();
  const plan = planDeReparacion(estados.map((e) => ({ ...e, _id: String(e._id) })), ESTADOS_IMPOSITIVOS_SISTEMA);
  if (plan.length === 0) console.log("Los estados impositivos de sistema están bien: nada que reparar.");

  for (const p of plan) {
    const idFinal = Number(p.conservar.data?.id);
    const idsBorrados = p.borrar.map((b) => Number(b.data?.id)).filter(Number.isFinite);
    const nombresViejos = [...new Set([p.conservar.name, ...p.borrar.map((b) => b.name)])].filter((n) => n !== p.nombreFinal);
    const conId = await UserProject.countDocuments({ "contracts.estado_id": { $in: idsBorrados } });
    const conNombre = await UserProject.countDocuments({ "contracts.nombre_estado_empleado": { $in: nombresViejos } });

    console.log(`${p.tipoImpositivo}:`);
    console.log(`  queda «${p.conservar.name}» (id ${idFinal}, ${p.contratoFrameIds.length} tipos de contrato)${p.renombrar ? ` → se llama «${p.nombreFinal}»` : ""}`);
    for (const b of p.borrar) console.log(`  se borra «${b.name}» (id ${b.data?.id}, ${(b.data?.contratoFrameIds || []).length} tipos de contrato)`);
    console.log(`  asignaciones con contratos en el id borrado: ${conId} · con contratos que dicen ${nombresViejos.map((n) => `«${n}»`).join(", ") || "—"}: ${conNombre}`);
    // Lo que no se corrige solo: otros estados que nombren a los borrados (dependencias, transiciones).
    for (const e of estados) {
      if (String(e._id) === p.conservar._id || p.borrar.some((b) => b._id === String(e._id))) continue;
      const texto = JSON.stringify(e.data || {});
      if (idsBorrados.some((id) => new RegExp(`[:\\[,"]${id}[,\\]}"]`).test(texto))) console.log(`  ⚠ «${e.name}» menciona un id borrado: revisalo a mano.`);
    }
    if (!APLICAR) continue;

    if (idsBorrados.length > 0)
      await UserProject.updateMany({ "contracts.estado_id": { $in: idsBorrados } }, { $set: { "contracts.$[c].estado_id": idFinal } }, { arrayFilters: [{ "c.estado_id": { $in: idsBorrados } }] });
    if (nombresViejos.length > 0)
      await UserProject.updateMany({ "contracts.nombre_estado_empleado": { $in: nombresViejos } }, { $set: { "contracts.$[c].nombre_estado_empleado": p.nombreFinal } }, { arrayFilters: [{ "c.nombre_estado_empleado": { $in: nombresViejos } }] });
    // Primero se borra: el nombre de fábrica lo tiene el que se va.
    await Info.deleteMany({ _id: { $in: p.borrar.map((b) => new mongoose.Types.ObjectId(b._id)) } });
    await Info.updateOne({ _id: p.conservar._id }, { $set: { name: p.nombreFinal, "data.nombre": p.nombreFinal, "data.contratoFrameIds": p.contratoFrameIds } });
    console.log("  ✓ aplicado");
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
