import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { Categoria } from "../models/Categoria.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import UserProject from "../models/UserProject.js";

/**
 * Reconstruye los grupos del convenio 0131/75: de 73 a 12, sin borrar una sola categoría.
 *
 * QUÉ ESTÁ MAL HOY
 * ────────────────
 * Los 73 grupos son TRES taxonomías apiladas, y solo una es una escala salarial:
 *
 *   1–3    «1ª / 2ª / 3ª CATEGORIA» — el prefijo de la descripción de ARCA, que es la categoría de
 *          la EMISORA (su tamaño), no el encuadre de la persona.            148 categorías
 *   4–61   nombres de función que la carga inicial promovió a grupo, uno por categoría.  58
 *   62–73  «GRUPO SALARIAL 1» a «12» — los únicos que son grupos de verdad.  12
 *
 * El modelo exigía `grupoId`, así que donde ARCA no publica un grupo hubo que inventar uno. Esa
 * exigencia ya se levantó (`grupoId` es opcional); esto limpia lo que dejó.
 *
 * QUÉ HACE
 * ────────
 *   1. Mueve los 12 grupos salariales a una numeración temporal (901–912).
 *   2. Desactiva las 206 categorías históricas y las deja sin grupo. NO las borra.
 *   3. Elimina los 61 grupos que quedaron vacíos, verificando que estén vacíos.
 *   4. Renumera los 12 de 901–912 a 1–12.
 *
 * EL PASO TEMPORAL NO ES UN RODEO. `{convenio, numero}` tiene índice único: renumerar el grupo 62 a 1
 * mientras el 1 viejo existe falla, y hacerlo al revés —borrar primero— dejaría el convenio sin
 * grupos si el proceso se corta a la mitad. Con el rango temporal, cualquier interrupción deja un
 * estado raro pero íntegro y reanudable.
 *
 *     npm run 013175:reconstruir:dry     (no escribe; imprime el plan completo)
 *     npm run 013175:reconstruir         (escribe, y deja el log reversible)
 *
 * Para deshacer:  npm run 013175:revertir -- logs/reconstruccion-013175-....json
 */

const DRY_RUN = process.env.DRY_RUN === "true";

const CONVENIO = "0131/75";

/** Dónde se estacionan los 12 mientras se liberan los números 1–12. Fuera de todo rango real. */
const BASE_TEMPORAL = 900;

/**
 * El mapeo grupo viejo → grupo nuevo, verificado contra la base el 28/08/2026.
 *
 * Va escrito y no calculado (`numero - 61`) a propósito: si mañana la numeración de origen cambia,
 * una resta silenciosamente correcta produciría un encuadre equivocado, y acá cada fila se valida
 * contra la categoría que cuelga del grupo. El código de ARCA es la prueba de que el grupo es el que
 * se cree que es.
 */
const MAPEO: Array<{ desde: number; hasta: number; codigoArca: string; nombre: string }> = [
  { desde: 62, hasta: 1, codigoArca: "036371", nombre: "GRUPO SALARIAL 1" },
  { desde: 63, hasta: 2, codigoArca: "036373", nombre: "GRUPO SALARIAL 2" },
  { desde: 64, hasta: 3, codigoArca: "036375", nombre: "GRUPO SALARIAL 3" },
  { desde: 65, hasta: 4, codigoArca: "036377", nombre: "GRUPO SALARIAL 4" },
  { desde: 66, hasta: 5, codigoArca: "036379", nombre: "GRUPO SALARIAL 5" },
  { desde: 67, hasta: 6, codigoArca: "036381", nombre: "GRUPO SALARIAL 6" },
  { desde: 68, hasta: 7, codigoArca: "036383", nombre: "GRUPO SALARIAL 7" },
  { desde: 69, hasta: 8, codigoArca: "036385", nombre: "GRUPO SALARIAL 8" },
  { desde: 70, hasta: 9, codigoArca: "036386", nombre: "GRUPO SALARIAL 9" },
  { desde: 71, hasta: 10, codigoArca: "036387", nombre: "GRUPO SALARIAL 10" },
  { desde: 72, hasta: 11, codigoArca: "036388", nombre: "GRUPO SALARIAL 11" },
  { desde: 73, hasta: 12, codigoArca: "036389", nombre: "GRUPO SALARIAL 12" },
];

const TOTAL_CATEGORIAS_ESPERADO = 218;

/** Contratos por `categoria_sat_id`, que es como el contrato guarda su categoría. */
async function contratosPorLegacyId(): Promise<Map<number, number>> {
  const ups: any[] = await UserProject.find({ "contracts.0": { $exists: true } }).select("contracts.categoria_sat_id").lean();
  const m = new Map<number, number>();
  for (const up of ups) {
    for (const c of up.contracts || []) {
      const id = Number(c?.categoria_sat_id);
      if (!id) continue;
      m.set(id, (m.get(id) || 0) + 1);
    }
  }
  return m;
}

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  console.log(`\nDB: ${dbName}   |   convenio: ${CONVENIO}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const problemas: string[] = [];

  const grupos: any[] = await ConvenioGrupo.find({ convenio: CONVENIO }).sort({ numero: 1 }).lean();
  const cats: any[] = await Categoria.find({ convenio: CONVENIO }).lean();
  const uso = await contratosPorLegacyId();

  console.log(`Estado actual: ${cats.length} categorías · ${grupos.length} grupos`);
  if (cats.length !== TOTAL_CATEGORIAS_ESPERADO) {
    console.log(`  ojo: se esperaban ${TOTAL_CATEGORIAS_ESPERADO} categorías y hay ${cats.length}. El relevamiento quedó viejo.`);
  }

  const porNumero = new Map<number, any>(grupos.map((g) => [Number(g.numero), g]));
  const porGrupoId = new Map<string, any[]>();
  for (const c of cats) {
    if (!c.grupoId) continue;
    const k = String(c.grupoId);
    if (!porGrupoId.has(k)) porGrupoId.set(k, []);
    porGrupoId.get(k)!.push(c);
  }

  // ── 1. Los 12 que se conservan, cada uno verificado por la categoría que le cuelga.
  const conservados: Array<{ grupo: any; nuevo: number; categoria: any }> = [];
  for (const m of MAPEO) {
    const g = porNumero.get(m.desde);
    if (!g) {
      problemas.push(`NO EXISTE el grupo ${m.desde} de ${CONVENIO}.`);
      continue;
    }
    const hijas = porGrupoId.get(String(g._id)) || [];
    const match = hijas.find((c) => String(c.codigoArca) === m.codigoArca);
    if (!match) {
      problemas.push(
        `DESFASAJE: el grupo ${m.desde} («${g.nombre || ""}») no tiene la categoría ${m.codigoArca} («${m.nombre}»), que es la que lo identifica. Tiene: ${hijas.map((c) => `${c.codigoArca} ${c.nombre}`).join(", ") || "(ninguna)"}.`
      );
      continue;
    }
    if (hijas.length !== 1) {
      problemas.push(`El grupo ${m.desde} tiene ${hijas.length} categorías y se esperaba 1: ${hijas.map((c) => c.codigoArca).join(", ")}.`);
      continue;
    }
    conservados.push({ grupo: g, nuevo: m.hasta, categoria: match });
  }

  const idsConservados = new Set(conservados.map((c) => String(c.grupo._id)));

  // ── 2. Las categorías históricas: todas las del convenio que NO cuelgan de un grupo conservado.
  const historicas = cats.filter((c) => !c.grupoId || !idsConservados.has(String(c.grupoId)));

  /*
    NINGUNA CATEGORÍA CON CONTRATOS SE DESACTIVA.

    Hoy este convenio tiene cero contratos, así que este chequeo no debería disparar nunca. Está
    igual porque el costo de equivocarse es asimétrico: desactivar una categoría en uso deja
    contratos apuntando a algo que los selectores ya no ofrecen, y el síntoma aparece recién cuando
    alguien intenta editar ese contrato. Frenar es barato; descubrirlo después, no.
  */
  const enUso = historicas.filter((c) => c.legacyId != null && (uso.get(Number(c.legacyId)) || 0) > 0);
  for (const c of enUso) {
    problemas.push(`EN USO: «${c.nombre}» (${c.codigoArca}, data.id=${c.legacyId}) la usan ${uso.get(Number(c.legacyId))} contrato(s). No se desactiva.`);
  }

  // ── 3. Los grupos a eliminar: los que no se conservan. Se verifica que queden vacíos.
  const aEliminar = grupos.filter((g) => !idsConservados.has(String(g._id)));
  for (const g of aEliminar) {
    const hijas = porGrupoId.get(String(g._id)) || [];
    const quedan = hijas.filter((c) => !historicas.some((h) => String(h._id) === String(c._id)));
    if (quedan.length > 0) {
      problemas.push(`NO QUEDA VACÍO: el grupo ${g.numero} («${g.nombre || ""}») conservaría ${quedan.length} categoría(s) y no se puede borrar.`);
    }
  }

  // ── Plan
  console.log(`\n── 1. Renumerar (vía ${BASE_TEMPORAL + 1}–${BASE_TEMPORAL + MAPEO.length}) ──`);
  for (const c of conservados) console.log(`   #${String(c.grupo.numero).padStart(2)} → #${String(c.nuevo).padStart(2)}   «${c.grupo.nombre || ""}»   (${c.categoria.codigoArca})`);

  console.log(`\n── 2. Desactivar y desvincular ──`);
  console.log(`   ${historicas.length} categoría(s) pasan a isActive:false y grupoId:null. Ninguna se borra.`);
  const conEscalaPropia = historicas.filter((c) => Number(c.sueldoBruto || 0) > 0).length;
  if (conEscalaPropia > 0) console.log(`   ${conEscalaPropia} de ellas tienen escala propia, que se conserva.`);

  console.log(`\n── 3. Eliminar grupos vacíos ──`);
  console.log(`   ${aEliminar.length} grupo(s): ${aEliminar.map((g) => g.numero).join(", ")}`);
  const conEscala = aEliminar.filter((g) => Number(g.sueldoBruto || 0) > 0);
  if (conEscala.length > 0) {
    console.log(`   ojo: ${conEscala.length} de ellos tienen escala cargada (${conEscala.map((g) => `#${g.numero}`).join(", ")}). Queda en el log.`);
  }

  console.log(`\nResultado esperado: ${MAPEO.length} grupos (1–${MAPEO.length}) · ${cats.length} categorías (${conservados.length} activas con grupo, ${historicas.length} inactivas sin grupo)`);

  if (problemas.length > 0) {
    console.log("\n✖ NO SE PUEDE APLICAR:\n");
    for (const p of problemas) console.log(`   · ${p}`);
    console.log("");
    await mongoose.disconnect();
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log("\nDRY RUN terminado. No se escribió nada.\n");
    await mongoose.disconnect();
    return;
  }

  // ── Log ANTES de tocar nada: el estado anterior completo de cada grupo y cada categoría.
  const log = {
    convenio: CONVENIO,
    fecha: new Date().toISOString(),
    gruposRenumerados: conservados.map((c) => ({ _id: String(c.grupo._id), numeroAntes: Number(c.grupo.numero), numeroDespues: c.nuevo, nombre: c.grupo.nombre || "" })),
    gruposEliminados: aEliminar.map((g) => ({
      _id: String(g._id),
      convenio: g.convenio,
      numero: g.numero,
      nombre: g.nombre || "",
      sueldoBasico: g.sueldoBasico ?? 0,
      sueldoAdicional: g.sueldoAdicional ?? 0,
      presentismo: g.presentismo ?? 0,
      sueldoBruto: g.sueldoBruto ?? 0,
      sueldoBrutoLetras: g.sueldoBrutoLetras || "",
      neto: g.neto ?? 0,
      sueldoNetoLetras: g.sueldoNetoLetras || "",
      fechaActualizacion: g.fechaActualizacion ?? null,
    })),
    categoriasDesactivadas: historicas.map((c) => ({
      _id: String(c._id),
      codigoArca: c.codigoArca,
      nombre: c.nombre,
      legacyId: c.legacyId ?? null,
      grupoIdAntes: c.grupoId ? String(c.grupoId) : null,
      isActiveAntes: c.isActive !== false,
    })),
  };

  // ── Aplicar, en el orden que sobrevive a una interrupción.
  let n = 0;
  for (const c of conservados) {
    await ConvenioGrupo.updateOne({ _id: c.grupo._id }, { $set: { numero: BASE_TEMPORAL + c.nuevo } });
    n++;
  }
  console.log(`\n1. ${n} grupo(s) movidos al rango temporal.`);

  const r2 = await Categoria.updateMany({ _id: { $in: historicas.map((c) => c._id) } }, { $set: { isActive: false, grupoId: null } });
  console.log(`2. ${r2.modifiedCount} categoría(s) desactivadas y desvinculadas.`);

  // Se relee: borrar un grupo que todavía tenga categorías dejaría huérfanas silenciosas, y entre el
  // chequeo de arriba y este punto ya se escribió.
  const idsAEliminar = aEliminar.map((g) => g._id);
  const colgadas = await Categoria.countDocuments({ grupoId: { $in: idsAEliminar } });
  if (colgadas > 0) {
    console.log(`\n✖ FRENO: ${colgadas} categoría(s) siguen colgando de los grupos a eliminar. Los grupos NO se borraron.`);
    const archivo = `logs/reconstruccion-013175-${new Date().toISOString().replace(/[:.]/g, "-")}-PARCIAL.json`;
    writeFileSync(archivo, JSON.stringify({ ...log, gruposEliminados: [] }, null, 2));
    console.log(`Log parcial: ${archivo}\n`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const r3 = await ConvenioGrupo.deleteMany({ _id: { $in: idsAEliminar } });
  console.log(`3. ${r3.deletedCount} grupo(s) vacíos eliminados.`);

  for (const c of conservados) {
    await ConvenioGrupo.updateOne({ _id: c.grupo._id }, { $set: { numero: c.nuevo } });
  }
  console.log(`4. ${conservados.length} grupo(s) renumerados a 1–${conservados.length}.`);

  const archivo = `logs/reconstruccion-013175-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(archivo, JSON.stringify(log, null, 2));

  // ── Verificación, sobre lo que quedó escrito y no sobre lo que se creía que se iba a escribir.
  const gruposFin: any[] = await ConvenioGrupo.find({ convenio: CONVENIO }).sort({ numero: 1 }).lean();
  const catsFin: any[] = await Categoria.find({ convenio: CONVENIO }).lean();
  const activasConGrupo = catsFin.filter((c) => c.isActive !== false && c.grupoId).length;
  const inactivasSinGrupo = catsFin.filter((c) => c.isActive === false && !c.grupoId).length;
  console.log(`\n── Verificación ──`);
  console.log(`   grupos: ${gruposFin.length} (${gruposFin.map((g) => g.numero).join(", ")})`);
  console.log(`   categorías: ${catsFin.length} — ${activasConGrupo} activas con grupo, ${inactivasSinGrupo} inactivas sin grupo`);
  for (const g of gruposFin) {
    const hijas = catsFin.filter((c) => String(c.grupoId) === String(g._id));
    console.log(`   #${String(g.numero).padStart(2)}  «${g.nombre || ""}»  ${hijas.map((c) => c.codigoArca).join(", ") || "(vacío)"}`);
  }

  console.log(`\nLog reversible: ${archivo}`);
  console.log(`Para deshacer:  npm run 013175:revertir -- ${archivo}\n`);

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
