/**
 * DIAGNÓSTICO, SÓLO LECTURA: qué obra social tiene guardada cada contrato de una persona, y cómo la ve
 * la pantalla de Solicitudes (que la lee por `contracts.solicitudId`).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagObraSocialSolicitudes.ts "BRIAN EMANUEL CASTRO" "LEONEL ELADIO LOIZZO"
 *
 * No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
const nombres = process.argv.slice(2);
if (nombres.length === 0) {
    console.error("Pasá uno o más nombres entre comillas.");
    process.exit(1);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const dia = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || "").slice(0, 10));
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    for (const nombre of nombres) {
        const partes = nombre.trim().split(/\s+/).map(esc);
        const re = new RegExp(partes.join("\\s+"), "i");
        const docs = await User.find({ $or: [{ "metadata.fullName": re }, { $expr: { $regexMatch: { input: { $concat: ["$firstName", " ", "$lastName"] }, regex: partes.join("\\s+"), options: "i" } } }] })
            .select("_id tenantId firstName lastName email metadata.fullName metadata.isSolicitud metadata.solicitudStatus metadata.solicitudUserId metadata.cuit metadata.startDate metadata.dueDate metadata.projectIds createdAt")
            .lean();
        console.log(`\n══════════ ${nombre} · ${docs.length} documento(s) de User ══════════`);
        const personas = new Set();
        for (const u of docs) {
            const m = u.metadata || {};
            console.log(`  User ${u._id} · tenant ${u.tenantId} · ${u.email}`);
            console.log(`    isSolicitud=${!!m.isSolicitud} estado=${m.solicitudStatus || "-"} solicitudUserId=${m.solicitudUserId || "-"} cuit=${m.cuit || "-"} fechas=${dia(m.startDate)}→${dia(m.dueDate)} creado=${dia(u.createdAt)}`);
            personas.add(String(u._id));
            if (m.solicitudUserId)
                personas.add(String(m.solicitudUserId));
        }
        const ups = await UserProject.find({ userId: { $in: [...personas].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) } })
            .select("userId projectId tenantId contracts")
            .lean();
        for (const up of ups) {
            console.log(`  UserProject ${up._id} · persona ${up.userId} · proyecto ${up.projectId} · ${(up.contracts || []).length} contrato(s)`);
            (up.contracts || []).forEach((c, i) => {
                console.log(`    [${i}] _id=${c._id || "-"} solicitudId=${c.solicitudId || "-"} empresa=${c.empresaContratoId || "-"} (${c.nombre_empresa_contrato || "-"}) alta=${dia(c.fecha_alta_contrato)} baja=${dia(c.fecha_baja_contrato)} contrato=${c.nombre_contrato || "-"}`);
                console.log(`        obraSocialId=${c.obraSocialId ?? "null"} origen=${c.obraSocialOrigen || "-"} noFigura=${!!c.obraSocialNoFigura} constatadaEn=${c.obraSocialConstatadaEn || "-"} constatadaEl=${dia(c.obraSocialConstatadaEl) || "-"} bloqueada=${!!c.obraSocialBloqueada} aplicada=${c.obraSocialAplicadaOrigen || "-"}`);
            });
        }
    }
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
