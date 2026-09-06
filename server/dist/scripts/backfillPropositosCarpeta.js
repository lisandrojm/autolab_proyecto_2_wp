import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { inferirPropositos, etiquetaProposito, esProposito, PROPOSITOS } from "../utils/propositosCarpeta.js";
/**
 * Carga el `proposito` de las carpetas vigiladas que todavía no lo tienen.
 *
 * QUÉ INFIERE Y CON QUÉ
 *
 * Con EL MISMO patrón que hoy usa la resolución en producción. Si el patrón acierta hoy, el backfill
 * acierta hoy — y a partir de ahí el nombre de la carpeta deja de importar.
 *
 * DÓNDE VIVE LA CONFIGURACIÓN, Y POR QUÉ ESTO NO ES «POR TENANT»
 *
 * `Info` NO tiene `tenantId`: los estados y sus carpetas son una colección GLOBAL, compartida por
 * todos los tenants. Las credenciales de Dropbox sí son por tenant. O sea que hay UNA configuración
 * de carpetas y N cuentas de Dropbox donde esas rutas pueden existir o no.
 *
 * Por eso el reporte hace dos cosas distintas: infiere el propósito una vez (sobre la config global)
 * y después, tenant por tenant, dice si esa ruta existe en SU Dropbox. Un tenant al que le falte una
 * carpeta no invalida nada: se reporta y se sigue.
 *
 * QUÉ FRENA
 *
 * Nada aborta la corrida, pero todo lo dudoso se nombra con estado y ruta:
 *   · una carpeta que no matchea ningún propósito → queda sin migrar y sigue resolviendo por nombre;
 *   · una que matchea DOS → ambigua, no se escribe: elegir por ella sería inventar;
 *   · dos carpetas del mismo estado con el mismo propósito → una de las dos está mal configurada.
 *
 * Uso (desde server/):
 *   npm run propositos:dry
 *   npm run propositos
 *   npm run propositos:revertir -- <respaldo.json>
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const nombre = (c) => (c.dropboxCarpeta || "").split("/").filter(Boolean).pop() || "(sin ruta)";
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("No se pudo establecer la conexión");
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    const estados = await db
        .collection("infos")
        .find({ type: "estado-empleado", "data.transicionAutomatica.carpetas.0": { $exists: true } })
        .toArray();
    const respaldos = [];
    const problemas = [];
    let aEscribir = 0;
    let yaTenian = 0;
    console.log("── Configuración de carpetas (global: `Info` no tiene tenantId) ──\n");
    for (const e of estados) {
        const carpetas = e?.data?.transicionAutomatica?.carpetas || [];
        console.log(`«${e.name}»`);
        const nuevas = [];
        const asignadosEnEsteEstado = new Map();
        for (const c of carpetas) {
            if (esProposito(c.proposito)) {
                // IDEMPOTENTE: lo ya cargado no se toca nunca, ni siquiera si el patrón diría otra cosa.
                // Alguien pudo haberlo corregido a mano, y el patrón es justamente lo que dejamos de creerle.
                yaTenian++;
                console.log(`   ·  ${c.dropboxCarpeta}`);
                console.log(`      ya tiene propósito: ${etiquetaProposito(c.proposito)}  (no se toca)`);
                nuevas.push(c);
                asignadosEnEsteEstado.set(c.proposito, c.dropboxCarpeta || "");
                continue;
            }
            const posibles = inferirPropositos(c);
            if (posibles.length === 0) {
                problemas.push(`«${e.name}» · ${c.dropboxCarpeta}: no matchea NINGÚN propósito. Queda sin migrar y se sigue resolviendo por el nombre.`);
                console.log(`   ⛔ ${c.dropboxCarpeta}`);
                console.log(`      sin propósito inferible`);
                nuevas.push(c);
                continue;
            }
            if (posibles.length > 1) {
                problemas.push(`«${e.name}» · ${c.dropboxCarpeta}: matchea ${posibles.length} propósitos (${posibles.join(", ")}). Ambiguo: no se escribe.`);
                console.log(`   ⛔ ${c.dropboxCarpeta}`);
                console.log(`      AMBIGUA: matchea ${posibles.join(", ")}`);
                nuevas.push(c);
                continue;
            }
            const p = posibles[0];
            const yaUsado = asignadosEnEsteEstado.get(p);
            if (yaUsado !== undefined) {
                problemas.push(`«${e.name}»: «${nombre(c)}» y «${yaUsado.split("/").pop()}» infieren el MISMO propósito (${p}). Una de las dos está mal configurada.`);
                console.log(`   ⛔ ${c.dropboxCarpeta}`);
                console.log(`      propósito repetido en este estado: ${p} (ya lo tiene ${yaUsado})`);
                nuevas.push(c);
                continue;
            }
            asignadosEnEsteEstado.set(p, c.dropboxCarpeta || "");
            aEscribir++;
            console.log(`   ✔  ${c.dropboxCarpeta}`);
            console.log(`      → ${p}   (${etiquetaProposito(p)})`);
            nuevas.push({ ...c, proposito: p });
        }
        const cambia = nuevas.some((n, i) => n.proposito !== carpetas[i]?.proposito);
        if (cambia) {
            respaldos.push({ infoId: String(e._id), estado: e.name, carpetas });
            if (!DRY_RUN)
                await db.collection("infos").updateOne({ _id: e._id }, { $set: { "data.transicionAutomatica.carpetas": nuevas } });
        }
        console.log();
    }
    // ── Cobertura: qué propósitos quedaron sin ninguna carpeta ────────────────
    const cubiertos = new Set();
    for (const e of estados) {
        for (const c of (e?.data?.transicionAutomatica?.carpetas || [])) {
            const p = esProposito(c.proposito) ? c.proposito : inferirPropositos(c)[0];
            if (p)
                cubiertos.add(p);
        }
    }
    const faltantes = PROPOSITOS.filter((p) => !cubiertos.has(p.valor));
    console.log("── Cobertura ──");
    console.log(`   ${cubiertos.size} de ${PROPOSITOS.length} propósitos tienen una carpeta.`);
    if (faltantes.length > 0) {
        // ADVERTENCIA, no error: un tenant puede legítimamente no usar alguno. Faltar uno solo produce
        // un 400 cuando alguien usa esa función concreta, no al guardar.
        console.log(`   ⚠ sin carpeta: ${faltantes.map((f) => `${f.valor} (${f.etiqueta})`).join(", ")}`);
        console.log(`     No es un error: solo significa que esa función todavía no se puede usar.`);
    }
    // ── Por tenant: ¿esas rutas existen en SU Dropbox? ────────────────────────
    console.log("\n── Por tenant: si la ruta existe en su cuenta de Dropbox ──");
    const { getTenantDropboxConfig, listFolder } = await import("../services/dropboxService.js");
    const tenants = await db.collection("tenants").find({}).project({ name: 1, slug: 1, integrations: 1 }).toArray();
    const rutas = [...new Set(estados.flatMap((e) => (e?.data?.transicionAutomatica?.carpetas || []).map((c) => c.dropboxCarpeta)).filter(Boolean))];
    for (const t of tenants) {
        const cfg = getTenantDropboxConfig(t);
        if (!cfg) {
            console.log(`   ${t.name || t.slug}: sin Dropbox conectado — nada que verificar.`);
            continue;
        }
        console.log(`   ${t.name || t.slug}:`);
        for (const ruta of rutas) {
            try {
                await listFolder(String(t._id), cfg, ruta, true);
                console.log(`      ok  ${ruta}`);
            }
            catch (err) {
                const motivo = err?.response?.data?.error_summary || err?.message || "error";
                console.log(`      ⛔  ${ruta}   ${motivo}`);
                problemas.push(`tenant «${t.name || t.slug}» · ${ruta}: no existe en su Dropbox (${motivo})`);
            }
        }
    }
    if (!DRY_RUN && respaldos.length > 0) {
        const dir = path.resolve(process.cwd(), "logs");
        fs.mkdirSync(dir, { recursive: true });
        const archivo = path.join(dir, `propositos-carpeta-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
        fs.writeFileSync(archivo, JSON.stringify(respaldos, null, 2));
        console.log(`\nRespaldo reversible: ${archivo}`);
    }
    // Se cuenta lo que REALMENTE cambiaría, no lo declarado.
    console.log(`\n${DRY_RUN ? "Se escribirían" : "Se escribieron"} ${aEscribir} propósito(s) en ${respaldos.length} estado(s). Ya tenían: ${yaTenian}.`);
    if (aEscribir === 0 && respaldos.length === 0)
        console.log("No hay nada que hacer.");
    if (problemas.length > 0) {
        console.log(`\n⚠ ${problemas.length} cosa(s) para mirar:`);
        for (const p of problemas)
            console.log(`   ${p}`);
    }
    console.log();
    await mongoose.disconnect();
}
/** Deshace una corrida: restaura el array de carpetas tal como estaba (sin `proposito`). */
async function revertir(archivo) {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    const respaldos = JSON.parse(fs.readFileSync(archivo, "utf8"));
    for (const r of respaldos) {
        await db.collection("infos").updateOne({ _id: new mongoose.Types.ObjectId(r.infoId) }, { $set: { "data.transicionAutomatica.carpetas": r.carpetas } });
        console.log(`↩  «${r.estado}» restaurado`);
    }
    console.log(`\n${respaldos.length} estado(s) restaurado(s).\n`);
    await mongoose.disconnect();
}
const archivo = process.argv[2];
(archivo ? revertir(archivo) : run()).catch((e) => {
    console.error(e);
    process.exit(1);
});
