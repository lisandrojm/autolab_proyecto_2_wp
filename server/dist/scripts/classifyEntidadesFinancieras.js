import dotenv from "dotenv";
import path from "path";
import mongoose from "mongoose";
import { Banco } from "../models/Banco.js";
/**
 * Clasifica las entidades financieras existentes en la colección `bancos`,
 * seteando el campo `tipoEntidad` según el padrón del BCRA (código = externalId).
 *
 * Tipos: "banco" | "billetera_virtual" | "compania_financiera" | "caja_credito" | "otro".
 *
 * Criterio:
 *   - Overrides explícitos por externalId (compañías financieras, billetera, caja de crédito).
 *   - Todo el resto → "banco" (incluye neobancos como Brubank / Banco del Sol / Wilobank,
 *     que legalmente tienen licencia bancaria).
 *
 * SEGURO / IDEMPOTENTE: solo escribe donde `tipoEntidad` está vacío. Nunca pisa
 * una clasificación ya cargada (manual o de una corrida previa). Re-ejecutable.
 *
 * Ejecutar (DB de .env.production):
 *   npx tsx src/scripts/classifyEntidadesFinancieras.ts
 *   DRY_RUN=true npx tsx src/scripts/classifyEntidadesFinancieras.ts   (solo listar)
 */
// externalId (código BCRA) → tipo. Todo lo que no esté acá es "banco".
const OVERRIDES = {
    // Billetera virtual / PSP
    "2": "billetera_virtual", // MERCADO PAGO
    // Caja de crédito cooperativa
    "65203": "caja_credito", // CAJA DE CREDITO CUENCA COOPERATIVA
    // Compañías financieras (financiadoras automotrices y de consumo)
    "44077": "compania_financiera", // COMPAÑIA FINANCIERA ARGENTINA
    "44090": "compania_financiera", // CORDIAL
    "44092": "compania_financiera", // FCA (Fiat)
    "44100": "compania_financiera", // FINANDINO
    "44059": "compania_financiera", // FORD CREDIT
    "44093": "compania_financiera", // GPAT (GM)
    "44096": "compania_financiera", // JOHN DEERE
    "44094": "compania_financiera", // MERCEDES-BENZ
    "45056": "compania_financiera", // MONTEMAR
    "44098": "compania_financiera", // PSA FINANCE (Peugeot)
    "44095": "compania_financiera", // ROMBO (Renault)
    "44099": "compania_financiera", // TOYOTA
    "45072": "compania_financiera", // TRANSATLANTICA
    "44088": "compania_financiera", // VOLKSWAGEN FINANCIAL SERVICES
    "1": "compania_financiera", // REBA (opera como billetera, licencia de compañía financiera)
    "339": "compania_financiera", // RCI BANQUE (financiadora Renault)
};
const DEFAULT_TIPO = "banco";
async function run() {
    dotenv.config({ path: path.resolve(process.cwd(), ".env.production"), override: true });
    const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/we_produ";
    const dbName = process.env.MONGO_DB_NAME || "weprodu_production_integration";
    const dryRun = String(process.env.DRY_RUN || "").toLowerCase() === "true";
    await mongoose.connect(uri, { dbName });
    console.log(`Conectado a MongoDB → db: ${dbName}${dryRun ? "  [DRY RUN]" : ""}`);
    const docs = await Banco.find().sort({ name: 1 }).lean();
    console.log(`Encontradas ${docs.length} entidades en 'bancos'.\n`);
    const counts = {};
    let toWrite = 0;
    let skipped = 0;
    const bulkOps = [];
    for (const doc of docs) {
        const extId = doc.externalId ? String(doc.externalId).trim() : "";
        const target = OVERRIDES[extId] ?? DEFAULT_TIPO;
        const current = doc.tipoEntidad ? String(doc.tipoEntidad).trim() : "";
        if (current) {
            skipped++;
            continue; // ya clasificado, no se toca
        }
        counts[target] = (counts[target] || 0) + 1;
        toWrite++;
        console.log(`  • [${target}] ${doc.name}  (id ${extId || "—"})`);
        bulkOps.push({
            updateOne: {
                filter: { _id: doc._id },
                update: { $set: { tipoEntidad: target } },
            },
        });
    }
    console.log(`\nResumen a aplicar: ${JSON.stringify(counts)}`);
    console.log(`A escribir: ${toWrite}   Ya clasificadas (sin tocar): ${skipped}`);
    if (dryRun) {
        console.log("\n[DRY RUN] No se escribió nada. Quitá DRY_RUN para aplicar.");
        return;
    }
    if (bulkOps.length > 0) {
        const result = await Banco.bulkWrite(bulkOps);
        console.log(`\nAplicado → modificados: ${result.modifiedCount || 0}.`);
    }
    else {
        console.log("\nNada para escribir (todo ya estaba clasificado).");
    }
}
run()
    .catch((err) => {
    console.error("Clasificación fallida:", err);
    process.exitCode = 1;
})
    .finally(async () => {
    await mongoose.disconnect();
    console.log("Desconectado de MongoDB.");
});
