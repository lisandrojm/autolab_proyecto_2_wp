import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { ContratoFrame } from "../models/ContratoFrame.js";
/**
 * Migra los contratos existentes desde la colección `infos` (type: "contrato")
 * hacia la nueva colección `contratos-frame`.
 *
 * El documento origen ya tiene la forma esperada:
 *   { externalId, name, type: "contrato", data: { id, nombre, rutaArchivo, cantidadJornadas, multiplicadorDiario } }
 *
 * Es idempotente: hace upsert por `externalId` (o por `name` si no hay externalId),
 * por lo que se puede ejecutar varias veces sin duplicar.
 *
 * Ejecutar:  npx tsx src/scripts/migrateContratosToContratosFrame.ts
 *   (usar -v DRY_RUN=true para sólo listar sin escribir)
 */
const parseNum = (val) => {
    if (val === undefined || val === null || val === "")
        return 0;
    const n = Number(val);
    return isNaN(n) ? 0 : n;
};
async function run() {
    dotenv.config({ path: path.resolve(process.cwd(), ".env.production"), override: true });
    const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/we_produ";
    const dbName = process.env.MONGO_DB_NAME || "weprodu_production_integration";
    const dryRun = String(process.env.DRY_RUN || "").toLowerCase() === "true";
    await mongoose.connect(uri, { dbName });
    console.log(`Conectado a MongoDB → db: ${dbName}${dryRun ? "  [DRY RUN]" : ""}`);
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("DB connection not established");
    const sourceDocs = await db
        .collection("infos")
        .find({ type: "contrato" })
        .sort({ name: 1 })
        .toArray();
    console.log(`Encontrados ${sourceDocs.length} documentos en 'infos' con type: "contrato".`);
    if (sourceDocs.length === 0) {
        console.log("Nada que migrar.");
        return;
    }
    const bulkOps = sourceDocs.map((doc) => {
        const data = doc.data || {};
        const externalId = doc.externalId ? String(doc.externalId).trim() : "";
        const nombre = String(data.nombre ?? doc.name ?? "").trim();
        const idNum = data.id !== undefined && data.id !== null ? Number(data.id) : undefined;
        const update = {
            name: String(doc.name ?? nombre).trim(),
            externalId,
            data: {
                id: idNum !== undefined && !isNaN(idNum) ? idNum : undefined,
                nombre,
                rutaArchivo: String(data.rutaArchivo ?? "").trim(),
                cantidadJornadas: parseNum(data.cantidadJornadas),
                multiplicadorDiario: parseNum(data.multiplicadorDiario),
                /*
                  Se MIGRA aunque el origen no lo tenga.
        
                  `esTiempoIndeterminado` se agregó a la Plantilla después de escribirse esta migración, y los
                  documentos viejos de `infos` no lo traen. `!!undefined` da `false`, que es el mismo default
                  del schema y la misma coerción que usan las rutas (`!!contrato.data?.esTiempoIndeterminado`):
                  los que sí lo tengan conservan su valor y los que no quedan como contratos a plazo.
        
                  Omitirlo no era una opción: `$set` con un `data` sin este campo pisaría el objeto entero y
                  BORRARÍA el flag en cualquier plantilla que ya lo tuviera — la migración es idempotente y
                  está pensada para volver a correrse.
                */
                esTiempoIndeterminado: !!data.esTiempoIndeterminado,
            },
        };
        return {
            updateOne: {
                filter: externalId ? { externalId } : { name: update.name },
                update: { $set: update },
                upsert: true,
            },
        };
    });
    // Vista previa
    for (const op of bulkOps) {
        const u = op.updateOne.update.$set;
        console.log(`  • externalId=${u.externalId || "(vacío)"}  id=${u.data.id ?? "-"}  "${u.name}"  jornadas=${u.data.cantidadJornadas}  mult=${u.data.multiplicadorDiario}${u.data.esTiempoIndeterminado ? "  tiempo-indeterminado" : ""}`);
    }
    if (dryRun) {
        console.log("\n[DRY RUN] No se escribió nada. Quitá DRY_RUN para aplicar.");
        return;
    }
    const result = await ContratoFrame.bulkWrite(bulkOps);
    const upserted = result.upsertedCount || 0;
    const modified = result.modifiedCount || 0;
    const matched = result.matchedCount || 0;
    console.log(`\nMigración completa → insertados: ${upserted}, actualizados: ${modified}, ya existentes sin cambios: ${matched - modified}.`);
    const total = await ContratoFrame.countDocuments();
    console.log(`Total de documentos ahora en 'contratos-frame': ${total}.`);
}
run()
    .catch((err) => {
    console.error("Migración fallida:", err);
    process.exitCode = 1;
})
    .finally(async () => {
    await mongoose.disconnect();
    console.log("Desconectado de MongoDB.");
});
