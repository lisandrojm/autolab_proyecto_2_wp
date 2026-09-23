import fs from "fs";
import path from "path";
import mongoose from "mongoose";

import { AcuerdoParitario } from "../models/AcuerdoParitario.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import { EscalaPeriodo } from "../models/EscalaPeriodo.js";
import { armarPeriodo } from "../services/escalasConvenio.js";
import { deducirAdicionalPct, redondearCentavos } from "../utils/escalaCalculo.js";
import { CONTROL_ABRIL_G1, EXPEDIENTE, FACTOR_JUNIO, MARCA_TRAMOS, VIGENCIA_ABRIL, VIGENCIA_JUNIO } from "./datos/acta634_2026.js";

/**
 * SEED 2 · Los tramos de ABRIL y JUNIO 2026 de la escala del 0634/11, como historia.
 *
 * DE DÓNDE SALEN LOS IMPORTES, QUE ES LO IMPORTANTE
 *
 * 1. JUNIO se RECONSTRUYE DE LA BASE, no se transcribe. Las 106 filas de `categorias-sat` del convenio (fecha
 *    06/07/2026) tienen, por grupo, exactamente la escala de ese tramo: básico igual al del CCT 0131/75 de
 *    junio, adicional = básico × el % del grupo, presentismo = 10 %, y el total que declara el acta. El script
 *    las agrupa y exige que las categorías de un mismo grupo coincidan entre sí; si no coinciden, no inventa un
 *    promedio: saltea el grupo y lo informa.
 * 2. ABRIL se DERIVA de junio dividiendo por 1,048, el factor del 2.º tramo. Está verificado contra el único
 *    valor del Anexo A que tenemos escrito: 1.187.208,59 ÷ 1,048 = 1.132.832,62, que es el básico del grupo 1
 *    de abril. Igual queda marcado `origen: "derivado"`, no `"acta"`, porque los otros once grupos nadie los
 *    cotejó todavía.
 * 3. Con `ARCHIVO=<ruta.json>` se cargan los dos tramos desde la tabla real del Anexo A y entonces sí quedan
 *    `origen: "acta"`. Formato:
 *      { "abril": [{ "grupo": 1, "basico": 0, "adicionalPct": 0, "adicionalMonto": 0, "presentismoMonto": 0,
 *                    "total": 0, "neto": 0 }], "junio": [ … ] }
 *
 * NO TOCA NADA DE LO VIGENTE. Inserta dos períodos por grupo, los dos con vigencia terminada en junio, así que
 * el `ConvenioGrupo` —que es lo que leen los contratos— queda exactamente igual. Es la condición del pedido.
 *
 * Uso (desde server/):
 *   npm run 634-tramos:dry
 *   npm run 634-tramos
 *   ARCHIVO=anexo_a.json npm run 634-tramos
 *   npm run 634-tramos:revertir -- <respaldo.json>
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const CONVENIO = "0634/11";
const ARCHIVO_ANEXO = process.env.ARCHIVO?.trim();

interface FilaDeEscala {
  grupo: number;
  basico: number;
  adicionalPct: number | null;
  adicionalMonto: number | null;
  presentismoMonto: number | null;
  total: number | null;
  neto: number | null;
}

async function conectar() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  return dbName;
}

/**
 * Junio, reconstruido desde `categorias-sat`.
 *
 * Exige coincidencia exacta entre las categorías del grupo. Un grupo cuyas categorías declaran importes
 * distintos no es una escala: es un dato roto, y cargarlo como si fuera una escala lo escondería.
 */
async function junioDesdeCategoriasSat(): Promise<{ filas: FilaDeEscala[]; problemas: string[] }> {
  const docs = await CategoriaSat.find({ "data.convenio": CONVENIO }).lean();
  const porGrupo = new Map<number, any[]>();
  for (const d of docs as any[]) {
    const g = Number(d?.data?.numeroCategoria);
    if (!Number.isFinite(g)) continue;
    porGrupo.set(g, [...(porGrupo.get(g) || []), d.data]);
  }

  const filas: FilaDeEscala[] = [];
  const problemas: string[] = [];
  for (const [grupo, lista] of [...porGrupo.entries()].sort((a, b) => a[0] - b[0])) {
    const distintos = (campo: string) => [...new Set(lista.map((x) => Number(x?.[campo] || 0)))];
    const inconsistentes = ["sueldoBasico", "sueldoAdicional", "presentismo", "sueldoBruto"].filter((c) => distintos(c).length > 1);
    if (inconsistentes.length) {
      problemas.push(`G${grupo}: sus ${lista.length} categorías no coinciden en ${inconsistentes.join(", ")}`);
      continue;
    }
    const basico = distintos("sueldoBasico")[0];
    const adicionalMonto = distintos("sueldoAdicional")[0];
    filas.push({
      grupo,
      basico,
      adicionalPct: deducirAdicionalPct(basico, adicionalMonto),
      adicionalMonto,
      presentismoMonto: distintos("presentismo")[0],
      total: distintos("sueldoBruto")[0],
      neto: distintos("neto")[0] || null,
    });
  }
  return { filas, problemas };
}

/** Abril, derivado de junio. El `adicionalPct` es del grupo y no se mueve con el tramo. */
const abrilDesdeJunio = (junio: FilaDeEscala[]): FilaDeEscala[] =>
  junio.map((f) => ({
    grupo: f.grupo,
    basico: redondearCentavos(f.basico / FACTOR_JUNIO),
    adicionalPct: f.adicionalPct,
    // Los montos NO se derivan: se recalculan del básico nuevo (lo hace `armarPeriodo`). Dividir cada importe
    // por separado daría una escala que no cierra con su propia cuenta.
    adicionalMonto: null,
    presentismoMonto: null,
    total: null,
    neto: null,
  }));

function leerAnexo(ruta: string): { abril: FilaDeEscala[]; junio: FilaDeEscala[] } {
  const absoluta = path.resolve(process.cwd(), ruta);
  if (!fs.existsSync(absoluta)) throw new Error(`No existe el archivo del Anexo A: ${absoluta}`);
  const json = JSON.parse(fs.readFileSync(absoluta, "utf8"));
  const normalizar = (filas: any[]): FilaDeEscala[] =>
    (filas || []).map((f) => ({
      grupo: Number(f.grupo),
      basico: Number(f.basico || 0),
      adicionalPct: f.adicionalPct == null ? null : Number(f.adicionalPct),
      adicionalMonto: f.adicionalMonto == null ? null : Number(f.adicionalMonto),
      presentismoMonto: f.presentismoMonto == null ? null : Number(f.presentismoMonto),
      total: f.total == null ? null : Number(f.total),
      neto: f.neto == null ? null : Number(f.neto),
    }));
  return { abril: normalizar(json.abril), junio: normalizar(json.junio) };
}

async function run() {
  const dbName = await conectar();
  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}   |   convenio ${CONVENIO}\n`);

  let abril: FilaDeEscala[];
  let junio: FilaDeEscala[];
  let origen: "acta" | "derivado";

  if (ARCHIVO_ANEXO) {
    const leido = leerAnexo(ARCHIVO_ANEXO);
    abril = leido.abril;
    junio = leido.junio;
    origen = "acta";
    console.log(`Fuente: ${ARCHIVO_ANEXO} (Anexo A) → los dos tramos quedan con origen "acta".`);
  } else {
    const { filas, problemas } = await junioDesdeCategoriasSat();
    junio = filas;
    abril = abrilDesdeJunio(filas);
    origen = "derivado";
    console.log(`Fuente: categorias-sat (${filas.length} grupos reconstruidos). Junio es fiel al tramo cargado; abril se deriva ÷ ${FACTOR_JUNIO}.`);
    for (const p of problemas) console.log(`   ⚠ ${p}`);
  }

  if (!junio.length) throw new Error("No se pudo reconstruir ningún grupo de junio. Pasá ARCHIVO=<anexo.json>.");

  /* El control del Anexo A: el único grupo de abril que tenemos escrito del acta. */
  const abrilG1 = abril.find((f) => f.grupo === CONTROL_ABRIL_G1.grupo);
  const controlOk = abrilG1 ? Math.abs(abrilG1.basico - CONTROL_ABRIL_G1.basico) < 0.01 : false;
  console.log(`Control Anexo A (grupo 1, abril): esperado ${CONTROL_ABRIL_G1.basico} · obtenido ${abrilG1?.basico ?? "—"} → ${controlOk ? "✓ coincide" : "✗ NO COINCIDE"}`);
  if (!controlOk) console.log("   ⚠ Si no coincide, revisá la fuente antes de escribir: el resto de los grupos sale del mismo camino.\n");

  const acuerdo = await AcuerdoParitario.findOne({ expediente: EXPEDIENTE }).select("_id");
  if (!acuerdo) console.log(`   ⚠ No está cargado el acuerdo ${EXPEDIENTE} (corré 634-acuerdo primero): los períodos van a quedar sin vínculo al acta.`);

  const grupos = await ConvenioGrupo.find({ convenio: CONVENIO }).select("numero").lean();
  const idPorNumero = new Map((grupos as any[]).map((g) => [Number(g.numero), String(g._id)]));

  const tramos: Array<{ nombre: string; codigo: string; vigencia: { desde: string; hasta: string }; filas: FilaDeEscala[] }> = [
    { nombre: "abril 2026", codigo: "2026-04", vigencia: VIGENCIA_ABRIL, filas: abril },
    { nombre: "junio 2026", codigo: "2026-06", vigencia: VIGENCIA_JUNIO, filas: junio },
  ];

  const insertados: Array<{ _id: string; grupo: number; desde: string }> = [];
  const salteados: string[] = [];
  let procesados = 0;

  for (const tramo of tramos) {
    console.log(`\n── ${tramo.nombre} (${tramo.vigencia.desde} → ${tramo.vigencia.hasta})`);
    for (const fila of tramo.filas.sort((a, b) => a.grupo - b.grupo)) {
      if (!(fila.basico > 0)) {
        salteados.push(`${tramo.codigo} G${fila.grupo}: sin básico`);
        continue;
      }
      const ya = await EscalaPeriodo.findOne({ convenio: CONVENIO, grupo: fila.grupo, categoriaId: null, desde: new Date(`${tramo.vigencia.desde}T00:00:00.000Z`) }).select("_id");
      if (ya) {
        salteados.push(`${tramo.codigo} G${fila.grupo}: ya estaba cargado`);
        continue;
      }

      /* Para el grupo 1 de abril sí tenemos los importes del acta: van como `acta`, y así la comparación queda
         asentada en el propio documento. Para el resto, la cuenta es la única fuente. */
      const esControl = tramo.codigo === "2026-04" && fila.grupo === CONTROL_ABRIL_G1.grupo && !ARCHIVO_ANEXO;
      const datos = armarPeriodo({
        convenio: CONVENIO,
        grupo: fila.grupo,
        grupoId: idPorNumero.get(fila.grupo) || null,
        desde: tramo.vigencia.desde,
        hasta: tramo.vigencia.hasta,
        basico: fila.basico,
        adicionalPct: fila.adicionalPct,
        presentismoPct: 10,
        acta: esControl
          ? { adicionalMonto: CONTROL_ABRIL_G1.adicionalMonto, presentismoMonto: CONTROL_ABRIL_G1.presentismoMonto, total: CONTROL_ABRIL_G1.total }
          : { adicionalMonto: fila.adicionalMonto, presentismoMonto: fila.presentismoMonto, total: fila.total, neto: fila.neto },
        acuerdoId: acuerdo?._id ? String(acuerdo._id) : null,
        tramo: tramo.codigo,
        // Junio queda como "acta" siempre: los importes de `categorias-sat` SON los del tramo, verificados
        // grupo por grupo. Abril queda "derivado" mientras no llegue la tabla del Anexo A.
        origen: tramo.codigo === "2026-06" ? "acta" : origen,
        migracion: MARCA_TRAMOS,
        nota: tramo.codigo === "2026-04" && !ARCHIVO_ANEXO ? `Básico derivado de junio ÷ ${FACTOR_JUNIO}. Cotejar contra el Anexo A.` : "",
      });

      const dif = (datos.diferencias as any[]).map((d) => `${d.campo} ${d.delta > 0 ? "+" : ""}${d.delta}`).join(", ");
      console.log(`   G${String(fila.grupo).padStart(2)}: A ${String(datos.basico).padStart(11)} · B ${String(fila.adicionalPct ?? "—").padStart(7)}% · C ${String(datos.adicionalMonto).padStart(10)} · D ${String(datos.presentismoMonto).padStart(9)} · total ${datos.total}${dif ? `   ⚠ ${dif}` : ""}`);

      procesados++;
      if (!DRY_RUN) {
        const creado = await EscalaPeriodo.create(datos);
        insertados.push({ _id: String(creado._id), grupo: fila.grupo, desde: tramo.vigencia.desde });
      }
    }
  }

  if (!DRY_RUN && insertados.length) {
    const dir = path.resolve(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });
    const archivo = path.join(dir, `634-tramos-${new Date().toISOString().replace(/[:.]/g, "")}.json`);
    fs.writeFileSync(archivo, JSON.stringify(insertados, null, 2));
    console.log(`\nRespaldo reversible: ${archivo}`);
  }

  console.log(`\n${DRY_RUN ? "Se insertarían" : "Se insertaron"} ${procesados} período(s).`);
  if (salteados.length) {
    console.log(`Salteados (${salteados.length}): ${salteados.join(" · ")}`);
  }
  console.log("La escala vigente de los grupos no se tocó: los dos tramos vencen en junio 2026.");
  console.log(`⚠ Entre el 01/07/2026 y el 14/09/2026 no queda ninguna escala cargada: falta el acta de ese tramo.\n`);
  await mongoose.disconnect();
}

async function revertir(archivo: string) {
  const dbName = await conectar();
  const ruta = path.resolve(process.cwd(), archivo);
  if (!fs.existsSync(ruta)) throw new Error(`No existe el respaldo: ${ruta}`);
  const insertados: Array<{ _id: string }> = JSON.parse(fs.readFileSync(ruta, "utf8"));
  let borrados = 0;
  for (const i of insertados) {
    const r = await EscalaPeriodo.deleteOne({ _id: i._id, migracion: MARCA_TRAMOS });
    borrados += r.deletedCount || 0;
  }
  console.log(`\nDB: ${dbName}   |   ${borrados} período(s) borrado(s).\n`);
  await mongoose.disconnect();
}

const archivo = process.argv[2];
(archivo ? revertir(archivo) : run()).catch((e) => {
  console.error("\n❌", e?.message || e, "\n");
  process.exit(1);
});
