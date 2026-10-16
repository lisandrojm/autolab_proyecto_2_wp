/**
 * DIAGNÓSTICO, SÓLO LECTURA: los proyectos cuyo coordinador (`metadata.responsableId`) no se resuelve a
 * una persona, y por qué. Es lo que hace que la columna «Coordinador» de Proyectos muestre «ID: 27» en
 * vez de un nombre.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagCoordinadorDeProyectos.ts
 *
 * Para cada proyecto sin resolver dice si hay un usuario con ese id: en el tenant del proyecto, con el
 * id guardado como TEXTO, o en OTRO tenant. Si no hay ninguno, la persona ya no existe y hay que elegir
 * otro coordinador editando el proyecto. No escribe nada.
 */
import mongoose from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const proyectos = await Project.find({ "metadata.responsableId": { $exists: true, $ne: null } })
        .select("name tenantId metadata.responsableId")
        .lean();
    let sinResolver = 0;
    for (const p of proyectos) {
        const id = p.metadata?.responsableId;
        const comoNumero = await User.findOne({ tenantId: p.tenantId, "metadata.id": Number(id) }).select("_id").lean();
        if (comoNumero)
            continue;
        sinResolver++;
        const comoTexto = await User.findOne({ tenantId: p.tenantId, "metadata.id": String(id) }).select("firstName lastName").lean();
        const enOtroTenant = await User.findOne({ tenantId: { $ne: p.tenantId }, "metadata.id": { $in: [Number(id), String(id)] } })
            .select("firstName lastName tenantId")
            .lean();
        const motivo = comoTexto
            ? `existe con el id guardado como TEXTO: ${comoTexto.firstName || ""} ${comoTexto.lastName || ""} (se arregla con el último cambio del server)`
            : enOtroTenant
                ? `existe pero en OTRO tenant (${enOtroTenant.tenantId}): ${enOtroTenant.firstName || ""} ${enOtroTenant.lastName || ""}`
                : "no hay ningún usuario con ese id: elegir otro coordinador editando el proyecto";
        console.log(`· ${p.name} — responsableId ${JSON.stringify(id)}: ${motivo}`);
    }
    console.log(`\n${proyectos.length} proyecto(s) con coordinador; ${sinResolver} sin resolver por número.`);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
