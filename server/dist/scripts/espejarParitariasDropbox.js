import fs from "node:fs/promises";
import mongoose from "mongoose";
import { PublicacionParitaria } from "../models/PublicacionParitaria.js";
import { FuenteParitaria } from "../models/FuenteParitaria.js";
import { rutaAbsoluta, existeArchivo } from "../services/archivoParitariaService.js";
import { conexionEspejo, baseAlcanzable, basePariarias, anioDe, nombreLegible, rutaEspejo, subirEspejo } from "../services/espejoDropboxParitaria.js";
/**
 * Sube a Dropbox las copias que falten. Idempotente: lo ya subido se saltea.
 *
 *   npm run paritarias-dropbox:dry     (no sube; imprime las rutas que usaría)
 *   npm run paritarias-dropbox         (sube lo que falta)
 *
 * NO BAJA NADA DEL GREMIO. Si el archivo no está en disco, se saltea con motivo: volver a bajarlo
 * para subirlo archivaría un documento distinto bajo la identidad del viejo, que es exactamente el
 * riesgo que guardar el archivo vino a cubrir.
 */
const DRY_RUN = process.env.DRY_RUN === "true";
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no sube)" : "ESCRITURA"}`);
    console.log(`Base: ${basePariarias()}\n`);
    const { conexion, motivo } = await conexionEspejo();
    if (!conexion) {
        console.log(`✖ Sin Dropbox utilizable: ${motivo}`);
        console.log(`  Las publicaciones quedan en «pendiente» y se reintentan en la próxima corrida.`);
        console.log(`  Nada de esto afecta a la app: el PDF se sigue sirviendo desde el disco del server.\n`);
        if (!DRY_RUN)
            await marcarPendientes(motivo);
        await mongoose.disconnect();
        return;
    }
    const alcance = await baseAlcanzable(conexion);
    if (!alcance.ok) {
        console.log(`✖ ${alcance.motivo}`);
        console.log(`  Salidas: reconectar Dropbox con una app que vea esa carpeta, o apuntar`);
        console.log(`  DROPBOX_PARITARIAS_PATH a una ruta que exista en la cuenta conectada.\n`);
        if (!DRY_RUN)
            await marcarPendientes(alcance.motivo);
        await mongoose.disconnect();
        return;
    }
    const entidades = new Map();
    for (const f of await FuenteParitaria.find({}).select("entidad").lean())
        entidades.set(String(f._id), f.entidad || "");
    // Idempotencia: lo que ya está en «ok» no se vuelve a subir ni se consulta contra Dropbox.
    const pendientes = await PublicacionParitaria.find({ "dropbox.estado": { $ne: "ok" } }).sort({ detectadaEl: 1 });
    const yaEstan = await PublicacionParitaria.countDocuments({ "dropbox.estado": "ok" });
    console.log(`a subir: ${pendientes.length}   |   ya espejadas: ${yaEstan}\n`);
    let subidas = 0;
    let salteadas = 0;
    const fallas = [];
    for (const p of pendientes) {
        const etiqueta = (p.textoEnlace || p.url.split("/").pop() || "").slice(0, 50);
        if (!p.archivo?.ruta || !(await existeArchivo(p.archivo.ruta))) {
            salteadas++;
            const razon = p.archivo?.ruta ? "el archivo no está en disco" : "la publicación no tiene archivo guardado";
            console.log(`·  ${etiqueta}\n     se saltea: ${razon} (no se vuelve a bajar del gremio)`);
            if (!DRY_RUN)
                await PublicacionParitaria.updateOne({ _id: p._id }, { $set: { dropbox: { path: "", estado: "pendiente", motivo: `No se espejó: ${razon}.` } } });
            continue;
        }
        const ex = p.extraccion || {};
        const nombre = nombreLegible({
            detectadaEl: p.detectadaEl,
            textoEnlace: p.textoEnlace,
            entidad: entidades.get(String(p.fuente)) || "sin entidad",
            conveniosMencionados: (ex.conveniosMencionados || []).map((c) => c.valor),
            periodo: ex.periodoMencionado?.valor,
            expediente: ex.expediente?.valor,
        });
        const path = rutaEspejo(entidades.get(String(p.fuente)) || "sin entidad", anioDe(ex.periodoMencionado?.valor, p.detectadaEl), nombre);
        if (DRY_RUN) {
            console.log(`·  ${path}`);
            continue;
        }
        const bytes = await fs.readFile(rutaAbsoluta(p.archivo.ruta));
        const r = await subirEspejo(conexion, path, bytes);
        if (r.estado === "ok") {
            subidas++;
            console.log(`✔  ${path}`);
        }
        else {
            fallas.push(`${etiqueta} → ${r.motivo}`);
            console.log(`✖  ${etiqueta}\n     ${r.motivo}`);
        }
        await PublicacionParitaria.updateOne({ _id: p._id }, { $set: { dropbox: { path, subidoEl: r.estado === "ok" ? new Date() : undefined, estado: r.estado, motivo: r.motivo } } });
    }
    console.log(`\n── Resultado ──`);
    console.log(`   subidas: ${subidas}   ·   salteadas (sin archivo): ${salteadas}   ·   fallidas: ${fallas.length}`);
    if (fallas.length > 0) {
        console.log(`\n   Quedan en «pendiente» y se reintentan solas en la próxima corrida:`);
        for (const f of fallas)
            console.log(`   · ${f}`);
    }
    console.log("");
    await mongoose.disconnect();
}
/** Deja el motivo escrito en las que no se pudieron espejar, sin tocar las que ya están. */
async function marcarPendientes(motivo) {
    const r = await PublicacionParitaria.updateMany({ "dropbox.estado": { $ne: "ok" } }, { $set: { dropbox: { path: "", estado: "pendiente", motivo } } });
    console.log(`  ${r.modifiedCount} publicación(es) quedaron en «pendiente» con el motivo.\n`);
}
run().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect();
    process.exit(1);
});
