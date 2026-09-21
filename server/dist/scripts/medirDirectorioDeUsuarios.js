/**
 * Qué cuesta `GET /users/directory` y dónde están sus bytes. SÓLO LECTURA.
 *
 *   npx tsx src/scripts/medirDirectorioDeUsuarios.ts <tenantId>
 *
 * El directorio es lo que hace lenta a la pantalla de Novedades: se pide al montar y la tabla no
 * dibuja nada hasta que llega. Acá se mide lo que viaja hoy, cuánto de eso es el historial de
 * contratos, y cuánto costaría mandar por vínculo SÓLO el contrato que rige.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import UserProject from "../models/UserProject.js";
import "../models/Project.js";
import { contratosQueRigenDeLasPersonas } from "../utils/contratosQueRigen.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
const kb = (x) => Buffer.byteLength(JSON.stringify(x ?? null)) / 1024;
const SELECT_HOY = "projectId areaId nombre_proyecto nombre_rol_frame " +
    "contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.fecha_carga " +
    "contracts.hora_inicio contracts.hora_fin contracts.areaId contracts.shiftId contracts.areaShiftAssignments " +
    "contracts.nombre_contrato contracts.tipo_contrato_id";
async function main() {
    const tenantId = process.argv[2];
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    await User.findOne({}).select("_id").lean();
    const filter = { tenantId: new Types.ObjectId(tenantId), "metadata.activo": true };
    console.log(`Usuarios activos del tenant: ${await User.countDocuments(filter)}`);
    console.log(`Vínculos usuario-proyecto:   ${await UserProject.countDocuments({})}`);
    const contratos = await UserProject.aggregate([{ $group: { _id: null, n: { $sum: { $size: { $ifNull: ["$contracts", []] } } } } }]);
    console.log(`Contratos en total:          ${contratos[0]?.n ?? 0}\n`);
    /* ── 1. Como está hoy ── */
    let t = Date.now();
    const hoy = await User.find(filter)
        .select("firstName lastName email projectIds roles metadata.activo metadata.id metadata.fullName metadata.projects")
        .populate({ path: "roles", select: "name permissions", model: Role })
        .populate("projectIds", "name")
        .populate({ path: "metadata.projects", model: UserProject, select: SELECT_HOY })
        .sort({ firstName: 1, lastName: 1 })
        .lean();
    const msHoy = Date.now() - t;
    console.log(`COMO ESTÁ HOY                      ${String(msHoy).padStart(6)} ms  ${kb(hoy).toFixed(1).padStart(9)} KB   ${hoy.length} usuarios`);
    /* ── 2. Dónde están esos bytes ── */
    let kbContratos = 0;
    let kbVinculosSinContratos = 0;
    let kbRoles = 0;
    let kbProjectIds = 0;
    let nContratos = 0;
    for (const u of hoy) {
        kbRoles += kb(u.roles);
        kbProjectIds += kb(u.projectIds);
        for (const up of u.metadata?.projects || []) {
            const { contracts, ...resto } = up;
            kbContratos += kb(contracts);
            kbVinculosSinContratos += kb(resto);
            nContratos += (contracts || []).length;
        }
    }
    const total = kb(hoy);
    const pct = (x) => `${((x / total) * 100).toFixed(0)}%`;
    console.log(`   historial de contratos          ${kbContratos.toFixed(1).padStart(9)} KB  ${pct(kbContratos).padStart(4)}   ${nContratos} contratos`);
    console.log(`   vínculos (sin contratos)        ${kbVinculosSinContratos.toFixed(1).padStart(9)} KB  ${pct(kbVinculosSinContratos).padStart(4)}`);
    console.log(`   roles poblados                  ${kbRoles.toFixed(1).padStart(9)} KB  ${pct(kbRoles).padStart(4)}`);
    console.log(`   projectIds poblados             ${kbProjectIds.toFixed(1).padStart(9)} KB  ${pct(kbProjectIds).padStart(4)}`);
    const resto = total - kbContratos - kbVinculosSinContratos - kbRoles - kbProjectIds;
    console.log(`   resto (nombre, mail, metadata)  ${resto.toFixed(1).padStart(9)} KB  ${pct(resto).padStart(4)}\n`);
    /* ── 3. Sin el historial: el vínculo pelado ── */
    t = Date.now();
    const pelado = await User.find(filter)
        .select("firstName lastName email projectIds roles metadata.activo metadata.id metadata.fullName metadata.projects")
        .populate({ path: "roles", select: "name permissions", model: Role })
        .populate("projectIds", "name")
        .populate({ path: "metadata.projects", model: UserProject, select: "projectId areaId shiftId nombre_proyecto nombre_rol_frame" })
        .sort({ firstName: 1, lastName: 1 })
        .lean();
    console.log(`SIN EL HISTORIAL DE CONTRATOS      ${String(Date.now() - t).padStart(6)} ms  ${kb(pelado).toFixed(1).padStart(9)} KB`);
    /* ── 4. Lo mismo + el contrato que rige, resuelto en Mongo ── */
    t = Date.now();
    const ids = pelado.map((u) => String(u._id));
    const rigen = await contratosQueRigenDeLasPersonas(ids, hoyArgentina(), [
        "hora_inicio",
        "hora_fin",
        "areaId",
        "shiftId",
        "areaShiftAssignments",
        "nombre_contrato",
        "tipo_contrato_id",
        "nombre_estado_empleado",
        "reemplazo",
    ]);
    const msRigen = Date.now() - t;
    console.log(`   + el contrato que rige          ${String(msRigen).padStart(6)} ms  ${kb([...rigen.values()]).toFixed(1).padStart(9)} KB   ${rigen.size} personas con contrato`);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
