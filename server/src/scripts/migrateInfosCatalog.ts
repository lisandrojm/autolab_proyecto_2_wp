import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";

/**
 * Migra un catálogo desde la colección `infos` (filtrando por `type`)
 * hacia su nueva colección dedicada.
 *
 * El documento origen en `infos` ya tiene la forma esperada por los modelos
 * nuevos: { externalId, name, type, data: { id, nombre, ... } }. Este script
 * copia tal cual `externalId`, `name` y `data` a la colección destino.
 *
 * Es idempotente: hace upsert por `externalId` (o por `name` si no hay externalId),
 * por lo que se puede ejecutar varias veces sin duplicar.
 *
 * Uso (vía cross-env / dotenv -v o variables de entorno):
 *   TYPE=obra-social  TARGET=obras-sociales  npx tsx src/scripts/migrateInfosCatalog.ts
 *
 * Mapeos conocidos:
 *   obra-social  → obras-sociales
 *   banco        → bancos
 *   centro-costo → centros-costo
 *   contrato     → contratos-frame
 *
 * Agregar DRY_RUN=true para sólo previsualizar sin escribir.
 */

const MAPPING: Record<string, string> = {
  "obra-social": "obras-sociales",
  banco: "bancos",
  "centro-costo": "centros-costo",
  contrato: "contratos-frame",
};

async function run() {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.production"), override: true });
  const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/we_produ";
  const dbName = process.env.MONGO_DB_NAME || "weprodu_production_integration";
  const dryRun = String(process.env.DRY_RUN || "").toLowerCase() === "true";

  const type = process.env.TYPE;
  if (!type) throw new Error("Falta la variable TYPE (ej: TYPE=obra-social)");
  const target = process.env.TARGET || MAPPING[type];
  if (!target) throw new Error(`No hay colección destino para TYPE="${type}". Pasá TARGET=...`);

  await mongoose.connect(uri, { dbName });
  console.log(`Conectado a MongoDB → db: ${dbName}${dryRun ? "  [DRY RUN]" : ""}`);
  console.log(`Migrando infos(type="${type}")  →  colección "${target}"\n`);

  const db = mongoose.connection.db;
  if (!db) throw new Error("DB connection not established");

  const sourceDocs = await db.collection("infos").find({ type }).sort({ name: 1 }).toArray();
  console.log(`Encontrados ${sourceDocs.length} documentos en 'infos' con type: "${type}".`);
  if (sourceDocs.length === 0) {
    console.log("Nada que migrar.");
    return;
  }

  const now = new Date();
  const bulkOps = sourceDocs.map((doc: any) => {
    const externalId = doc.externalId ? String(doc.externalId).trim() : "";
    const name = String(doc.name ?? doc.data?.nombre ?? "").trim();
    const data = doc.data ?? {};
    return {
      updateOne: {
        filter: externalId ? { externalId } : { name },
        update: {
          $set: { externalId, name, data, updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        upsert: true,
      },
    };
  });

  if (dryRun) {
    for (const op of bulkOps.slice(0, 20)) {
      const u = op.updateOne.update.$set;
      console.log(`  • externalId=${u.externalId || "(vacío)"}  "${u.name}"`);
    }
    if (bulkOps.length > 20) console.log(`  … y ${bulkOps.length - 20} más`);
    console.log("\n[DRY RUN] No se escribió nada. Quitá DRY_RUN para aplicar.");
    return;
  }

  const result = await db.collection(target).bulkWrite(bulkOps);
  const upserted = result.upsertedCount || 0;
  const modified = result.modifiedCount || 0;
  const matched = result.matchedCount || 0;
  console.log(
    `\nMigración completa → insertados: ${upserted}, actualizados: ${modified}, ya existentes sin cambios: ${matched - modified}.`
  );
  const total = await db.collection(target).countDocuments();
  console.log(`Total de documentos ahora en '${target}': ${total}.`);
}

run()
  .catch((err) => {
    console.error("Migración fallida:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    console.log("Desconectado de MongoDB.");
  });
