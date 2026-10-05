import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { ArcaCatalogo } from "../models/ArcaCatalogo.js";
import { exportarCsvArca } from "../compartido/catalogoArca.js";
/**
 * Regenera `documentation/arca_tablas_simplificacion_registral.csv` desde el espejo de ARCA, con el
 * mismo formato. Solo las filas vigentes que vienen del CSV o de ARCA, en el orden del CSV; lo nuevo
 * va al final de su tabla. El resultado es un commit revisable.
 *
 * Uso (desde server/): npm run catalogo-arca:exportar-csv     (SALIDA=<ruta> para escribir en otro lado)
 */
async function run() {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const filas = await ArcaCatalogo.find({ vigente: true, tabla: { $ne: "GRUPO_TIPO_SERVICIO" } }).lean();
    // Orden del CSV; las nuevas (orden alto) al final, agrupadas por tabla y código.
    filas.sort((a, b) => (a.orden ?? 999999) - (b.orden ?? 999999) || String(a.tabla).localeCompare(b.tabla) || String(a.codigo).localeCompare(b.codigo));
    const csv = exportarCsvArca(filas.map((f) => ({ tabla: f.tabla, alcance: f.alcance || "", codigo: f.codigo, codigoPadded: f.codigoPadded || f.codigo, largo: f.largo || String(f.codigoPadded || f.codigo).length, descripcion: f.descripcion, filtroPadre: f.filtroPadre || "" })));
    const salida = process.env.SALIDA || path.resolve(process.cwd(), "../documentation/arca_tablas_simplificacion_registral.csv");
    fs.writeFileSync(salida, csv, "utf8");
    console.log(`${filas.length} filas → ${salida}`);
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
