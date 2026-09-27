/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL ÍNDICE ÚNICO DE `renovaciones_contrato` PASA A LLEVAR LA POSICIÓN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/indiceRenovaciones.ts            # dice qué haría
 *   npx tsx src/scripts/indiceRenovaciones.ts --aplicar  # lo hace
 *
 * (con NODE_ENV=production para ir contra la base de producción)
 *
 * ── Por qué ──
 *
 * Una decisión sobre un contrato por vencer se guardaba con la clave (tenant, asignación, fecha de
 * baja), dando por sentado que dentro de una asignación dos contratos no terminan el mismo día. En la
 * base hay 515 pares (asignación, fecha de baja) con más de un contrato, así que la clave no
 * identificaba a uno: decidir sobre el primero guardaba un registro que sacaba de la lista a los dos.
 *
 * La identidad ahora incluye `indiceContrato` —la posición en `UserProject.contracts`, que es como el
 * resto del sistema nombra un contrato—. Este script cambia el índice único para que la acompañe.
 *
 * ── Por qué a mano y no solo ──
 *
 * Mongoose crea los índices que faltan al arrancar, pero NO borra los que sobran. Mientras el viejo
 * siga puesto, guardar la decisión del segundo contrato choca con él y falla con duplicate key: la
 * pantalla diría que no se pudo guardar, sin decir por qué.
 */
import mongoose from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";

const VIEJO = "tenantId_1_userProjectId_1_fechaBajaContrato_1";
const NUEVO = { tenantId: 1, userProjectId: 1, fechaBajaContrato: 1, indiceContrato: 1 } as const;

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const col = mongoose.connection.db!.collection("renovaciones_contrato");
  console.log(`Base: ${mongoose.connection.db!.databaseName}${aplicar ? "" : "   (simulación: no se escribe nada)"}\n`);

  const documentos = await col.countDocuments();
  const indices = await col.indexes();
  console.log(`renovaciones_contrato: ${documentos} documentos`);
  for (const i of indices) console.log(`   ${i.name}${i.unique ? "  (unique)" : ""}`);

  const tieneViejo = indices.some((i) => i.name === VIEJO);
  const sinIndice = documentos > 0 ? await col.countDocuments({ indiceContrato: { $exists: false } }) : 0;

  console.log(`\nQué hay que hacer:`);
  console.log(`   ${sinIndice > 0 ? `poner indiceContrato: 0 en ${sinIndice} documentos` : "ningún documento sin indiceContrato"}`);
  console.log(`   ${tieneViejo ? `borrar el índice viejo "${VIEJO}"` : "el índice viejo ya no está"}`);
  console.log(`   crear/confirmar el índice único con indiceContrato`);

  if (!aplicar) {
    console.log("\nNada se escribió. Con --aplicar se hace.");
    await mongoose.disconnect();
    return;
  }

  /*
    Primero el campo y DESPUÉS el índice: crear un índice único sobre un campo que a algunos
    documentos les falta los agrupa a todos bajo el mismo valor (ausente) y el índice no se puede
    crear. Con la colección vacía no cambia nada, pero el orden tiene que ser este igual.
  */
  if (sinIndice > 0) {
    const r = await col.updateMany({ indiceContrato: { $exists: false } }, { $set: { indiceContrato: 0 } });
    console.log(`\nindiceContrato: 0 en ${r.modifiedCount} documentos`);
  }

  if (tieneViejo) {
    await col.dropIndex(VIEJO);
    console.log(`Borrado el índice "${VIEJO}"`);
  }

  await col.createIndex(NUEVO, { unique: true });
  console.log(`Listo. Índices ahora:`);
  for (const i of await col.indexes()) console.log(`   ${i.name}${i.unique ? "  (unique)" : ""}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
