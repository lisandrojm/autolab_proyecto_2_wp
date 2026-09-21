/**
 * SOLO LECTURA. Qué tipos de contrato y plantillas faltan, y quién los sigue apuntando.
 *
 * Los tipos «Eventual …» se borraron físicamente (`deleteOne` en las rutas de Contrato y
 * ContratoFrame), así que lo único que queda de ellos son las referencias que dejaron: contratos de
 * gente, estados del ABM y plantillas apuntando a un Contrato que ya no está.
 *
 * Este script NO escribe nada. Lista lo que hay, lo que falta y quién lo referencia, para poder
 * decidir qué restaurar del backup.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx \
 *     src/scripts/diagnosticarTiposEventualBorrados.ts
 */
import mongoose from "mongoose";

const uri = process.env.MONGO_URI || "";
if (!uri) {
  console.error("Falta MONGO_URI");
  process.exit(1);
}

const main = async () => {
  await mongoose.connect(uri, { dbName: process.env.MONGO_DB_NAME });
  const db = mongoose.connection.db!;
  console.log(`Base: ${db.databaseName}\n`);

  const contratos = await db.collection("contratos").find({}).project({ name: 1 }).toArray();
  const frames = await db.collection("contratos-frame").find({}).project({ name: 1, contratoId: 1 }).toArray();

  const idsContrato = new Set(contratos.map((c) => String(c._id)));
  const idsFrame = new Set(frames.map((f) => String(f._id)));

  console.log(`── TIPOS DE CONTRATO (contratos): ${contratos.length}`);
  for (const c of contratos.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))) console.log(`   · ${c.name}`);

  console.log(`\n── PLANTILLAS (contratos-frame): ${frames.length}`);
  for (const f of frames.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))) {
    const huerfana = f.contratoId && !idsContrato.has(String(f.contratoId));
    console.log(`   · ${f.name}${huerfana ? "   ⚠️  apunta a un Contrato que ya no existe" : ""}`);
  }

  /*
    Los nombres que la gente TIENE CONTRATADOS. `nombre_contrato` es texto copiado al momento del
    alta, así que sobrevive al borrado del catálogo: es la prueba de qué tipos existieron.
  */
  const porNombre = new Map<string, number>();
  const contratoIdsUsados = new Map<string, number>();
  const ups = await db.collection("users_&_projects").find({}).project({ contracts: 1 }).toArray();
  for (const up of ups) {
    for (const c of (up as any).contracts || []) {
      const n = String(c?.nombre_contrato || "").trim();
      if (n) porNombre.set(n, (porNombre.get(n) || 0) + 1);
      if (c?.contratoId) {
        const k = String(c.contratoId);
        contratoIdsUsados.set(k, (contratoIdsUsados.get(k) || 0) + 1);
      }
    }
  }

  const nombresVivos = new Set(contratos.map((c) => String(c.name)));
  console.log(`\n── NOMBRES CONTRATADOS por la gente (userprojects.contracts.nombre_contrato)`);
  for (const [n, cant] of [...porNombre.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(cant).padStart(5)}  ${n}${nombresVivos.has(n) ? "" : "   ⚠️  SIN tipo en el catálogo"}`);
  }

  console.log(`\n── contratoId referenciados por contratos de gente, que ya NO existen`);
  let huerfanos = 0;
  for (const [id, cant] of [...contratoIdsUsados.entries()].sort((a, b) => b[1] - a[1])) {
    if (!idsContrato.has(id)) {
      console.log(`   ${String(cant).padStart(5)}  ${id}`);
      huerfanos++;
    }
  }
  if (huerfanos === 0) console.log("   (ninguno)");

  /* El TERCER catálogo: los tipos importados de FRAME viven como Info type:"contrato", con su
     `data.id` numérico, y es contra ese que los contratos guardan `tipo_contrato_id`. */
  const infosContrato = await db.collection("infos").find({ type: "contrato" }).project({ name: 1, "data.id": 1 }).toArray();
  console.log(`\n── Info type:"contrato" (catálogo de tipos importados): ${infosContrato.length}`);
  for (const i of infosContrato.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)))) {
    console.log(`   · [${(i as any).data?.id}] ${(i as any).name}`);
  }

  /* Los estados del ABM que guardan punteros a plantillas borradas: los badges «Tipo eliminado». */
  console.log(`\n── ESTADOS con contratoFrameIds que ya no existen`);
  const estados = await db.collection("infos").find({ type: "estado-empleado" }).project({ name: 1, "data.contratoFrameIds": 1 }).toArray();
  let estadosConHuerfanos = 0;
  for (const e of estados) {
    const ids: string[] = ((e as any).data?.contratoFrameIds || []).map(String);
    const muertos = ids.filter((id) => !idsFrame.has(id));
    if (muertos.length > 0) {
      console.log(`   · ${(e as any).name}: ${muertos.length} de ${ids.length} apuntan a la nada`);
      estadosConHuerfanos++;
    }
  }
  if (estadosConHuerfanos === 0) console.log("   (ninguno)");

  await mongoose.disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
