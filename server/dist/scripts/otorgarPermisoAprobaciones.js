import mongoose from "mongoose";
import { MOBILE_APPROVALS, PROJECT_COORDINATOR, PROJECT_SUPERVISOR } from "../utils/permisosMobile.js";
/**
 * Le da `mobile_approvals:view` («Aprobaciones» en la app, 15/11/2026) a los roles que aprueban vacaciones:
 * los que supervisan áreas y turnos (rol Supervisor, capacidad `project_coordinator:eligible`) y los
 * coordinadores de proyecto (rol Coordinador, capacidad `project_supervisor:eligible`). Los nombres de las
 * capacidades están cruzados con los de los roles: ver `utils/permisosMobile.ts`.
 *
 * Mismo modelo que `otorgarPermisoRolesEmpresa.ts`: el arranque del server no les suma permisos a los roles
 * que existen, así que un permiso nuevo llega con un script aditivo, con dry run, corrido a propósito.
 * `$addToSet`: no saca nada ni toca roles sin esas capacidades. Después se puede destildar desde
 * Usuarios › Roles › App Mobile.
 *
 *     npm run aprobaciones:permiso:dry
 *     npm run aprobaciones:permiso
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
    const filtro = { permissions: { $in: [PROJECT_COORDINATOR, PROJECT_SUPERVISOR] }, $nor: [{ permissions: MOBILE_APPROVALS }] };
    const candidatos = await db.collection("roles").find(filtro, { projection: { name: 1 } }).toArray();
    if (candidatos.length === 0)
        console.log("Ningún rol necesita el permiso: o ya lo tienen, o no supervisan ni coordinan.");
    else if (DRY_RUN)
        console.log(`Recibirían ${MOBILE_APPROVALS}: ${candidatos.map((r) => r.name).join(", ")}`);
    else {
        const r = await db.collection("roles").updateMany(filtro, { $addToSet: { permissions: MOBILE_APPROVALS } });
        console.log(`${MOBILE_APPROVALS} agregado a ${r.modifiedCount} rol(es): ${candidatos.map((r2) => r2.name).join(", ")}`);
    }
    console.log(DRY_RUN ? "\nDRY RUN: no se escribió nada.\n" : "\nListo. Quienes tengan esos roles ven «Aprobaciones» al volver a entrar a la app.\n");
    await mongoose.disconnect();
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
