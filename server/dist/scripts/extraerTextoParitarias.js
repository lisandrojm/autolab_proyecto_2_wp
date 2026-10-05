import mongoose from "mongoose";
import { PublicacionParitaria } from "../models/PublicacionParitaria.js";
import { FuenteParitaria } from "../models/FuenteParitaria.js";
import { rutaAbsoluta, existeArchivo } from "../services/archivoParitariaService.js";
import { extraerTexto, detectarPdftotext } from "../services/extraerTextoParitaria.js";
import { detectarSenales, cotejarConvenios, coincidePeriodo, periodosMencionados } from "../services/senalesParitaria.js";
/**
 * Extrae el texto plano de los PDF guardados y detecta sus señales.
 *
 * DATO DERIVADO, REGENERABLE. Todo lo que escribe sale del archivo que ya está en disco: no baja
 * nada, no consulta al gremio, y correrlo de nuevo sobre todo el corpus es la operación normal —es
 * lo que hay que hacer cada vez que se afine un detector.
 *
 * NO TOCA LA CAPA 1. Ni `vista`, ni `estado`, ni el archivo. Que el sistema haya leído una
 * publicación no significa que una persona la haya visto, y confundir las dos cosas haría desaparecer
 * la bandeja de novedades sin que nadie la hubiera mirado.
 *
 *   npm run paritarias-texto:dry     (no escribe; extrae e imprime lo que detectaría)
 *   npm run paritarias-texto         (escribe)
 *   FORZAR=true npm run paritarias-texto    (re-extrae también las que ya tienen texto)
 *
 * Sin `FORZAR` se saltea lo ya extraído, así que la corrida diaria cuesta casi nada.
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const FORZAR = process.env.FORZAR === "true";
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    const extractor = (await detectarPdftotext()) ? "pdftotext -layout (poppler)" : "pdf-parse (sin dependencia de sistema)";
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}${FORZAR ? " · FORZANDO re-extracción" : ""}`);
    console.log(`Extractor: ${extractor}\n`);
    const filtro = FORZAR ? {} : { "extraccion.extraidoEl": { $exists: false } };
    const pubs = await PublicacionParitaria.find(filtro).sort({ detectadaEl: 1 });
    const total = await PublicacionParitaria.countDocuments({});
    console.log(`publicaciones a procesar: ${pubs.length} de ${total}\n`);
    // Los convenios que cada fuente dice alimentar, para cotejar contra lo que el PDF menciona.
    const fuentes = new Map();
    for (const f of await FuenteParitaria.find({}).select("convenios").lean())
        fuentes.set(String(f._id), f.convenios || []);
    const conteo = { ok: 0, vacio: 0, error: 0, sinArchivo: 0 };
    const hallazgos = [];
    for (const p of pubs) {
        const etiqueta = (p.textoEnlace || p.url.split("/").pop() || "").slice(0, 58);
        /*
          Sin archivo se saltea CON MOTIVO, no falla. `disponible: false` es un estado legítimo: hay
          publicaciones que nacieron antes de que se guardaran los PDF y otras cuyo archivo el gremio ya
          no sirve. Cortar la corrida entera por una de esas dejaría sin texto a las 32 restantes.
        */
        if (!p.archivo?.ruta || !(await existeArchivo(p.archivo.ruta))) {
            conteo.sinArchivo++;
            const motivo = p.archivo?.ruta ? "el archivo no está en disco" : "la publicación no tiene archivo guardado";
            console.log(`·  ${etiqueta}\n     se saltea: ${motivo}`);
            if (!DRY_RUN) {
                await PublicacionParitaria.updateOne({ _id: p._id }, { $set: { "extraccion.estado": "error", "extraccion.motivo": `No se extrajo: ${motivo}.`, "extraccion.extraidoEl": new Date(), "extraccion.texto": "", "extraccion.paginas": 0 } });
            }
            continue;
        }
        const r = await extraerTexto(rutaAbsoluta(p.archivo.ruta));
        const senales = detectarSenales(r.texto);
        const deLaFuente = fuentes.get(String(p.fuente)) || [];
        const cotejo = cotejarConvenios(senales.conveniosMencionados.map((c) => c.valor), deLaFuente);
        // Todos los períodos del PDF, no solo el que se muestra: un acuerdo encabeza un tramo por mes.
        const periodoOk = coincidePeriodo(periodosMencionados(r.texto).map((x) => x.valor), p.textoEnlace);
        conteo[r.estado]++;
        const marca = r.estado === "ok" ? "✔" : r.estado === "vacio" ? "◌" : "✖";
        console.log(`${marca}  ${etiqueta}`);
        console.log(`     ${r.paginas} pág · ${r.texto.length} chars${r.motivo ? ` · ${r.motivo}` : ""}`);
        const resumen = [
            senales.conveniosMencionados.length ? `CCT ${senales.conveniosMencionados.map((c) => c.valor).join(", ")}` : "sin CCT citado",
            cotejo === "ajeno" ? "AJENO a esta fuente" : cotejo === "sin_mencion" ? "no cita convenio" : "coincide",
            senales.periodoMencionado ? `período ${senales.periodoMencionado.valor}` : "sin período",
            periodoOk === false ? "PERÍODO DISTINTO AL DEL ENLACE" : "",
            senales.unidadSospechosa ? `UNIDAD: «${senales.unidadSospechosa.valor}»` : "",
        ].filter(Boolean);
        console.log(`     ${resumen.join(" · ")}`);
        if (cotejo === "ajeno")
            hallazgos.push(`AJENO · ${etiqueta} → cita ${senales.conveniosMencionados.map((c) => c.valor).join(", ")}, la fuente alimenta ${deLaFuente.join(", ")}`);
        if (senales.unidadSospechosa)
            hallazgos.push(`UNIDAD · ${etiqueta} → «${senales.unidadSospechosa.fragmento}»`);
        if (r.estado === "vacio")
            hallazgos.push(`SIN TEXTO · ${etiqueta} → ${r.motivo}`);
        if (periodoOk === false)
            hallazgos.push(`PERÍODO · ${etiqueta} → el PDF dice «${senales.periodoMencionado?.valor}» y el enlace «${p.textoEnlace}»`);
        if (DRY_RUN)
            continue;
        /*
          `$set` de campos puntuales y no `p.save()`: guardar el documento entero reescribiría también
          `vista` y `estado` con lo que se leyó al principio de la corrida, y si alguien marcó una
          publicación como vista mientras esto corría, se perdería. La regla de no tocar la capa 1 se
          cumple acá, en la forma de la escritura.
        */
        await PublicacionParitaria.updateOne({ _id: p._id }, {
            $set: {
                extraccion: {
                    texto: r.texto,
                    paginas: r.paginas,
                    extraidoEl: new Date(),
                    estado: r.estado,
                    motivo: r.motivo,
                    extractor: r.extractor || undefined,
                    conveniosMencionados: senales.conveniosMencionados,
                    periodoMencionado: senales.periodoMencionado || undefined,
                    expediente: senales.expediente || undefined,
                    unidadSospechosa: senales.unidadSospechosa || undefined,
                    cotejoConvenios: cotejo,
                    ...(periodoOk === null ? {} : { periodoCoincide: periodoOk }),
                },
            },
        });
    }
    console.log(`\n── Resultado ──`);
    console.log(`   ok: ${conteo.ok}   ·   sin capa de texto: ${conteo.vacio}   ·   error: ${conteo.error}   ·   sin archivo: ${conteo.sinArchivo}`);
    if (hallazgos.length > 0) {
        console.log(`\n── Lo que hay que mirar (${hallazgos.length}) ──`);
        for (const h of hallazgos)
            console.log(`   · ${h}`);
        console.log(`\nNinguna publicación se descartó por esto: son señales para quien decide.`);
    }
    console.log("");
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect();
    process.exit(1);
});
