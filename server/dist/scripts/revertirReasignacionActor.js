import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import UserProject from "../models/UserProject.js";
/**
 * Deshace una corrida de `reasignarCategoriaActor`, leyendo su log.
 *
 * Existe para que «reversible» sea un hecho y no una intención. Dos de las seis decisiones —animación
 * y TELECOM a UNITARIO— se tomaron por la naturaleza de la obra y sin el detalle de producción: si
 * resultan equivocadas, corregirlas tiene que costar una corrida.
 *
 * Restaura EXACTAMENTE lo que había: `categoria_sat_id` y `nombre_categoria_sat` anteriores, contrato
 * por contrato, por `_id` del UserProject y posición. No recalcula nada ni asume que el estado actual
 * sea el que dejó la migración: si alguien tocó un contrato después, este script lo pisa con el valor
 * viejo — que es lo que «revertir» significa.
 *
 *     npm run actores:revertir:dry -- logs/reasignacion-actor-....json
 *     npm run actores:revertir     -- logs/reasignacion-actor-....json
 */
const DRY_RUN = process.env.DRY_RUN === "true";
async function run() {
    const archivo = process.argv[2];
    if (!archivo)
        throw new Error("Falta el archivo de log: npm run actores:revertir -- logs/reasignacion-actor-....json");
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    const log = JSON.parse(readFileSync(archivo, "utf8"));
    await mongoose.connect(uri, { dbName });
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}`);
    console.log(`Log: ${archivo} · ${log.length} contrato(s)\n`);
    // Agrupado por documento: varios contratos viven en el mismo `UserProject` y guardarlos de a uno
    // se pisa a sí mismo.
    const porDoc = new Map();
    for (const e of log) {
        if (!porDoc.has(e.userProjectId))
            porDoc.set(e.userProjectId, []);
        porDoc.get(e.userProjectId).push(e);
    }
    let revertidos = 0;
    const yaCambiados = [];
    for (const [id, entradas] of porDoc) {
        const doc = await UserProject.findById(id);
        if (!doc) {
            yaCambiados.push(`${id}: el UserProject ya no existe`);
            continue;
        }
        for (const e of entradas) {
            const actual = doc.contracts?.[e.contractIndex];
            if (!actual) {
                yaCambiados.push(`${id}[${e.contractIndex}]: ya no existe ese contrato`);
                continue;
            }
            // Se avisa, no se frena: revertir sobre algo que ya cambió sigue siendo lo pedido, pero quien
            // corre esto tiene que enterarse de que está pisando un cambio posterior.
            if (Number(actual.categoria_sat_id) !== Number(e.ahora.categoria_sat_id)) {
                yaCambiados.push(`${id}[${e.contractIndex}]: hoy tiene ${actual.categoria_sat_id}, no ${e.ahora.categoria_sat_id}`);
            }
            if (!DRY_RUN) {
                doc.contracts[e.contractIndex] = { ...actual.toObject(), categoria_sat_id: e.antes.categoria_sat_id, nombre_categoria_sat: e.antes.nombre_categoria_sat };
            }
            revertidos++;
        }
        if (!DRY_RUN) {
            doc.markModified("contracts");
            await doc.save();
        }
    }
    if (yaCambiados.length > 0) {
        console.log(`Ojo: ${yaCambiados.length} contrato(s) no estaban como los dejó la migración:`);
        for (const y of yaCambiados.slice(0, 10))
            console.log(`  · ${y}`);
        if (yaCambiados.length > 10)
            console.log(`  …y ${yaCambiados.length - 10} más.`);
        console.log("");
    }
    console.log(DRY_RUN ? `DRY RUN terminado: ${revertidos} se revertirían. No se escribió nada.\n` : `${revertidos} contrato(s) revertido(s) a su categoría anterior.\n`);
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error("\n✖", e.message);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});
