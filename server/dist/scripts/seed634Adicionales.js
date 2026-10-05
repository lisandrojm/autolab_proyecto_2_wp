import mongoose from "mongoose";
import { AcuerdoParitario } from "../models/AcuerdoParitario.js";
import { AdicionalConvenio } from "../models/AdicionalConvenio.js";
import { AdicionalValorPeriodo } from "../models/AdicionalValorPeriodo.js";
import { ADICIONALES, EXPEDIENTE, MARCA_ADICIONALES, VIGENCIA_ABRIL, VIGENCIA_JUNIO } from "./datos/acta634_2026.js";
/**
 * SEED 3 · El catálogo de adicionales del 0634/11 y sus importes de abril y junio 2026.
 *
 * Carga los siete que publica el acta —antigüedad, comidas, meriendas, exteriores, subida a torre, guardería y
 * ropa— con los dos importes de cada uno, LITERALES. No se deriva junio de abril con el 4,8 %: seis de los
 * siete darían un centavo distinto del que dice el acta (ver `utils/aplicarParitaria.test.ts`).
 *
 * TODOS QUEDAN "A CONFIRMAR", Y ESO ES LO CORRECTO
 *
 * El acta publica importes, no reglas: no dice cómo se calcula cada adicional ni si es remunerativo. Los dos
 * datos definen la base de aportes, así que se cargan `confirmado: false` y `remunerativo: null`. El tipo de
 * cálculo va con la sugerencia del pedido (antigüedad por año, comidas por evento, guardería mensual…), que es
 * una hipótesis razonable marcada como hipótesis — no un dato.
 *
 * Es idempotente: vuelve a correr sin duplicar nada. Lo que NO hace es pisar un adicional que alguien ya
 * confirmó: si `confirmado: true`, sólo le agrega los importes que falten.
 *
 * Uso (desde server/):
 *   npm run 634-adicionales:dry
 *   npm run 634-adicionales
 *   npm run 634-adicionales:revertir
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const REVERTIR = process.argv[2] === "revertir";
const CONVENIO = "0634/11";
const aFecha = (iso) => new Date(`${iso}T00:00:00.000Z`);
async function conectar() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    return dbName;
}
async function run() {
    const dbName = await conectar();
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}   |   convenio ${CONVENIO}\n`);
    const acuerdo = await AcuerdoParitario.findOne({ expediente: EXPEDIENTE }).select("_id");
    if (!acuerdo)
        console.log(`   ⚠ No está cargado el acuerdo ${EXPEDIENTE} (corré 634-acuerdo primero): los importes van a quedar sin vínculo al acta.\n`);
    let catalogoNuevo = 0;
    let valoresNuevos = 0;
    let respetados = 0;
    for (const [indice, ad] of ADICIONALES.entries()) {
        const existente = await AdicionalConvenio.findOne({ convenio: CONVENIO, codigo: ad.codigo });
        const estado = existente ? (existente.confirmado ? "ya confirmado (no se toca la definición)" : "ya existía") : "nuevo";
        console.log(`── ${ad.nombre} [${ad.codigo}] · ${estado}`);
        console.log(`   tipo sugerido: ${ad.tipoSugerido} (${ad.unidad || "sin unidad"}) · remunerativo: a confirmar`);
        console.log(`   abril ${ad.abril} · junio ${ad.junio}${ad.nota ? `   — ${ad.nota}` : ""}`);
        if (existente?.confirmado)
            respetados++;
        let adicionalId = existente?._id;
        if (!DRY_RUN) {
            if (!existente) {
                const creado = await AdicionalConvenio.create({
                    convenio: CONVENIO,
                    codigo: ad.codigo,
                    nombre: ad.nombre,
                    tipoCalculo: ad.tipoSugerido,
                    remunerativo: null,
                    confirmado: false,
                    unidad: ad.unidad,
                    condicion: ad.nota || "",
                    capitulo: "general",
                    orden: indice + 1,
                    migracion: MARCA_ADICIONALES,
                });
                adicionalId = creado._id;
                catalogoNuevo++;
            }
            /* Los dos importes, cada uno con su vigencia. `upsert` por (adicional, grupo null, desde). */
            for (const [desde, hasta, monto, tramo] of [
                [VIGENCIA_ABRIL.desde, VIGENCIA_ABRIL.hasta, ad.abril, "2026-04"],
                [VIGENCIA_JUNIO.desde, VIGENCIA_JUNIO.hasta, ad.junio, "2026-06"],
            ]) {
                const r = await AdicionalValorPeriodo.updateOne({ adicionalId, grupo: null, desde: aFecha(desde) }, {
                    $setOnInsert: {
                        convenio: CONVENIO,
                        hasta: aFecha(hasta),
                        monto,
                        porcentaje: null,
                        acuerdoId: acuerdo?._id || null,
                        tramo,
                        origen: "acta",
                        migracion: MARCA_ADICIONALES,
                    },
                }, { upsert: true });
                if (r.upsertedCount)
                    valoresNuevos++;
            }
        }
    }
    console.log(`\n${DRY_RUN ? "Se crearían" : "Se crearon"} ${DRY_RUN ? ADICIONALES.length : catalogoNuevo} adicional(es) y ${DRY_RUN ? ADICIONALES.length * 2 : valoresNuevos} importe(s).`);
    if (respetados)
        console.log(`${respetados} ya estaban confirmados: se les respetó la definición.`);
    console.log("\nQueda por confirmar, adicional por adicional: el tipo de cálculo, si es remunerativo, la periodicidad de Ropa y a quién aplica Guardería.\n");
    await mongoose.disconnect();
}
/** Revertir borra sólo lo que este seed creó (por la marca) y nunca lo que alguien confirmó después. */
async function revertir() {
    const dbName = await conectar();
    const adicionales = await AdicionalConvenio.find({ convenio: CONVENIO, migracion: MARCA_ADICIONALES, confirmado: false }).select("_id nombre");
    const ids = adicionales.map((a) => a._id);
    const valores = await AdicionalValorPeriodo.deleteMany({ migracion: MARCA_ADICIONALES });
    const borrados = await AdicionalConvenio.deleteMany({ _id: { $in: ids } });
    const confirmados = await AdicionalConvenio.countDocuments({ convenio: CONVENIO, migracion: MARCA_ADICIONALES, confirmado: true });
    console.log(`\nDB: ${dbName}   |   ${borrados.deletedCount || 0} adicional(es) y ${valores.deletedCount || 0} importe(s) borrado(s).`);
    if (confirmados)
        console.log(`${confirmados} quedaron: ya estaban confirmados y borrarlos sería descartar trabajo de otra persona.`);
    console.log("");
    await mongoose.disconnect();
}
(REVERTIR ? revertir() : run()).catch((e) => {
    console.error("\n❌", e?.message || e, "\n");
    process.exit(1);
});
