import mongoose from "mongoose";

/**
 * Migra la empresa del proyecto de campo único a arreglo:
 *   projects.contratoEmpresa  (ObjectId)  →  projects.contratoEmpresas  ([ObjectId])
 *   projects.releaseEmpresa   (ObjectId)  →  projects.releaseEmpresas   ([ObjectId])
 *
 * Un proyecto ahora puede quedar vinculado a varias empresas y se elige cuál usar al descargar
 * el documento. Este script copia el valor viejo dentro del arreglo nuevo (si el arreglo aún no
 * existe) y luego elimina los campos singulares.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/migrateEmpresasToArrays.ts
 *   (sin DRY_RUN=true escribe de verdad)
 */

const DRY_RUN = process.env.DRY_RUN === "true";

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const col = db.collection("projects");
  const cursor = col.find({ $or: [{ contratoEmpresa: { $exists: true } }, { releaseEmpresa: { $exists: true } }] });

  let contratoCopiados = 0;
  let releaseCopiados = 0;
  let procesados = 0;

  for await (const p of cursor) {
    procesados++;
    const set: any = {};

    if (p.contratoEmpresa && !(Array.isArray(p.contratoEmpresas) && p.contratoEmpresas.length)) {
      set.contratoEmpresas = [p.contratoEmpresa];
      contratoCopiados++;
    }
    if (p.releaseEmpresa && !(Array.isArray(p.releaseEmpresas) && p.releaseEmpresas.length)) {
      set.releaseEmpresas = [p.releaseEmpresa];
      releaseCopiados++;
    }

    if (DRY_RUN) continue;

    const update: any = { $unset: { contratoEmpresa: "", releaseEmpresa: "" } };
    if (Object.keys(set).length) update.$set = set;
    await col.updateOne({ _id: p._id }, update);
  }

  console.log(`Proyectos con campo viejo: ${procesados}`);
  console.log(`  contratoEmpresa → contratoEmpresas: ${contratoCopiados}`);
  console.log(`  releaseEmpresa  → releaseEmpresas:  ${releaseCopiados}`);
  if (!DRY_RUN) console.log("  campos singulares eliminados ($unset contratoEmpresa/releaseEmpresa).");

  await mongoose.disconnect();
  console.log("\nListo.\n");
}

run().catch(async (err) => {
  console.error("Error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
