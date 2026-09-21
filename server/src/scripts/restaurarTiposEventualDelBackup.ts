/**
 * RESTAURA los 8 tipos de contrato «Eventual …» y sus 8 plantillas, desde el backup de Dropbox.
 *
 * ── Qué pasó ──
 *
 * Las rutas de Contrato y ContratoFrame borran FÍSICO (`deleteOne`), sin papelera ni `isActive`. Se
 * borraron 8 tipos con sus 8 plantillas, y quedaron colgadas las referencias que otros documentos
 * guardaban: los 5 estados del ABM de Contratos apuntan cada uno a 8 plantillas que ya no existen
 * (los badges «Tipo eliminado»), y 466 contratos de gente tienen un `nombre_contrato` sin catálogo.
 *
 * ── Por qué esta copia ──
 *
 * `weprodu_production_integration_2026-09-10_1610` es la ÚNICA que todavía los tiene: las siete
 * copias siguientes (de 18/09 en adelante) ya traen 7 y 7. O sea que el borrado fue entre el 10 y el
 * 18 de septiembre, y ésta es la última foto anterior. Lo que vuelve es el estado del 10/09: si
 * alguno se editó entre esa fecha y el borrado, esa edición no está en ninguna copia.
 *
 * ── Por qué con el `_id` original ──
 *
 * Es lo único que arregla a los que los referencian. Los estados guardan `contratoFrameIds` con los
 * ids viejos; con ids nuevos volverían los tipos pero los estados seguirían apuntando a la nada, que
 * es el problema que se quiere resolver. Verificado antes de escribir esto: los 8 ids huérfanos de
 * los estados son EXACTAMENTE los 8 que trae el backup, y los `contratoId` de las 8 plantillas
 * resuelven contra los 8 tipos que se restauran en la misma corrida.
 *
 * ── Seguridad ──
 *
 * Sólo INSERTA lo que no está: cada documento se escribe con `insertOne` y si el `_id` ya existe se
 * saltea. No actualiza ni borra nada, así que correrlo dos veces no hace daño y no puede pisar algo
 * que se haya creado después.
 *
 *   DRY (por defecto, no escribe):
 *     ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx \
 *       src/scripts/restaurarTiposEventualDelBackup.ts
 *   ESCRIBIENDO:
 *     ./node_modules/.bin/dotenv -e .env.production -v APLICAR=true -- ./node_modules/.bin/tsx \
 *       src/scripts/restaurarTiposEventualDelBackup.ts
 */
import mongoose from "mongoose";
import { EJSON } from "bson";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, downloadFileContent } from "../services/dropboxService.js";
import { CARPETA_BACKUPS } from "../services/backupService.js";

const BACKUP = process.env.BACKUP || "weprodu_production_integration_2026-09-10_1610";
const TENANT_SLUG = process.env.TENANT_SLUG || "demo-tenant";
const APLICAR = process.env.APLICAR === "true";
const COLECCIONES = ["contratos", "contratos-frame"];

const parsearEjsonPorLinea = (buf: Buffer): any[] =>
  buf
    .toString("utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => EJSON.parse(l) as any);

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI || "", { dbName: process.env.MONGO_DB_NAME });
  const db = mongoose.connection.db!;

  const tenant: any = await Tenant.findOne({ slug: TENANT_SLUG }).lean();
  if (!tenant) throw new Error(`No existe el tenant ${TENANT_SLUG}`);
  const cfg = getTenantDropboxConfig(tenant);
  if (!cfg) throw new Error(`El tenant ${TENANT_SLUG} no tiene Dropbox conectado`);
  const tenantId = String(tenant._id);

  console.log(`Base:   ${db.databaseName}`);
  console.log(`Backup: ${BACKUP}`);
  console.log(`Modo:   ${APLICAR ? "APLICAR (escribe)" : "DRY-RUN (no escribe)"}\n`);

  for (const coleccion of COLECCIONES) {
    const docs = parsearEjsonPorLinea(await downloadFileContent(tenantId, cfg, `${CARPETA_BACKUPS}/${BACKUP}/${coleccion}.json`));
    const presentes = new Set((await db.collection(coleccion).find({}).project({ _id: 1 }).toArray()).map((d) => String(d._id)));
    const faltantes = docs.filter((d) => !presentes.has(String(d._id)));

    console.log(`── ${coleccion}: ${docs.length} en la copia, ${presentes.size} hoy → a restaurar ${faltantes.length}`);

    let ok = 0;
    for (const doc of faltantes) {
      if (!APLICAR) {
        console.log(`   [dry] insertaría ${doc.name}  _id=${String(doc._id)}`);
        continue;
      }
      try {
        await db.collection(coleccion).insertOne(doc);
        ok++;
        console.log(`   ✓ ${doc.name}  _id=${String(doc._id)}`);
      } catch (e: any) {
        // 11000 = el `_id` (o un índice único) ya estaba: no se pisa nada, se informa y sigue.
        console.log(`   ✗ ${doc.name}: ${e?.code === 11000 ? "ya existía / choque de índice único" : e?.message || e}`);
      }
    }
    if (APLICAR) console.log(`   → insertados ${ok} de ${faltantes.length}`);
    console.log("");
  }

  /* Comprobación final: que los estados ya no apunten a la nada. */
  const idsFrame = new Set((await db.collection("contratos-frame").find({}).project({ _id: 1 }).toArray()).map((d) => String(d._id)));
  const estados = await db.collection("infos").find({ type: "estado-empleado" }).project({ name: 1, "data.contratoFrameIds": 1 }).toArray();
  let colgados = 0;
  for (const e of estados) {
    const muertos = ((e as any).data?.contratoFrameIds || []).map(String).filter((id: string) => !idsFrame.has(id));
    if (muertos.length > 0) {
      console.log(`Estado «${(e as any).name}»: quedan ${muertos.length} referencias colgadas`);
      colgados += muertos.length;
    }
  }
  console.log(colgados === 0 ? "Estados: sin referencias colgadas ✓" : `Estados: ${colgados} referencias colgadas`);

  await mongoose.disconnect();
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
