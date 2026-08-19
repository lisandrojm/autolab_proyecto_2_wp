import fs from "fs";
import mongoose from "mongoose";
/**
 * Completa `categorias-sat.data.convenio` con el código de CCT al que pertenece cada categoría,
 * tomándolo del CSV de tablas de ARCA (filas CATEGORIA_CCT, columna `filtro_padre`).
 *
 * Por qué hace falta: ARCA no ofrece un catálogo global de categorías — el combo `l_CatCCT` viene
 * filtrado por convenio, y solo muestra los de los CCT que la empleadora tiene habilitados. Sin
 * saber a qué convenio pertenece cada categoría no se puede validar que la del contrato sea
 * elegible para su empresa, y una categoría de otro convenio pasa todos los controles y llega mal.
 *
 * El convenio NO se manda al TXT (pos. 91-100 van en blanco): esto es solo para validar.
 *
 * Es idempotente y NO pisa lo ya cargado a mano: solo completa las que están vacías, salvo que se
 * corra con FORZAR=true.
 *
 * Uso (desde server/):
 *   DRY_RUN=true CSV=../documentation/arca_tablas_simplificacion_registral.csv \
 *     ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/backfillCategoriaConvenio.ts
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const FORZAR = process.env.FORZAR === "true";
const CSV_PATH = process.env.CSV || "";
/** Igual que en los otros scripts: las descripciones traen comas y comillas dobladas. */
function parseCsv(texto) {
    const filas = [];
    let campo = "";
    let fila = [];
    let enComillas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (enComillas) {
            if (c === '"') {
                if (texto[i + 1] === '"') {
                    campo += '"';
                    i++;
                }
                else
                    enComillas = false;
            }
            else
                campo += c;
            continue;
        }
        if (c === '"')
            enComillas = true;
        else if (c === ",") {
            fila.push(campo);
            campo = "";
        }
        else if (c === "\n") {
            fila.push(campo);
            filas.push(fila);
            fila = [];
            campo = "";
        }
        else if (c !== "\r")
            campo += c;
    }
    if (campo !== "" || fila.length > 0) {
        fila.push(campo);
        filas.push(fila);
    }
    return filas;
}
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    if (!CSV_PATH)
        throw new Error("Falta CSV=/ruta/al/arca_tablas_simplificacion_registral.csv");
    if (!fs.existsSync(CSV_PATH))
        throw new Error(`No existe el CSV: ${CSV_PATH}`);
    const filas = parseCsv(fs.readFileSync(CSV_PATH, "utf-8").replace(/^﻿/, ""));
    const enc = filas.shift();
    if (!enc)
        throw new Error("El CSV está vacío");
    const iTabla = enc.indexOf("tabla");
    const iPadded = enc.indexOf("codigo_padded");
    const iPadre = enc.indexOf("filtro_padre");
    const iDesc = enc.indexOf("descripcion");
    if (iTabla < 0 || iPadded < 0 || iPadre < 0)
        throw new Error("Al CSV le faltan columnas (tabla / codigo_padded / filtro_padre)");
    // código de categoría (6 díg.) → código de convenio. Un mismo código puede venir repetido en el
    // export, pero siempre bajo el MISMO convenio; si alguna vez difiriera, se avisa y no se usa.
    const convenioPorCategoria = new Map();
    const conflictivos = new Set();
    for (const f of filas) {
        if (f[iTabla] !== "CATEGORIA_CCT")
            continue;
        const cod = String(f[iPadded] || "").trim();
        const cct = String(f[iPadre] || "").trim();
        if (!cod || !cct)
            continue;
        const previo = convenioPorCategoria.get(cod);
        if (previo && previo !== cct)
            conflictivos.add(cod);
        convenioPorCategoria.set(cod, cct);
    }
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("No se pudo establecer la conexión");
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}${FORZAR ? "   |   FORZAR: pisa lo ya cargado" : ""}`);
    console.log(`CSV: ${convenioPorCategoria.size} categorías con convenio\n`);
    if (conflictivos.size > 0) {
        console.log(`⚠ ${conflictivos.size} código(s) de categoría aparecen en más de un convenio: ${[...conflictivos].join(", ")}. Revisalos a mano.\n`);
    }
    const cats = await db.collection("categorias-sat").find({}).toArray();
    let completadas = 0;
    let yaTenian = 0;
    let sinCodigo = 0;
    const sinMatch = [];
    for (const c of cats) {
        const codigoAfip = c.data?.codigoAfip;
        if (!codigoAfip) {
            sinCodigo++;
            continue;
        }
        const cod = String(codigoAfip).replace(/\D/g, "").padStart(6, "0");
        const cct = convenioPorCategoria.get(cod);
        if (!cct || conflictivos.has(cod)) {
            sinMatch.push(`${cod} (${c.name})`);
            continue;
        }
        if (c.data?.convenio && !FORZAR) {
            yaTenian++;
            continue;
        }
        if (c.data?.convenio === cct) {
            yaTenian++;
            continue;
        }
        completadas++;
        if (!DRY_RUN)
            await db.collection("categorias-sat").updateOne({ _id: c._id }, { $set: { "data.convenio": cct, updatedAt: new Date() } });
    }
    console.log(`Categorías: ${cats.length} en total`);
    console.log(`  → ${completadas} se ${DRY_RUN ? "completarían" : "completaron"} con su convenio`);
    console.log(`  → ${yaTenian} ya lo tenían${FORZAR ? "" : " (no se pisan; usar FORZAR=true para rehacerlas)"}`);
    console.log(`  → ${sinCodigo} sin codigoAfip cargado`);
    if (sinMatch.length > 0) {
        // No se inventa un convenio: sin match, la categoría queda sin validar y el checklist lo dice.
        console.log(`  → ${sinMatch.length} sin match en el CSV (quedan sin convenio): ${sinMatch.slice(0, 10).join(" · ")}${sinMatch.length > 10 ? " …" : ""}`);
    }
    // Control de sanidad: que los convenios asignados existan en el catálogo y estén habilitados en
    // alguna empresa. Si una categoría queda con un convenio que ninguna empleadora tiene, sus
    // contratos no van a poder generar el alta y conviene saberlo ahora.
    const usados = new Set(cats.map((c) => c.data?.convenio).filter(Boolean));
    if (!DRY_RUN)
        for (const [, cct] of convenioPorCategoria)
            usados.add(cct);
    const enCatalogo = new Set((await db.collection("convenios").find({}).project({ externalId: 1 }).toArray()).map((c) => String(c.externalId).trim()));
    const faltantes = [...usados].filter((c) => !enCatalogo.has(c));
    if (faltantes.length > 0)
        console.log(`\n⚠ Convenios usados por categorías que NO están en el catálogo de Convenios: ${faltantes.join(", ")}`);
    const empresas = await db.collection("companies").find({}).toArray();
    const habilitados = new Set();
    for (const e of empresas) {
        const convs = await db.collection("convenios").find({ _id: { $in: e.convenioIds || [] } }).project({ externalId: 1 }).toArray();
        for (const c of convs)
            habilitados.add(String(c.externalId).trim());
    }
    const sinEmpresa = [...usados].filter((c) => enCatalogo.has(c) && !habilitados.has(c));
    if (sinEmpresa.length > 0)
        console.log(`\n⚠ Convenios de categorías que ninguna empresa tiene habilitados: ${sinEmpresa.join(", ")}`);
    await mongoose.disconnect();
    console.log(`\n${DRY_RUN ? "DRY RUN terminado: no se escribió nada." : "Listo."}\n`);
}
run().catch(async (err) => {
    console.error("Error:", err);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
