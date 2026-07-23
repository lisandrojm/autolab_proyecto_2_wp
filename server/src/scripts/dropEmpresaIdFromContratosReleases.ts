import mongoose from "mongoose";

/**
 * Elimina el campo residual `empresaId` de las colecciones `contratos-frame` y `release`.
 *
 * La empresa dejó de estar tagueada en cada contrato/release: ahora se setea por proyecto
 * (`projects.contratoEmpresa` / `projects.releaseEmpresa`) y se resuelve al descargar el .docx.
 * Este script limpia los documentos que quedaron con el campo viejo.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/dropEmpresaIdFromContratosReleases.ts
 *   (sin DRY_RUN=true escribe de verdad)
 */

const COLLECTIONS = ["contratos-frame", "release"];
const DRY_RUN = process.env.DRY_RUN === "true";

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  for (const name of COLLECTIONS) {
    if (!existing.includes(name)) {
      console.log(`- ${name}: la colección no existe, se saltea.`);
      continue;
    }
    const filter = { empresaId: { $exists: true } };
    const total = await db.collection(name).countDocuments({});
    const conCampo = await db.collection(name).countDocuments(filter);

    if (DRY_RUN) {
      console.log(`- ${name}: ${conCampo} de ${total} documentos tienen empresaId (se eliminarían).`);
      continue;
    }

    const res = await db.collection(name).updateMany(filter, { $unset: { empresaId: "" } });
    const restantes = await db.collection(name).countDocuments(filter);
    console.log(`- ${name}: ${conCampo} tenían empresaId → modificados ${res.modifiedCount}. Restantes con el campo: ${restantes}.`);
  }

  await mongoose.disconnect();
  console.log("\nListo.\n");
}

run().catch(async (err) => {
  console.error("Error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
