import fs from "fs";
import path from "path";
import mongoose from "mongoose";
/**
 * Marca como `no_aplica` los convenios que no tienen paritaria y no la van a tener.
 *
 * POR QUÉ HACE FALTA UN SCRIPT PARA UN SOLO CONVENIO
 *
 * `9999/99 — EXCLUIDO DE CONVENIO` no es un CCT: es lo que se declara cuando la persona NO está bajo
 * ninguno. No tiene sindicato, y por lo tanto no hay ninguna página del mundo que publique sus
 * acuerdos. Sin marcarlo, la columna de /convenios lo muestra «Sin revisar» para siempre y ofrece
 * «asignar fuente» — invitando a buscar algo que no existe, una y otra vez, a cada persona nueva.
 *
 * Es un dato, no una regla de código. Hardcodear «si el código es 9999/99, entonces no aplica» en la
 * derivación pondría una excepción de dominio adentro de una función que no la necesita, y el día que
 * aparezca un segundo caso habría que tocar código en vez de tildar un switch. Se escribe una vez.
 *
 * SOLO EL CÓDIGO EXACTO
 *
 * No toca variantes ni parecidos. Si aparece otro `9999/...` en el nomenclador se lo REPORTA y se
 * frena: decidir que algo no tiene paritaria es una afirmación sobre el mundo, y no se deduce de que
 * el código empiece parecido.
 *
 * Uso (desde server/):
 *   npm run convenios-sin-paritaria:dry
 *   npm run convenios-sin-paritaria
 *   npm run convenios-sin-paritaria:revertir -- <respaldo.json>
 */
const DRY_RUN = process.env.DRY_RUN === "true";
/** Los códigos que se marcan, exactos. Uno por línea, con el motivo al lado. */
const SIN_PARITARIA = [{ codigo: "9999/99", porque: "no es un CCT: es «excluido de convenio». Sin sindicato no hay quién publique acuerdos." }];
/** Quién queda registrado como autor. No es una persona: fue una decisión de producto, no una búsqueda. */
const AUTOR = "script marcarConveniosSinParitaria";
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
    const convenios = db.collection("convenios");
    const fuentes = db.collection("fuentes-paritaria");
    const respaldos = [];
    let escritos = 0;
    for (const { codigo, porque } of SIN_PARITARIA) {
        const docs = await convenios.find({ externalId: codigo }).toArray();
        if (docs.length === 0) {
            console.log(`⚠  ${codigo}: no existe en el nomenclador. No se toca nada.`);
            continue;
        }
        /*
          Si alguien le asignó una fuente, hay una contradicción y NO la resuelve un script.
    
          Una de las dos cosas está mal —o el convenio sí tiene dónde publicar, o la asignación fue un
          error— y las dos requieren que una persona mire. Marcar igual dejaría un dato que la derivación
          después ignora, o sea basura con cara de dato.
        */
        const vigilante = await fuentes.findOne({ convenios: codigo });
        if (vigilante) {
            console.log(`⛔ ${codigo}: «${vigilante.nombre}» lo tiene asignado como fuente. No se marca: revisalo a mano.`);
            continue;
        }
        for (const d of docs) {
            if (d.fuenteEstadoDeclarado === "no_aplica") {
                console.log(`·  ${codigo} (${d._id}): ya estaba marcado. Sin cambios.`);
                continue;
            }
            console.log(`✔  ${codigo} (${d._id}) «${d.name}» → no_aplica — ${porque}`);
            respaldos.push({
                _id: String(d._id),
                externalId: String(d.externalId || ""),
                fuenteEstadoDeclarado: d.fuenteEstadoDeclarado,
                fuenteNota: d.fuenteNota,
                fuenteRevisadaPor: d.fuenteRevisadaPor,
                fuenteRevisadaEl: d.fuenteRevisadaEl ?? null,
            });
            if (!DRY_RUN) {
                await convenios.updateOne({ _id: d._id }, { $set: { fuenteEstadoDeclarado: "no_aplica", fuenteNota: porque, fuenteRevisadaPor: AUTOR, fuenteRevisadaEl: new Date() } });
                escritos++;
            }
        }
    }
    // Lo que EMPIEZA igual pero no es igual: se reporta y no se toca. Que un código empiece con 9999 no
    // dice nada sobre si el gremio publica paritarias.
    const parecidos = await convenios
        .find({ externalId: { $regex: "^9999", $nin: SIN_PARITARIA.map((s) => s.codigo) } })
        .project({ externalId: 1, name: 1 })
        .toArray();
    if (parecidos.length > 0) {
        console.log(`\n⚠  Hay ${parecidos.length} código(s) parecido(s) que NO se tocaron. Decidir si tienen paritaria es una afirmación sobre el mundo, no una deducción del código:`);
        for (const p of parecidos)
            console.log(`     ${p.externalId} — ${p.name}`);
    }
    if (!DRY_RUN && respaldos.length > 0) {
        const dir = path.resolve(process.cwd(), "logs");
        fs.mkdirSync(dir, { recursive: true });
        const archivo = path.join(dir, `convenios-sin-paritaria-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
        fs.writeFileSync(archivo, JSON.stringify(respaldos, null, 2));
        console.log(`\nRespaldo reversible: ${archivo}`);
    }
    console.log(`\n${DRY_RUN ? "Se marcarían" : "Se marcaron"} ${DRY_RUN ? respaldos.length : escritos} convenio(s).\n`);
    await mongoose.disconnect();
}
/** Deshace una corrida a partir de su respaldo: deja cada convenio exactamente como estaba. */
async function revertir(archivo) {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("No se pudo establecer la conexión");
    const respaldos = JSON.parse(fs.readFileSync(archivo, "utf8"));
    const convenios = db.collection("convenios");
    for (const r of respaldos) {
        const id = new mongoose.Types.ObjectId(r._id);
        if (r.fuenteEstadoDeclarado === undefined) {
            // No tenía el campo: se lo saca, no se lo pone en "sin_revisar". Ausente y "sin_revisar"
            // significan lo mismo, pero dejar escrito lo que antes no estaba no es revertir.
            await convenios.updateOne({ _id: id }, { $unset: { fuenteEstadoDeclarado: 1, fuenteNota: 1, fuenteRevisadaPor: 1, fuenteRevisadaEl: 1 } });
        }
        else {
            await convenios.updateOne({ _id: id }, { $set: { fuenteEstadoDeclarado: r.fuenteEstadoDeclarado, fuenteNota: r.fuenteNota || "", fuenteRevisadaPor: r.fuenteRevisadaPor || "", fuenteRevisadaEl: r.fuenteRevisadaEl } });
        }
        console.log(`↩  ${r.externalId} (${r._id}) restaurado`);
    }
    console.log(`\n${respaldos.length} convenio(s) restaurado(s).\n`);
    await mongoose.disconnect();
}
const archivoARevertir = process.argv[2];
const tarea = archivoARevertir ? revertir(archivoARevertir) : run();
tarea.catch((e) => {
    console.error(e);
    process.exit(1);
});
