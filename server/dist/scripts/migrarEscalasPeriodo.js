import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import { Categoria } from "../models/Categoria.js";
import { EscalaPeriodo } from "../models/EscalaPeriodo.js";
import { armarPeriodo } from "../services/escalasConvenio.js";
import { deducirAdicionalPct } from "../utils/escalaCalculo.js";
import { aIsoFecha, vigenciaIncoherente } from "../utils/escalaAFecha.js";
/**
 * MIGRACIÓN 1 · Pasa la escala vigente de cada grupo a la historia versionada.
 *
 * QUÉ HACE Y QUÉ NO
 *
 * Por cada `ConvenioGrupo` con importe cargado, INSERTA un `EscalaPeriodo` que es la foto de lo que hay hoy:
 * `desde` = su `fechaActualizacion`, `hasta` = su `vigenciaHasta`, y los cuatro importes copiados TAL CUAL.
 *
 * **No toca ni un solo documento existente.** Ni `ConvenioGrupo`, ni `Categoria`, ni `categorias-sat`. Es la
 * condición del pedido: los valores vigentes al 15/09/2026 tienen que seguir exactamente iguales. Por eso
 * también es reversible sin riesgo: revertir es borrar lo insertado, y no hay nada que restaurar.
 *
 * LOS IMPORTES SE COPIAN COMO "LO QUE DICE EL ACTA", NO COMO "LO CALCULADO"
 *
 * Van en los campos `acta*`, así que son los que rigen, y la cuenta queda al lado en `diferencias`. Es lo
 * correcto y además informativo: hace visible, sin cambiar nada, que el grupo 8 de 0634/11 tiene un adicional
 * que implica 23,5025 % en lugar del 23,5 % del acta ($21,15 de diferencia).
 *
 * EL CASO DE LA VIGENCIA IMPOSIBLE
 *
 * Los 12 grupos de 0634/11 tienen `fechaActualizacion` 15/09/2026 y `vigenciaHasta` 30/06/2026: un período que
 * termina antes de empezar (la plantilla de junio con los importes de septiembre). Un período así no se puede
 * representar, así que se guarda con `hasta: null` y una nota que lo explica. **El `ConvenioGrupo` queda como
 * está**: corregirlo es una decisión de datos, no de migración.
 *
 * Uso (desde server/):
 *   npm run escalas-periodo:dry
 *   npm run escalas-periodo
 *   npm run escalas-periodo:revertir -- <respaldo.json>
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const MARCA = "escalas-periodo-v1";
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
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}   |   marca: ${MARCA}\n`);
    const grupos = await ConvenioGrupo.find().sort({ convenio: 1, numero: 1 }).lean();
    const insertados = [];
    const salteados = [];
    for (const g of grupos) {
        const convenio = String(g.convenio || "").trim();
        const etiqueta = `${convenio || "(sin convenio)"} G${g.numero}`;
        // Los grupos sin convenio no forman parte de ningún CCT: sus categorías son huérfanas y se resuelven desde
        // el banner de `/arca/categorias`, no versionando una escala que no se sabe de quién es.
        if (!convenio) {
            salteados.push(`${etiqueta}: sin convenio`);
            continue;
        }
        if (!(Number(g.sueldoBruto || 0) > 0)) {
            salteados.push(`${etiqueta}: sin importe cargado (bruto en cero)`);
            continue;
        }
        const desde = aIsoFecha(g.fechaActualizacion);
        if (!desde) {
            // Sin fecha de inicio no hay período: ubicarlo en el tiempo con el día de hoy sería inventar la vigencia.
            salteados.push(`${etiqueta}: sin fechaActualizacion legible`);
            continue;
        }
        const incoherente = vigenciaIncoherente({ desde: g.fechaActualizacion, hasta: g.vigenciaHasta });
        const hasta = incoherente ? null : aIsoFecha(g.vigenciaHasta) || null;
        const adicionalPct = deducirAdicionalPct(Number(g.sueldoBasico || 0), Number(g.sueldoAdicional || 0));
        const ya = await EscalaPeriodo.findOne({ convenio, grupo: g.numero, categoriaId: null, desde: new Date(`${desde}T00:00:00.000Z`) }).select("_id");
        if (ya) {
            salteados.push(`${etiqueta}: ya tenía el período del ${desde}`);
            continue;
        }
        const datos = armarPeriodo({
            convenio,
            grupo: Number(g.numero),
            grupoId: String(g._id),
            desde,
            hasta,
            basico: Number(g.sueldoBasico || 0),
            adicionalPct,
            // El presentismo se copia como dato del acta; el % se deja en 10 (el del CCT) sólo como referencia de la
            // cuenta. Si el importe cargado no es el 10 %, la diferencia queda registrada en `diferencias`.
            presentismoPct: 10,
            acta: {
                adicionalMonto: Number(g.sueldoAdicional || 0),
                presentismoMonto: Number(g.presentismo || 0),
                total: Number(g.sueldoBruto || 0),
                neto: Number(g.neto || 0) || null,
            },
            totalLetras: g.sueldoBrutoLetras || "",
            netoLetras: g.sueldoNetoLetras || "",
            origen: "estado-actual",
            migracion: MARCA,
            nota: incoherente ? `El grupo tenía vigenciaHasta ${aIsoFecha(g.vigenciaHasta)}, anterior a su fechaActualizacion ${desde}. Se guardó sin fin de vigencia; el dato original del grupo no se tocó.` : "",
        });
        const dif = datos.diferencias.map((d) => `${d.campo} ${d.delta > 0 ? "+" : ""}${d.delta}`).join(", ");
        console.log(`── ${etiqueta}: desde ${desde}${hasta ? ` hasta ${hasta}` : " (sin fin)"} · A ${datos.basico} · B ${adicionalPct ?? "—"}% · total ${datos.total}${dif ? `   ⚠ no cierra: ${dif}` : ""}${incoherente ? "   ⚠ vigencia imposible en el grupo: ver nota" : ""}`);
        if (!DRY_RUN) {
            const creado = await EscalaPeriodo.create(datos);
            insertados.push({ _id: String(creado._id), convenio, grupo: Number(g.numero), desde });
        }
        else {
            insertados.push({ _id: "(dry-run)", convenio, grupo: Number(g.numero), desde });
        }
    }
    /**
     * Las categorías con escala PROPIA (los convenios sin grupos, como los de actores) no se migran acá.
     *
     * El modelo las soporta (`categoriaId`), pero el espejo de lo vigente sólo sabe escribir en `ConvenioGrupo`.
     * Versionarlas sin poder espejarlas dejaría dos fuentes de verdad para el mismo importe, que es peor que no
     * versionarlas todavía. Se cuentan para que el pendiente quede dicho con un número.
     */
    const conEscalaPropia = await Categoria.countDocuments({ sueldoBruto: { $gt: 0 } });
    if (!DRY_RUN && insertados.length) {
        const dir = path.resolve(process.cwd(), "logs");
        fs.mkdirSync(dir, { recursive: true });
        const archivo = path.join(dir, `escalas-periodo-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
        fs.writeFileSync(archivo, JSON.stringify(insertados, null, 2));
        console.log(`\nRespaldo reversible: ${archivo}`);
    }
    console.log(`\n${DRY_RUN ? "Se insertarían" : "Se insertaron"} ${insertados.length} período(s).`);
    if (salteados.length) {
        console.log(`\nSalteados (${salteados.length}):`);
        for (const s of salteados)
            console.log(`   · ${s}`);
    }
    console.log(`\nPendiente aparte: ${conEscalaPropia} categoría(s) con escala propia (convenios sin grupos) todavía no se versionan.`);
    console.log("No se modificó ningún documento existente: ni convenio-grupos, ni categorias, ni categorias-sat.\n");
    await mongoose.disconnect();
}
/** Revertir = borrar lo insertado. No hay nada que restaurar porque la migración no pisó nada. */
async function revertir(archivo) {
    const dbName = await conectar();
    const ruta = path.resolve(process.cwd(), archivo);
    if (!fs.existsSync(ruta))
        throw new Error(`No existe el respaldo: ${ruta}`);
    const insertados = JSON.parse(fs.readFileSync(ruta, "utf8"));
    console.log(`\nDB: ${dbName}   |   revirtiendo ${insertados.length} período(s) desde ${path.basename(ruta)}\n`);
    let borrados = 0;
    for (const i of insertados) {
        if (i._id === "(dry-run)")
            continue;
        const r = await EscalaPeriodo.deleteOne({ _id: i._id, migracion: MARCA });
        borrados += r.deletedCount || 0;
    }
    console.log(`${borrados} período(s) borrado(s). Los grupos no se tocaron ni al migrar ni al revertir.\n`);
    await mongoose.disconnect();
}
const archivo = process.argv[2];
(archivo ? revertir(archivo) : run()).catch((e) => {
    console.error("\n❌", e?.message || e, "\n");
    process.exit(1);
});
