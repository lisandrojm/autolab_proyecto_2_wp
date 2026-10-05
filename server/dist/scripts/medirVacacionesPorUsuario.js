/**
 * Qué cuesta `GET /vacations/users-balance`. SÓLO LECTURA.
 *
 *   npx tsx src/scripts/medirVacacionesPorUsuario.ts <tenantId>
 *
 * Esa pantalla trae todos los usuarios del tenant con sus vínculos a proyectos POBLADOS ENTEROS, o
 * sea con todos sus contratos, para mostrar tres cosas: el rol empresa, el tipo del contrato que rige
 * y el período. Acá se mide eso y lo que costaría trayendo sólo los campos que se leen.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import "../models/Project.js";
void UserProject; // El import se elide si no se usa, y entonces el modelo no queda registrado.
const kb = (x) => Buffer.byteLength(JSON.stringify(x ?? null)) / 1024;
/** Lo único que la pantalla lee de cada vínculo y de cada contrato. */
const CAMPOS = "projectId nombre_rol_frame rol_frame_id contracts.fecha_alta_contrato contracts.fecha_baja_contrato contracts.fecha_carga contracts.nombre_contrato contracts.tipo_contrato contracts.nombre_rol_frame";
async function main() {
    const tenantId = new Types.ObjectId(process.argv[2]);
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    await User.findOne({}).select("_id").lean();
    const cuantos = await User.countDocuments({ tenantId, isSystem: { $ne: true } });
    console.log(`Usuarios del tenant (no sistema): ${cuantos}\n`);
    const base = () => User.find({ tenantId, isSystem: { $ne: true } }).select("firstName lastName email hireDate extraVacationDays carryOverVacationDays metadata projectIds");
    // COMO QUEDA: los usuarios sin vínculos + una consulta liviana con los contratos recortados.
    let t = Date.now();
    const usuarios = await User.find({ tenantId, isSystem: { $ne: true } })
        .select("firstName lastName email hireDate extraVacationDays carryOverVacationDays metadata.activo projectIds")
        .lean();
    const msUsuarios = Date.now() - t;
    t = Date.now();
    const vinculos = await UserProject.aggregate([
        { $match: { userId: { $in: usuarios.map((u) => u._id) } } },
        {
            $project: {
                _id: 0, userId: 1, nombre_rol_frame: 1, rol_frame_id: 1,
                contracts: { $map: { input: { $ifNull: ["$contracts", []] }, as: "c", in: { fecha_alta_contrato: "$$c.fecha_alta_contrato", fecha_baja_contrato: "$$c.fecha_baja_contrato", nombre_rol_frame: "$$c.nombre_rol_frame" } } },
            },
        },
    ]);
    const msVinculos = Date.now() - t;
    const contratos = vinculos.reduce((n, v) => n + (v.contracts?.length || 0), 0);
    console.log(`COMO QUEDA  usuarios       ${String(msUsuarios).padStart(6)} ms  ${kb(usuarios).toFixed(1).padStart(9)} KB   ${usuarios.length} usuarios`);
    console.log(`            vínculos       ${String(msVinculos).padStart(6)} ms  ${kb(vinculos).toFixed(1).padStart(9)} KB   ${contratos} contratos recortados`);
    console.log(`            TOTAL          ${String(msUsuarios + msVinculos).padStart(6)} ms  ${(kb(usuarios) + kb(vinculos)).toFixed(1).padStart(9)} KB`);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error("FALLÓ:", e.message);
    process.exit(1);
});
