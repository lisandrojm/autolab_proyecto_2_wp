import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { PublicacionParitaria } from "../models/PublicacionParitaria.js";
import { guardarPdf } from "../services/archivoParitariaService.js";

/**
 * Rebaja el PDF de las publicaciones que se detectaron antes de que se guardaran los archivos.
 *
 * Las 33 primeras publicaciones nacieron cuando el sistema bajaba el PDF solo para hashearlo y lo
 * descartaba. Sin esto, la historia arranca vacía: el sistema tendría archivo de lo que salga de acá
 * en adelante y nada de lo que ya avisó.
 *
 * EL HASH SE VERIFICA, Y ESE ES EL PUNTO
 *
 * Si lo que se baja hoy no hashea igual que lo que se bajó entonces, NO es el mismo documento: el
 * gremio lo repuso o lo corrigió. Guardarlo bajo el hash viejo sería archivar un papel afirmando que
 * es otro — justo lo contrario de para qué existe el archivo. En ese caso se anota el motivo y se
 * sigue: es un hallazgo, no una falla del script.
 *
 * Es idempotente: las que ya tienen archivo se saltean. Se puede correr las veces que haga falta.
 *
 * Uso (desde server/):
 *   npm run paritarias-pdf:dry
 *   npm run paritarias-pdf
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const USER_AGENT = "WeProdu/1.0 (vigilancia de paritarias; contacto: lisandrojm@gmail.com)";
const TIMEOUT_MS = 30000;

/** Entre descarga y descarga, para no golpear el sitio del gremio con 33 pedidos seguidos. */
const PAUSA_MS = 500;

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe ni baja)" : "ESCRITURA"}\n`);

  const pendientes = await PublicacionParitaria.find({ "archivo.ruta": { $exists: false } }).sort({ detectadaEl: 1 });
  const conArchivo = await PublicacionParitaria.countDocuments({ "archivo.ruta": { $exists: true } });
  console.log(`publicaciones sin archivo: ${pendientes.length}   |   ya con archivo: ${conArchivo}\n`);

  let guardadas = 0;
  const problemas: string[] = [];

  for (const p of pendientes) {
    const etiqueta = `${p.textoEnlace?.slice(0, 45) || p.url.split("/").pop()}`;
    if (DRY_RUN) {
      console.log(`·  ${etiqueta}`);
      console.log(`     ${p.url}`);
      continue;
    }

    let bytes: Buffer;
    let contentType: string | null = null;
    try {
      const res = await fetch(p.url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`respondió ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
      contentType = res.headers.get("content-type");
    } catch (e: any) {
      const motivo = `No se pudo rebajar: ${e?.message || e}`;
      console.log(`⛔ ${etiqueta}\n     ${motivo}`);
      problemas.push(`${etiqueta}: ${motivo}`);
      p.archivoError = motivo;
      await p.save();
      continue;
    }

    const hash = createHash("sha256").update(bytes).digest("hex");
    if (hash !== p.hash) {
      /*
        EL HALLAZGO, no el error: el PDF cambió desde que lo vimos.

        Es literalmente el riesgo que esta entrega viene a cubrir, ocurriendo. No se guarda bajo el
        hash viejo ni se actualiza el hash: lo primero archivaría un documento distinto con la
        etiqueta del original, y lo segundo borraría la prueba de que cambió.
      */
      const motivo = `El PDF que hay hoy en esa URL NO es el que se detectó: hash ${hash.slice(0, 12)}… contra ${p.hash.slice(0, 12)}…. El gremio lo repuso o lo corrigió, y el original ya no se puede recuperar.`;
      console.log(`⚠  ${etiqueta}\n     ${motivo}`);
      problemas.push(`${etiqueta}: el PDF cambió en el origen`);
      p.archivoError = motivo;
      await p.save();
      continue;
    }

    p.archivo = await guardarPdf(String(p.fuente), hash, bytes, p.url, contentType);
    p.archivoError = "";
    await p.save();
    guardadas++;
    console.log(`✔  ${etiqueta}\n     ${(bytes.length / 1024).toFixed(0)} KB → ${p.archivo.ruta}`);
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  console.log(`\n${DRY_RUN ? "Se intentarían rebajar" : "Se guardaron"} ${DRY_RUN ? pendientes.length : guardadas} archivo(s).`);
  if (problemas.length > 0) {
    console.log(`\n${problemas.length} sin archivo, con el motivo anotado en la publicación:`);
    for (const p of problemas) console.log(`   ${p}`);
  }
  console.log();
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
