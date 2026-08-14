import mongoose from "mongoose";

/**
 * Reestructura `categorias-sat` (lista plana) en `convenio-grupos` + `categorias`.
 *
 * Contexto: `categorias-sat` no era una tabla genérica — era, literalmente, las 106 categorías del
 * convenio **0634/11 (SAT — Televisión)**, con la escala salarial repetida en cada fila (unas 9
 * veces por grupo). Ahora la escala vive en el grupo y la categoría solo lleva código y nombre.
 *
 * NO toca `categorias-sat`: escribe en colecciones nuevas y deja la vieja intacta como respaldo.
 * Para volver atrás alcanza con borrar `convenio-grupos` y `categorias`.
 *
 * Reglas (todas verificadas contra los datos antes de escribirlas):
 *  - Grupos 1-12 → convenio 0634/11. Son exactamente 106 categorías, el total del CCT en ARCA.
 *  - Grupo 15 "Excluido de convenio" → convenio 9999/99, categoría 999999 "SIN CATEGORIAS". En ARCA
 *    no es una categoría del SAT: es un convenio propio con una sola categoría.
 *  - Grupos 13 "Actor" y 14 "Musico" → SIN convenio, y se reportan. No tienen código de ARCA y no se
 *    puede deducir a cuál de los convenios de actores pertenecen. Quedan para asignar a mano: el
 *    checklist de Datos ARCA ya frena cualquier contrato que las use ("la categoría no tiene cargado
 *    a qué convenio pertenece"), así que no pueden generar un alta mal.
 *  - La escala del grupo se toma de sus categorías. Si dentro de un grupo hubiera valores distintos,
 *    se REPORTA como conflicto y no se elige en silencio.
 *  - `codigoAfip` numérico → `codigoArca` de 6 dígitos con ceros a la izquierda.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/migrarCategoriasAConvenioGrupo.ts
 */

const DRY_RUN = process.env.DRY_RUN === "true";

/** Convenio del que salió la tabla vieja: SAT — Televisión. */
const CONVENIO_SAT = "0634/11";
/** Convenio "excluido de convenio" y su única categoría, según el nomenclador de ARCA. */
const CONVENIO_EXCLUIDO = "9999/99";
const CATEGORIA_EXCLUIDO = { codigo: "999999", nombre: "SIN CATEGORIAS" };

/** Rango de códigos del convenio SAT en ARCA, para detectar filas mal cargadas. */
const RANGO_SAT = { min: 35283, max: 35388 };

const ESCALA = ["sueldoBasico", "sueldoAdicional", "presentismo", "sueldoBruto", "neto"] as const;

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const cats = (await db.collection("categorias-sat").find({}).toArray()) as any[];
  if (cats.length === 0) {
    console.log("`categorias-sat` está vacía: no hay nada para migrar.\n");
    await mongoose.disconnect();
    return;
  }

  // Si ya se corrió, no se duplica: se aborta y se pide limpiar a mano (es una migración, no un sync).
  const yaHay = await db.collection("categorias").countDocuments({});
  if (yaHay > 0 && !DRY_RUN) {
    throw new Error(`La colección "categorias" ya tiene ${yaHay} documentos. Borrala antes de re-migrar (categorias-sat sigue intacta).`);
  }

  const porGrupo = new Map<number, any[]>();
  for (const c of cats) {
    const g = Number(c.data?.numeroCategoria);
    if (!Number.isFinite(g)) {
      console.log(`  ⚠ "${c.name}" no tiene Nº de categoría: se saltea.`);
      continue;
    }
    if (!porGrupo.has(g)) porGrupo.set(g, []);
    porGrupo.get(g)!.push(c);
  }

  const conflictos: string[] = [];
  const sinConvenio: string[] = [];
  const fueraDeRango: string[] = [];
  let gruposCreados = 0;
  let categoriasCreadas = 0;

  for (const numero of [...porGrupo.keys()].sort((a, b) => a - b)) {
    const items = porGrupo.get(numero)!;

    // A qué convenio va este grupo.
    const esExcluido = /excluido de convenio/i.test(items[0]?.name || "") || items.every((i) => Number(i.data?.codigoAfip) === 9999);
    const tieneCodigosSat = items.some((i) => {
      const n = Number(i.data?.codigoAfip);
      return n >= RANGO_SAT.min && n <= RANGO_SAT.max;
    });
    const convenio = esExcluido ? CONVENIO_EXCLUIDO : tieneCodigosSat ? CONVENIO_SAT : "";

    // Escala del grupo: tiene que ser la misma en todas sus categorías.
    const escala: Record<string, number> = {};
    for (const campo of ESCALA) {
      const valores = [...new Set(items.map((i) => Number(i.data?.[campo] ?? 0)))];
      if (valores.length > 1) conflictos.push(`Grupo ${numero} · ${campo}: ${valores.join(" / ")}`);
      escala[campo] = valores[0] ?? 0;
    }

    const ref = items[0];
    const grupo = {
      _id: new mongoose.Types.ObjectId(),
      convenio,
      numero,
      nombre: "",
      ...escala,
      sueldoBrutoLetras: String(ref.data?.sueldoBrutoLetras || ""),
      sueldoNetoLetras: String(ref.data?.sueldoNetoLetras || ""),
      fechaActualizacion: ref.data?.fechaActualizacion,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!DRY_RUN) await db.collection("convenio-grupos").insertOne(grupo as any);
    gruposCreados++;

    for (const c of items) {
      const crudo = String(c.data?.codigoAfip ?? "").replace(/\D/g, "");
      let codigoArca = crudo && crudo !== "0" ? crudo.padStart(6, "0") : "";
      let conv = convenio;
      let nombre = String(c.name || c.data?.nombre || "").trim();

      if (esExcluido) {
        // En ARCA la exclusión no es una categoría del SAT: es el convenio 9999/99 con una sola
        // categoría, 999999. El 9999 que había cargado no existe en el nomenclador.
        codigoArca = CATEGORIA_EXCLUIDO.codigo;
        nombre = nombre || CATEGORIA_EXCLUIDO.nombre;
      } else if (!conv) {
        sinConvenio.push(`Nº${numero} "${nombre}" (código ${crudo || "vacío"})`);
      } else if (codigoArca) {
        const n = Number(codigoArca);
        if (n < RANGO_SAT.min || n > RANGO_SAT.max) fueraDeRango.push(`Nº${numero} "${nombre}" → ${codigoArca}`);
      }

      if (!DRY_RUN) {
        await db.collection("categorias").insertOne({
          convenio: conv,
          grupoId: grupo._id,
          codigoArca,
          nombre,
          descripcionArca: "",
          legacyId: Number(c.data?.id) || undefined,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
      }
      categoriasCreadas++;
    }

    const etiqueta = convenio || "SIN CONVENIO";
    console.log(`  Grupo ${String(numero).padStart(2)} → ${etiqueta.padEnd(9)} · ${String(items.length).padStart(3)} categoría(s) · bruto ${Number(escala.sueldoBruto).toLocaleString("es-AR")}`);
  }

  console.log(`\nResumen: ${gruposCreados} grupo(s) y ${categoriasCreadas} categoría(s)${DRY_RUN ? " se crearían" : " creadas"}.`);

  const porConvenio = new Map<string, number>();
  for (const numero of porGrupo.keys()) {
    const items = porGrupo.get(numero)!;
    const esExc = /excluido de convenio/i.test(items[0]?.name || "");
    const sat = items.some((i) => Number(i.data?.codigoAfip) >= RANGO_SAT.min && Number(i.data?.codigoAfip) <= RANGO_SAT.max);
    const k = esExc ? CONVENIO_EXCLUIDO : sat ? CONVENIO_SAT : "(sin convenio)";
    porConvenio.set(k, (porConvenio.get(k) || 0) + items.length);
  }
  console.log("Por convenio:");
  for (const [k, v] of porConvenio) console.log(`  ${k.padEnd(14)} ${v} categoría(s)${k === CONVENIO_SAT ? ` ${v === 106 ? "✓ coincide con las 106 de ARCA" : `⚠ ARCA tiene 106, acá hay ${v}`}` : ""}`);

  if (conflictos.length) console.log(`\n⚠ ESCALAS INCONSISTENTES (se tomó el primer valor, revisar):\n   ${conflictos.join("\n   ")}`);
  if (fueraDeRango.length) console.log(`\n⚠ CÓDIGOS FUERA DEL RANGO DEL SAT (${RANGO_SAT.min}-${RANGO_SAT.max}) — dato mal cargado:\n   ${fueraDeRango.join("\n   ")}`);
  if (sinConvenio.length) console.log(`\n⚠ SIN CONVENIO ASIGNABLE — cargales convenio y código desde el ABM:\n   ${sinConvenio.join("\n   ")}`);

  await mongoose.disconnect();
  console.log(`\n${DRY_RUN ? "DRY RUN terminado: no se escribió nada." : "Listo. `categorias-sat` quedó intacta como respaldo."}\n`);
}

run().catch(async (err) => {
  console.error("Error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
