/**
 * SIEMBRA EL PUESTO DESEMPEÑADO POR DEFECTO DE LOS CONVENIOS (registro de 85, Altas Masivas).
 *
 *   0102/90  ACTORES     → 2455
 *   0322/75  ACTORES     → 2455
 *   0634/11  TELEVISIÓN  → 4132
 *
 * La lista y las reglas viven en `utils/planPuestoPorConvenio.ts` (probadas sin base). Este script
 * sólo trae los datos, muestra el plan y —si se le pide— escribe.
 *
 *   VER QUÉ HARÍA (no escribe):
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/sembrarPuestoPorConvenio.ts --dry-run
 *
 *   APLICAR:
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/sembrarPuestoPorConvenio.ts
 *
 *   APLICAR PISANDO lo que ya esté cargado con otro código:
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/sembrarPuestoPorConvenio.ts --pisar
 *
 * · Idempotente: correrlo de nuevo no cambia nada.
 * · Verifica que los códigos existan y estén activos en el catálogo de puestos; si falta alguno, avisa
 *   y no toca esos convenios. No crea puestos.
 * · No pisa un valor ya cargado salvo con `--pisar`.
 * · Lista los convenios en uso (con contratos o con categorías) que quedan SIN default, para decidir.
 *
 * El catálogo de Convenios es compartido por toda la plataforma (no es por tenant): el default rige
 * para cualquier empleadora que use ese convenio.
 */
import mongoose from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Convenio } from "../models/Convenio.js";
import { Categoria } from "../models/Categoria.js";
import { ArcaPuestoDesempenado } from "../models/ArcaPuestoDesempenado.js";
import UserProject from "../models/UserProject.js";
import { planPuestoPorConvenio, PUESTOS_POR_CONVENIO } from "../utils/planPuestoPorConvenio.js";

const args = process.argv.slice(2);
const desconocidos = args.filter((a) => !["--dry-run", "--pisar"].includes(a));
if (desconocidos.length > 0) {
  console.error(`Argumento desconocido: ${desconocidos.join(" ")}. Uso: [--dry-run] [--pisar]`);
  process.exit(1);
}
const enSeco = args.includes("--dry-run");
const pisar = args.includes("--pisar");

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });

  // Convenios en uso: los de las categorías cargadas, con cuántos contratos los usan (por la categoría).
  const categorias: any[] = await Categoria.find().select("legacyId convenio").lean();
  const cctDeCategoria = new Map<number, string>(categorias.filter((c) => c.legacyId != null).map((c) => [Number(c.legacyId), String(c.convenio || "").trim()]));
  const usoPorCategoria: any[] = await UserProject.aggregate([{ $unwind: "$contracts" }, { $group: { _id: "$contracts.categoria_sat_id", n: { $sum: 1 } } }]);
  const enUsoMap = new Map<string, { cct: string; contratos: number; categorias: number }>();
  for (const c of categorias) {
    const cct = String(c.convenio || "").trim();
    if (!cct) continue;
    const u = enUsoMap.get(cct) || { cct, contratos: 0, categorias: 0 };
    u.categorias++;
    enUsoMap.set(cct, u);
  }
  for (const u of usoPorCategoria) {
    const cct = cctDeCategoria.get(Number(u._id));
    if (cct && enUsoMap.has(cct)) enUsoMap.get(cct)!.contratos += u.n;
  }

  const ccts = [...new Set([...PUESTOS_POR_CONVENIO.map((p) => p.cct), ...enUsoMap.keys()])];
  const convenios: any[] = await Convenio.find({ externalId: { $in: ccts } }).select("externalId name puestoDesempenadoDefault").lean();
  const puestos: any[] = await ArcaPuestoDesempenado.find({ externalId: { $in: [...new Set(PUESTOS_POR_CONVENIO.map((p) => p.puesto))] } })
    .select("externalId name activo")
    .lean();
  const nombrePuesto = new Map(puestos.map((p) => [String(p.externalId), String(p.name || "")]));

  const plan = planPuestoPorConvenio({
    convenios: convenios.map((c) => ({ externalId: String(c.externalId), name: c.name, puestoDesempenadoDefault: c.puestoDesempenadoDefault })),
    puestosActivos: puestos.filter((p) => p.activo !== false).map((p) => String(p.externalId)),
    enUso: [...enUsoMap.values()],
    pisar,
  });

  console.log(enSeco ? "EN SECO: no se escribe nada." : pisar ? "APLICANDO, pisando lo ya cargado (--pisar)." : "APLICANDO (lo ya cargado con otro código se respeta).");

  for (const f of plan.puestosFaltantes) console.log(`✗ El puesto ${f.puesto} no existe o está desactivado en el catálogo de Puestos Desempeñados: NO se asigna a ${f.ccts.join(", ")}. Cargalo o activalo en Configuración → ARCA → Puestos Desempeñados y volvé a correr.`);
  for (const cct of plan.conveniosFaltantes) console.log(`✗ El convenio ${cct} no está en el ABM de Convenios: no se le asigna nada.`);
  for (const y of plan.yaEstaban) console.log(`= ${y.cct}: ya tenía ${y.puesto} (${nombrePuesto.get(y.puesto) || "?"}).`);
  for (const r of plan.respetados) console.log(`· ${r.cct}: tiene ${r.actual} cargado y NO se pisa (se quería ${r.deseado}). Con --pisar se reemplaza.`);

  let escritos = 0;
  for (const a of plan.aplicar) {
    console.log(`${enSeco ? "·" : "→"} ${a.cct} ${a.nombre}: ${a.de || "(vacío)"} ⇒ ${a.a} (${nombrePuesto.get(a.a) || "?"})`);
    if (enSeco) continue;
    // Sólo si sigue como se leyó: si alguien lo cambió mientras tanto, no se pisa su cambio.
    const filtroPrevio = a.de ? { puestoDesempenadoDefault: a.de } : { $or: [{ puestoDesempenadoDefault: { $exists: false } }, { puestoDesempenadoDefault: "" }, { puestoDesempenadoDefault: null }] };
    const r = await Convenio.updateOne({ externalId: a.cct, ...filtroPrevio }, { $set: { puestoDesempenadoDefault: a.a } });
    if (r.modifiedCount === 1) escritos++;
    else console.log(`   NO se escribió ${a.cct}: cambió mientras se corría el script. Volvé a correrlo.`);
  }

  console.log(`\n${enSeco ? `Se aplicarían ${plan.aplicar.length}` : `Escritos ${escritos} de ${plan.aplicar.length}`} · ya estaban ${plan.yaEstaban.length} · respetados ${plan.respetados.length}.`);

  if (plan.sinDefault.length > 0) {
    console.log("\nConvenios EN USO que quedan SIN puesto por defecto (no se les asigna nada: decidilo vos):");
    for (const s of plan.sinDefault) console.log(`   ${s.cct.padEnd(12)} ${String(s.nombre || "").padEnd(28)} ${String(s.contratos).padStart(5)} contrato(s) · ${s.categorias} categoría(s)`);
  } else {
    console.log("\nNo queda ningún convenio en uso sin puesto por defecto.");
  }
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
