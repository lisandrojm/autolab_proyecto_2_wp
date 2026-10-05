/**
 * DIAGNÓSTICO, SÓLO LECTURA: en qué estado está cada contrato que nació de una solicitud aprobada
 * (`contracts.solicitudId`), para ver cuántos se fueron de la bandeja de ARCA sin pasar por el alta.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagContratosNacidosDeSolicitud.ts <tenantId> [desdeYYYY-MM-DD]
 *
 * No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";
const [tenantId, desde] = process.argv.slice(2);
if (!tenantId || !Types.ObjectId.isValid(tenantId)) {
    console.error("Uso: <tenantId> [desdeYYYY-MM-DD]");
    process.exit(1);
}
const dia = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || "").slice(0, 10));
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const proyectos = await Project.find({ tenantId: new Types.ObjectId(tenantId) }).select("_id name").lean();
    const nombreProyecto = new Map(proyectos.map((p) => [String(p._id), p.name]));
    const ups = await UserProject.find({ projectId: { $in: proyectos.map((p) => p._id) }, contracts: { $elemMatch: { solicitudId: { $exists: true, $ne: null } } } })
        .select("userId projectId contracts.solicitudId contracts.estado_id contracts.nombre_estado_empleado contracts.fecha_carga contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.nombre_contrato contracts.obraSocialId contracts.obraSocialOrigen")
        .lean();
    const users = await User.find({ _id: { $in: ups.map((u) => u.userId) } }).select("firstName lastName email").lean();
    const nombre = new Map(users.map((u) => [String(u._id), `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email]));
    const porEstado = new Map();
    const filas = [];
    for (const up of ups) {
        (up.contracts || []).forEach((c, i) => {
            if (!c.solicitudId)
                return;
            if (desde && dia(c.fecha_carga) < desde)
                return;
            const estado = c.nombre_estado_empleado || "(sin estado)";
            porEstado.set(estado, (porEstado.get(estado) || 0) + 1);
            filas.push(`  ${dia(c.fecha_carga)}  ${estado.padEnd(24)} ${String(nombre.get(String(up.userId)) || up.userId).padEnd(32)} ${String(nombreProyecto.get(String(up.projectId)) || "").padEnd(12)} ${dia(c.fecha_alta_contrato)}→${dia(c.fecha_baja_contrato)}  ${c.nombre_contrato || ""}  OS=${c.obraSocialId ?? "-"}/${c.obraSocialOrigen || "-"}  ref=${up._id}:${i}`);
        });
    }
    filas.sort();
    console.log(`\nContratos nacidos de una solicitud${desde ? ` cargados desde ${desde}` : ""}: ${filas.length}`);
    for (const [estado, n] of [...porEstado.entries()].sort((a, b) => b[1] - a[1]))
        console.log(`  ${String(n).padStart(4)}  ${estado}`);
    console.log("\n  carga       estado                   persona                          proyecto     período                 contrato  obra social  ref (UserProject:índice)");
    for (const f of filas)
        console.log(f);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
