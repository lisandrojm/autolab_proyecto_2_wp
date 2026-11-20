/**
 * SIEMBRA LA TABLA DE SITUACIONES DE BAJA DE ARCA desde el fixture relevado el 20/11/2026
 * (`services/arca/fixtures/catalogos-RegistraBaja.json`, que es `window.l_SBV` tal como lo publica el
 * formulario Registrar baja). Idempotente: upsert por código. No borra lo que ya no esté en el fixture.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/sembrarSituacionesBajaArca.ts          # dry-run
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/sembrarSituacionesBajaArca.ts --commit
 *
 * No toca contratos: es un catálogo. Cuando ARCA cambie la lista, se vuelve a relevar con
 * `reconocerModificacionesArca.ts` (ABRIR=baja) y se regenera el fixture.
 */
import mongoose from "mongoose";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ArcaSituacionBaja } from "../models/ArcaSituacionBaja.js";
const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), "../services/arca/fixtures/catalogos-RegistraBaja.json");
async function main() {
    const commit = process.argv.includes("--commit");
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8"));
    const filas = (fixture.l_SBV || []).map((x) => ({ codigo: String(x.codigo).trim(), descripcion: String(x.descripcion).trim() })).filter((x) => x.codigo && x.descripcion);
    if (filas.length === 0)
        throw new Error(`El fixture ${FIXTURE} no trae situaciones de baja.`);
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    console.log(`${commit ? "MODO COMMIT" : "DRY-RUN"} · ${filas.length} situaciones de baja en el fixture`);
    const existentes = new Map((await ArcaSituacionBaja.find().lean()).map((d) => [String(d.externalId), d]));
    let nuevas = 0, cambiadas = 0, iguales = 0;
    for (const f of filas) {
        const e = existentes.get(f.codigo);
        if (!e)
            nuevas++;
        else if (e.name !== f.descripcion)
            cambiadas++;
        else
            iguales++;
        if (!e || e.name !== f.descripcion)
            console.log(`  ${e ? "cambia" : "nueva "} ${f.codigo.padStart(2, " ")}  ${f.descripcion}${e ? ` (antes: ${e.name})` : ""}`);
        if (commit)
            await ArcaSituacionBaja.updateOne({ externalId: f.codigo }, { $set: { externalId: f.codigo, name: f.descripcion, "data.id": Number(f.codigo), "data.nombre": f.descripcion } }, { upsert: true });
    }
    const sobran = [...existentes.keys()].filter((k) => !filas.some((f) => f.codigo === k));
    console.log(`nuevas ${nuevas} · cambiadas ${cambiadas} · iguales ${iguales}${sobran.length ? ` · en la base y no en el fixture (se dejan): ${sobran.join(", ")}` : ""}`);
    if (!commit)
        console.log("Sin --commit no se escribió nada.");
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
