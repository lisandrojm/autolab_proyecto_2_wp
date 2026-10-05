import fs from "fs";
import path from "path";
import mongoose from "mongoose";
/**
 * Carga la VIGENCIA de las escalas ya cargadas. Fase 4 · D1.
 *
 * QUÉ PROBLEMA RESUELVE
 *
 * Las escalas están cargadas y los importes son correctos, pero ningún documento de la base tiene
 * `vigenciaHasta`: el campo existe en el modelo, el chequeo `auditoriaEscalas` lo lee y el banner de
 * `/arca/categorias` está montado — y los tres callan, porque sin esa fecha no hay desde dónde
 * avisar. El resultado es el peor de los estados posibles: importes vencidos que se ven exactamente
 * igual que los vigentes.
 *
 * NO SE INVENTA NINGUNA FECHA
 *
 * Cada valor de acá abajo tiene su origen anotado al lado. Lo que no está documentado se deja vacío:
 * un `vigenciaDesde` inventado no rompería nada hoy y mentiría para siempre.
 *
 * LO QUE SE ESCRIBE ES LA VIGENCIA, NO EL IMPORTE. No se toca ningún `sueldoBruto`.
 *
 * Uso (desde server/):
 *   npm run vigencia-escalas:dry
 *   npm run vigencia-escalas
 *   npm run vigencia-escalas:revertir -- <respaldo.json>
 */
const DRY_RUN = process.env.DRY_RUN === "true";
/**
 * LAS FECHAS, Y DE DÓNDE SALE CADA UNA.
 *
 * `hasta` es lo único que el aviso necesita, y es lo único que está documentado sin ambigüedad en
 * los tres casos. `desde` queda en `null` a propósito donde no lo está — ver abajo.
 */
const VIGENCIAS = [
    {
        convenio: "0131/75",
        // El acuerdo ATA/CAPIT cubre febrero–junio 2026, verificado contra la página del SATSAID: no hay
        // ninguno posterior. El `fechaActualizacion` que ya tiene este convenio (2026-06-01) es coherente
        // con que lo cargado sea el último tramo, pero eso NO alcanza para afirmar el inicio de vigencia:
        // un acuerdo de cinco meses puede tener tramos mensuales distintos y no sabemos cuál se cargó.
        desde: null,
        hasta: "2026-06-30",
        fuente: "acuerdo ATA/CAPIT feb–jun 2026 · verificado contra satsaid.com.ar: no hay acuerdo posterior",
    },
    {
        convenio: "0634/11",
        // El MISMO acuerdo que 0131/75: se cargan juntos y tienen que decir lo mismo. Hoy este muestra
        // `fechaActualizacion` 2026-07-06, que es la fecha de CARGA y no la del acuerdo — de ahí que los
        // dos convenios muestren fechas distintas para una sola paritaria.
        desde: null,
        hasta: "2026-06-30",
        fuente: "el mismo acuerdo ATA/CAPIT que 0131/75",
    },
    {
        convenio: "0322/75",
        // Escala de televisión de la Asociación Argentina de Actores. Las cuatro categorías tienen
        // `fechaActualizacion` vacía, así que hoy no hay ningún dato desde el cual avisar: el 1 de
        // septiembre los contratos de TIRA muestran un importe vencido con cara de vigente.
        desde: null,
        hasta: "2026-08-31",
        fuente: "escala AAA televisión, vigente hasta el 31/08/2026",
    },
    // 0102/90 NO entra: sus cuatro categorías están sin importe («Sin escala: bloquea el alta»).
    // Ponerle una vigencia sería fechar algo que no existe.
];
/**
 * `fechaActualizacion` se alinea con la vigencia SOLO donde hay un `desde` documentado.
 *
 * Es lo que pide la revisión —«fechaActualizacion = vigencia»— pero pisar la de 0131/75 con un valor
 * deducido cambiaría un dato que hoy es correcto por uno que nadie verificó. Cuando se confirme qué
 * tramo se cargó, se completa `desde` acá y esta misma corrida lo alinea.
 */
const COLECCIONES = ["convenio-grupos", "categorias"];
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
    const hoy = new Date().toISOString().slice(0, 10);
    const respaldos = [];
    let escritos = 0;
    for (const v of VIGENCIAS) {
        console.log(`── ${v.convenio} → vigencia hasta ${v.hasta}${v.desde ? `, desde ${v.desde}` : ""}`);
        console.log(`   origen: ${v.fuente}`);
        if (!v.desde)
            console.log(`   (sin «desde» documentado: no se escribe, y por eso tampoco se toca fechaActualizacion)`);
        for (const coleccion of COLECCIONES) {
            /*
              SOLO lo que tiene un importe cargado.
      
              Fechar una categoría sin `sueldoBruto` sería decir «esta escala venció» sobre algo que nunca
              tuvo escala — y el banner la contaría como una paritaria pendiente que no existe.
            */
            const docs = await db.collection(coleccion).find({ convenio: v.convenio, sueldoBruto: { $gt: 0 } }).toArray();
            if (docs.length === 0)
                continue;
            const yaVencida = v.hasta < hoy;
            console.log(`   ${coleccion}: ${docs.length} con importe${yaVencida ? "   ⚠ YA VENCIDA: va a aparecer en el banner apenas se escriba" : ""}`);
            for (const d of docs) {
                respaldos.push({
                    coleccion,
                    _id: String(d._id),
                    convenio: v.convenio,
                    vigenciaDesde: d.vigenciaDesde ?? null,
                    vigenciaHasta: d.vigenciaHasta ?? null,
                    fechaActualizacion: d.fechaActualizacion ?? null,
                });
                if (!DRY_RUN) {
                    const set = { vigenciaHasta: v.hasta };
                    if (v.desde) {
                        set.vigenciaDesde = v.desde;
                        set.fechaActualizacion = v.desde;
                    }
                    await db.collection(coleccion).updateOne({ _id: d._id }, { $set: set });
                    escritos++;
                }
            }
        }
    }
    if (!DRY_RUN && respaldos.length > 0) {
        const dir = path.resolve(process.cwd(), "logs");
        fs.mkdirSync(dir, { recursive: true });
        const archivo = path.join(dir, `vigencia-escalas-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
        fs.writeFileSync(archivo, JSON.stringify(respaldos, null, 2));
        console.log(`\nRespaldo reversible: ${archivo}`);
    }
    console.log(`\n${DRY_RUN ? "Se escribirían" : "Se escribieron"} ${DRY_RUN ? respaldos.length : escritos} documento(s).`);
    console.log(`Hoy es ${hoy}: las vigencias anteriores a esta fecha van a encender el banner de escalas vencidas.\n`);
    await mongoose.disconnect();
}
/** Deshace una corrida: deja cada documento exactamente como estaba, incluida la ausencia del campo. */
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
    for (const r of respaldos) {
        const set = {};
        const unset = {};
        for (const campo of ["vigenciaDesde", "vigenciaHasta", "fechaActualizacion"]) {
            // `null` en el respaldo = el campo NO estaba. Volver a escribirlo como null no sería revertir.
            if (r[campo] === null)
                unset[campo] = 1;
            else
                set[campo] = r[campo];
        }
        await db.collection(r.coleccion).updateOne({ _id: new mongoose.Types.ObjectId(r._id) }, { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) });
    }
    console.log(`\n${respaldos.length} documento(s) restaurado(s).\n`);
    await mongoose.disconnect();
}
const archivo = process.argv[2];
(archivo ? revertir(archivo) : run()).catch((e) => {
    console.error(e);
    process.exit(1);
});
