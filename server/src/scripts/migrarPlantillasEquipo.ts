import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { CAMPOS_DE_CONDICIONES, CAMPOS_DE_EQUIPO, PlantillaEquipo } from "../models/PlantillaEquipo.js";
import { puestoEnEquipo } from "../services/plantillasEquipo.js";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PLANTILLAS DE EQUIPO → CONDICIONES DEL EQUIPO Y REEMPLAZO EXPLÍCITO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Antes cada puesto llevaba su contrato, área y turno, horario y días, y un equipo pisaba puesto por
 * puesto («PROPIAS»). Ahora el equipo tiene SUS condiciones y cada puesto sólo guarda lo distinto.
 * Por equipo y por campo:
 *
 *   - el valor de la MAYORÍA de sus puestos (lo que efectivamente regía: puesto + propias) pasa a
 *     «Condiciones del equipo» (empate: el del primer puesto);
 *   - los puestos con otro valor quedan con esa DIFERENCIA, aunque antes lo tuvieran en el puesto y no
 *     en el equipo: si no, el equipo nuevo se los pisaría.
 *
 * Y cada «Entró en lugar de X» (el reemplazo implícito que dejaba «Cambiar a…») pasa a un reemplazo
 * sin motivo marcado «Revisar motivo»: la contratación no lo deja salir hasta que se complete.
 *
 * NO SE PIERDE NADA: por cada puesto de cada equipo se compara lo que regía antes y después, campo por
 * campo, y cuántas personas hay asignadas. Si algo no coincide, aborta sin escribir. Antes de escribir
 * deja una copia de los documentos originales en `scripts/salidas/`.
 *
 *   npm run migrar-plantillas:dry
 *   npm run migrar-plantillas
 */

const DRY_RUN = process.env.DRY_RUN === "true";

const comparable = (v: any): string => {
  if (v === undefined || v === null || v === "") return "";
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => String(x)));
  return String(v);
};

/** El contrato viaja con su nombre y su trámite: se decide como uno solo. */
const GRUPOS: string[][] = [["contratoId", "nombreContrato", "tipoImpositivo"], ["areaId", "shiftId"], ["inTime", "outTime"], ["diasSemana", "diasPorSemana", "diasRotativos"]];

async function conectar() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  return dbName;
}

/** Lo que rige en cada puesto que usa el equipo, con cualquiera de los dos modelos. */
const vigente = (p: any, e: any) =>
  new Map(
    (p.integrantes || [])
      .filter((i: any) => !(e.asignaciones || []).some((a: any) => String(a.puestoId) === String(i._id) && a.excluido))
      .map((i: any) => {
        const a = (e.asignaciones || []).find((x: any) => String(x.puestoId) === String(i._id));
        const efectivo = puestoEnEquipo(i, a, e);
        return [String(i._id), Object.fromEntries(CAMPOS_DE_CONDICIONES.map((c) => [c, comparable(efectivo[c])]))];
      }),
  );

function migrarEquipo(p: any, e: any): string[] {
  const cambios: string[] = [];
  const usados = (p.integrantes || []).filter((i: any) => !(e.asignaciones || []).some((a: any) => String(a.puestoId) === String(i._id) && a.excluido));
  const asignacion = (i: any) => (e.asignaciones || []).find((a: any) => String(a.puestoId) === String(i._id));

  // 1. Las condiciones del equipo (si ya las tiene, está migrado: no se tocan).
  if (!e.condiciones && usados.length) {
    const efectivos = usados.map((i: any) => puestoEnEquipo(i, asignacion(i), e));
    const condiciones: Record<string, any> = {};
    for (const grupo of GRUPOS) {
      const votos = new Map<string, { n: number; valor: Record<string, any> }>();
      for (const ef of efectivos) {
        const clave = grupo.map((c) => comparable(ef[c])).join("|");
        const v = votos.get(clave) || { n: 0, valor: Object.fromEntries(grupo.map((c) => [c, ef[c] ?? null])) };
        v.n++;
        votos.set(clave, v);
      }
      // Map conserva el orden de inserción: en un empate gana el del primer puesto.
      const ganador = [...votos.values()].reduce((a, b) => (b.n > a.n ? b : a));
      if (grupo.some((c) => comparable(ganador.valor[c]) !== "")) Object.assign(condiciones, ganador.valor);
    }
    if (Object.keys(condiciones).length) {
      e.condiciones = condiciones;
      cambios.push(`condiciones del equipo: ${Object.keys(condiciones).filter((k) => comparable(condiciones[k])).join(", ")}`);
    }

    // 2. Las diferencias: lo que regía en cada puesto y ya no sale del equipo.
    for (const [n, i] of usados.entries()) {
      const antes = efectivos[n];
      const base = puestoEnEquipo(i, null, e);
      let a = asignacion(i);
      const viejas = a?.condiciones || {};
      const nuevas: Record<string, any> = {};
      for (const c of CAMPOS_DE_CONDICIONES) {
        const esDeEquipo = (CAMPOS_DE_EQUIPO as readonly string[]).includes(c);
        if (!esDeEquipo) {
          if (c in viejas) nuevas[c] = viejas[c];
          continue;
        }
        if (comparable(antes[c]) !== comparable(base[c])) nuevas[c] = antes[c] ?? null;
      }
      if ("escalaAlFijar" in viejas && ("dailyRateManual" in nuevas || "categoriaSatId" in nuevas)) nuevas.escalaAlFijar = viejas.escalaAlFijar;
      const hay = Object.keys(nuevas).length > 0;
      if (!a && hay) e.asignaciones.push((a = { puestoId: i._id, userId: null, condiciones: null, excluido: false }));
      if (a) {
        const antesTxt = JSON.stringify(a.condiciones || null);
        a.condiciones = hay ? nuevas : null;
        if (JSON.stringify(a.condiciones) !== antesTxt) cambios.push(`puesto ${n + 1}: diferencia ${hay ? Object.keys(nuevas).join(", ") : "ninguna"}`);
      }
    }
  }

  // 3. «Entró en lugar de» → reemplazo sin motivo, a revisar.
  for (const a of e.asignaciones || []) {
    if (a.reemplazadoDePersonaId && !a.reemplazo?.replacedUserId) {
      a.reemplazo = { replacedUserId: a.reemplazadoDePersonaId, motivoReemplazoId: null, revisarMotivo: true };
      cambios.push(`reemplazo a revisar (antes «Entró en lugar de»)`);
    }
    if (a.reemplazadoDePersonaId || a.reemplazadoEl) {
      a.reemplazadoDePersonaId = null;
      a.reemplazadoEl = null;
    }
  }
  return cambios;
}

async function run() {
  const dbName = await conectar();
  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
  const plantillas = await PlantillaEquipo.find({ alcance: { $ne: "general" } }).lean();
  const salida: any[] = [];
  let tocadas = 0;

  for (const original of plantillas) {
    const p: any = JSON.parse(JSON.stringify(original));
    // Los ObjectId se comparan como texto: la copia de trabajo los tiene como string, igual que el original.
    const antes = new Map((original.equipos || []).map((e: any) => [String(e._id), vigente(original, e)]));
    const personasAntes = (original.equipos || []).reduce((s: number, e: any) => s + (e.asignaciones || []).filter((a: any) => a.userId).length, 0);
    const cambiosPorEquipo = (p.equipos || []).map((e: any) => ({ equipo: e.nombre, cambios: migrarEquipo(p, e) })).filter((x: any) => x.cambios.length);
    if (!cambiosPorEquipo.length) continue;

    // La verificación: nada de lo que regía cambia, nadie se pierde.
    for (const e of p.equipos || []) {
      const a = antes.get(String(e._id))!;
      const d = vigente(p, e);
      for (const [puestoId, campos] of a) {
        const despues = d.get(puestoId) || {};
        for (const [c, v] of Object.entries(campos)) if ((despues as any)[c] !== v) throw new Error(`«${p.nombre}» / «${e.nombre}» / puesto ${puestoId}: ${c} era «${v}» y quedaría «${(despues as any)[c]}». No se escribió nada.`);
      }
    }
    const personasDespues = (p.equipos || []).reduce((s: number, e: any) => s + (e.asignaciones || []).filter((a: any) => a.userId).length, 0);
    if (personasAntes !== personasDespues) throw new Error(`«${p.nombre}»: ${personasAntes} personas asignadas antes y ${personasDespues} después. No se escribió nada.`);

    tocadas++;
    console.log(`• ${p.nombre}${p.activo === false ? " (borrada)" : ""}`);
    for (const x of cambiosPorEquipo) {
      console.log(`    «${x.equipo}»`);
      for (const c of x.cambios) console.log(`       - ${c}`);
    }
    salida.push({ original, nuevosEquipos: p.equipos });
  }

  console.log(`\n${tocadas} de ${plantillas.length} plantillas con cambios. Verificación: OK (nada de lo que regía cambia; nadie se pierde).`);
  // Para revisar el resultado sin escribir: `SALIDA_DRY=archivo.json` deja los equipos como quedarían.
  if (process.env.SALIDA_DRY) fs.writeFileSync(process.env.SALIDA_DRY, JSON.stringify(salida.map((x) => ({ _id: String(x.original._id), nombre: x.original.nombre, equipos: x.nuevosEquipos })), null, 2));
  if (!DRY_RUN && salida.length) {
    const dir = path.resolve("src/scripts/salidas");
    fs.mkdirSync(dir, { recursive: true });
    const archivo = path.join(dir, `migrarPlantillas-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(archivo, JSON.stringify(salida.map((x) => x.original), null, 2));
    console.log(`Copia de los originales: ${archivo}`);
    // Se escribe con el driver: el esquema de Mongoose descartaría campos viejos que hay que poner en null.
    const col = mongoose.connection.collection("plantillas_equipo");
    for (const x of salida) {
      // La copia de trabajo pasó por JSON: se le devuelven los ObjectId y las fechas.
      const equipos = JSON.parse(JSON.stringify(x.nuevosEquipos), (k, v) =>
        typeof v === "string" && /^[0-9a-f]{24}$/.test(v) && /(^_id$|Id$)/.test(k) ? new mongoose.Types.ObjectId(v) : typeof v === "string" && /El$/.test(k) && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v,
      );
      await col.updateOne({ _id: x.original._id }, { $set: { equipos } });
    }
    console.log(`Escritas ${salida.length} plantillas.`);
  }
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error("\n✖", e.message || e);
  await mongoose.disconnect();
  process.exit(1);
});
