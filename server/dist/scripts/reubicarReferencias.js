/**
 * REUBICAR REFERENCIAS CORRIDAS (etapa 2c, 18/11/2026): una referencia que quedó apuntando al contrato de
 * al lado (los borrados físicos de antes de la 2b corrían las posiciones) pasa a apuntar a SU contrato:
 * nueva posición y, con ella, su clave.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/reubicarReferencias.ts   # dry-run (por defecto)
 *   ... --commit                  escribe
 *   ... --incluir-debiles         también las de evidencia débil (renovaciones: sólo la fecha de baja)
 *   ... --solo <userProjectId>    sólo las de ese vínculo (p. ej. para resolver a una persona antes que el resto)
 *   ... --revertir migraciones-respaldo/reubicar-referencias-<fecha>.json
 *   En el VPS: NODE_ENV=production node dist/scripts/reubicarReferencias.js [--commit]
 *
 * SÓLO SE REUBICA CON (ver `utils/referenciasCorridas.ts`):
 *  - un ÚNICO contrato del vínculo que coincide con todo lo que la referencia guardó, sin lápidas, y
 *  - evidencia FUERTE: el log de la corrida que presentó ese contrato (`altaArcaPresentada.logId`), o
 *    fecha de alta + empleadora. Sólo la fecha de baja es débil: queda listada y fuera, salvo
 *    `--incluir-debiles`.
 * Lo demás (varios candidatos, ninguno, vínculo borrado) se lista para revisar a mano.
 *
 * CADA REUBICACIÓN DEJA SU EVIDENCIA en el respaldo: posición y clave de antes y de después, qué campos
 * se compararon con qué valores, por qué la posición vieja no coincidía y que el candidato era único.
 * La escritura exige que la referencia siga en la posición vieja y sin clave. Una decisión de renovación
 * que choque con otra en el índice único se informa y no se toca.
 *
 * El backfill de claves NO toca estas referencias (las ve corridas): reciben la clave acá.
 */
import mongoose, { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { fechaISO } from "../utils/contratoVigencia.js";
import { clasificarReferencia, huellaUtil } from "../utils/referenciasCorridas.js";
import { campoClave, campoVinculo, contratosDe, leerReferencias, SIN_CLAVE } from "../services/referenciasPorPosicion.js";
const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");
const db = () => mongoose.connection.db;
const txt = (v) => (v == null ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));
async function escribir(r) {
    const col = db().collection(r.coleccion);
    const id = new Types.ObjectId(r._id);
    const up = new Types.ObjectId(r.userProjectId);
    const clave = new Types.ObjectId(r.despues.clave);
    try {
        if (r.arreglo) {
            const res = await col.updateOne({ _id: id }, { $set: { [`${r.arreglo}.$[e].${r.campoIndice}`]: r.despues.indice, [`${r.arreglo}.$[e].contratoKey`]: clave } }, { arrayFilters: [{ "e.userProjectId": up, [`e.${r.campoIndice}`]: r.antes.indice, "e.contratoKey": null }] });
            return res.modifiedCount > 0 ? "ok" : "cambio";
        }
        const res = await col.updateOne({ _id: id, [campoVinculo(r.coleccion)]: up, [r.campoIndice]: r.antes.indice ?? SIN_CLAVE, [campoClave(r.coleccion)]: SIN_CLAVE }, { $set: { [r.campoIndice]: r.despues.indice, [campoClave(r.coleccion)]: clave } });
        return res.modifiedCount > 0 ? "ok" : "cambio";
    }
    catch (e) {
        if (e?.code === 11000)
            return "choque";
        throw e;
    }
}
async function main() {
    const commit = process.argv.includes("--commit");
    const debiles = process.argv.includes("--incluir-debiles");
    const iSolo = process.argv.indexOf("--solo");
    const solo = iSolo >= 0 ? process.argv[iSolo + 1] : null;
    const iRevertir = process.argv.indexOf("--revertir");
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    if (iRevertir >= 0)
        return revertir(process.argv[iRevertir + 1]);
    console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");
    const refs = (await leerReferencias()).filter((r) => !solo || String(r.userProjectId) === solo);
    const contratos = await contratosDe(refs.map((r) => r.userProjectId));
    const plan = [];
    const debilesFuera = [];
    const aMano = [];
    for (const r of refs) {
        const lista = contratos.get(String(r.userProjectId));
        if (!lista)
            continue; // vínculo borrado: lo lista el backfill
        const k = clasificarReferencia(lista, r);
        if (k.tipo !== "corrida" && k.tipo !== "fuera")
            continue;
        const linea = `${r.coleccion} ${r._id} · ${r.texto} · ${k.tipo === "corrida" ? `#${r.indice}: ` : ""}${k.motivo} [${k.evidencia.join("+") || "sin evidencia"}]`;
        if (k.candidatos?.length !== 1) {
            aMano.push(`${linea} → ${k.candidatos?.length ? `${k.candidatos.length} candidatos (#${k.candidatos.join(", #")})` : "ningún contrato coincide"}`);
            continue;
        }
        if (k.fuerza !== "fuerte" && !debiles) {
            debilesFuera.push(`${linea} → candidato único #${k.candidatos[0]}, pero la evidencia es débil`);
            continue;
        }
        const destino = k.candidatos[0];
        const c = lista[destino];
        if (!c?.contratoKey) {
            aMano.push(`${linea} → el candidato #${destino} no tiene clave`);
            continue;
        }
        const h = huellaUtil(lista, r.huella);
        plan.push({
            coleccion: r.coleccion,
            arreglo: r.arreglo,
            _id: String(r._id),
            userProjectId: String(r.userProjectId),
            campoIndice: r.campoIndice,
            texto: r.texto,
            antes: { indice: r.indice, claveEnEsaPosicion: r.indice != null && lista[r.indice]?.contratoKey ? String(lista[r.indice].contratoKey) : null },
            despues: { indice: destino, clave: String(c.contratoKey) },
            evidencia: {
                campos: k.evidencia,
                fuerza: k.fuerza,
                referencia: Object.fromEntries(Object.entries(h).map(([kk, v]) => [kk, txt(v)])),
                contratoElegido: { alta: fechaISO(c.fecha_alta_contrato), baja: fechaISO(c.fecha_baja_contrato), empresaId: txt(c.empresaContratoId), logId: txt(c.altaArcaPresentada?.logId) },
                motivoPosicionVieja: k.motivo || "",
                candidatos: k.candidatos,
            },
        });
    }
    console.log(`REUBICABLES (candidato único, evidencia ${debiles ? "fuerte o débil" : "fuerte"}): ${plan.length}`);
    for (const p of plan)
        console.log(`  ${p.coleccion} ${p._id} · ${p.texto} · #${p.antes.indice ?? "—"} → #${p.despues.indice} (${p.evidencia.campos.join("+")}: ${Object.entries(p.evidencia.referencia).map(([k, v]) => `${k} ${v.slice(-10)}`).join(", ")})`);
    if (debilesFuera.length) {
        console.log(`\nEVIDENCIA DÉBIL, NO SE TOCAN (--incluir-debiles para incluirlas): ${debilesFuera.length}`);
        for (const t of debilesFuera)
            console.log(`  ${t}`);
    }
    if (aMano.length) {
        console.log(`\nA MANO (sin candidato único): ${aMano.length}`);
        for (const t of aMano)
            console.log(`  ${t}`);
    }
    if (!commit || !plan.length)
        return;
    fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
    const archivo = path.join(CARPETA_RESPALDOS, `reubicar-referencias-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(archivo, JSON.stringify(plan, null, 1));
    console.log(`\nRespaldo (con la evidencia de cada una): ${archivo}`);
    const cuenta = { ok: 0, cambio: 0, choque: 0 };
    for (const p of plan) {
        const r = await escribir(p);
        cuenta[r]++;
        if (r !== "ok")
            console.log(`  ${r === "choque" ? "✖ choca con otra decisión de renovación en esa posición" : "= cambió entre la lectura y la escritura"}: ${p.coleccion} ${p._id}`);
    }
    console.log(`Reubicadas: ${cuenta.ok}. Sin cambios: ${cuenta.cambio}. Choques: ${cuenta.choque}.`);
    console.log("Corré de nuevo sin --commit: lo reubicado ya no tiene que aparecer.");
}
/** Vuelve cada referencia a su posición vieja y le saca la clave, sólo si sigue como la dejó la reubicación. */
async function revertir(archivo) {
    if (!archivo || !fs.existsSync(archivo))
        throw new Error("Falta el archivo de respaldo (--revertir <archivo>).");
    const plan = JSON.parse(fs.readFileSync(archivo, "utf8"));
    let n = 0;
    for (const p of plan) {
        const col = db().collection(p.coleccion);
        const clave = new Types.ObjectId(p.despues.clave);
        const r = p.arreglo
            ? await col.updateOne({ _id: new Types.ObjectId(p._id) }, { $set: { [`${p.arreglo}.$[e].${p.campoIndice}`]: p.antes.indice, [`${p.arreglo}.$[e].contratoKey`]: null } }, { arrayFilters: [{ "e.userProjectId": new Types.ObjectId(p.userProjectId), "e.contratoKey": clave, [`e.${p.campoIndice}`]: p.despues.indice }] })
            : await col.updateOne({ _id: new Types.ObjectId(p._id), [campoClave(p.coleccion)]: clave, [p.campoIndice]: p.despues.indice }, { $set: { [p.campoIndice]: p.antes.indice }, $unset: { [campoClave(p.coleccion)]: "" } });
        n += r.modifiedCount;
    }
    console.log(`Revertidas: ${n} de ${plan.length}.`);
}
main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
