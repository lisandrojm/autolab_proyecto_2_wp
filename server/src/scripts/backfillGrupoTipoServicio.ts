import mongoose from "mongoose";

/**
 * Siembra los 2 Grupos de Tipo de Servicio (`l_GTS`) y clasifica los 293 tipos de servicio.
 *
 * POR QUÉ HACE FALTA
 * ──────────────────
 * De los 293 tipos de servicio, **49 nombres están repetidos** (98 registros). En el buscador se ven
 * dos filas idénticas y elegir la equivocada escribe otro código en las posiciones 107-109 del TXT:
 *
 *     AERONAVEGANTE: INSTRUCTOR O INSPECTOR   →  014  y  514
 *     TAREAS INSALUBRES                       →  006  y  506
 *
 * Lo que las separa es el grupo, que ARCA pide como campo aparte de la pantalla de alta y que este
 * proyecto no tenía.
 *
 * LA REGLA, Y POR QUÉ SE PUEDE AFIRMAR
 * ────────────────────────────────────
 * Los códigos ≥ 500 son DISCONTINUOS; el resto, CONTINUOS. No es una corazonada por la partición
 * 55/238: el propio nomenclador lo dice en dos de sus nombres.
 *
 *     000  SERVICIOS COMUNES CONTINUOS
 *     500  SERVICIOS COMUNES DISCONTINUOS
 *
 * Y la numeración lo respalda: los códigos van de 000 a 299 y saltan a 500-560, sin nada en el medio.
 * El bloque 5xx es un espejo del 0xx-2xx, no una continuación.
 *
 * LO QUE EL GRUPO NO ARREGLA
 * ──────────────────────────
 * Quedan DOS nombres duplicados que el grupo no desambigua, porque los dos códigos caen en el mismo:
 *
 *     114 / 115  PERSONAL QUE SE DESEMPEÑE EN ACTIVIDADES PENOSAS… DECRETO N 2012 PROVINCIA DE RIO NEGRO
 *     248 / 249  BALANCINES, SILLETAS, ESCALERAS A VIENTO O SOGAS A NUDO, Y ALTA TENSION Y OTROS SAN LUIS
 *
 * Por eso el selector muestra SIEMPRE el código junto al nombre, y no solo mientras el grupo esté
 * vacío: para estos cuatro registros el código es lo único que los distingue.
 *
 * NO TOCA lo ya clasificado a mano: si un tipo de servicio tiene `grupo` cargado, se lo deja. Si ARCA
 * confirmara que la regla es otra, se corrige el grupo desde el ABM sin volver a correr nada.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/backfillGrupoTipoServicio.ts
 */

const DRY_RUN = process.env.DRY_RUN === "true";

/** Los 2 registros de `l_GTS`, tal como los nombra ARCA. */
const GRUPOS = [
  { externalId: "1", name: "CONTINUOS" },
  { externalId: "2", name: "DISCONTINUOS" },
];

/** Código ≥ 500 → discontinuo. Ver el encabezado: lo dice el nomenclador en 000 / 500. */
const grupoDe = (externalId: string): string => {
  const n = Number(String(externalId).replace(/\D/g, ""));
  if (!Number.isFinite(n)) return "";
  return n >= 500 ? "2" : "1";
};

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  // 1. Los 2 grupos. Upsert por código: correrlo dos veces deja lo mismo.
  const colGrupos = db.collection("arca-grupos-tipo-servicio");
  for (const g of GRUPOS) {
    const existe = await colGrupos.findOne({ externalId: g.externalId });
    if (existe) {
      console.log(`   = grupo ${g.externalId} ${g.name} (ya estaba)`);
      continue;
    }
    if (!DRY_RUN) {
      await colGrupos.insertOne({
        externalId: g.externalId,
        name: g.name,
        data: { id: Number(g.externalId), nombre: g.name },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    console.log(`   + grupo ${g.externalId} ${g.name}`);
  }

  // 2. Los tipos de servicio sin clasificar.
  const colTipos = db.collection("arca-tipos-servicio");
  const tipos = await colTipos.find({}).project({ externalId: 1, name: 1, grupo: 1 }).toArray();
  console.log(`\n${tipos.length} tipo(s) de servicio en la base.`);

  const yaClasificados = tipos.filter((t) => String(t.grupo || "").trim() !== "");
  const pendientes = tipos.filter((t) => String(t.grupo || "").trim() === "");
  if (yaClasificados.length > 0) console.log(`   ${yaClasificados.length} ya tenían grupo cargado: no se tocan.`);

  const porGrupo: Record<string, number> = { "1": 0, "2": 0 };
  const sinCodigo: string[] = [];
  const ops = [];
  for (const t of pendientes) {
    const g = grupoDe(String(t.externalId || ""));
    if (!g) {
      sinCodigo.push(String(t.name || t._id));
      continue;
    }
    porGrupo[g]++;
    ops.push({ updateOne: { filter: { _id: t._id }, update: { $set: { grupo: g } } } });
  }

  console.log(`\n   → 1 CONTINUOS:    ${porGrupo["1"]}`);
  console.log(`   → 2 DISCONTINUOS: ${porGrupo["2"]}`);
  if (sinCodigo.length > 0) {
    // Sin código no hay regla que aplicar. Se dejan vacíos y se avisa: inventarles un grupo sería
    // exactamente el error que este script viene a evitar.
    console.log(`\n   ⚠ ${sinCodigo.length} sin código, quedan sin grupo:`);
    sinCodigo.slice(0, 10).forEach((n) => console.log(`      ${n}`));
  }

  if (ops.length > 0 && !DRY_RUN) {
    const res = await colTipos.bulkWrite(ops);
    console.log(`\n${res.modifiedCount} tipo(s) de servicio clasificado(s).`);
  } else if (DRY_RUN) {
    console.log(`\nDRY RUN terminado: ${ops.length} se actualizarían. No se escribió nada.`);
  } else {
    console.log("\nNo había nada para clasificar.");
  }

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error("\n✖", e.message);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
