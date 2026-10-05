import mongoose from "mongoose";
/**
 * Pone al día el catálogo de puestos desempeñados para el ABM nuevo:
 *   · los que no tienen `origen` salieron de la tabla oficial (la semilla del CSV) → `origen: "arca"`,
 *     `activo: true`, `sincronizadoEl` = su fecha de alta;
 *   · normaliza el código a 4 dígitos;
 *   · crea el índice ÚNICO por código, verificando antes que no haya repetidos.
 *
 * Uso (desde server/): npm run puestos:migrar:dry  /  npm run puestos:migrar
 */
const DRY_RUN = process.env.DRY_RUN === "true";
async function run() {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const col = mongoose.connection.db.collection("arca-puestos-desempenados");
    const todos = await col.find({}).toArray();
    const norm = (v) => {
        const d = String(v ?? "").replace(/\D/g, "");
        return d ? d.slice(-4).padStart(4, "0") : "";
    };
    const porCodigo = new Map();
    for (const p of todos)
        porCodigo.set(norm(p.externalId), [...(porCodigo.get(norm(p.externalId)) || []), p]);
    const repetidos = [...porCodigo.entries()].filter(([, l]) => l.length > 1);
    const sinOrigen = todos.filter((p) => !p.origen);
    const malCodigo = todos.filter((p) => p.externalId !== norm(p.externalId));
    console.log(`${todos.length} puestos · sin origen ${sinOrigen.length} · código a normalizar ${malCodigo.length} · repetidos ${repetidos.length}${DRY_RUN ? "  [DRY RUN]" : ""}`);
    if (repetidos.length) {
        for (const [c, l] of repetidos)
            console.log(`  repetido ${c}: ${l.map((x) => x.name).join(" | ")}`);
        console.log("✋ Hay códigos repetidos: no se crea el índice único. Resolvelos a mano.");
    }
    if (!DRY_RUN) {
        const ops = [
            ...sinOrigen.map((p) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { origen: "arca", activo: p.activo !== false, sincronizadoEl: p.createdAt || new Date() } } } })),
            ...malCodigo.map((p) => ({ updateOne: { filter: { _id: p._id }, update: { $set: { externalId: norm(p.externalId) } } } })),
        ];
        if (ops.length)
            await col.bulkWrite(ops, { ordered: true });
        if (!repetidos.length && !(await col.indexes()).some((i) => i.name === "codigo_unico")) {
            await col.createIndex({ externalId: 1 }, { unique: true, name: "codigo_unico" });
            console.log("✓ Índice único creado.");
        }
        console.log(`✓ ${ops.length} actualizados.`);
    }
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
