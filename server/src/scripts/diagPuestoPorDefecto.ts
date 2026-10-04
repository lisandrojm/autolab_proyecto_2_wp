/**
 * DIAGNÓSTICO, SÓLO LECTURA: qué puesto desempeñado le toca por defecto a un contrato con ese rol, esa
 * categoría y esa empleadora, y de qué escalón sale. Es lo mismo que muestra «Configurar Miembro».
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagPuestoPorDefecto.ts <rolFrameId> <categoriaSatId> <empresaId>
 *
 * Los tres son opcionales (pasar "-" para omitir uno). No escribe nada.
 */
import mongoose from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { puestoPorDefectoDe } from "../services/arca/puestosDesempenados.js";

const [rol, categoria, empresa] = process.argv.slice(2).map((a) => (a === "-" ? "" : a));

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const r = await puestoPorDefectoDe({ rolFrameId: rol, categoriaSatId: categoria, empresaId: empresa });
  console.log(`rol=${rol || "-"} categoría=${categoria || "-"} empresa=${empresa || "-"} → ${r.codigo || "(ninguno)"} ${r.descripcion} · origen: ${r.origen}`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
