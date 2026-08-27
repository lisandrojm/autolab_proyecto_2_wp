import mongoose from "mongoose";

/**
 * Le asigna `legacyId` a las categorías que no lo tienen.
 *
 * POR QUÉ HACE FALTA
 * ──────────────────
 * El contrato guarda la categoría en `contracts.categoria_sat_id`, que es un NÚMERO: el `legacyId`.
 * Las categorías creadas en el ABM nuevo (Configuración → ARCA → Categorías) nacen sin ese campo
 * —`Categoria.create()` nunca lo asignó— y el resultado es que NO SE PUEDEN ELEGIR en ningún lado:
 * ni en el wizard del miembro ni en «Datos ARCA». El selector las lista, se las clickea, y no pasa
 * nada, porque no hay número que guardar.
 *
 * Medido en producción al escribir esto: 335 categorías, **226 sin `legacyId`** — entre ellas las 218
 * del convenio 0131/75 y las 4 de 0102/90. Es decir, dos tercios del catálogo eran inelegibles.
 *
 * DE DÓNDE SALE EL NÚMERO NUEVO
 * ─────────────────────────────
 * `max + 1`, mirando LAS DOS colecciones: `categorias` (modelo nuevo) y `categorias-sat` (la tabla
 * vieja, que todavía se sirve como fallback en `utils/categoriaCompat.ts`). Mirar solo una dejaría
 * dos categorías distintas con el mismo id, y la resolución por `legacyId` pasaría a ser ambigua —
 * con el detalle de que la ambigüedad se manifestaría como un sueldo equivocado en un contrato.
 *
 * Es IDEMPOTENTE: solo toca las que no tienen id. Correrlo dos veces no cambia nada.
 *
 *     npm run categorias:legacy-id:dry     (no escribe)
 *     npm run categorias:legacy-id
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

  const colCategorias = db.collection("categorias");
  const colViejas = db.collection("categorias-sat");

  const sinId = await colCategorias.find({ $or: [{ legacyId: { $exists: false } }, { legacyId: null }] }).project({ convenio: 1, codigoArca: 1, nombre: 1 }).toArray();
  if (sinId.length === 0) {
    console.log("Todas las categorías ya tienen legacyId. No hay nada que hacer.");
    await mongoose.disconnect();
    return;
  }

  const maxNuevo = await colCategorias.find({ legacyId: { $ne: null } }).sort({ legacyId: -1 }).limit(1).toArray();
  const maxViejo = await colViejas.find({ "data.id": { $ne: null } }).sort({ "data.id": -1 }).limit(1).toArray();
  let proximo = Math.max(Number(maxNuevo[0]?.legacyId || 0), Number((maxViejo[0] as any)?.data?.id || 0)) + 1;

  console.log(`Sin legacyId: ${sinId.length}`);
  console.log(`Se numeran desde ${proximo} (max en categorias: ${maxNuevo[0]?.legacyId ?? 0} · max en categorias-sat: ${(maxViejo[0] as any)?.data?.id ?? 0})\n`);

  const porConvenio = new Map<string, number>();
  const ops = sinId.map((c: any) => {
    const id = proximo++;
    porConvenio.set(c.convenio || "(sin convenio)", (porConvenio.get(c.convenio || "(sin convenio)") || 0) + 1);
    return { updateOne: { filter: { _id: c._id }, update: { $set: { legacyId: id } } } };
  });

  for (const [convenio, cuantas] of [...porConvenio.entries()].sort()) console.log(`  ${convenio}  →  ${cuantas}`);
  console.log("\nPrimeras 5:");
  sinId.slice(0, 5).forEach((c: any, i) => console.log(`  legacyId ${Number(maxNuevo[0]?.legacyId || 0) + 1 + i}  ${c.convenio}  ${c.codigoArca}  ${c.nombre}`));

  if (DRY_RUN) {
    console.log(`\nDRY RUN terminado: ${ops.length} se numerarían. No se escribió nada.`);
  } else {
    const res = await colCategorias.bulkWrite(ops);
    console.log(`\n${res.modifiedCount} categoría(s) numerada(s). Ahora se pueden elegir en el wizard y en Datos ARCA.`);
  }

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error("\n✖", e.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
