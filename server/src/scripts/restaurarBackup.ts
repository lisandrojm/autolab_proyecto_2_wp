/**
 * ═══════════════════════════════════════════════════════════════════════
 * VOLVER LA BASE A UNA COPIA DE DROPBOX
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/restaurarBackup.ts weprodu_2026_09_20_08-40            # dice qué haría
 *   npx tsx src/scripts/restaurarBackup.ts weprodu_2026_09_20_08-40 --aplicar  # lo hace
 *
 * ESTO BORRA TODO LO QUE PASÓ DESPUÉS DE ESA COPIA. No es un "merge": cada colección queda
 * exactamente como estaba, y lo que se cargó después desaparece. Partes, ediciones, altas: todo.
 *
 * ── Cómo lo hace, y por qué así ──
 *
 * · ANTES DE TOCAR NADA copia la base actual a otra base del cluster. Es la única forma de poder
 *   arrepentirse: la copia de Dropbox permite volver a ayer, pero no volver a hoy.
 *
 * · Vacía cada colección con `deleteMany` en vez de borrarla con `drop`. Un `drop` se lleva puestos
 *   los ÍNDICES, y los que no están declarados en un modelo de Mongoose no vuelven solos: la base
 *   quedaría igual de completa y mucho más lenta, que es de los problemas que peor se diagnostican.
 *
 * · Las colecciones que existen HOY y no están en la copia SÍ se borran enteras: son las que se
 *   crearon después, y dejarlas sería no volver al estado pedido.
 *
 * · Lee EJSON, no JSON: es lo que hace que un `ObjectId` vuelva a ser un `ObjectId` y una fecha una
 *   fecha. Con JSON pelado las referencias entre colecciones se restauran como texto, que es lo
 *   mismo que no tener backup.
 */
import mongoose from "mongoose";
import { EJSON } from "bson";
import "../config/env.js";
import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent } from "../services/dropboxService.js";
import { CARPETA_BACKUPS } from "../services/backupService.js";

/** De a cuántos se insertan los documentos. Lotes grandes hacen timeout contra Atlas. */
const LOTE = 500;

interface EntradaDelManifiesto {
  nombre: string;
  documentos: number;
  bytes: number;
}

async function main() {
  const copia = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  const sinRespaldo = process.argv.includes("--sin-respaldo");

  if (!copia) {
    console.error('Falta la copia. Uso: npx tsx src/scripts/restaurarBackup.ts "weprodu_2026_09_20_08-40" [--aplicar]');
    process.exit(1);
  }

  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const cliente = mongoose.connection.getClient();
  const base = mongoose.connection.db!;
  console.log(`Base: ${base.databaseName}${aplicar ? "" : "   (simulación: no se escribe nada)"}\n`);

  /* ── De qué tenant es el Dropbox donde vive la copia ── */
  const tenants: any[] = await Tenant.find({}).lean();
  const conDropbox = tenants.map((t) => ({ t, cfg: getTenantDropboxConfig(t) })).find((x) => x.cfg);
  if (!conDropbox?.cfg) {
    console.error("Ningún tenant tiene Dropbox configurado: no hay de dónde leer la copia.");
    await mongoose.disconnect();
    process.exit(1);
  }
  const tenantId = String(conDropbox.t._id);
  const cfg = conDropbox.cfg;

  /* ── El manifiesto: qué trae la copia ── */
  const carpeta = `${CARPETA_BACKUPS}/${copia}`;
  const manifiesto = JSON.parse((await downloadFileContent(tenantId, cfg, `${carpeta}/_backup.json`)).toString("utf8"));
  const colecciones: EntradaDelManifiesto[] = manifiesto.colecciones || [];

  console.log(`Copia: ${copia}`);
  console.log(`   tomada el ${manifiesto.fecha}`);
  console.log(`   base de origen: ${manifiesto.base}`);
  console.log(`   ${colecciones.length} colecciones, ${manifiesto.documentos} documentos\n`);

  if (manifiesto.base !== base.databaseName) {
    console.error(`La copia es de "${manifiesto.base}" y estás conectado a "${base.databaseName}". No se toca nada.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  /* ── Qué cambia: documento por documento, colección por colección ── */
  const actuales = await base.listCollections().toArray();
  const nombresActuales = new Set(actuales.map((c) => c.name));
  const enLaCopia = new Set(colecciones.map((c) => c.nombre));
  const sobran = [...nombresActuales].filter((n) => !enLaCopia.has(n));

  console.log("COLECCIÓN                                    HOY      EN LA COPIA    DIFERENCIA");
  let totalHoy = 0;
  for (const c of colecciones) {
    const hoy = nombresActuales.has(c.nombre) ? await base.collection(c.nombre).countDocuments() : 0;
    totalHoy += hoy;
    const dif = hoy - c.documentos;
    if (dif !== 0) console.log(`   ${c.nombre.padEnd(40)} ${String(hoy).padStart(6)}   ${String(c.documentos).padStart(11)}   ${dif > 0 ? "+" : ""}${dif}`);
  }
  console.log(`\nDocumentos hoy: ${totalHoy}   ·   en la copia: ${manifiesto.documentos}`);

  if (sobran.length) {
    console.log(`\nColecciones que hoy existen y la copia NO tiene — se BORRAN enteras:`);
    for (const n of sobran) console.log(`   ${n.padEnd(40)} ${await base.collection(n).countDocuments()} documentos`);
  }

  if (!aplicar) {
    console.log("\nNada se escribió. Con --aplicar se restaura.");
    await mongoose.disconnect();
    return;
  }

  /* ── 1. La red de seguridad: la base de hoy, copiada ── */
  if (!sinRespaldo) {
    /*
      EL NOMBRE TIENE QUE SER CORTO: Mongo acepta 38 bytes y "weprodu_production_integration" ya usa
      30. Un nombre descriptivo hace fallar el insert con "Database name is too long", y el mensaje
      llega recién al escribir, no al abrir la base.
    */
    const sello = new Date().toISOString().slice(2, 16).replace(/[:T-]/g, "");
    const destino = `wp_prev_${sello}`;
    console.log(`\nCopiando el estado ACTUAL a "${destino}" antes de tocar nada…`);
    const respaldo = cliente.db(destino);

    for (const c of actuales) {
      const docs = await base.collection(c.name).find({}).toArray();
      if (docs.length === 0) continue;
      for (let i = 0; i < docs.length; i += LOTE) await respaldo.collection(c.name).insertMany(docs.slice(i, i + LOTE));
    }
    console.log(`   Listo. Para volver a hoy: restaurar desde esa base.`);
  }

  /* ── 2. Colección por colección ── */
  console.log("\nRestaurando:");
  let restaurados = 0;
  for (const c of colecciones) {
    const contenido = (await downloadFileContent(tenantId, cfg, `${carpeta}/${c.nombre}.json`)).toString("utf8");
    const lineas = contenido.split("\n").filter((l) => l.trim().length > 0);
    // `relaxed: false` conserva los tipos: sin eso un ObjectId vuelve como string.
    const docs = lineas.map((l) => EJSON.parse(l, { relaxed: false }) as any);

    await base.collection(c.nombre).deleteMany({});
    for (let i = 0; i < docs.length; i += LOTE) {
      await base.collection(c.nombre).insertMany(docs.slice(i, i + LOTE), { ordered: false });
    }

    restaurados += docs.length;
    console.log(`   ${c.nombre.padEnd(40)} ${String(docs.length).padStart(6)} documentos`);
  }

  /* ── 3. Lo que sobra ── */
  for (const n of sobran) {
    await base.collection(n).drop();
    console.log(`   BORRADA  ${n}`);
  }

  console.log(`\nListo: ${restaurados} documentos restaurados en ${colecciones.length} colecciones.`);
  console.log("Reiniciá el server: los modelos vuelven a crear sus índices al arrancar.");
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
