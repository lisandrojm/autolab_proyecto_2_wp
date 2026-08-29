import fs from "fs";
import path from "path";
import mongoose from "mongoose";

/**
 * Saca los grupos salariales de los convenios de actores: la escala pasa a vivir en la categoría.
 *
 * QUÉ SON ESOS GRUPOS Y POR QUÉ SOBRAN
 *
 * 0322/75 y 0102/90 tienen hoy cuatro grupos y cuatro categorías cada uno — un grupo por cabeza, con
 * el mismo nombre que su única categoría. No es una escala: es lo que hubo que inventar cuando
 * `grupoId` era obligatorio y no había otra forma de guardar la fila.
 *
 * ARCA no publica grupo salarial para estos dos convenios: el nomenclador los lista planos
 * («032564 - TIRA», sin sufijo de grupo) y la tarifa de actores se pacta por rol, no por
 * agrupamiento. Ahora que el grupo es opcional y `escalaCategoria` sabe leer la escala de la propia
 * categoría, el nivel intermedio no agrega nada y sí confunde: la plantilla de paritaria sale con una
 * columna «grupo» que pide un dato que no existe.
 *
 * QUÉ HACE, EN ESTE ORDEN
 *
 *   1. Pasa las categorías a `grupoId: null`, conservando `isActive`.
 *   2. Recién entonces borra los grupos, y SOLO si quedaron sin ninguna categoría colgando.
 *
 * El orden importa: al revés, un fallo a la mitad dejaría categorías apuntando a un grupo borrado —
 * que es el mismo tipo de puntero fantasma que costó los 164 contratos del `legacyId 43`.
 *
 * NINGUNA CATEGORÍA SE BORRA. Los grupos sí, porque son estructura que este convenio no tiene; las
 * categorías son el dato.
 *
 * Uso (desde server/):
 *   npm run actores:aplanar:dry
 *   npm run actores:aplanar
 *   npm run actores:aplanar:revertir -- <respaldo.json>
 */

const DRY_RUN = process.env.DRY_RUN === "true";

/** Los convenios donde ARCA no publica grupo. No se toca ningún otro. */
const CONVENIOS = ["0322/75", "0102/90"];

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const respaldo: { categorias: Array<{ _id: string; grupoId: string }>; grupos: any[] } = { categorias: [], grupos: [] };

  for (const convenio of CONVENIOS) {
    const grupos = await db.collection("convenio-grupos").find({ convenio }).toArray();
    const cats = await db.collection("categorias").find({ convenio }).toArray();
    console.log(`${convenio}  ·  ${cats.length} categoría(s)  ·  ${grupos.length} grupo(s)`);

    /*
      SI ALGÚN GRUPO TIENE ESCALA, SE FRENA.

      Un grupo con importes cargados significa que alguien pactó ahí una escala, y borrarlo la
      perdería sin que quede rastro. Hoy los ocho están en cero —por eso este trabajo existe— pero el
      chequeo tiene que estar igual: el día que no se cumpla, es que la premisa cambió.
    */
    const conEscala = grupos.filter((g: any) => Number(g.sueldoBruto || 0) > 0);
    if (conEscala.length > 0) {
      console.log(`   ✗ ${conEscala.length} grupo(s) tienen escala cargada (${conEscala.map((g: any) => g.nombre || g.numero).join(", ")}). NO se toca este convenio.`);
      console.log(`     Aplanarlo perdería esos importes. Pasalos a la categoría primero.\n`);
      continue;
    }

    // 1. Las categorías se sueltan del grupo.
    const conGrupo = cats.filter((c: any) => c.grupoId);
    for (const c of conGrupo as any[]) {
      respaldo.categorias.push({ _id: String(c._id), grupoId: String(c.grupoId) });
      console.log(`   · «${c.nombre}» (${c.codigoArca}) → sin grupo${c.isActive === false ? "  [de baja, se respeta]" : ""}`);
      if (!DRY_RUN) await db.collection("categorias").updateOne({ _id: c._id }, { $set: { grupoId: null } });
    }

    // 2. Los grupos se borran, pero solo los que quedaron REALMENTE vacíos: se vuelve a preguntar a
    //    la base en vez de asumir que el paso anterior alcanzó.
    for (const g of grupos as any[]) {
      const colgando = DRY_RUN ? cats.filter((c: any) => String(c.grupoId) === String(g._id) && !conGrupo.some((x: any) => String(x._id) === String(c._id))).length : await db.collection("categorias").countDocuments({ grupoId: g._id });
      if (colgando > 0) {
        console.log(`   ✗ grupo «${g.nombre || g.numero}»: todavía tiene ${colgando} categoría(s). No se borra.`);
        continue;
      }
      respaldo.grupos.push(g);
      console.log(`   − grupo «${g.nombre || g.numero}» eliminado (vacío)`);
      if (!DRY_RUN) await db.collection("convenio-grupos").deleteOne({ _id: g._id });
    }
    console.log("");
  }

  if (respaldo.categorias.length > 0 || respaldo.grupos.length > 0) {
    const carpeta = path.resolve("respaldos");
    fs.mkdirSync(carpeta, { recursive: true });
    const archivo = path.join(carpeta, `aplanar-actores-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2), "utf8");
    console.log(`Respaldo: ${archivo}`);
    console.log(`Para volver atrás:  npm run actores:aplanar:revertir -- "${archivo}"\n`);
  }

  // ── Verificación: que las 8 sigan visibles, ahora en `sinGrupo` ─────────────
  console.log("CÓMO QUEDAN (es lo que va a mostrar la pantalla):\n");
  for (const convenio of CONVENIOS) {
    const cats = await db.collection("categorias").find({ convenio }).toArray();
    const grupos = await db.collection("convenio-grupos").countDocuments({ convenio });
    const sinGrupo = cats.filter((c: any) => !c.grupoId).length;
    console.log(`   ${convenio}  ·  ${grupos} grupo(s)  ·  ${sinGrupo}/${cats.length} categoría(s) en «sin grupo»`);
    for (const c of cats as any[]) console.log(`      ${c.codigoArca}  ${c.nombre}  ·  escala ${Number(c.sueldoBruto || 0) > 0 ? `$ ${Number(c.sueldoBruto).toLocaleString("es-AR")}` : "SIN CARGAR"}`);
  }
  console.log("\nLa escala se carga ahora con «Paritaria» del convenio: la plantilla sale por CATEGORÍA con su código de ARCA.\n");

  await mongoose.disconnect();
}

/** Devuelve los grupos y vuelve a colgarles sus categorías. */
async function revertir(archivo: string) {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
  const respaldo = JSON.parse(fs.readFileSync(archivo, "utf8")) as { categorias: Array<{ _id: string; grupoId: string }>; grupos: any[] };

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db!;
  console.log(`\nDB: ${dbName}   |   REVIRTIENDO desde ${archivo}\n`);

  // Primero los grupos y después las referencias, al revés que al aplanar: acá el estado intermedio
  // seguro es "el grupo existe y nadie lo apunta", no "lo apuntan y no existe".
  for (const g of respaldo.grupos) {
    await db.collection("convenio-grupos").updateOne({ _id: new mongoose.Types.ObjectId(String(g._id)) }, { $set: { ...g, _id: undefined } }, { upsert: true });
  }
  console.log(`   ← ${respaldo.grupos.length} grupo(s) restituido(s)`);
  for (const c of respaldo.categorias) {
    await db.collection("categorias").updateOne({ _id: new mongoose.Types.ObjectId(c._id) }, { $set: { grupoId: new mongoose.Types.ObjectId(c.grupoId) } });
  }
  console.log(`   ← ${respaldo.categorias.length} categoría(s) devuelta(s) a su grupo\n`);
  await mongoose.disconnect();
}

if (process.argv[1] && process.argv[1].includes("aplanarConveniosActores")) {
  const archivo = process.argv.find((a) => a.endsWith(".json"));
  (archivo ? revertir(archivo) : run()).catch((e) => {
    console.error("\nError:", e?.message || e, "\n");
    process.exit(1);
  });
}
