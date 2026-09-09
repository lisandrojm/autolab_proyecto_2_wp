import fs from "fs";
import path from "path";
import zlib from "zlib";
import readline from "readline";
import mongoose from "mongoose";
import { EJSON } from "bson";
/**
 * Restaura una CARPETA de backup (la que genera `backupService`) sin necesidad de `mongoimport`.
 *
 * El camino normal para Atlas es `mongoimport`, que lee los archivos tal cual están:
 *
 *   mongoimport --uri "<atlas>" --collection users --gzip --file users.json.gz
 *
 * Este script existe para cuando no se tienen las mongodb-database-tools a mano, y para restaurar la
 * carpeta ENTERA de una sin escribir un `for` por colección.
 *
 * ESTE SCRIPT ESCRIBE SOBRE UNA BASE. Por eso:
 *
 *  - Arranca en DRY RUN: lee, cuenta e informa, y no toca nada. Para escribir hay que pasar
 *    `DRY_RUN=false` a propósito.
 *  - Exige `MONGODB_URI_DESTINO` explícito y se NIEGA a usar la URI de la app. Restaurar encima de la
 *    base de producción no debería poder pasar por olvidarse una variable: lo normal es levantar una
 *    base aparte, restaurar ahí y recién después decidir.
 *  - Inserta con `insertMany({ ordered: false })` sobre colecciones que espera VACÍAS. Si ya tienen
 *    datos, los `_id` repetidos se rechazan uno por uno y el resto entra; se informa cuántos.
 *
 * Uso:
 *   MONGODB_URI_DESTINO="mongodb://localhost:27017/weprodu_restore" \
 *   npm run restaurar:backup -- ruta/a/weprodu_production_integration_2026-09-09_0300
 *
 *   ... y cuando el dry run diga lo esperado, otra vez con DRY_RUN=false.
 */
const LOTE = 500;
async function main() {
    const carpeta = process.argv[2];
    if (!carpeta || !fs.existsSync(carpeta) || !fs.statSync(carpeta).isDirectory()) {
        console.error("Falta la carpeta del backup (la que contiene los .json.gz).");
        console.error("Uso: npm run restaurar:backup -- <carpeta>");
        process.exit(1);
    }
    const dryRun = String(process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
    const destino = String(process.env.MONGODB_URI_DESTINO || "").trim();
    if (!destino) {
        console.error("Falta MONGODB_URI_DESTINO. Es a propósito: hay que decir explícitamente en qué base se restaura.");
        process.exit(1);
    }
    if (destino === String(process.env.MONGODB_URI || "").trim()) {
        console.error("MONGODB_URI_DESTINO es la MISMA base que usa la aplicación. Restaurá en una base aparte y comparen antes de mover nada.");
        process.exit(1);
    }
    const manifiestoPath = path.join(carpeta, "_backup.json");
    if (fs.existsSync(manifiestoPath)) {
        const m = JSON.parse(fs.readFileSync(manifiestoPath, "utf8"));
        console.log(`   base original: ${m.base} · generado: ${m.fecha} · ${m.colecciones?.length ?? 0} colecciones · ${m.documentos} documentos`);
    }
    const archivos = fs.readdirSync(carpeta).filter((f) => f.endsWith(".json.gz")).sort();
    if (archivos.length === 0) {
        console.error("La carpeta no tiene ningún .json.gz. ¿Es la carpeta de un backup?");
        process.exit(1);
    }
    console.log(`${dryRun ? "🔍 DRY RUN" : "✍️  ESCRIBIENDO"} · ${archivos.length} colecciones desde ${carpeta}\n`);
    const conexion = dryRun ? null : await mongoose.createConnection(destino).asPromise();
    console.log("Colección                          documentos   rechazados");
    let total = 0;
    for (const archivo of archivos) {
        const coleccion = archivo.replace(/\.json\.gz$/, "");
        const lineas = readline.createInterface({ input: fs.createReadStream(path.join(carpeta, archivo)).pipe(zlib.createGunzip()), crlfDelay: Infinity });
        let lote = [];
        let cuenta = 0;
        let rechazados = 0;
        const vaciarLote = async () => {
            if (lote.length === 0)
                return;
            cuenta += lote.length;
            if (!dryRun && conexion) {
                try {
                    await conexion.db.collection(coleccion).insertMany(lote, { ordered: false });
                }
                catch (e) {
                    // `ordered: false` sigue de largo con los que sí entran; acá solo se cuenta lo que quedó afuera.
                    rechazados += e?.writeErrors?.length ?? 0;
                }
            }
            lote = [];
        };
        for await (const linea of lineas) {
            if (!linea.trim())
                continue;
            lote.push(EJSON.parse(linea, { relaxed: false }));
            if (lote.length >= LOTE)
                await vaciarLote();
        }
        await vaciarLote();
        total += cuenta;
        console.log(`${coleccion.padEnd(34)} ${String(cuenta).padStart(10)}   ${String(rechazados).padStart(10)}`);
    }
    console.log(`\n${dryRun ? "Se restaurarían" : "Se restauraron"} ${total} documentos en ${archivos.length} colecciones.`);
    if (dryRun)
        console.log("Nada se escribió. Volvé a correr con DRY_RUN=false para hacerlo de verdad.");
    await conexion?.close();
    process.exit(0);
}
main().catch((e) => {
    console.error("Falló la restauración:", e);
    process.exit(1);
});
