import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { AcuerdoParitario } from "../models/AcuerdoParitario.js";
import { EscalaPequenasEmpresas } from "../models/EscalaPequenasEmpresas.js";
import { desvioJornadaAdicional } from "../services/escalasConvenio.js";
import { redondearCentavos } from "../utils/escalaCalculo.js";
import { EXPEDIENTE, MARCA_PEQUENAS, VIGENCIA_ABRIL, VIGENCIA_JUNIO } from "./datos/acta634_2026.js";
/**
 * SEED 4 · El capítulo de PEQUEÑAS EMPRESAS del 0634/11.
 *
 * ESTE SEED NO TIENE LOS DATOS ADENTRO, Y ES A PROPÓSITO.
 *
 * Los cuatro valores por grupo (semana de labor de 9 h de lunes a viernes, jornada adicional, hora extra al 50 %
 * y al 100 %) no están en ninguna parte del sistema ni llegaron con el pedido: sólo llegó la ESTRUCTURA. Poner
 * números inventados o derivados de la escala mensual sería peor que no tenerlos, porque no habría forma de
 * distinguirlos de los del acta. Así que el script exige el archivo.
 *
 * Formato de `ARCHIVO` (JSON), un objeto por tramo:
 *   {
 *     "abril": [{ "grupo": 1, "semana9hsLunVie": 0, "jornadaAdicional9hs": 0, "horaExtra50": 0, "horaExtra100": 0 }],
 *     "junio": [ … ]
 *   }
 *
 * Valida lo que el acta dice de sí misma: la jornada adicional tendría que ser la semana ÷ 5. Si no da, LO CARGA
 * IGUAL y avisa — el importe que se paga es el del acta, no el que cierra.
 *
 * Uso (desde server/):
 *   ARCHIVO=pequenas_empresas.json npm run 634-pequenas:dry
 *   ARCHIVO=pequenas_empresas.json npm run 634-pequenas
 *   npm run 634-pequenas:revertir
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const REVERTIR = process.argv[2] === "revertir";
const CONVENIO = "0634/11";
const ARCHIVO = process.env.ARCHIVO?.trim();
const aFecha = (iso) => new Date(`${iso}T00:00:00.000Z`);
async function conectar() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    return dbName;
}
function leerArchivo(ruta) {
    const absoluta = path.resolve(process.cwd(), ruta);
    if (!fs.existsSync(absoluta))
        throw new Error(`No existe el archivo: ${absoluta}`);
    const json = JSON.parse(fs.readFileSync(absoluta, "utf8"));
    const normalizar = (filas) => (filas || []).map((f) => ({
        grupo: Number(f.grupo),
        semana9hsLunVie: Number(f.semana9hsLunVie || 0),
        jornadaAdicional9hs: Number(f.jornadaAdicional9hs || 0),
        horaExtra50: Number(f.horaExtra50 || 0),
        horaExtra100: Number(f.horaExtra100 || 0),
    }));
    return { abril: normalizar(json.abril), junio: normalizar(json.junio) };
}
async function run() {
    if (!ARCHIVO) {
        console.log("\nFalta ARCHIVO=<ruta.json> con la tabla del capítulo de pequeñas empresas.");
        console.log("Los importes no están en el sistema y no se pueden derivar de la escala mensual: sin el acta, no hay nada que cargar.");
        console.log("\nFormato esperado:");
        console.log('  { "abril": [{ "grupo": 1, "semana9hsLunVie": 0, "jornadaAdicional9hs": 0, "horaExtra50": 0, "horaExtra100": 0 }], "junio": [ … ] }\n');
        process.exit(1);
    }
    const dbName = await conectar();
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}   |   convenio ${CONVENIO}   |   archivo ${ARCHIVO}\n`);
    const datos = leerArchivo(ARCHIVO);
    const acuerdo = await AcuerdoParitario.findOne({ expediente: EXPEDIENTE }).select("_id");
    if (!acuerdo)
        console.log(`   ⚠ No está cargado el acuerdo ${EXPEDIENTE}: las filas van a quedar sin vínculo al acta.\n`);
    const tramos = [
        { nombre: "abril 2026", codigo: "2026-04", vigencia: VIGENCIA_ABRIL, filas: datos.abril || [] },
        { nombre: "junio 2026", codigo: "2026-06", vigencia: VIGENCIA_JUNIO, filas: datos.junio || [] },
    ];
    let escritas = 0;
    const avisos = [];
    for (const tramo of tramos) {
        if (!tramo.filas.length) {
            console.log(`── ${tramo.nombre}: el archivo no trae filas, se saltea.`);
            continue;
        }
        console.log(`── ${tramo.nombre} (${tramo.vigencia.desde} → ${tramo.vigencia.hasta})`);
        for (const f of tramo.filas.sort((a, b) => a.grupo - b.grupo)) {
            if (!Number.isFinite(f.grupo))
                continue;
            const desvio = desvioJornadaAdicional(f.semana9hsLunVie, f.jornadaAdicional9hs);
            if (desvio != null)
                avisos.push(`${tramo.codigo} G${f.grupo}: la jornada adicional difiere en ${desvio} de la semana ÷ 5`);
            console.log(`   G${String(f.grupo).padStart(2)}: semana ${f.semana9hsLunVie} · jornada ${f.jornadaAdicional9hs}${desvio != null ? ` ⚠ (esperada ${redondearCentavos(f.semana9hsLunVie / 5)})` : ""} · extra 50 % ${f.horaExtra50} · extra 100 % ${f.horaExtra100}`);
            if (!DRY_RUN) {
                await EscalaPequenasEmpresas.updateOne({ convenio: CONVENIO, grupo: f.grupo, desde: aFecha(tramo.vigencia.desde) }, {
                    $setOnInsert: {
                        hasta: aFecha(tramo.vigencia.hasta),
                        semana9hsLunVie: redondearCentavos(f.semana9hsLunVie),
                        jornadaAdicional9hs: redondearCentavos(f.jornadaAdicional9hs),
                        horaExtra50: redondearCentavos(f.horaExtra50),
                        horaExtra100: redondearCentavos(f.horaExtra100),
                        acuerdoId: acuerdo?._id || null,
                        tramo: tramo.codigo,
                        origen: "acta",
                        migracion: MARCA_PEQUENAS,
                    },
                }, { upsert: true });
                escritas++;
            }
        }
    }
    console.log(`\n${DRY_RUN ? "Se cargarían" : "Se cargaron"} ${DRY_RUN ? tramos.reduce((n, t) => n + t.filas.length, 0) : escritas} fila(s).`);
    if (avisos.length) {
        console.log(`\nAvisos (${avisos.length}) — se cargan igual, el importe del acta manda:`);
        for (const a of avisos)
            console.log(`   · ${a}`);
    }
    console.log("");
    await mongoose.disconnect();
}
async function revertir() {
    const dbName = await conectar();
    const r = await EscalaPequenasEmpresas.deleteMany({ convenio: CONVENIO, migracion: MARCA_PEQUENAS });
    console.log(`\nDB: ${dbName}   |   ${r.deletedCount || 0} fila(s) borrada(s).\n`);
    await mongoose.disconnect();
}
(REVERTIR ? revertir() : run()).catch((e) => {
    console.error("\n❌", e?.message || e, "\n");
    process.exit(1);
});
