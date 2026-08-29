import fs from "fs";
import path from "path";
import mongoose from "mongoose";

/**
 * Remapea las funciones FRAME que quedaron apuntando a categorías inexistentes o dadas de baja.
 *
 * QUÉ ROMPIÓ Y QUÉ NO
 *
 * La Fase 2 reasignó los contratos y dio de baja «Actor» y «Musico», pero nadie tocó las funciones
 * FRAME, que guardan su lista de categorías DENORMALIZADA por id. Los contratos ya armados están
 * bien —su categoría sigue resolviendo—; lo que estaba roto era el PRÓXIMO: quien eligiera el rol
 * «Actor» recibía como propuesta una categoría inactiva, sin convenio y sin código de ARCA. Y sin
 * ruido, porque «Actor» ya no figuraba entre las huérfanas del panel rojo justamente por estar de
 * baja.
 *
 * QUÉ HACE Y QUÉ NO
 *
 *  - Reescribe `data.categoriasSat` de las funciones listadas en `REMAPEOS`, y nada más.
 *  - NO borra funciones ni categorías.
 *  - NO inventa la categoría de «Músico», «Coordinador de Intimidad» ni «Doblajista»: las reporta.
 *  - Guarda el estado anterior completo en un JSON antes de escribir. Ver `revertir()`.
 *
 * Uso (desde server/):
 *   npm run funciones-frame:reparar:dry     ← no escribe nada
 *   npm run funciones-frame:reparar
 *   npm run funciones-frame:reparar:revertir -- <archivo-de-respaldo.json>
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const COLECCION_CONTRATOS = "users_&_projects";

/**
 * A qué categorías tiene que apuntar cada función, por `legacyId`.
 *
 * Los ids son los del catálogo, no los del documento guardado: se re-resuelven contra `categorias`
 * al aplicar, así que si alguno dejara de existir el script FRENA en vez de escribir una referencia
 * rota — que es exactamente el error que vino a arreglar.
 */
const REMAPEOS: Array<{ funcion: string; rolId: number; legacyIds: number[]; porque: string }> = [
  {
    funcion: "Actor",
    rolId: 54,
    // Las CUATRO de 0322/75, no la que más se usa: es el criterio acordado para funciones con varias
    // categorías posibles — la interfaz pide la decisión en vez de resolverla sola. Hoy los contratos
    // se reparten entre TIRA (142) y UNITARIO (9), así que elegir una sola dejaría a la otra afuera.
    legacyIds: [409, 410, 411, 412],
    porque: "apuntaba a «Actor» (legacyId 46), dada de baja por la Fase 2",
  },
  {
    funcion: "Apuntador",
    rolId: 120,
    // Unívoca: acá no hay nada que elegir, y ofrecer las cuatro sería pedir una decisión inventada.
    legacyIds: [409],
    porque: "apuntaba a «Actor» (legacyId 46), dada de baja por la Fase 2",
  },
  {
    funcion: "Director de Programas",
    rolId: 2,
    /*
     * El 43 se reemplaza por el 1: es LA MISMA categoría, que en FRAME tenía id 43 y la migración
     * recreó con id 1 (035283, 0634/11).
     *
     * El 111 «Mezclador de Control Central» SE CONSERVA, contra lo que pedía el pedido original.
     * Ahí decía «si nadie puede justificarlo, sacalo», y los datos lo justifican: 322 de los 485
     * contratos de esta función lo usan, contra 163 del 43. Sacarlo no sería limpiar el puente,
     * sería dejar 322 contratos con una categoría que su propio rol ya no contempla — o sea, subir
     * el termómetro que este trabajo existe para bajar. Si igual hay que sacarlo, es una decisión
     * sobre esos 322 contratos y no sobre esta lista.
     */
    legacyIds: [1, 111],
    porque: "apuntaba al legacyId 43, que no existe (la migración lo recreó como 1)",
  },
];

/** Sin categoría válida y sin reemplazo decidido. Se reportan; no se tocan. */
const PARA_DECIDIR = ["Músico", "Coordinador de Intimidad", "Doblajista"];

/** La copia denormalizada que espera `data.categoriasSat`, armada desde la categoría vigente. */
const aCategoriaSat = (c: any, escala: any) => ({
  id: c.legacyId,
  numeroCategoria: c.numeroCategoria ?? escala?.numeroCategoria,
  sueldoBruto: escala?.sueldoBruto ?? 0,
  sueldoBrutoLetras: escala?.sueldoBrutoLetras ?? "",
  neto: escala?.neto ?? 0,
  sueldoNetoLetras: escala?.sueldoNetoLetras ?? "",
  fechaActualizacion: escala?.fechaActualizacion ?? null,
  codigoAfip: Number(String(c.codigoArca || "").replace(/\D/g, "")) || 0,
  presentismo: escala?.presentismo ?? 0,
  sueldoBasico: escala?.sueldoBasico ?? 0,
  sueldoAdicional: escala?.sueldoAdicional ?? 0,
  nombre: c.nombre,
});

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const categorias = await db.collection("categorias").find({}).toArray();
  const grupos = await db.collection("convenio-grupos").find({}).toArray();
  const porLegacyId = new Map<number, any>(categorias.filter((c: any) => c.legacyId != null).map((c: any) => [Number(c.legacyId), c]));
  const porGrupo = new Map<string, any>(grupos.map((g: any) => [String(g._id), g]));

  const respaldo: Array<{ _id: string; name: string; categoriasSat: any[] }> = [];
  let escritas = 0;

  for (const r of REMAPEOS) {
    const rol = await db.collection("roles_frame").findOne({ "data.rol.id": r.rolId });
    if (!rol) {
      console.log(`   ⚠ ${r.funcion}: no existe la función con rol id ${r.rolId}. Se saltea.`);
      continue;
    }

    /*
      Se re-resuelve cada id ANTES de escribir, y si falta uno se FRENA la función entera.
      Escribir una lista a medias dejaría el puente medio arreglado y sin que nadie se entere, que es
      el modo de falla que estamos corrigiendo.
    */
    const destino = r.legacyIds.map((id) => ({ id, cat: porLegacyId.get(id) }));
    const faltan = destino.filter((d) => !d.cat);
    if (faltan.length > 0) {
      console.log(`   ✗ ${r.funcion}: no existen las categorías ${faltan.map((f) => f.id).join(", ")}. NO se toca.`);
      continue;
    }
    const inactivas = destino.filter((d) => d.cat.isActive === false);
    if (inactivas.length > 0) {
      console.log(`   ✗ ${r.funcion}: ${inactivas.map((d) => `${d.cat.nombre} (${d.id})`).join(", ")} está(n) dada(s) de baja. NO se toca: sería repetir el bug.`);
      continue;
    }

    const nuevas = destino.map((d) => aCategoriaSat(d.cat, porGrupo.get(String(d.cat.grupoId))));
    const antes = (rol as any).data?.categoriasSat || [];

    console.log(`   ${r.funcion}  (rol ${r.rolId})`);
    console.log(`      motivo: ${r.porque}`);
    console.log(`      antes:  ${antes.length ? antes.map((c: any) => `${c.id} «${c.nombre}»`).join(", ") : "(ninguna)"}`);
    console.log(`      queda:  ${nuevas.map((c: any) => `${c.id} «${c.nombre}»`).join(", ")}`);

    respaldo.push({ _id: String(rol._id), name: (rol as any).name, categoriasSat: antes });
    if (!DRY_RUN) {
      await db.collection("roles_frame").updateOne({ _id: rol._id }, { $set: { "data.categoriasSat": nuevas } });
      escritas++;
    }
    console.log("");
  }

  // El respaldo se escribe SIEMPRE que haya algo que revertir, incluso en dry-run: así se puede
  // revisar el archivo antes de correr la escritura de verdad.
  if (respaldo.length > 0) {
    const carpeta = path.resolve("respaldos");
    fs.mkdirSync(carpeta, { recursive: true });
    const archivo = path.join(carpeta, `funciones-frame-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2), "utf8");
    console.log(`Respaldo del estado anterior: ${archivo}`);
    console.log(`Para volver atrás:  npm run funciones-frame:reparar:revertir -- "${archivo}"\n`);
  }

  console.log(`${escritas} función(es) actualizada(s)${DRY_RUN ? " (0: es dry run)" : ""}.\n`);

  // ── Lo que queda para que lo decida una persona ─────────────────────────────
  console.log("SIN CATEGORÍA Y SIN REEMPLAZO DECIDIDO — no se inventa ninguna:\n");
  for (const nombre of PARA_DECIDIR) {
    const rol = await db.collection("roles_frame").findOne({ name: nombre });
    if (!rol) {
      console.log(`   · ${nombre}: no existe como función.`);
      continue;
    }
    const rolId = (rol as any).data?.rol?.id;
    const ups = await db.collection(COLECCION_CONTRATOS).find({ "contracts.rol_frame_id": rolId }).project({ contracts: 1 }).toArray();
    const n = ups.reduce((a: number, up: any) => a + (up.contracts || []).filter((c: any) => Number(c.rol_frame_id) === Number(rolId)).length, 0);
    const cats = ((rol as any).data?.categoriasSat || []).map((c: any) => `${c.id} «${c.nombre}»`).join(", ") || "(ninguna)";
    console.log(`   · ${nombre}  ·  rol ${rolId}  ·  ${n} contrato(s)  ·  apunta a: ${cats}`);
  }
  console.log("");

  await mongoose.disconnect();
}

/** Vuelve atrás con el JSON que dejó la corrida. Restituye la lista tal cual estaba. */
async function revertir(archivo: string) {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
  const respaldo = JSON.parse(fs.readFileSync(archivo, "utf8")) as Array<{ _id: string; name: string; categoriasSat: any[] }>;

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db!;
  console.log(`\nDB: ${dbName}   |   REVIRTIENDO desde ${archivo}\n`);
  for (const r of respaldo) {
    await db.collection("roles_frame").updateOne({ _id: new mongoose.Types.ObjectId(r._id) }, { $set: { "data.categoriasSat": r.categoriasSat } });
    console.log(`   ← ${r.name}: ${r.categoriasSat.length} categoría(s) restituida(s)`);
  }
  console.log("");
  await mongoose.disconnect();
}

if (process.argv[1] && process.argv[1].includes("repararFuncionesFrame")) {
  const archivo = process.argv.find((a) => a.endsWith(".json"));
  const tarea = archivo ? revertir(archivo) : run();
  tarea.catch((e) => {
    console.error("\nError:", e?.message || e, "\n");
    process.exit(1);
  });
}
