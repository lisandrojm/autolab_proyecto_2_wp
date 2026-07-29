/**
 * Limpieza puntual: borra los Contrato duplicados generados por una condición de carrera del
 * backfill automático (dos requests concurrentes creando el mismo Contrato a la vez). Por cada
 * nombre repetido, conserva el que tenga más Plantillas asignadas (desempate: el más antiguo),
 * reasigna a ese cualquier Plantilla que apunte a los demás, y borra los que queden en 0.
 *
 * Idempotente: si no hay duplicados, no hace nada. Podés correrlo de nuevo sin riesgo.
 */
import mongoose from "mongoose";
import { Contrato } from "../models/Contrato.js";
import { ContratoFrame } from "../models/ContratoFrame.js";

async function main() {
  await mongoose.connect(String(process.env.MONGO_URI), { dbName: String(process.env.MONGO_DB_NAME) });

  const contratos = await Contrato.find().sort({ createdAt: 1 }).lean();
  const porNombre = new Map<string, any[]>();
  contratos.forEach((c: any) => {
    if (!porNombre.has(c.name)) porNombre.set(c.name, []);
    porNombre.get(c.name)!.push(c);
  });

  const duplicados = [...porNombre.entries()].filter(([, l]) => l.length > 1);
  if (duplicados.length === 0) {
    console.log("Sin duplicados, nada para hacer.");
    await mongoose.disconnect();
    return;
  }

  let borrados = 0;
  let reasignadas = 0;

  for (const [nombre, lista] of duplicados) {
    const conConteo = await Promise.all(lista.map(async (c: any) => ({ c, n: await ContratoFrame.countDocuments({ contratoId: c._id }) })));
    conConteo.sort((a, b) => b.n - a.n || new Date(a.c.createdAt).getTime() - new Date(b.c.createdAt).getTime());
    const [ganador, ...perdedores] = conConteo;

    for (const p of perdedores) {
      if (p.n > 0) {
        const res = await ContratoFrame.updateMany({ contratoId: p.c._id }, { $set: { contratoId: ganador.c._id } });
        reasignadas += res.modifiedCount;
        console.log(`"${nombre}": reasignadas ${res.modifiedCount} plantilla(s) de ${p.c._id} → ${ganador.c._id}`);
      }
      await Contrato.deleteOne({ _id: p.c._id });
      borrados++;
      console.log(`"${nombre}": borrado duplicado ${p.c._id}`);
    }
  }

  console.log(`\nListo: ${borrados} Contrato duplicados borrados, ${reasignadas} plantilla(s) reasignadas.`);

  const totalFinal = await Contrato.countDocuments();
  console.log(`Contratos totales ahora: ${totalFinal}`);

  await mongoose.disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
