import mongoose from "mongoose";

/**
 * Hace ÚNICO el índice `{ convenio, codigoArca }` de `categorias` (parcial: activas con código).
 *
 * Antes verifica que no haya duplicados: si los hay, los lista y no toca nada. Reemplaza el índice
 * común que tenía la misma clave (dos índices con la misma clave y distintas opciones no conviven).
 *
 * Uso (desde server/): npm run categorias:indice-unico:dry  /  npm run categorias:indice-unico
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const NOMBRE = "convenio_codigoArca_unico";
const FILTRO = { isActive: true, codigoArca: { $gt: "" } };

async function run() {
  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const col = mongoose.connection.db!.collection("categorias");
  const dups = await col
    .aggregate([{ $match: FILTRO }, { $group: { _id: { convenio: "$convenio", codigoArca: "$codigoArca" }, n: { $sum: 1 }, nombres: { $push: "$nombre" } } }, { $match: { n: { $gt: 1 } } }])
    .toArray();
  if (dups.length) {
    console.log("✋ Hay códigos repetidos entre categorías activas. No se crea el índice:");
    for (const d of dups) console.log(`   ${d._id.convenio} ${d._id.codigoArca}: ${d.nombres.join(" + ")}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const indices = await col.indexes();
  const viejo = indices.find((i) => JSON.stringify(i.key) === JSON.stringify({ convenio: 1, codigoArca: 1 }) && i.name !== NOMBRE);
  const yaEsta = indices.some((i) => i.name === NOMBRE);
  console.log(`Sin duplicados. Índice viejo: ${viejo?.name || "—"} · único ya creado: ${yaEsta ? "sí" : "no"}${DRY_RUN ? "  [DRY RUN]" : ""}`);
  if (!DRY_RUN && !yaEsta) {
    if (viejo?.name) await col.dropIndex(viejo.name);
    await col.createIndex({ convenio: 1, codigoArca: 1 }, { unique: true, name: NOMBRE, partialFilterExpression: FILTRO });
    console.log("✓ Índice único creado.");
  }
  await mongoose.disconnect();
}
run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
