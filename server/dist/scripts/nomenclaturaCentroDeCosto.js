import mongoose from "mongoose";
import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { validarPatron } from "../utils/nomenclatura.js";
/**
 * Suma `{{centroDeCosto}}_` adelante de `{{proyecto}}` en TODOS los patrones guardados del ABM de
 * Nomenclatura de archivos.
 *
 * Los patrones de fábrica ya lo traen (`PATRON_POR_DEFECTO`); esto es para los que un tenant guardó
 * a mano, que pisan al de fábrica y por eso no se enteran solos del cambio.
 *
 * Regla: si el patrón ya usa `{{centroDeCosto}}`, no se toca. Si tiene `{{proyecto}}`, el centro va
 * pegado adelante de la primera aparición. Si no lo tiene, va al principio del nombre.
 *
 * Uso (desde server/):
 *   npm run nomenclatura:centro-de-costo:dry   → muestra el antes/después, no escribe nada
 *   npm run nomenclatura:centro-de-costo       → aplica
 */
const DRY_RUN = process.env.DRY_RUN === "true";
export const conCentroDeCosto = (patron) => {
    if (/\{\{\s*centroDeCosto\s*\}\}/.test(patron))
        return patron;
    const m = /\{\{\s*proyecto\s*\}\}/.exec(patron);
    if (!m)
        return `{{centroDeCosto}}_${patron}`;
    return `${patron.slice(0, m.index)}{{centroDeCosto}}_${patron.slice(m.index)}`;
};
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Base: ${dbName}`);
    const filas = await NomenclaturaArchivo.find({}).lean();
    let cambiadas = 0;
    for (const f of filas) {
        const nuevo = conCentroDeCosto(f.patron);
        if (nuevo === f.patron) {
            console.log(`= ${f.tipo} (tenant ${f.tenantId}): ya tiene {{centroDeCosto}}`);
            continue;
        }
        const errores = validarPatron(f.tipo, nuevo);
        if (errores.length > 0) {
            console.log(`✖ ${f.tipo} (tenant ${f.tenantId}): el patrón nuevo no valida, no se toca → ${errores.map((e) => e.motivo).join(" | ")}`);
            continue;
        }
        console.log(`~ ${f.tipo} (tenant ${f.tenantId})\n    antes:   ${f.patron}\n    después: ${nuevo}`);
        if (!DRY_RUN)
            await NomenclaturaArchivo.updateOne({ _id: f._id }, { $set: { patron: nuevo } });
        cambiadas++;
    }
    console.log(`\n${filas.length} patrones guardados · ${cambiadas} ${DRY_RUN ? "se cambiarían" : "cambiados"}.`);
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
