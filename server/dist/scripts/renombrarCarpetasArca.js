import fs from "fs";
import path from "path";
import mongoose from "mongoose";
/**
 * Reapunta las carpetas vigiladas de Dropbox al nuevo árbol de ARCA.
 *
 * QUÉ CAMBIÓ EN DROPBOX
 *
 *   antes                            ahora
 *   /AFIP/Alta temprana de Afip  →   /WEPRODU/ARCA/Alta temprana de Arca
 *   /AFIP/Constancia de cuit     →   /WEPRODU/ARCA/Constancia de cuit
 *   /AFIP/Sin cuit               →   /WEPRODU/ARCA/Sin cuit
 *
 * `/HelloSign` NO se movió: sigue colgando de la raíz, con Outbox, Pendbox y Requested signatures.
 * Verificado listando la cuenta conectada, no deducido — `/AFIP` ya devuelve `path/not_found` y
 * `/WEPRODU/ARCA` ya tiene los tres subdirectorios con los archivos migrados adentro.
 *
 * POR QUÉ ESTO ES UN SCRIPT Y NO UN CAMBIO DE CÓDIGO
 *
 * Las rutas nunca estuvieron en el código: viven en la configuración de cada Estado
 * (`Info.data.transicionAutomatica.carpetas[].dropboxCarpeta`), que es lo que se edita en
 * Configuración → Documentos → Dropbox. El código las resuelve por patrón sobre el ÚLTIMO tramo del
 * path, así que «Constancia de cuit» y «Sin cuit» siguen matcheando igual y «Alta temprana de Arca»
 * también (el patrón es `[/alta/i, /temprana|afip/i]`). Lo único que hay que mover es el dato.
 *
 * SI NO SE CORRE, EL SÍNTOMA ES SILENCIOSO: el cron sigue mirando `/AFIP/...`, que ya no existe, no
 * encuentra nada, y ningún contrato vuelve a avanzar a «Envío de documentación». Sin error visible.
 *
 * Uso (desde server/):
 *   npm run carpetas-arca:dry
 *   npm run carpetas-arca
 *   npm run carpetas-arca:revertir -- <respaldo.json>
 */
const DRY_RUN = process.env.DRY_RUN === "true";
/** De dónde a dónde. Exacto: no se hace ningún reemplazo por patrón sobre paths que no estén acá. */
const MUDANZAS = [
    { de: "/AFIP/Alta temprana de Afip", a: "/WEPRODU/ARCA/Alta temprana de Arca" },
    { de: "/AFIP/Constancia de cuit", a: "/WEPRODU/ARCA/Constancia de cuit" },
    { de: "/AFIP/Sin cuit", a: "/WEPRODU/ARCA/Sin cuit" },
];
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
    const infos = db.collection("infos");
    const estados = await infos.find({ type: "estado-empleado", "data.transicionAutomatica.carpetas.0": { $exists: true } }).toArray();
    const respaldos = [];
    let cambiadas = 0;
    for (const e of estados) {
        const carpetas = (e?.data?.transicionAutomatica?.carpetas || []);
        const nuevas = carpetas.map((c) => {
            const actual = String(c.dropboxCarpeta || "");
            const m = MUDANZAS.find((x) => x.de === actual);
            return m ? { ...c, dropboxCarpeta: m.a } : c;
        });
        const hayCambio = nuevas.some((n, i) => n.dropboxCarpeta !== carpetas[i]?.dropboxCarpeta);
        console.log(`«${e.name}»`);
        for (let i = 0; i < carpetas.length; i++) {
            const antes = carpetas[i]?.dropboxCarpeta;
            const despues = nuevas[i]?.dropboxCarpeta;
            console.log(antes === despues ? `   ·  ${antes}   (sin cambio)` : `   ✔  ${antes}` + `\n      → ${despues}`);
        }
        if (!hayCambio)
            continue;
        // El respaldo guarda el array ENTERO del estado, no solo lo que cambió: revertir tiene que poder
        // dejarlo exactamente como estaba, incluidas las carpetas que no se tocaron y sus `detalle`.
        respaldos.push({ infoId: String(e._id), estado: e.name, carpetas });
        // Se cuenta lo que REALMENTE difiere, también en dry-run. Contar las mudanzas declaradas haría
        // que una corrida sobre datos ya migrados informe «se cambiarían 3» cuando no hay nada que hacer
        // — que es justo cuando alguien necesita creerle al resumen.
        cambiadas += nuevas.filter((n, i) => n.dropboxCarpeta !== carpetas[i]?.dropboxCarpeta).length;
        if (!DRY_RUN)
            await infos.updateOne({ _id: e._id }, { $set: { "data.transicionAutomatica.carpetas": nuevas } });
    }
    // Lo que quedó apuntando al árbol viejo y NO está en la lista: se reporta y no se toca. Un
    // reemplazo por patrón sobre `/AFIP` movería carpetas que nadie verificó que existan del otro lado.
    const huerfanas = [];
    for (const e of estados) {
        for (const c of (e?.data?.transicionAutomatica?.carpetas || [])) {
            const p = String(c.dropboxCarpeta || "");
            if (/^\/AFIP\b/i.test(p) && !MUDANZAS.some((m) => m.de === p))
                huerfanas.push(`${e.name}: ${p}`);
        }
    }
    if (huerfanas.length > 0) {
        console.log(`\n⚠  ${huerfanas.length} carpeta(s) siguen apuntando al árbol viejo y NO están en la lista de mudanzas:`);
        for (const h of huerfanas)
            console.log(`     ${h}`);
        console.log(`   Decidir a dónde van es una afirmación sobre Dropbox, no una deducción del path.`);
    }
    if (!DRY_RUN && respaldos.length > 0) {
        const dir = path.resolve(process.cwd(), "logs");
        fs.mkdirSync(dir, { recursive: true });
        const archivo = path.join(dir, `carpetas-arca-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
        fs.writeFileSync(archivo, JSON.stringify(respaldos, null, 2));
        console.log(`\nRespaldo reversible: ${archivo}`);
    }
    console.log(`\n${DRY_RUN ? "Se cambiarían" : "Se cambiaron"} ${cambiadas} carpeta(s) en ${respaldos.length} estado(s).\n`);
    if (cambiadas === 0)
        console.log("Las carpetas vigiladas ya apuntan al árbol nuevo. No hay nada que hacer.\n");
    await mongoose.disconnect();
}
/** Deshace una corrida: restaura el array de carpetas tal como estaba. */
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
