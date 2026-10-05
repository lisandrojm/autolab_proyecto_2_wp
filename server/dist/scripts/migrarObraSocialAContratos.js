import mongoose from "mongoose";
/**
 * Mueve la obra social de la PERSONA a cada uno de sus CONTRATOS.
 *
 * Por qué: el RNOS es un dato de la relación laboral, no del CUIL. ARCA lo declara en cada alta (pos.
 * 40-45), no lo lee de un padrón de personas: dos contratos de la misma persona en dos empleadoras
 * son dos registros y cada uno lleva el suyo. Además caduca solo —por desregulación alguien cambia de
 * obra social sin que su empleadora se entere—, así que un valor guardado en la ficha se propagaba en
 * silencio a todos los contratos futuros.
 *
 * Qué hace, en dos pasos que se corren por separado a propósito:
 *
 *   PASO 1 (default)          copia `users.metadata.osId` a cada contrato de esa persona, con
 *                             `obraSocialOrigen: "heredada-usuario"` y SIN fecha de constatación.
 *                             Ese origen es el que la UI marca en amarillo: el dato existe pero nadie
 *                             lo verificó.
 *
 *   PASO 2 (DROP_USER=true)   recién ahí borra `metadata.osId` de todos los usuarios.
 *
 * Están separados para que el borrado sea una decisión explícita y posterior a ver el resultado del
 * paso 1. Correr el paso 2 sin el paso 1 pierde el dato.
 *
 * NO pisa contratos que ya tengan `obraSocialId`: si alguien ya constató uno, el valor viejo y sin
 * verificar de la persona no puede ganarle. Por eso es idempotente.
 *
 * Las personas sin ningún contrato pierden el valor, y está bien: era un dato sin verificar, sin
 * fecha y sin uso. Cuando se les haga un contrato hay que constatarlo igual.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/migrarObraSocialAContratos.ts
 *
 *   # y una vez revisado:
 *   DROP_USER=true ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/migrarObraSocialAContratos.ts
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const DROP_USER = process.env.DROP_USER === "true";
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    console.log(`Conectado a ${dbName}${DRY_RUN ? "  [DRY RUN]" : ""}\n`);
    const usuarios = await db
        .collection("users")
        .find({ "metadata.osId": { $exists: true, $ne: null } }, { projection: { _id: 1, firstName: 1, lastName: 1, "metadata.osId": 1 } })
        .toArray();
    console.log(`Personas con obra social cargada: ${usuarios.length}`);
    let contratosTocados = 0;
    let contratosYaTenian = 0;
    let sinContratos = 0;
    for (const u of usuarios) {
        const osId = Number(u.metadata?.osId);
        if (!Number.isFinite(osId) || osId === 0)
            continue;
        const memberships = await db.collection("userprojects").find({ user: u._id }).toArray();
        if (memberships.length === 0) {
            sinContratos++;
            continue;
        }
        for (const m of memberships) {
            const contratos = m.contracts || [];
            for (let i = 0; i < contratos.length; i++) {
                // El que ya tiene obra social propia no se toca: puede estar constatada, y lo de la persona
                // es justamente el dato sin verificar que estamos degradando.
                if (contratos[i]?.obraSocialId) {
                    contratosYaTenian++;
                    continue;
                }
                contratosTocados++;
                if (!DRY_RUN) {
                    await db.collection("userprojects").updateOne({ _id: m._id }, {
                        $set: {
                            [`contracts.${i}.obraSocialId`]: osId,
                            [`contracts.${i}.obraSocialOrigen`]: "heredada-usuario",
                        },
                    });
                }
            }
        }
    }
    console.log(`\nPASO 1 — copiar a los contratos`);
    console.log(`  contratos actualizados : ${contratosTocados}`);
    console.log(`  ya tenían obra social  : ${contratosYaTenian} (no se tocaron)`);
    console.log(`  personas sin contratos : ${sinContratos} (pierden el valor, era un dato sin verificar)`);
    if (DROP_USER) {
        console.log(`\nPASO 2 — borrar metadata.osId de los usuarios`);
        if (DRY_RUN) {
            console.log(`  [DRY RUN] se borraría de ${usuarios.length} persona(s)`);
        }
        else {
            const r = await db.collection("users").updateMany({ "metadata.osId": { $exists: true } }, { $unset: { "metadata.osId": "" } });
            console.log(`  borrado de ${r.modifiedCount} persona(s)`);
        }
    }
    else {
        console.log(`\nPASO 2 — NO se corrió. Revisá el resultado y volvé a correr con DROP_USER=true.`);
    }
    await mongoose.disconnect();
}
run().catch((e) => {
    console.error(e);
    process.exit(1);
});
