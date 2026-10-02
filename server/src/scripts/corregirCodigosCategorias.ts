import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { CategoriaParaEmparejar, emparejarCategorias, estadoCategoria, filasCsvArca } from "../compartido/catalogoArca.js";
import { ESPERADO_0634_11 } from "../compartido/correccion063411.js";

/**
 * Corrige el CÓDIGO de ARCA de las categorías que quedaron apuntando a otra categoría.
 *
 * EL PROBLEMA. 41 categorías del 0634/11 (grupos 2, 5 y 7) tienen el código de otra categoría de su
 * mismo grupo: alguien asignó códigos consecutivos a los nombres ordenados alfabéticamente, cuando
 * ARCA tiene algunas al final del grupo. ~1.400 contratos declaran ante ARCA una categoría que no es
 * la de la persona. Verificado contra la pantalla de ARCA el 2/10/2026.
 *
 * YA SE HABÍA CORREGIDO UNA VEZ (17/08/2026, mismo script, mismos 41 `_id`) y el 22/09/2026 entre las
 * 19:40 y las 19:41 UTC algo volvió a escribir los códigos viejos en esas categorías y en los 12
 * grupos del 0634/11, documento por documento. No se encontró qué. Por eso esta vez la corrección
 * viene con la estructura que lo impide (espejo de ARCA + validación en el servidor + índice único).
 *
 * LA REGLA: EL NOMBRE MANDA, EL CÓDIGO SE CORRIGE. El contrato eligió «Peinador»; lo que está mal es
 * el número pegado a ese nombre. Se cambia `codigoArca` en la fila de la categoría y se conserva todo
 * lo demás (`_id`, `legacyId`, nombre, grupo, escala). Los contratos no se tocan: apuntan por
 * `legacyId`, así que todos pasan a declarar el código correcto solos.
 *
 * El emparejamiento es `emparejarCategorias` (código compartido, con tests): nombre normalizado contra
 * la descripción del CSV, exigiendo que coincida el grupo. Lo que no empareja de forma única NO se
 * adivina: el script se detiene y lo lista. Y el resultado del 0634/11 tiene que ser EXACTAMENTE la
 * tabla verificada (`correccion063411.ts`); si difiere, se detiene y muestra la diferencia.
 *
 * Además completa `descripcionArca` con el texto literal de ARCA en todas las categorías del convenio.
 *
 * Y CORRIGE TAMBIÉN LA COPIA HEREDADA (`categorias-sat`, `data.codigoAfip`). El cruce nació en FRAME:
 * esa colección —la copia de FRAME que se migró a `categorias`— tiene los mismos 41 códigos cruzados.
 * Nadie la lee para el alta, pero es la fuente de la que cualquier re-copia vuelve a traer el error
 * (el candidato más probable de lo que pasó el 22/09). Arreglarla saca esa fuente de en medio.
 *
 * Uso (desde server/):
 *   npm run categorias:codigos:dry                              → muestra, no escribe NADA
 *   npm run categorias:codigos                                  → aplica (con respaldo en respaldos/)
 *   npm run categorias:codigos:revertir -- respaldos/<archivo>.json
 *
 *   CONVENIOS=0131/75,0322/75,0102/90,9999/99 npm run categorias:codigos:dry
 *     → la misma auditoría sobre otros convenios, SOLO REPORTE (nunca escribe fuera del 0634/11).
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const CSV_PATH = process.env.CSV || path.resolve(process.cwd(), "../documentation/arca_tablas_simplificacion_registral.csv");
const CONVENIO_A_CORREGIR = "0634/11";
const CONVENIOS_REPORTE = String(process.env.CONVENIOS || "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s && s !== CONVENIO_A_CORREGIR);

async function conectar() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  return { db: mongoose.connection.db!, dbName };
}

/** Categorías de un convenio con su grupo y cuántos contratos las usan. */
async function cargar(db: any, convenio: string, usos: Map<number, number>) {
  const grupos = new Map<string, number>((await db.collection("convenio-grupos").find({ convenio }).toArray()).map((g: any) => [String(g._id), Number(g.numero)]));
  const docs: any[] = await db.collection("categorias").find({ convenio }).toArray();
  const cats: CategoriaParaEmparejar[] = docs.map((c) => ({
    id: String(c._id),
    nombre: String(c.nombre || ""),
    convenio,
    codigoArca: String(c.codigoArca || ""),
    grupoNumero: grupos.get(String(c.grupoId)) ?? null,
    contratos: usos.get(Number(c.legacyId)) || 0,
  }));
  return { docs, cats };
}

const tabla = (filas: string[][]) => {
  const anchos = filas[0].map((_, i) => Math.max(...filas.map((f) => String(f[i]).length)));
  for (const f of filas) console.log("  " + f.map((c, i) => String(c).padEnd(anchos[i])).join("  "));
};

async function run() {
  const oficiales = filasCsvArca(fs.readFileSync(CSV_PATH, "utf8")).filter((f) => f.tabla === "CATEGORIA_CCT");
  const { db, dbName } = await conectar();
  console.log(`Base: ${dbName}   ${DRY_RUN ? "[DRY RUN: no se escribe nada]" : "[APLICA]"}\n`);

  const usos = new Map<number, number>();
  const ups = await db.collection("users_&_projects").find({}).project({ "contracts.categoria_sat_id": 1 }).toArray();
  for (const up of ups) for (const c of (up as any).contracts || []) if (c?.categoria_sat_id != null) usos.set(Number(c.categoria_sat_id), (usos.get(Number(c.categoria_sat_id)) || 0) + 1);

  // ── Auditoría de otros convenios: solo reporte ──────────────────────────────────────────────────
  for (const convenio of CONVENIOS_REPORTE) {
    const { cats } = await cargar(db, convenio, usos);
    const of = oficiales.filter((f) => f.filtroPadre === convenio).map((f) => ({ codigo: f.codigoPadded, descripcion: f.descripcion }));
    const r = emparejarCategorias(cats, of);
    console.log(`── ${convenio} (solo reporte): ${cats.length} en la base, ${new Set(of.map((o) => o.codigo)).size} en ARCA ──`);
    console.log(`  correctas ${r.correctas.length} · código cruzado ${r.cambios.length} · sin pareja ${r.sinMatch.length} · ambiguas ${r.ambiguas.length} · otro grupo ${r.grupoDistinto.length} · colisiones ${r.colisiones.length}`);
    if (r.cambios.length) tabla([["Grupo", "Categoría", "Hoy", "Correcto", "Contratos"], ...r.cambios.map((c) => [String(c.grupo ?? "—"), c.nombre, c.de, c.a, String(c.contratos)])]);
    for (const s of r.sinMatch) console.log(`  sin pareja: ${s.codigoArca} «${s.nombre}» (grupo ${s.grupoNumero ?? "—"}, ${s.contratos} contratos)`);
    for (const s of r.ambiguas) console.log(`  ambigua: «${s.nombre}» → ${s.candidatos.join(", ")}`);
    for (const s of r.grupoDistinto) console.log(`  otro grupo: «${s.nombre}» grupo ${s.grupoNumero} — ARCA: ${s.codigoArcaCorrecto} en grupo ${s.grupoArca}`);
    const enArca = new Set(of.map((o) => o.codigo));
    const fuera = cats.filter((c) => c.codigoArca && !enArca.has(c.codigoArca));
    if (fuera.length) console.log(`  códigos que ARCA no tiene: ${fuera.map((c) => `${c.codigoArca} «${c.nombre}»`).join(", ")}`);
    console.log("");
  }

  // ── 0634/11: la corrección ──────────────────────────────────────────────────────────────────────
  const { docs, cats } = await cargar(db, CONVENIO_A_CORREGIR, usos);
  const of = oficiales.filter((f) => f.filtroPadre === CONVENIO_A_CORREGIR).map((f) => ({ codigo: f.codigoPadded, descripcion: f.descripcion }));
  const r = emparejarCategorias(cats, of);

  console.log(`── ${CONVENIO_A_CORREGIR}: ${cats.length} categorías ──`);
  console.log(`  correctas ${r.correctas.length} · a corregir ${r.cambios.length} (${r.cambios.reduce((n, c) => n + c.contratos, 0)} contratos)\n`);

  const problemas = [...r.sinMatch.map((s) => `sin pareja en ARCA: ${s.codigoArca} «${s.nombre}»`), ...r.ambiguas.map((s) => `ambigua: «${s.nombre}» → ${s.candidatos.join(", ")}`), ...r.grupoDistinto.map((s) => `«${s.nombre}» está en el grupo ${s.grupoNumero} y ARCA la tiene en el ${s.grupoArca}`), ...r.colisiones.map((c) => `colisión: ${c.codigo} ← ${c.nombres.join(" + ")}`)];
  if (problemas.length > 0) {
    console.log("✋ No empareja de forma única. No se aplica nada:");
    for (const p of problemas) console.log("   " + p);
    await mongoose.disconnect();
    process.exit(1);
  }

  const orden = (a: { grupo: number | null; de: string }, b: { grupo: number | null; de: string }) => (a.grupo ?? 0) - (b.grupo ?? 0) || a.de.localeCompare(b.de);
  const cambios = [...r.cambios].sort(orden);
  if (cambios.length > 0) tabla([["Grupo", "Categoría", "Código hoy", "Código correcto", "Contratos"], ...cambios.map((c) => [String(c.grupo), c.nombre, c.de, c.a, String(c.contratos)])]);

  // ¿Es EXACTAMENTE la tabla verificada contra ARCA? Si ya se aplicó, no hay cambios y está bien.
  if (cambios.length > 0) {
    const clave = (g: number | null, n: string, de: string, a: string) => `${g}|${n}|${de}|${a}`;
    const obtenido = new Set(cambios.map((c) => clave(c.grupo, c.nombre, c.de, c.a)));
    const esperado = new Set(ESPERADO_0634_11.map(([g, n, de, a]) => clave(g, n, de, a)));
    const sobran = [...obtenido].filter((k) => !esperado.has(k));
    const faltan = [...esperado].filter((k) => !obtenido.has(k));
    if (sobran.length || faltan.length) {
      console.log("\n✋ El resultado NO es la tabla verificada contra ARCA. No se aplica nada.");
      for (const k of sobran) console.log(`   + no esperado: ${k}`);
      for (const k of faltan) console.log(`   − falta:       ${k}`);
      await mongoose.disconnect();
      process.exit(1);
    }
    console.log(`\n✓ Coincide fila por fila con la tabla verificada contra ARCA (${ESPERADO_0634_11.length} cambios).`);
  } else {
    console.log("✓ Los códigos ya están correctos.");
  }

  // Descripción de ARCA para las 106 (las correctas y las corregidas).
  const descPorCodigo = new Map(of.map((o) => [o.codigo, o.descripcion]));
  const finalDe = (id: string, actual: string) => cambios.find((c) => c.id === id)?.a ?? actual;
  const sinDescripcion = docs.filter((d) => descPorCodigo.get(finalDe(String(d._id), d.codigoArca)) !== d.descripcionArca);
  console.log(`Descripción de ARCA a completar/actualizar: ${sinDescripcion.length} de ${docs.length}.`);

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No se escribió nada (tampoco el respaldo).");
    await mongoose.disconnect();
    return;
  }
  if (cambios.length === 0 && sinDescripcion.length === 0) {
    await mongoose.disconnect();
    return;
  }

  // Respaldo del estado anterior de TODAS las filas que se tocan, antes de tocar nada.
  const tocadas = docs.filter((d) => cambios.some((c) => c.id === String(d._id)) || sinDescripcion.includes(d));
  // La copia heredada de las que cambian de código, por `data.id` = `legacyId`.
  const legacyDe = new Map(docs.map((d) => [String(d._id), d.legacyId]));
  const heredadas: any[] = await db
    .collection("categorias-sat")
    .find({ "data.id": { $in: cambios.map((c) => legacyDe.get(c.id)).filter((x) => x != null) } })
    .project({ "data.id": 1, "data.codigoAfip": 1 })
    .toArray();
  const respaldo = {
    categorias: tocadas.map((d) => ({ _id: String(d._id), nombre: d.nombre, codigoArca: d.codigoArca, descripcionArca: d.descripcionArca ?? "", grupoId: d.grupoId ? String(d.grupoId) : null })),
    categoriasSat: heredadas.map((h) => ({ _id: String(h._id), codigoAfip: h.data?.codigoAfip ?? null })),
  };
  const carpeta = path.resolve("respaldos");
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `codigos-categorias-${dbName}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 2));
  console.log(`\nRespaldo: ${archivo}`);

  // UN solo bulkWrite: son permutaciones, y con el índice único de a una chocarían entre sí.
  const ahora = new Date();
  const ops = tocadas.map((d) => {
    const codigo = finalDe(String(d._id), d.codigoArca);
    return { updateOne: { filter: { _id: d._id }, update: { $set: { codigoArca: codigo, descripcionArca: descPorCodigo.get(codigo) || "", updatedAt: ahora } } } };
  });
  const res = await db.collection("categorias").bulkWrite(ops, { ordered: true });
  console.log(`Escritas: ${res.modifiedCount}.`);
  const opsSat = cambios
    .map((c) => ({ c, legacy: legacyDe.get(c.id) }))
    .filter((x) => x.legacy != null)
    .map(({ c, legacy }) => ({ updateOne: { filter: { "data.id": legacy }, update: { $set: { "data.codigoAfip": Number(c.a), updatedAt: ahora } } } }));
  if (opsSat.length) {
    const r2 = await db.collection("categorias-sat").bulkWrite(opsSat, { ordered: true });
    console.log(`Copia heredada (categorias-sat) corregida: ${r2.modifiedCount}.`);
  }

  // Verificación final contra el CSV, releyendo de la base.
  const { cats: despues } = await cargar(db, CONVENIO_A_CORREGIR, usos);
  const codigos = despues.map((c) => c.codigoArca).sort();
  const malas = despues.filter((c) => estadoCategoria({ nombre: c.nombre, grupoNumero: c.grupoNumero, fila: { codigo: c.codigoArca, descripcion: descPorCodigo.get(c.codigoArca) || "", vigente: descPorCodigo.has(c.codigoArca) } }).estado !== "ok");
  const ok = new Set(codigos).size === 106 && codigos[0] === "035283" && codigos.at(-1) === "035388" && malas.length === 0;
  console.log(ok ? "✓ Verificado: 106 códigos distintos, 035283–035388, cada uno con el nombre que le da ARCA." : `✖ La verificación falló (${new Set(codigos).size} distintos, ${malas.length} con nombre distinto: ${malas.map((m) => m.nombre).join(", ")}). Revertí con el respaldo.`);
  console.log(`\nPara deshacer: npm run categorias:codigos:revertir -- "${archivo}"`);
  console.log("OJO: las altas YA presentadas en ARCA siguen con el código viejo. Ver `npm run categorias:altas-cruzadas`.");
  await mongoose.disconnect();
  if (!ok) process.exit(1);
}

async function revertir(archivo: string) {
  const leido = JSON.parse(fs.readFileSync(archivo, "utf8"));
  // Respaldos viejos eran una lista; los nuevos traen también la copia heredada.
  const respaldo: Array<{ _id: string; codigoArca: string; descripcionArca: string; grupoId: string | null }> = Array.isArray(leido) ? leido : leido.categorias;
  const sat: Array<{ _id: string; codigoAfip: number | null }> = Array.isArray(leido) ? [] : leido.categoriasSat || [];
  const { db, dbName } = await conectar();
  console.log(`Base: ${dbName}   Revirtiendo ${respaldo.length} categoría(s) y ${sat.length} de la copia heredada desde ${archivo}${DRY_RUN ? "  [DRY RUN]" : ""}`);
  if (!DRY_RUN) {
    if (sat.length) await db.collection("categorias-sat").bulkWrite(sat.map((r) => ({ updateOne: { filter: { _id: new mongoose.Types.ObjectId(r._id) }, update: { $set: { "data.codigoAfip": r.codigoAfip } } } })));
    const ops = respaldo.map((r) => ({
      updateOne: {
        filter: { _id: new mongoose.Types.ObjectId(r._id) },
        update: { $set: { codigoArca: r.codigoArca, descripcionArca: r.descripcionArca, grupoId: r.grupoId ? new mongoose.Types.ObjectId(r.grupoId) : null, updatedAt: new Date() } },
      },
    }));
    const res = await db.collection("categorias").bulkWrite(ops, { ordered: true });
    console.log(`Revertidas: ${res.modifiedCount}.`);
  }
  await mongoose.disconnect();
}

if (process.argv[1]?.includes("corregirCodigosCategorias")) {
  const archivo = process.argv.find((a) => a.endsWith(".json"));
  (archivo ? revertir(archivo) : run()).catch(async (e) => {
    console.error(e);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}
