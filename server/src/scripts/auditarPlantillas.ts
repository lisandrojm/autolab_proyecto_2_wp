import mongoose from "mongoose";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { Contrato } from "../models/Contrato.js";
import { analizarPlantilla } from "../utils/variablesPlantilla.js";

/**
 * SOLO LECTURA. Estado de salud de las plantillas de contrato.
 *
 * Recorre TODAS las llaves de cada documento en vez de buscar las formas que se esperan encontrar:
 * es la diferencia entre este chequeo y el que dejó pasar `{fechaAltaContrato}}` diciendo «todas
 * válidas». Ver `utils/variablesPlantilla.ts`.
 *
 *   npm run plantillas:auditar
 */

async function run() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME! });

  const tipos: any[] = await Contrato.find({}).select("name").lean();
  const porTipoId = new Map(tipos.map((t) => [String(t._id), t.name]));
  const plantillas: any[] = await ContratoFrame.find({}).select("name content contratoId").sort({ name: 1 }).lean();

  // ¿Cuántas plantillas cuelgan de cada tipo? Es lo que decide si los anexos pueden ser plantillas.
  const porTipo = new Map<string, string[]>();
  for (const p of plantillas) {
    const k = String(p.contratoId || "(sin tipo)");
    if (!porTipo.has(k)) porTipo.set(k, []);
    porTipo.get(k)!.push(p.name);
  }

  console.log(`\n── Salud de las ${plantillas.length} plantillas ──\n`);
  let rotas = 0;
  for (const p of plantillas) {
    const r = analizarPlantilla(String(p.content || ""));
    const literalMail = (String(p.content || "").match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || []).length;
    const marca = r.problemas.length === 0 ? "✔" : "✖";
    if (r.problemas.length > 0) rotas++;
    console.log(`${marca} ${String(p.name).padEnd(52)} ${String(r.variables.length).padStart(3)} vars · ${String(r.problemas.length).padStart(2)} problemas${literalMail ? ` · ${literalMail} mail(s) literal(es)` : ""}`);
    for (const x of r.problemas.slice(0, 12)) console.log(`      ${x.motivo}\n         …${x.fragmento}…`);
    if (r.problemas.length > 12) console.log(`      … y ${r.problemas.length - 12} más`);
  }
  console.log(`\nplantillas con problemas: ${rotas} de ${plantillas.length}`);

  console.log(`\n── ¿Un tipo admite varias plantillas? ──\n`);
  let conVarias = 0;
  for (const [tipoId, nombres] of porTipo) {
    if (nombres.length > 1) conVarias++;
    console.log(`   ${String(porTipoId.get(tipoId) || tipoId).padEnd(52)} ${nombres.length} plantilla(s): ${nombres.join(" | ")}`);
  }
  console.log(`\ntipos con más de una plantilla HOY: ${conVarias}`);
  const tiposSinPlantilla = tipos.filter((t) => !porTipo.has(String(t._id)));
  if (tiposSinPlantilla.length > 0) console.log(`tipos sin plantilla: ${tiposSinPlantilla.map((t) => t.name).join(", ")}`);

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
