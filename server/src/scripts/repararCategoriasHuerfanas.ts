import mongoose from "mongoose";

/**
 * Repara dos inconsistencias que dejó la convivencia de modelos de categorías. A diferencia de
 * `migrarCategoriasAConvenioGrupo.ts`, este script SÍ es idempotente: se puede correr las veces que
 * haga falta y la segunda no cambia nada.
 *
 * ── 1. Alias de la categoría huérfana ──────────────────────────────────────────────────────────
 * 163 contratos apuntan a `categoria_sat_id = 43`, un id que no existe ni en `categorias` ni en
 * `categorias-sat` (no lo perdió la migración: nunca estuvo). Los 163 declaran
 * `nombre_categoria_sat = "Director de Programas"`, que hoy existe con `legacyId 1`.
 *
 * NO se remapean los contratos, aunque sería lo prolijo: `categoria_sat_id` forma parte de la clave
 * compuesta con la que el sync aditivo de FRAME decide si un contrato ya existe (ver
 * `utils/additiveSync.ts` → `buildContractKey`). Cambiarlo haría que la próxima importación no los
 * reconozca y los vuelva a crear duplicados.
 *
 * En su lugar se crea una categoría ALIAS con `legacyId 43` apuntando al MISMO grupo salarial que la
 * categoría 1, marcada `isActive: false` para que resuelva (sueldo y código ARCA de los 163
 * contratos) pero no aparezca entre las elegibles al cargar un contrato nuevo.
 *
 * ── 2. Nombres "Sin categoria" ─────────────────────────────────────────────────────────────────
 * `routes/projects.ts` buscaba la categoría en la colección `Info`, donde nunca hubo un solo
 * documento de tipo "categoria-sat". El lookup siempre devolvía null, así que todo contrato creado o
 * editado desde el wizard quedó con `nombre_categoria_sat: "Sin categoria"`. La causa ya está
 * arreglada; esto corrige lo que quedó guardado, resolviendo el nombre por `categoria_sat_id`.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/repararCategoriasHuerfanas.ts
 */

const DRY_RUN = process.env.DRY_RUN === "true";

/** El id que quedó colgado y la categoría vigente de la que es un duplicado. */
const LEGACY_HUERFANO = 43;
const LEGACY_DESTINO = 1;
const NOMBRE_ESPERADO = "Director de Programas";

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Alias del id huérfano
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("── Alias de la categoría huérfana ──");

  const yaExiste = await db.collection("categorias").findOne({ legacyId: LEGACY_HUERFANO });
  if (yaExiste) {
    console.log(`  El alias legacyId ${LEGACY_HUERFANO} ya existe (${(yaExiste as any).nombre}). Nada que hacer.`);
  } else {
    const destino = (await db.collection("categorias").findOne({ legacyId: LEGACY_DESTINO })) as any;
    if (!destino) throw new Error(`No existe la categoría legacyId ${LEGACY_DESTINO}: correr primero migrarCategoriasAConvenioGrupo.ts`);

    // Chequeo de seguridad: si la categoría destino no es la que se espera, algo cambió desde que se
    // decidió el alias y crearlo a ciegas apuntaría los 163 contratos a un sueldo equivocado.
    if (String(destino.nombre).trim().toLowerCase() !== NOMBRE_ESPERADO.toLowerCase()) {
      throw new Error(`La categoría legacyId ${LEGACY_DESTINO} se llama "${destino.nombre}" y se esperaba "${NOMBRE_ESPERADO}". Revisar antes de crear el alias.`);
    }

    const alias = {
      convenio: destino.convenio,
      grupoId: destino.grupoId,
      codigoArca: destino.codigoArca,
      nombre: destino.nombre,
      descripcionArca: destino.descripcionArca,
      legacyId: LEGACY_HUERFANO,
      // No elegible: existe solo para que resuelvan los contratos históricos.
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const afectados = await contarContratosCon(db, LEGACY_HUERFANO);
    console.log(`  Crear alias legacyId ${LEGACY_HUERFANO} → "${alias.nombre}" (${alias.convenio}, cód. ${alias.codigoArca}), grupo ${String(alias.grupoId)}`);
    console.log(`  Contratos que pasa a resolver: ${afectados}`);
    if (!DRY_RUN) await db.collection("categorias").insertOne(alias as any);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Nombres denormalizados que quedaron en "Sin categoria"
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n── Nombres 'Sin categoria' ──");

  // Se arma el índice DESPUÉS del alias, así los contratos del 43 también se pueden corregir.
  const categorias = (await db.collection("categorias").find({}).toArray()) as any[];
  const porLegacyId = new Map<number, any>(categorias.filter((c) => c.legacyId != null).map((c) => [Number(c.legacyId), c]));

  const ups = (await db.collection("users_&_projects").find({ "contracts.nombre_categoria_sat": "Sin categoria" }).toArray()) as any[];

  let corregidos = 0;
  const sinResolver = new Map<number, number>();

  for (const up of ups) {
    let cambio = false;
    for (const c of up.contracts || []) {
      if (c.nombre_categoria_sat !== "Sin categoria") continue;

      const cat = porLegacyId.get(Number(c.categoria_sat_id));
      if (!cat) {
        const id = Number(c.categoria_sat_id);
        sinResolver.set(id, (sinResolver.get(id) || 0) + 1);
        continue;
      }
      c.nombre_categoria_sat = cat.nombre;
      corregidos++;
      cambio = true;
    }
    // Se reescribe el array completo: los contratos son subdocumentos y el índice no es estable
    // entre corridas, así que un `$set` posicional sería más frágil que esto.
    if (cambio && !DRY_RUN) await db.collection("users_&_projects").updateOne({ _id: up._id }, { $set: { contracts: up.contracts } });
  }

  console.log(`  Contratos corregidos: ${corregidos}`);
  if (sinResolver.size > 0) {
    console.log(`  Sin resolver (categoria_sat_id que no existe): ${JSON.stringify([...sinResolver.entries()])}`);
  }

  console.log(`\n${DRY_RUN ? "DRY RUN: no se escribió nada." : "Listo."}\n`);
  await mongoose.disconnect();
}

/** Cuántos contratos apuntan a un `categoria_sat_id` dado. */
async function contarContratosCon(db: any, legacyId: number): Promise<number> {
  const ups = (await db.collection("users_&_projects").find({ "contracts.categoria_sat_id": legacyId }).project({ contracts: 1 }).toArray()) as any[];
  return ups.reduce((acc, up) => acc + (up.contracts || []).filter((c: any) => Number(c.categoria_sat_id) === legacyId).length, 0);
}

run().catch(async (e) => {
  console.error("\nFALLÓ:", e.message, "\n");
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
