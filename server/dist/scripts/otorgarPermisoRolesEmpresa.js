import mongoose from "mongoose";
/**
 * Le da `admin_roles_empresa:view` a los roles que ya administran roles de plataforma.
 *
 * POR QUÉ HACE FALTA. El permiso es nuevo, y `ensureRole` (roleInitService) solo hace la unión al
 * arrancar el server. Hasta que el VPS reinicie, el ítem "Usuarios → Roles Empresa" no aparece en el
 * menú de nadie. Esto adelanta exactamente lo que haría ese arranque.
 *
 * ES ADITIVO: `$addToSet` sobre los roles que ya tienen `admin_roles:view`. No saca ningún permiso ni
 * toca roles que no administren roles.
 *
 *     npm run roles-empresa:permiso:dry
 *     npm run roles-empresa:permiso
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const PERMISO = "admin_roles_empresa:view";
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    const filtro = { permissions: "admin_roles:view", $nor: [{ permissions: PERMISO }] };
    const candidatos = await db.collection("roles").find(filtro, { projection: { name: 1 } }).toArray();
    if (candidatos.length === 0)
        console.log("Ningún rol necesita el permiso: o ya lo tienen, o no administran roles.");
    else if (DRY_RUN)
        console.log(`Recibirían ${PERMISO}: ${candidatos.map((r) => r.name).join(", ")}`);
    else {
        const r = await db.collection("roles").updateMany(filtro, { $addToSet: { permissions: PERMISO } });
        console.log(`${PERMISO} agregado a ${r.modifiedCount} rol(es): ${candidatos.map((r2) => r2.name).join(", ")}`);
    }
    console.log(DRY_RUN ? "\nDRY RUN: no se escribió nada.\n" : "\nListo.\n");
    await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
