import mongoose from "mongoose";
/**
 * Prepara `companies` para el contexto Empresa:
 *
 *  1. **Renombra `obraSocialId` → `obraSocialDefaultId`.** El nombre viejo sugería "la obra social de
 *     la empresa" cuando siempre fue solo el valor por defecto para las personas que no tienen una
 *     propia. Con el conjunto de registradas ya modelado (`obrasSocialesIds`), la ambigüedad deja de
 *     ser un detalle de nombre: son dos campos distintos.
 *
 *  2. **Siembra `obrasSocialesIds` con la default**, si está vacío. Es el piso correcto y no una
 *     invención: la que la empleadora viene usando está, por definición, registrada ante ARCA. NO se
 *     cargan las ~400 restantes: eso sale de la extracción del padrón, logueado con cada CUIT, y
 *     adivinarlas dejaría pasar altas que ARCA rechaza.
 *
 * Es idempotente. No toca `convenioIds`, `sucursalIds` ni ningún otro campo.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/migrarObrasSocialesPorEmpresa.ts
 */
const DRY_RUN = process.env.DRY_RUN === "true";
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
    const empresas = (await db.collection("companies").find({}).toArray());
    const obrasSociales = (await db.collection("obras-sociales").find({}).toArray());
    // Las obras sociales se referencian por `data.id` (el RNOS numérico) en los contratos y en la
    // default; el conjunto de registradas usa `_id`. Este índice traduce entre los dos.
    const porDataId = new Map(obrasSociales.filter((o) => o.data?.id != null).map((o) => [Number(o.data.id), o]));
    console.log(`Empresas: ${empresas.length} · catálogo de obras sociales: ${obrasSociales.length}\n`);
    let renombradas = 0;
    let sembradas = 0;
    const sinMatch = [];
    for (const e of empresas) {
        const set = {};
        const unset = {};
        // 1. Renombre
        const defaultId = e.obraSocialDefaultId ?? e.obraSocialId ?? null;
        if (e.obraSocialId !== undefined) {
            unset.obraSocialId = "";
            if (e.obraSocialDefaultId === undefined && e.obraSocialId != null)
                set.obraSocialDefaultId = e.obraSocialId;
            renombradas++;
        }
        // 2. Siembra del conjunto
        const yaTiene = Array.isArray(e.obrasSocialesIds) && e.obrasSocialesIds.length > 0;
        if (!yaTiene && defaultId != null) {
            const os = porDataId.get(Number(defaultId));
            if (os) {
                set.obrasSocialesIds = [os._id];
                sembradas++;
            }
            else {
                // La default apunta a un RNOS que no está en el catálogo: se reporta y no se inventa nada.
                sinMatch.push(`${e.razonSocial}: la obra social por defecto (data.id ${defaultId}) no está en el catálogo`);
            }
        }
        const registradas = yaTiene ? e.obrasSocialesIds.length : set.obrasSocialesIds?.length || 0;
        console.log(`  ${String(e.razonSocial || "(sin razón social)").padEnd(28)} default ${String(defaultId ?? "—").padEnd(8)} · registradas: ${registradas}${yaTiene ? " (ya estaban)" : ""}`);
        if (!DRY_RUN && (Object.keys(set).length > 0 || Object.keys(unset).length > 0)) {
            const update = {};
            if (Object.keys(set).length > 0)
                update.$set = set;
            if (Object.keys(unset).length > 0)
                update.$unset = unset;
            await db.collection("companies").updateOne({ _id: e._id }, update);
        }
    }
    console.log(`\nResumen: ${renombradas} renombrada(s), ${sembradas} con su conjunto sembrado.`);
    if (sinMatch.length > 0)
        console.log(`\n⚠ Revisar:\n   ${sinMatch.join("\n   ")}`);
    console.log(`\n⚠ El conjunto REAL de obras sociales registradas sale del padrón de ARCA, logueado con`);
    console.log(`  cada CUIT (Datos del Empleador → Obras Sociales). Este script solo deja la default`);
    console.log(`  adentro del conjunto para que ningún contrato existente quede inválido.\n`);
    console.log(`${DRY_RUN ? "DRY RUN terminado: no se escribió nada." : "Listo."}\n`);
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error("\nFALLÓ:", e.message, "\n");
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
