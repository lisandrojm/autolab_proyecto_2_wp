/**
 * DIAGNÓSTICO, SÓLO LECTURA: contratos duplicados dentro de un mismo vínculo (18/11/2026), en TODOS los
 * proyectos del tenant.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/diagDuplicadosAppFrame.ts [--detalle]
 *   En el VPS: NODE_ENV=production node dist/scripts/diagDuplicadosAppFrame.js
 *
 * DUPLICADO = dos o más contratos NO anulados del mismo vínculo con la misma fecha de alta, la misma baja
 * y el mismo tipo de contrato. Para cada grupo dice:
 *  - si las copias tienen la misma CLAVE DE IMPORTACIÓN de FRAME (`buildContractKey`:
 *    proyecto_id | empleado_id | fecha_alta | tipo_contrato_id | categoria_sat_id). Si la tienen, el import
 *    no debería haber creado la segunda; si no, QUÉ CAMPO difiere: ésa es la razón por la que el import no
 *    reconoció la copia de la app y agregó la suya.
 *  - de qué tanda de carga viene cada copia (fecha_carga) y si alguna tiene recibos o alta en ARCA (la
 *    que hay que conservar).
 */
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { buildContractKey } from "../utils/additiveSync.js";
import { fechaISO } from "../utils/contratoVigencia.js";

const db = () => mongoose.connection.db!;
const dia = (v: any) => (v instanceof Date ? v.toISOString().slice(0, 10) : fechaISO(v));
const CAMPOS = ["proyecto_id", "empleado_id", "fecha_alta_contrato", "tipo_contrato_id", "categoria_sat_id"] as const;

async function main() {
  const detalle = process.argv.includes("--detalle");
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const proyectos = new Map((await db().collection("projects").find({}).project({ name: 1 }).toArray()).map((p: any) => [String(p._id), p.name]));
  const ups = await db().collection("users_&_projects").find({ "contracts.1": { $exists: true } })
    .project({ userId: 1, projectId: 1, ...Object.fromEntries([...CAMPOS, "fecha_baja_contrato", "nombre_contrato", "estadoContrato", "fecha_carga", "contratoKey", "altaArcaPresentada.resultado", "sueldo_bruto", "solicitudId", "origen"].map((c) => [`contracts.${c}`, 1])) })
    .toArray();
  const conRecibos = new Set((await db().collection("recibos_sueldo_enviados").find({ contratoKey: { $ne: null } }).project({ contratoKey: 1 }).toArray()).map((r: any) => String(r.contratoKey)));

  const grupos: any[] = [];
  for (const up of ups) {
    const porFirma = new Map<string, number[]>();
    (up.contracts || []).forEach((c: any, i: number) => {
      if (c?.estadoContrato === "ANULADO") return;
      const firma = `${dia(c.fecha_alta_contrato)}|${dia(c.fecha_baja_contrato)}|${c.nombre_contrato || ""}`;
      (porFirma.get(firma) || porFirma.set(firma, []).get(firma)!).push(i);
    });
    for (const [firma, idxs] of porFirma) {
      if (idxs.length < 2) continue;
      const copias = idxs.map((i) => up.contracts[i]);
      const claves = copias.map((c: any) => buildContractKey(c));
      const difieren = CAMPOS.filter((f) => new Set(copias.map((c: any) => String(c[f] ?? ""))).size > 1);
      grupos.push({
        proyecto: proyectos.get(String(up.projectId)) || "?",
        up: String(up._id),
        userId: String(up.userId),
        firma,
        copias: idxs.map((i, n) => ({ i, carga: dia(copias[n].fecha_carga), arca: copias[n].altaArcaPresentada?.resultado || "", recibos: conRecibos.has(String(copias[n].contratoKey)), sueldo: !!copias[n].sueldo_bruto, app: !!(copias[n].solicitudId || copias[n].origen) })),
        mismaClaveFrame: new Set(claves).size === 1,
        difieren,
      });
    }
  }

  const personas = new Set(grupos.map((g) => g.userId)).size;
  const extra = grupos.reduce((a, g) => a + g.copias.length - 1, 0);
  console.log(`Grupos de duplicados: ${grupos.length} · personas: ${personas} · contratos de más: ${extra}\n`);
  const contar = (f: (g: any) => string) => { const m = new Map<string, number>(); for (const g of grupos) m.set(f(g), (m.get(f(g)) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
  console.log("Por proyecto:"); for (const [k, n] of contar((g) => g.proyecto)) console.log(`  ${String(n).padStart(4)}  ${k}`);
  console.log("\n¿Por qué el import no reconoció la copia? (campo de la clave que difiere)");
  for (const [k, n] of contar((g) => (g.mismaClaveFrame ? "MISMA clave (no lo explica el import)" : g.difieren.join(" + ")))) console.log(`  ${String(n).padStart(4)}  ${k}`);
  console.log("\nTandas de carga de las copias (fecha_carga, combinadas):");
  for (const [k, n] of contar((g) => g.copias.map((c: any) => c.carga).sort().join(" + ")).slice(0, 15)) console.log(`  ${String(n).padStart(4)}  ${k}`);
  console.log("\nCopias con algo que las ata (recibos o alta en ARCA):");
  console.log(`  grupos donde UNA sola copia tiene recibos/ARCA: ${grupos.filter((g) => g.copias.filter((c: any) => c.recibos || c.arca).length === 1).length}`);
  console.log(`  grupos donde VARIAS copias tienen recibos/ARCA: ${grupos.filter((g) => g.copias.filter((c: any) => c.recibos || c.arca).length > 1).length}`);
  console.log(`  grupos donde NINGUNA tiene recibos/ARCA: ${grupos.filter((g) => g.copias.every((c: any) => !c.recibos && !c.arca)).length}`);
  if (detalle) {
    console.log("\nDETALLE:");
    for (const g of grupos) console.log(`  ${g.proyecto} · vínculo ${g.up} · ${g.firma} · ${g.mismaClaveFrame ? "misma clave" : `difiere: ${g.difieren.join("+")}`} · ${g.copias.map((c: any) => `#${c.i} carga ${c.carga}${c.recibos ? " recibos" : ""}${c.arca ? ` arca:${c.arca}` : ""}${c.sueldo ? "" : " sin sueldo"}`).join(" | ")}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
