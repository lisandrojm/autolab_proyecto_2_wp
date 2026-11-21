/**
 * COMPLETAR `anulacion.claveIdentidad` EN LAS LÁPIDAS VIEJAS (18/11/2026).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/completarClaveIdentidadLapidas.ts [--commit]
 *   En el VPS: NODE_ENV=production node dist/scripts/completarClaveIdentidadLapidas.js [--commit]
 *
 * El import de FRAME ahora reconoce un contrato también por su identidad (proyecto, persona, alta y tipo
 * por nombre: ver `findNewContracts`). Las lápidas nuevas la guardan al anularse; las de antes no, y sin
 * ella un anulado volvería si FRAME le cambia la categoría. La identidad sale del contrato entero que
 * guardó `contratos_anulados`. Sólo escribe donde falta; idempotente.
 */
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { claveDeIdentidad } from "../utils/additiveSync.js";
async function main() {
    const commit = process.argv.includes("--commit");
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const db = mongoose.connection.db;
    console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");
    const archivados = await db.collection("contratos_anulados").find({ vinculoEliminado: { $ne: true } }).toArray();
    let ok = 0, nada = 0, sinIdentidad = 0;
    for (const a of archivados) {
        const ident = claveDeIdentidad(a.contrato || {}, []);
        if (!ident) {
            sinIdentidad++;
            console.log(`  ✖ ${a.contratoKey}: el contrato archivado no tiene nombre o alta`);
            continue;
        }
        const filtro = { _id: a.userProjectId };
        const af = { arrayFilters: [{ "c.contratoKey": a.contratoKey, "c.estadoContrato": "ANULADO", "c.anulacion.claveIdentidad": { $in: [null, ""] } }] };
        console.log(`  ${a.contratoKey} → ${ident}`);
        if (!commit)
            continue;
        const r = await db.collection("users_&_projects").updateOne(filtro, { $set: { "contracts.$[c].anulacion.claveIdentidad": ident } }, af);
        r.modifiedCount ? ok++ : nada++;
    }
    console.log(`\nLápidas: ${archivados.length}${commit ? ` · completadas ${ok} · ya la tenían o cambiaron ${nada}` : ""} · sin identidad posible ${sinIdentidad}`);
}
main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
