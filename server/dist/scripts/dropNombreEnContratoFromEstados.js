import mongoose from "mongoose";
/**
 * Elimina el campo residual `data.nombreEnContrato` de los Estados (`infos` con type
 * "estado-empleado"). El campo se sacó de la UI: el badge de Estado ahora siempre muestra el
 * nombre real del estado, sin alias. Este script limpia los documentos que quedaron con el
 * campo viejo en la base.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/dropNombreEnContratoFromEstados.ts
 *   (sin DRY_RUN=true escribe de verdad)
 */
const COLLECTION = "infos";
const DRY_RUN = process.env.DRY_RUN === "true";
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("No se pudo establecer la conexión");
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    const existing = (await db.listCollections().toArray()).map((c) => c.name);
    if (!existing.includes(COLLECTION)) {
        console.log(`- ${COLLECTION}: la colección no existe, se saltea.`);
        await mongoose.disconnect();
        return;
    }
    const filter = { type: "estado-empleado", "data.nombreEnContrato": { $exists: true } };
    const conCampo = await db.collection(COLLECTION).countDocuments(filter);
    if (DRY_RUN) {
        console.log(`- ${COLLECTION}: ${conCampo} estado(s) tienen data.nombreEnContrato (se eliminaría).`);
    }
    else {
        const res = await db.collection(COLLECTION).updateMany(filter, { $unset: { "data.nombreEnContrato": "" } });
        const restantes = await db.collection(COLLECTION).countDocuments(filter);
        console.log(`- ${COLLECTION}: ${conCampo} tenían data.nombreEnContrato → modificados ${res.modifiedCount}. Restantes con el campo: ${restantes}.`);
    }
    await mongoose.disconnect();
    console.log("\nListo.\n");
}
run().catch(async (err) => {
    console.error("Error:", err);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
