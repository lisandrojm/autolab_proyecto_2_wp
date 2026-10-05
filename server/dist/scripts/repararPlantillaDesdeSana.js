import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { ContratoFrame } from "../models/ContratoFrame.js";
import { analizarPlantilla } from "../utils/variablesPlantilla.js";
/**
 * Copia el CONTENIDO de una plantilla sana sobre una dañada. Nada más que el contenido.
 *
 * POR QUÉ EN LA BASE Y NO EN EL EDITOR. Se intentó dos veces desde el editor y las dos fallaron:
 * «seleccionar todo y pegar» agregó el HTML al final en vez de reemplazarlo (125 celdas), y
 * «seleccionar todo, borrar, pegar» no vació el documento y volvió a agregar. El editor rechaza esas
 * operaciones sintéticas, y forzarlas es exactamente lo que produjo el daño original: variables
 * partidas por el borde de una celda, en la forma `{` … `{nombre}}`.
 *
 * QUÉ NO SE TOCA: el `name` del destino y su `contratoId`. Se copia el contenido; la plantilla sigue
 * siendo la misma entidad, con el mismo vínculo al tipo de contrato. Tampoco se borra nada.
 *
 *   npm run plantillas:reparar:dry
 *   npm run plantillas:reparar
 *
 * SE NIEGA A ESCRIBIR SI EL ORIGEN NO ESTÁ SANO. Copiar una plantilla rota sobre otra rota duplica
 * el problema en vez de arreglarlo, y sería indistinguible de un éxito mirando solo el destino.
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const ORIGEN = "Eventual Talento My secret Nudity rider - Reelshort";
const DESTINO = "Eventual Talento Surrender Nudity rider - Reelshort";
/** Estructura del documento, que es lo que el conteo de variables no ve. */
const estructura = (html) => ({
    chars: html.length,
    filas: (html.match(/<tr\b/gi) || []).length,
    celdas: (html.match(/<td\b/gi) || []).length,
});
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    const origen = await ContratoFrame.findOne({ name: ORIGEN }).lean();
    const destino = await ContratoFrame.findOne({ name: DESTINO }).lean();
    if (!origen)
        throw new Error(`No existe la plantilla origen «${ORIGEN}»`);
    if (!destino)
        throw new Error(`No existe la plantilla destino «${DESTINO}»`);
    const htmlOrigen = String(origen.content || "");
    const htmlDestino = String(destino.content || "");
    const aOrigen = analizarPlantilla(htmlOrigen);
    const aDestino = analizarPlantilla(htmlDestino);
    console.log(`ORIGEN   ${ORIGEN}`);
    console.log(`         ${JSON.stringify(estructura(htmlOrigen))} · ${aOrigen.variables.length} variables · ${aOrigen.problemas.length} problemas`);
    console.log(`DESTINO  ${DESTINO}`);
    console.log(`         ${JSON.stringify(estructura(htmlDestino))} · ${aDestino.variables.length} variables · ${aDestino.problemas.length} problemas`);
    console.log(`\nSe conserva del destino: name=«${destino.name}» · contratoId=${destino.contratoId} · usaMembrete=${destino.usaMembrete}\n`);
    if (aOrigen.problemas.length > 0) {
        console.log(`✖ EL ORIGEN NO ESTÁ SANO: ${aOrigen.problemas.length} problema(s) de llaves. No se copia nada.`);
        for (const x of aOrigen.problemas.slice(0, 5))
            console.log(`   ${x.motivo}`);
        await mongoose.disconnect();
        process.exit(1);
    }
    if (aDestino.problemas.length === 0 && htmlDestino === htmlOrigen) {
        console.log("El destino ya tiene el contenido del origen. Nada que hacer.\n");
        await mongoose.disconnect();
        return;
    }
    if (DRY_RUN) {
        console.log(`DRY RUN: se copiarían ${htmlOrigen.length} caracteres. No se escribió nada.\n`);
        await mongoose.disconnect();
        return;
    }
    // El log ANTES de escribir: aunque lo anterior esté roto, es texto legal y queda registrado.
    const archivo = `logs/plantilla-reparada-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(archivo, JSON.stringify({ fecha: new Date().toISOString(), origen: ORIGEN, destino: DESTINO, destinoAntes: { name: destino.name, contratoId: String(destino.contratoId || ""), content: htmlDestino } }, null, 2));
    await ContratoFrame.updateOne({ _id: destino._id }, { $set: { content: htmlOrigen } });
    // Verificación sobre lo que quedó escrito, releyendo.
    const fin = await ContratoFrame.findById(destino._id).lean();
    const aFin = analizarPlantilla(String(fin.content || ""));
    console.log(`✔ Copiado.`);
    console.log(`   ${JSON.stringify(estructura(String(fin.content || "")))} · ${aFin.variables.length} variables · ${aFin.problemas.length} problemas`);
    console.log(`   name sigue siendo «${fin.name}» · contratoId sigue siendo ${fin.contratoId}`);
    console.log(`   contenido idéntico al origen: ${String(fin.content) === htmlOrigen}`);
    console.log(`\nLog reversible: ${archivo}\n`);
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect();
    process.exit(1);
});
