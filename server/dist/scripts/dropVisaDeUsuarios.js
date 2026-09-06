import mongoose from "mongoose";
/**
 * Elimina `metadata.visa` de los usuarios.
 *
 * El campo se sacó del producto entero: no lo usaba ningún contrato, ni el TXT de ARCA, ni los PDF.
 * Solo se cargaba en el formulario de usuario, se sincronizaba desde FRAME y se mostraba en la ficha
 * y en Mi Perfil. Quitarlo del schema alcanza para que deje de escribirse —Mongoose descarta lo que
 * no está declarado— pero NO borra lo ya guardado: eso es lo que hace este script.
 *
 * No corre solo ni forma parte del deploy. Se ejecuta a mano, una vez, y primero en DRY_RUN.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/dropVisaDeUsuarios.ts
 *   (sin DRY_RUN=true escribe de verdad)
 */
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
    const col = db.collection("users");
    const filtro = { "metadata.visa": { $exists: true } };
    const total = await col.countDocuments(filtro);
    // El desglose antes de tocar nada: si alguno tuviera `true`, es un dato que alguien cargó a mano y
    // conviene saber cuántos son antes de perderlos.
    const enTrue = await col.countDocuments({ "metadata.visa": true });
    console.log(`Usuarios con el campo presente: ${total}`);
    console.log(`  de esos, en true:             ${enTrue}`);
    console.log(`  de esos, en false/null:       ${total - enTrue}\n`);
    if (total === 0) {
        console.log("No hay nada que limpiar.\n");
        await mongoose.disconnect();
        return;
    }
    if (DRY_RUN) {
        console.log("DRY RUN: no se escribió nada. Sacá DRY_RUN=true para aplicarlo.\n");
        await mongoose.disconnect();
        return;
    }
    const r = await col.updateMany(filtro, { $unset: { "metadata.visa": "" } });
    console.log(`Listo. Documentos modificados: ${r.modifiedCount}\n`);
    await mongoose.disconnect();
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
