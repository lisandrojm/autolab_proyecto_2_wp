import mongoose from "mongoose";
import { Categoria } from "../models/Categoria.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import { RoleFrame } from "../models/RoleFrame.js";
import UserProject from "../models/UserProject.js";

/**
 * SOLO LECTURA. Fotografía del encuadre antes de tocar nada.
 *
 * Contesta las tres preguntas que abren las fases A y C, y no escribe una sola vez:
 *
 *   1. Qué contratos tienen una categoría de un convenio que su función FRAME no contempla.
 *      Es el rastro que deja una asignación masiva hecha por error: la categoría queda válida para
 *      ARCA —existe, tiene código— y equivocada para la persona, así que nada chilla.
 *   2. Qué categorías quedaron huérfanas y con cuántos contratos encima.
 *   3. Cómo están armados los grupos de un convenio, para planificar la reconstrucción.
 *
 *     npm run encuadre:auditar
 *
 * `CONVENIO=0131/75` cambia el convenio del bloque 3 (por defecto, ese).
 */

const CONVENIO_GRUPOS = process.env.CONVENIO || "0131/75";

/** Normaliza para comparar nombres de rol contra nombres de función: FRAME no es consistente. */
const norm = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  console.log(`\nDB: ${dbName}   |   SOLO LECTURA\n`);

  // ── Catálogo: legacyId → categoría, que es como los contratos la guardan.
  const cats: any[] = await Categoria.find({}).lean();
  const porLegacy = new Map<number, any>();
  for (const c of cats) if (c.legacyId != null) porLegacy.set(Number(c.legacyId), c);

  // ── Funciones FRAME: nombre → convenios que sus categorías contemplan.
  const roles: any[] = await RoleFrame.find({}).lean();
  const conveniosDeFuncion = new Map<string, { convenios: Set<string>; cats: string[]; rotas: number }>();
  for (const r of roles) {
    const nombre = norm(r?.data?.rol?.nombre || r?.name || "");
    if (!nombre) continue;
    /*
      Solo cuentan las categorías CON convenio.

      La función «Actor» mapea a la categoría rota «Actor», que no tiene convenio: si esa entrara al
      conjunto, los 152 contratos que la migración acaba de encuadrar bien darían sospechosos, porque
      su convenio real (0322/75) no está en un conjunto que solo contiene la cadena vacía. Sería
      denunciar como error exactamente lo que se vino a arreglar.
    */
    const convenios = new Set<string>();
    const detalle: string[] = [];
    let rotas = 0;
    for (const cs of r?.data?.categoriasSat || []) {
      const cat = porLegacy.get(Number(cs?.id));
      if (!cat) continue;
      if (!cat.convenio) {
        rotas++;
        continue;
      }
      convenios.add(String(cat.convenio));
      detalle.push(`${cat.convenio} ${cat.codigoArca} ${cat.nombre}${cat.isActive === false ? " (DE BAJA)" : ""}`);
    }
    conveniosDeFuncion.set(nombre, { convenios, cats: detalle, rotas });
  }

  // ── Todos los contratos con categoría asignada.
  const ups: any[] = await UserProject.find({ "contracts.0": { $exists: true } })
    .select("nombre_proyecto userId projectId contracts")
    .lean();

  type Fila = { userProjectId: string; proyecto: string; rol: string; cat: any; convenioCat: string; contemplados: string[]; opciones: string[]; alta: string; userId: string; idx: number };
  const sospechosos: Fila[] = [];
  const sinFuncionMapeada = new Map<string, number>();
  const usoPorLegacy = new Map<number, number>();
  let conCategoria = 0;

  for (const up of ups) {
    for (let i = 0; i < (up.contracts || []).length; i++) {
      const c = up.contracts[i];
      const legacy = Number(c?.categoria_sat_id);
      if (!legacy) continue;
      conCategoria++;
      usoPorLegacy.set(legacy, (usoPorLegacy.get(legacy) || 0) + 1);

      const cat = porLegacy.get(legacy);
      if (!cat) continue;
      const rol = String(c?.nombre_rol_frame || "");
      const fn = conveniosDeFuncion.get(norm(rol));
      if (!fn || fn.convenios.size === 0) {
        // No es sospechoso: es que no hay con qué comparar. Se cuenta aparte.
        const k = rol || "(sin rol FRAME)";
        sinFuncionMapeada.set(k, (sinFuncionMapeada.get(k) || 0) + 1);
        continue;
      }
      if (fn.convenios.has(String(cat.convenio || ""))) continue;
      sospechosos.push({
        proyecto: String(up.nombre_proyecto || ""),
        rol,
        userProjectId: String(up._id),
        cat,
        convenioCat: String(cat.convenio || ""),
        contemplados: [...fn.convenios],
        opciones: fn.cats,
        alta: String(c?.fecha_alta_contrato || ""),
        userId: String(up.userId),
        idx: i,
      });
    }
  }

  console.log("═══ A2 · Contratos con categoría de un convenio que su función FRAME no contempla ═══\n");
  console.log(`Contratos con categoría asignada: ${conCategoria}`);
  console.log(`Funciones FRAME con categorías mapeadas: ${[...conveniosDeFuncion.values()].filter((f) => f.convenios.size > 0).length}\n`);
  if (sospechosos.length === 0) console.log("  (ninguno)\n");
  for (const s of sospechosos) {
    console.log(`  ✖ ${s.proyecto} · rol «${s.rol}» · alta ${s.alta}`);
    console.log(`      tiene:    ${s.convenioCat} ${s.cat.codigoArca} ${s.cat.nombre}  (data.id=${s.cat.legacyId})`);
    console.log(`      contempla: ${s.contemplados.join(", ")}`);
    for (const o of s.opciones) console.log(`         · ${o}`);
    console.log(`      userId=${s.userId} contractIndex=${s.idx}`);
  }
  console.log(`\nTotal sospechosos: ${sospechosos.length}`);

  const sinMapeo = [...sinFuncionMapeada.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\nSin comparación posible (la función FRAME no tiene categorías mapeadas): ${sinMapeo.reduce((a, [, n]) => a + n, 0)} contrato(s) en ${sinMapeo.length} función(es)`);
  for (const [k, n] of sinMapeo.slice(0, 15)) console.log(`   ${String(n).padStart(4)}  ${k}`);
  if (sinMapeo.length > 15) console.log(`   … y ${sinMapeo.length - 15} más`);

  console.log("\n\n═══ A3 · Categorías huérfanas (sin convenio o sin código de ARCA) ═══\n");
  const huerfanas = cats.filter((c) => !c.convenio || !/^\d{6}$/.test(String(c.codigoArca || "")) || String(c.codigoArca) === "000000");
  for (const h of huerfanas) {
    const n = h.legacyId != null ? usoPorLegacy.get(Number(h.legacyId)) || 0 : 0;
    console.log(`  ${h.isActive === false ? "baja " : "ACTIVA"}  «${h.nombre}»  convenio=${h.convenio || "—"} codigo=${h.codigoArca || "—"} data.id=${h.legacyId ?? "—"}  contratos=${n}`);
  }
  if (huerfanas.length === 0) console.log("  (ninguna)");

  console.log(`\n\n═══ C · Grupos de ${CONVENIO_GRUPOS} ═══\n`);
  const grupos: any[] = await ConvenioGrupo.find({ convenio: CONVENIO_GRUPOS }).sort({ numero: 1 }).lean();
  const catsConv = cats.filter((c) => String(c.convenio) === CONVENIO_GRUPOS);
  const porGrupo = new Map<string, any[]>();
  let sinGrupo = 0;
  for (const c of catsConv) {
    if (!c.grupoId) {
      sinGrupo++;
      continue;
    }
    const k = String(c.grupoId);
    if (!porGrupo.has(k)) porGrupo.set(k, []);
    porGrupo.get(k)!.push(c);
  }
  console.log(`${catsConv.length} categorías · ${grupos.length} grupos · ${sinGrupo} sin grupo`);
  const conEscala = catsConv.filter((c) => Number(c.sueldoBruto) > 0 || Number(c.sueldoBasico) > 0).length;
  const gruposConEscala = grupos.filter((g) => Number(g.sueldoBruto) > 0 || Number(g.sueldoBasico) > 0).length;
  console.log(`Con escala: ${conEscala} categorías, ${gruposConEscala} grupos\n`);
  let usados = 0;
  for (const g of grupos) {
    const hijas = porGrupo.get(String(g._id)) || [];
    const contratos = hijas.reduce((a, c) => a + (c.legacyId != null ? usoPorLegacy.get(Number(c.legacyId)) || 0 : 0), 0);
    usados += contratos;
    console.log(`  #${String(g.numero).padStart(3)}  ${String(hijas.length).padStart(3)} cat  ${String(contratos).padStart(3)} contratos  «${g.nombre || ""}»  _id=${g._id}`);
  }
  console.log(`\nContratos usando categorías de ${CONVENIO_GRUPOS}: ${usados + catsConv.filter((c) => !c.grupoId).reduce((a, c) => a + (c.legacyId != null ? usoPorLegacy.get(Number(c.legacyId)) || 0 : 0), 0)}`);

  console.log("\n── Categorías que se llaman «GRUPO SALARIAL N» ──");
  for (const c of catsConv.filter((c) => /GRUPO\s+SALARIAL/i.test(String(c.nombre) + " " + String(c.descripcionArca))).sort((a, b) => String(a.codigoArca).localeCompare(String(b.codigoArca)))) {
    const g = c.grupoId ? grupos.find((x) => String(x._id) === String(c.grupoId)) : null;
    console.log(`  ${c.codigoArca}  «${c.nombre}»  grupo=${g ? `#${g.numero} «${g.nombre || ""}»` : "—"}`);
  }

  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
