import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { ArcaCatalogo, ArcaCatalogoLectura } from "../models/ArcaCatalogo.js";
import { calcularDiff, filasCsvArca, hashTabla } from "../compartido/catalogoArca.js";
import { aplicarFilas } from "../services/arca/espejoArca.js";
/**
 * SIEMBRA EL ESPEJO DE ARCA (`arca_catalogo`) desde el CSV versionado del repo.
 *
 * El CSV (`documentation/arca_tablas_simplificacion_registral.csv`) coincide con ARCA —verificado el
 * 2/10/2026 contra la pantalla de altas para 0634/11, 0322/75, 0102/90, 9999/99, puestos, situación
 * de revista, tipos de servicio y modalidades—. Es la semilla; después lo mantiene la sincronización
 * contra ARCA.
 *
 * Idempotente: lo que ya está igual no se toca, lo nuevo se agrega, lo cambiado se actualiza y lo que
 * el CSV ya no trae pasa a `vigente: false` (nunca se borra). Deja una lectura `origen: csv` registrada.
 *
 * Uso (desde server/):
 *   npm run catalogo-arca:sembrar:dry
 *   npm run catalogo-arca:sembrar
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const CSV_PATH = process.env.CSV || path.resolve(process.cwd(), "../documentation/arca_tablas_simplificacion_registral.csv");
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    const csv = filasCsvArca(fs.readFileSync(CSV_PATH, "utf8"));
    const filas = csv.map((f, i) => ({ tabla: f.tabla, filtroPadre: f.filtroPadre || "", codigo: f.codigo, descripcion: f.descripcion, codigoPadded: f.codigoPadded, largo: f.largo, alcance: f.alcance, orden: i }));
    const tablas = [...new Set(filas.map((f) => f.tabla))];
    await mongoose.connect(uri, { dbName });
    console.log(`Base: ${dbName}   ${DRY_RUN ? "[DRY RUN]" : "[APLICA]"}   CSV: ${CSV_PATH}\n`);
    const actuales = await ArcaCatalogo.find({ vigente: true }).select("tabla filtroPadre codigo descripcion").lean();
    const diff = calcularDiff(actuales, filas, tablas);
    const porTabla = {};
    for (const t of tablas) {
        const deLaTabla = [...new Map(filas.filter((f) => f.tabla === t).map((f) => [`${f.filtroPadre}|${f.codigo}`, f])).values()];
        porTabla[t] = { cantidad: deLaTabla.length, hash: hashTabla(deLaTabla) };
    }
    for (const [t, v] of Object.entries(porTabla))
        console.log(`  ${t.padEnd(24)} ${String(v.cantidad).padStart(4)}  hash ${v.hash}`);
    console.log(`\nNuevas ${diff.nuevos.length} · descripción cambiada ${diff.descripcionCambiada.length} · dejan de ser vigentes ${diff.dejaronDePublicarse.length}`);
    for (const d of diff.descripcionCambiada.slice(0, 20))
        console.log(`  ~ ${d.tabla} ${d.filtroPadre} ${d.codigo}: «${d.descripcionAnterior}» → «${d.descripcion}»`);
    for (const d of diff.dejaronDePublicarse.slice(0, 20))
        console.log(`  − ${d.tabla} ${d.filtroPadre} ${d.codigo} «${d.descripcion}»`);
    if (DRY_RUN) {
        console.log("\n[DRY RUN] No se escribió nada.");
        await mongoose.disconnect();
        return;
    }
    await ArcaCatalogo.syncIndexes();
    const r = await aplicarFilas({ filas, origen: "csv", empresaCuit: null, tablas });
    await ArcaCatalogoLectura.create({ origen: "csv", empresaCuit: null, porTabla, tablasLeidas: tablas, diff, estado: "aplicada", aplicadaEl: new Date() });
    console.log(`\nEspejo: ${r.nuevos} nuevas, ${r.cambiados} actualizadas, ${r.bajas} dejaron de ser vigentes.`);
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
