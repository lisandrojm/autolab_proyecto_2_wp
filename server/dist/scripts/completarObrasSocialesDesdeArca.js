/**
 * COMPLETAR EL CATÁLOGO DE OBRAS SOCIALES CON LAS QUE ARCA PUBLICA Y FALTAN (19/11/2026).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/completarObrasSocialesDesdeArca.ts [--commit]
 *   ... --revertir migraciones-respaldo/obras-sociales-desde-arca-<fecha>.json
 *   En el VPS: NODE_ENV=production node dist/scripts/completarObrasSocialesDesdeArca.js [--commit]
 *
 * El catálogo de Obras Sociales (`obras-sociales`) se cargó el 15/06/2026 y no se sincroniza con ARCA.
 * La lectura del catálogo de ARCA de octubre (`arca_catalogo`, tabla OBRA_SOCIAL_RNOS) trajo códigos que
 * no están ahí. Cuando ARCA devuelve uno de ésos al validar una persona, el lote lo rechaza («no está en
 * el catálogo») y no se guarda nada: le pasó a Jorge Garcia con 907806 (BIENESTAR SALUD S.A.).
 *
 * Qué hace, sólo con lo que dice ARCA:
 *  - crea en el catálogo cada código VIGENTE de ARCA que falta (mismo formato que los demás: código de
 *    6 dígitos en `externalId`, número en `data.id`, la descripción de ARCA como nombre);
 *  - lo registra en cada empleadora que ARCA lista como fuente de ese código (`fuentes[].empresaCuit`):
 *    es ARCA diciendo que esa empleadora lo tiene. Ninguna otra.
 * Idempotente: lo que ya está no se toca. Respaldo con lo creado y lo agregado, para `--revertir`.
 */
import mongoose, { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const dig = (s) => String(s ?? "").replace(/\D/g, "");
const db = () => mongoose.connection.db;
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    if (arg("--revertir"))
        return revertir(arg("--revertir"));
    const commit = process.argv.includes("--commit");
    console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");
    const abm = await db().collection("obras-sociales").find({}).project({ externalId: 1, "data.id": 1 }).toArray();
    const yaEstan = new Set(abm.map((o) => dig(o.externalId || o.data?.id).padStart(6, "0")));
    const arca = await db().collection("arca_catalogo").find({ tabla: "OBRA_SOCIAL_RNOS", vigente: true }).toArray();
    const faltan = arca.filter((a) => dig(a.codigo) && dig(a.codigo) !== "000000" && !yaEstan.has(dig(a.codigo).padStart(6, "0")));
    const empresas = await db().collection("companies").find({}).project({ razonSocial: 1, cuit: 1 }).toArray();
    const porCuit = new Map(empresas.map((e) => [dig(e.cuit), e]));
    console.log(`Catálogo: ${abm.length} · ARCA vigentes: ${arca.length} · faltan en el catálogo: ${faltan.length}\n`);
    const respaldo = { creadas: [], registradas: [], el: new Date().toISOString() };
    for (const a of faltan) {
        const codigo = dig(a.codigo).padStart(6, "0");
        const emps = (a.fuentes || []).map((f) => porCuit.get(dig(f.empresaCuit))).filter(Boolean);
        console.log(`  + ${codigo} ${a.descripcion} → registrarla en: ${emps.map((e) => e.razonSocial).join(", ") || "(ninguna: ARCA no la lista para ninguna empleadora nuestra)"}`);
        if (!commit)
            continue;
        const ahora = new Date();
        const r = await db().collection("obras-sociales").insertOne({ externalId: codigo, name: a.descripcion, data: { id: Number(codigo), nombre: a.descripcion }, createdAt: ahora, updatedAt: ahora });
        respaldo.creadas.push({ _id: String(r.insertedId), codigo });
        for (const e of emps) {
            const u = await db().collection("companies").updateOne({ _id: e._id }, { $addToSet: { obrasSocialesIds: r.insertedId } });
            if (u.modifiedCount)
                respaldo.registradas.push({ empresaId: String(e._id), obraSocialId: String(r.insertedId) });
        }
    }
    if (commit && faltan.length) {
        fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
        const archivo = path.join(CARPETA_RESPALDOS, `obras-sociales-desde-arca-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
        fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 1));
        console.log(`\n✔ ${respaldo.creadas.length} creadas, ${respaldo.registradas.length} registros en empleadoras. Respaldo: ${archivo}`);
    }
}
async function revertir(archivo) {
    const r = JSON.parse(fs.readFileSync(archivo, "utf8"));
    for (const x of r.registradas)
        await db().collection("companies").updateOne({ _id: new Types.ObjectId(x.empresaId) }, { $pull: { obrasSocialesIds: new Types.ObjectId(x.obraSocialId) } });
    // Sólo se borra si ningún contrato la usa todavía.
    for (const c of r.creadas) {
        const usada = await db().collection("users_&_projects").countDocuments({ "contracts.obraSocialId": Number(c.codigo) });
        if (usada)
            console.log(`  = ${c.codigo}: ya la usan ${usada} vínculo(s), no se borra del catálogo.`);
        else
            await db().collection("obras-sociales").deleteOne({ _id: new Types.ObjectId(c._id) });
    }
    console.log("Revertido.");
}
main()
    .catch((e) => { console.error(`✖ ${e?.message || e}`); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
