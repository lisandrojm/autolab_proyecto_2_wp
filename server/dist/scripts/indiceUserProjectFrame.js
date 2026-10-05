/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ÍNDICE ÚNICO (proyecto FRAME, empleado FRAME) DE `users_&_projects` PASA A SER PARCIAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run indice:userproject-frame              # dice qué haría
 *   npm run indice:userproject-frame -- --aplicar # lo hace
 *
 * ── Por qué ──
 *
 * El índice era `{ unique: true, sparse: true }` sobre dos campos. En un índice compuesto `sparse`
 * indexa el documento si tiene CUALQUIERA de los dos: una asignación de alguien sin legajo en FRAME
 * (entró por una solicitud) en el proyecto 705 quedaba como (705, null), y la segunda persona así en
 * ese proyecto no se podía guardar: «E11000 duplicate key … { externalProjectId: 705,
 * externalEmployeeId: null }» al cargar el contrato desde la solicitud.
 *
 * El nuevo (`frame_proyecto_empleado_unico`, ver models/UserProject.ts) sólo mira pares reales (> 0).
 *
 * ── Por qué a mano ──
 *
 * Mongoose crea el nuevo al arrancar, pero no borra el viejo: mientras siga puesto, el error sigue.
 * Se crea el nuevo ANTES de borrar el viejo, así la unicidad de los pares reales no se suelta nunca.
 */
import mongoose from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { INDICE_PAR_FRAME } from "../models/UserProject.js";
const VIEJO = "externalProjectId_1_externalEmployeeId_1";
const CLAVE = { externalProjectId: 1, externalEmployeeId: 1 };
const FILTRO = { externalProjectId: { $gt: 0 }, externalEmployeeId: { $gt: 0 } };
async function main() {
    const aplicar = process.argv.includes("--aplicar");
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const col = mongoose.connection.db.collection("users_&_projects");
    console.log(`Base: ${mongoose.connection.db.databaseName}${aplicar ? "" : "   (simulación: no se escribe nada)"}\n`);
    const indices = await col.indexes();
    for (const i of indices)
        console.log(`   ${i.name}${i.unique ? "  (unique)" : ""}${i.sparse ? "  (sparse)" : ""}${i.partialFilterExpression ? "  (parcial)" : ""}`);
    const tieneViejo = indices.some((i) => i.name === VIEJO);
    const tieneNuevo = indices.some((i) => i.name === INDICE_PAR_FRAME);
    // Las que el índice viejo trataba como pares de FRAME sin serlo: son las que chocaban.
    const sinLegajo = await col.countDocuments({ externalProjectId: { $exists: true }, $nor: [FILTRO] });
    console.log(`\nAsignaciones sin par FRAME real (null/0/sin legajo): ${sinLegajo}`);
    console.log(`\nQué hay que hacer:`);
    console.log(`   ${tieneNuevo ? `el índice parcial "${INDICE_PAR_FRAME}" ya está` : `crear el índice parcial "${INDICE_PAR_FRAME}"`}`);
    console.log(`   ${tieneViejo ? `borrar el índice viejo "${VIEJO}"` : "el índice viejo ya no está"}`);
    if (!aplicar) {
        console.log("\nNada se escribió. Con --aplicar se hace.");
        await mongoose.disconnect();
        return;
    }
    if (!tieneNuevo) {
        await col.createIndex(CLAVE, { unique: true, name: INDICE_PAR_FRAME, partialFilterExpression: FILTRO });
        console.log(`\nCreado "${INDICE_PAR_FRAME}"`);
    }
    if (tieneViejo) {
        await col.dropIndex(VIEJO);
        console.log(`Borrado "${VIEJO}"`);
    }
    console.log(`\nListo. Índices ahora:`);
    for (const i of await col.indexes())
        console.log(`   ${i.name}${i.unique ? "  (unique)" : ""}${i.partialFilterExpression ? "  (parcial)" : ""}`);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
