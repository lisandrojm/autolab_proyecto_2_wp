import fs from "fs";
import mongoose from "mongoose";
/**
 * Auditoría de SOLO LECTURA del catálogo de categorías, contra el nomenclador de ARCA.
 *
 * No arregla nada: reporta. Es la contraparte de la regla "cualquier código fuera de rango es dato
 * mal cargado: reportalo, no lo migres en silencio". Cada hallazgo viene con el número de contratos
 * afectados, porque es lo que decide qué se puede dar de baja y qué hay que arreglar.
 *
 * Chequea:
 *  1. Categorías huérfanas: sin convenio, o con un código que no es un código de ARCA ("0", "").
 *  2. Categorías cuyo par (convenio, código) NO existe en el export de ARCA — el reemplazo correcto
 *     del "rango 035283-035388" hardcodeado, que solo servía para el SAT.
 *  3. Contratos que apuntan a un `categoria_sat_id` que no resuelve contra ninguna categoría.
 *  4. Grupos salariales con la escala en cero: sus contratos no pueden generar el TXT.
 *  5. Funciones FRAME que mezclan categorías de convenios distintos.
 *  6. Convenios usados por categorías que ninguna empresa tiene habilitados (ARCA los va a rechazar).
 *
 * Uso (desde server/):
 *   CSV=../documentation/arca_tablas_simplificacion_registral.csv \
 *     ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/auditarCategorias.ts
 */
const CSV_PATH = process.env.CSV || "../documentation/arca_tablas_simplificacion_registral.csv";
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
const titulo = (n, t) => console.log(`\n── ${n}. ${t} ${"─".repeat(Math.max(0, 74 - t.length))}`);
const ok = (msg) => console.log(`   ✓ ${msg}`);
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    // El CSV es opcional: sin él se saltea el cotejo contra ARCA y el resto igual corre.
    const hayCsv = fs.existsSync(CSV_PATH);
    const enArca = new Map(); // "convenio|codigo" → descripción
    if (hayCsv) {
        const filas = parseCsv(fs.readFileSync(CSV_PATH, "utf-8").replace(/^﻿/, ""));
        const enc = filas.shift();
        const [iTabla, iPadded, iDesc, iPadre] = ["tabla", "codigo_padded", "descripcion", "filtro_padre"].map((k) => enc.indexOf(k));
        for (const f of filas) {
            if (f[iTabla] !== "CATEGORIA_CCT")
                continue;
            enArca.set(`${String(f[iPadre] || "").trim()}|${String(f[iPadded] || "").trim()}`, String(f[iDesc] || "").trim());
        }
    }
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("No se pudo establecer la conexión");
    console.log(`\nDB: ${dbName}   |   SOLO LECTURA`);
    console.log(hayCsv ? `CSV de ARCA: ${CSV_PATH} (${enArca.size} categorías)` : `⚠ Sin CSV (${CSV_PATH}): se saltea el cotejo contra ARCA`);
    const cats = (await db.collection("categorias").find({}).toArray());
    const grupos = (await db.collection("convenio-grupos").find({}).toArray());
    const porGrupoId = new Map(grupos.map((g) => [String(g._id), g]));
    console.log(`\nCatálogo: ${cats.length} categorías en ${grupos.length} grupos.`);
    // Uso en contratos, por `legacyId`.
    const filas = await db
        .collection("users_&_projects")
        .aggregate([{ $unwind: "$contracts" }, { $group: { _id: "$contracts.categoria_sat_id", total: { $sum: 1 } } }])
        .toArray();
    const uso = new Map();
    for (const f of filas) {
        const id = Number(f._id);
        if (Number.isFinite(id))
            uso.set(id, f.total);
    }
    const contratosDe = (c) => (c.legacyId != null ? uso.get(Number(c.legacyId)) || 0 : 0);
    const codigoValido = (v) => /^\d{6}$/.test(String(v || "")) && String(v) !== "000000";
    let hallazgos = 0;
    // ── 1
    titulo(1, "Categorías huérfanas (sin convenio o sin código de ARCA)");
    const huerfanas = cats.filter((c) => !String(c.convenio || "").trim() || !codigoValido(c.codigoArca));
    if (huerfanas.length === 0)
        ok("Ninguna.");
    for (const c of huerfanas.sort((a, b) => contratosDe(b) - contratosDe(a))) {
        hallazgos++;
        const n = contratosDe(c);
        console.log(`   ✗ "${c.nombre}" (legacyId ${c.legacyId ?? "—"}) · convenio "${c.convenio || ""}" · código "${c.codigoArca || ""}" · ${n} contrato(s)`);
        console.log(`     → ${n > 0 ? "NO se puede dar de baja: asignarle convenio y código reales desde ARCA → Categorías." : "Sin contratos: se puede dar de baja."}`);
    }
    // ── 2
    titulo(2, "Categorías que no existen en el nomenclador de ARCA");
    if (!hayCsv)
        console.log("   (salteado: falta el CSV)");
    else {
        const fuera = cats.filter((c) => String(c.convenio || "").trim() && codigoValido(c.codigoArca) && !enArca.has(`${String(c.convenio).trim()}|${String(c.codigoArca)}`));
        if (fuera.length === 0)
            ok("Todos los pares (convenio, código) existen en ARCA.");
        for (const c of fuera) {
            hallazgos++;
            console.log(`   ✗ ${c.convenio} · ${c.codigoArca} "${c.nombre}" · ${contratosDe(c)} contrato(s) — ARCA no tiene ese código en ese convenio`);
        }
        // El otro lado del cotejo: categorías que ARCA sí tiene y acá faltan, por convenio ya cargado.
        const conveniosCargados = [...new Set(cats.map((c) => String(c.convenio || "").trim()).filter(Boolean))];
        for (const cct of conveniosCargados.sort()) {
            const enArcaDelCct = [...enArca.keys()].filter((k) => k.startsWith(`${cct}|`));
            const cargados = new Set(cats.filter((c) => String(c.convenio).trim() === cct).map((c) => String(c.codigoArca)));
            const faltan = enArcaDelCct.map((k) => k.split("|")[1]).filter((cod) => !cargados.has(cod));
            if (faltan.length > 0) {
                hallazgos++;
                console.log(`   ✗ ${cct}: faltan ${faltan.length} de las ${enArcaDelCct.length} categorías de ARCA (${faltan.slice(0, 8).join(", ")}${faltan.length > 8 ? " …" : ""})`);
                console.log(`     → cargalas con: CONVENIOS=${cct} tsx src/scripts/importarCategoriasArca.ts`);
            }
            else
                ok(`${cct}: las ${enArcaDelCct.length} categorías de ARCA están cargadas.`);
        }
    }
    // ── 3
    titulo(3, "Contratos que apuntan a una categoría inexistente");
    const porLegacy = new Set(cats.filter((c) => c.legacyId != null).map((c) => Number(c.legacyId)));
    const rotos = [...uso.entries()].filter(([id]) => !porLegacy.has(id)).sort((a, b) => b[1] - a[1]);
    if (rotos.length === 0)
        ok("Todos los contratos resuelven su categoría.");
    for (const [id, n] of rotos) {
        hallazgos++;
        console.log(`   ✗ categoria_sat_id ${id} → ${n} contrato(s), sin categoría que lo resuelva`);
    }
    if (rotos.length > 0)
        console.log(`     → ver scripts/repararCategoriasHuerfanas.ts (crea un alias en vez de remapear, porque categoria_sat_id es parte de la clave del sync de FRAME)`);
    // ── 4
    titulo(4, "Grupos con la escala en cero (sus contratos no pueden generar el TXT)");
    const enCero = grupos.filter((g) => !Number(g.sueldoBruto));
    if (enCero.length === 0)
        ok("Ninguno.");
    for (const g of enCero.sort((a, b) => String(a.convenio).localeCompare(String(b.convenio)) || a.numero - b.numero)) {
        const suyas = cats.filter((c) => String(c.grupoId) === String(g._id));
        const contratos = suyas.reduce((acc, c) => acc + contratosDe(c), 0);
        // 9999/99 EXCLUIDO DE CONVENIO no tiene escala de convenio: el cero ahí es el valor correcto.
        const esperado = String(g.convenio).trim() === "9999/99";
        // Un grupo vacío no bloquea nada: quedó suelto (típicamente después de mudar su categoría a otro
        // convenio). Se informa para poder limpiarlo, pero no cuenta como hallazgo.
        const vacio = suyas.length === 0;
        if (!esperado && !vacio)
            hallazgos++;
        const nota = esperado ? " — correcto: excluido de convenio no tiene escala" : vacio ? " — grupo vacío: se puede eliminar desde ARCA → Categorías" : "";
        console.log(`   ${esperado || vacio ? "·" : "✗"} ${String(g.convenio || "(sin convenio)").padEnd(10)} grupo ${String(g.numero).padStart(2)} · ${suyas.length} categoría(s) · ${contratos} contrato(s)${nota}`);
    }
    // ── 5
    titulo(5, "Funciones FRAME que mezclan convenios");
    const porLegacyId = new Map(cats.filter((c) => c.legacyId != null).map((c) => [Number(c.legacyId), c]));
    const roles = (await db.collection("roles_frame").find({}).toArray());
    let mezcladas = 0;
    for (const r of roles) {
        // Las que no resuelven NO se descartan: una función con una categoría rota apunta, de hecho, a
        // algo que no es de ningún convenio, y esconderla haría parecer coherente lo que no lo es.
        const asoc = (r.data?.categoriasSat || []).map((cs) => porLegacyId.get(Number(cs?.id)) || { convenio: "", codigoArca: "", nombre: `${cs?.nombre || "?"} (id ${cs?.id} no resuelve)`, roto: true });
        const convs = [...new Set(asoc.map((c) => (c.roto ? "(no resuelve)" : String(c.convenio || "").trim() || "(sin convenio)")))];
        if (convs.length > 1) {
            mezcladas++;
            hallazgos++;
            console.log(`   ✗ "${r.name}" → ${convs.join(" + ")}`);
            for (const c of asoc)
                console.log(`       ${String(c.convenio || (c.roto ? "—" : "sin convenio")).padEnd(10)} ${c.codigoArca || "sin código"}  ${c.nombre}`);
            console.log(`     → una función mapea a categorías de UN convenio: la empleadora tiene que tenerlo habilitado`);
        }
    }
    if (mezcladas === 0)
        ok(`Las ${roles.length} funciones apuntan a un solo convenio.`);
    // ── 6
    titulo(6, "Convenios de categorías que ninguna empresa tiene habilitados");
    const convenios = (await db.collection("convenios").find({}).toArray());
    const codigoPorId = new Map(convenios.map((c) => [String(c._id), String(c.externalId).trim()]));
    const habilitados = new Set();
    for (const e of (await db.collection("companies").find({}).toArray())) {
        for (const id of e.convenioIds || []) {
            const cod = codigoPorId.get(String(id));
            if (cod)
                habilitados.add(cod);
        }
    }
    const usados = [...new Set(cats.map((c) => String(c.convenio || "").trim()).filter(Boolean))];
    const sinEmpresa = usados.filter((c) => !habilitados.has(c));
    if (sinEmpresa.length === 0)
        ok("Todos los convenios con categorías están habilitados en alguna empresa.");
    for (const c of sinEmpresa) {
        hallazgos++;
        const n = cats.filter((x) => String(x.convenio).trim() === c).reduce((acc, x) => acc + contratosDe(x), 0);
        console.log(`   ✗ ${c} · ${n} contrato(s) — ARCA no va a aceptar estas altas: habilitá el convenio en Configuración → Empresas`);
    }
    console.log(`\n${hallazgos === 0 ? "Sin hallazgos." : `${hallazgos} hallazgo(s).`}\n`);
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error("\nFALLÓ:", e.message, "\n");
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
