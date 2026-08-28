import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { Categoria } from "../models/Categoria.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";

/**
 * Deshace una corrida de `reconstruirGrupos013175`, leyendo su log.
 *
 * Existe para que «reversible» sea un hecho y no una intención: la reconstrucción BORRA 61 grupos, y
 * un borrado sin vuelta atrás no es algo que se pueda correr con tranquilidad sobre producción. Los
 * grupos se recrean con su `_id` original —no con uno nuevo—, que es lo que permite que las
 * categorías vuelvan a colgar de ellos por el `grupoIdAntes` que quedó guardado.
 *
 *     npm run 013175:revertir:dry -- logs/reconstruccion-013175-....json
 *     npm run 013175:revertir     -- logs/reconstruccion-013175-....json
 *
 * El orden es el inverso al de la migración, y por el mismo motivo del índice único `{convenio,
 * numero}`: primero los 12 se apartan al rango temporal, después se recrean los 61 con sus números
 * originales, y recién entonces los 12 vuelven a 62–73.
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const BASE_TEMPORAL = 900;

async function run() {
  const archivo = process.argv[2];
  if (!archivo) throw new Error("Falta el archivo de log: npm run 013175:revertir -- logs/reconstruccion-013175-....json");

  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  const log = JSON.parse(readFileSync(archivo, "utf8"));
  await mongoose.connect(uri, { dbName });
  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}`);
  console.log(`Log: ${archivo} · convenio ${log.convenio}\n`);
  console.log(`   ${log.gruposRenumerados.length} grupo(s) vuelven a su número original`);
  console.log(`   ${log.gruposEliminados.length} grupo(s) se recrean con su _id y su escala`);
  console.log(`   ${log.categoriasDesactivadas.length} categoría(s) recuperan su grupo y su estado\n`);

  if (DRY_RUN) {
    console.log("DRY RUN terminado. No se escribió nada.\n");
    await mongoose.disconnect();
    return;
  }

  for (const g of log.gruposRenumerados) {
    await ConvenioGrupo.updateOne({ _id: g._id }, { $set: { numero: BASE_TEMPORAL + Number(g.numeroDespues) } });
  }
  console.log(`1. ${log.gruposRenumerados.length} grupo(s) apartados al rango temporal.`);

  let recreados = 0;
  for (const g of log.gruposEliminados) {
    // `upsert` y no `create`: si una reversión anterior quedó a medias, esto es reanudable.
    await ConvenioGrupo.updateOne(
      { _id: g._id },
      {
        $set: {
          convenio: g.convenio,
          numero: g.numero,
          nombre: g.nombre,
          sueldoBasico: g.sueldoBasico,
          sueldoAdicional: g.sueldoAdicional,
          presentismo: g.presentismo,
          sueldoBruto: g.sueldoBruto,
          sueldoBrutoLetras: g.sueldoBrutoLetras,
          neto: g.neto,
          sueldoNetoLetras: g.sueldoNetoLetras,
          ...(g.fechaActualizacion ? { fechaActualizacion: g.fechaActualizacion } : {}),
        },
      },
      { upsert: true }
    );
    recreados++;
  }
  console.log(`2. ${recreados} grupo(s) recreados.`);

  let cats = 0;
  for (const c of log.categoriasDesactivadas) {
    await Categoria.updateOne({ _id: c._id }, { $set: { isActive: c.isActiveAntes !== false, grupoId: c.grupoIdAntes || null } });
    cats++;
  }
  console.log(`3. ${cats} categoría(s) restauradas.`);

  for (const g of log.gruposRenumerados) {
    await ConvenioGrupo.updateOne({ _id: g._id }, { $set: { numero: Number(g.numeroAntes) } });
  }
  console.log(`4. ${log.gruposRenumerados.length} grupo(s) devueltos a su número original.`);

  const gruposFin = await ConvenioGrupo.countDocuments({ convenio: log.convenio });
  const activas = await Categoria.countDocuments({ convenio: log.convenio, isActive: true });
  console.log(`\nEstado: ${gruposFin} grupos · ${activas} categorías activas\n`);

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
