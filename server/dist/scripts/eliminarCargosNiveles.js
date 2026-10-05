import mongoose from "mongoose";
/**
 * Saca Cargos y Niveles de la base.
 *
 * POR QUÉ. Se decidió que la aplicación no los usa. El ABM, las rutas, los modelos y las referencias
 * ya salieron del código; esto es lo que queda del lado de los datos.
 *
 * QUÉ TOCA, y por qué es poco: el inventario previo dio 0 de 843 `users_&_projects` con
 * positionId/levelId (ni en la raíz ni dentro de `contracts[]`), 0 reglas de solapamiento acotadas
 * por cargo o nivel, y solo 2 de 1566 usuarios con el campo en la raíz —los dos de la semilla—.
 * Las colecciones `positions` (3) y `levels` (13) también son semilla.
 *
 *     npm run cargos-niveles:eliminar:dry     (no escribe: lista lo que haría)
 *     npm run cargos-niveles:eliminar
 *
 * `nombre_cargo` / `nombre_nivel` (los strings denormalizados dentro de cada contrato) TAMBIÉN se
 * borran: 6749 contratos no los tenían y 31 decían literalmente "Sin cargo" / "Sin nivel".
 */
const DRY_RUN = process.env.DRY_RUN === "true";
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    const existentes = (await db.listCollections().toArray()).map((c) => c.name);
    // 1. Campos sueltos en documentos de otras colecciones.
    const limpiezas = [
        { col: "users", filtro: { $or: [{ positionId: { $exists: true } }, { levelId: { $exists: true } }] }, unset: { positionId: "", levelId: "" } },
        { col: "users_&_projects", filtro: { $or: [{ positionId: { $exists: true } }, { levelId: { $exists: true } }] }, unset: { positionId: "", levelId: "" } },
        { col: "users_&_projects", filtro: { $or: [{ "contracts.positionId": { $exists: true } }, { "contracts.levelId": { $exists: true } }, { "contracts.nombre_cargo": { $exists: true } }, { "contracts.nombre_nivel": { $exists: true } }] },
            unset: { "contracts.$[].positionId": "", "contracts.$[].levelId": "", "contracts.$[].nombre_cargo": "", "contracts.$[].nombre_nivel": "" } },
        { col: "vacations_configs", filtro: { $or: [{ "overlaps.positionId": { $exists: true } }, { "overlaps.levelId": { $exists: true } }] },
            unset: { "overlaps.$[].positionId": "", "overlaps.$[].levelId": "" } },
    ];
    for (const { col, filtro, unset } of limpiezas) {
        if (!existentes.includes(col)) {
            console.log(`· ${col}: no existe, se saltea`);
            continue;
        }
        const n = await db.collection(col).countDocuments(filtro);
        const campos = Object.keys(unset).join(", ");
        if (n === 0) {
            console.log(`· ${col}: 0 doc(s) con ${campos} — nada que hacer`);
            continue;
        }
        if (DRY_RUN) {
            console.log(`· ${col}: ${n} doc(s) perderían ${campos}`);
            continue;
        }
        const r = await db.collection(col).updateMany(filtro, { $unset: unset });
        console.log(`· ${col}: ${r.modifiedCount} doc(s) actualizados (${campos})`);
    }
    // 2. Las colecciones propias.
    for (const col of ["positions", "levels"]) {
        if (!existentes.includes(col)) {
            console.log(`· colección ${col}: no existe`);
            continue;
        }
        const n = await db.collection(col).countDocuments();
        if (DRY_RUN) {
            console.log(`· colección ${col}: se eliminaría con sus ${n} doc(s)`);
            continue;
        }
        await db.collection(col).drop();
        console.log(`· colección ${col}: eliminada (tenía ${n} doc(s))`);
    }
    // 3. El permiso, de todos los roles que lo tengan.
    const permisos = ["admin_positions:view", "admin_levels:view", "config_positions:view", "config_levels:view"];
    const nRoles = await db.collection("roles").countDocuments({ permissions: { $in: permisos } });
    if (nRoles === 0)
        console.log(`· roles: ninguno tiene ${permisos.join(" / ")}`);
    else if (DRY_RUN)
        console.log(`· roles: ${nRoles} rol(es) perderían ${permisos.join(" / ")}`);
    else {
        const r = await db.collection("roles").updateMany({ permissions: { $in: permisos } }, { $pull: { permissions: { $in: permisos } } });
        console.log(`· roles: ${r.modifiedCount} rol(es) actualizados`);
    }
    console.log(DRY_RUN ? "\nDRY RUN: no se escribió nada.\n" : "\nListo.\n");
    await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
