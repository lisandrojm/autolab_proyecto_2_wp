/**
 * DIAGNÓSTICO, SÓLO LECTURA: cómo resuelve el catálogo compat (`GET /categorias-sat`) el id de categoría
 * que guardó una solicitud, y qué trae esa entrada (grupo, convenio).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/diagCategoriaDeSolicitud.ts <categoriaSatId> [legacyId]
 */
import mongoose from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { listarCategoriasCompat } from "../utils/categoriaCompat.js";

const [buscado, legacy] = process.argv.slice(2);

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const lista: any[] = await listarCategoriasCompat();
  console.log(`catálogo compat: ${lista.length} entradas`);
  const resumen = (c: any) => JSON.stringify({ _id: String(c._id), externalId: c.externalId, name: c.name, isActive: c.isActive, data: { id: c.data?.id, numeroCategoria: c.data?.numeroCategoria, grupoId: c.data?.grupoId, grupoNombre: c.data?.grupoNombre, convenio: c.data?.convenio, codigoArca: c.data?.codigoArca } });
  const porId = lista.find((c) => String(c._id) === String(buscado));
  console.log(`por _id ${buscado}:`, porId ? resumen(porId) : "NO ESTÁ");
  if (legacy) {
    const porLegacy = lista.filter((c) => String(c.data?.id) === String(legacy));
    console.log(`por data.id ${legacy}: ${porLegacy.length}`);
    for (const c of porLegacy) console.log("  ", resumen(c));
  }
  console.log("muestra:", resumen(lista[0]));
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
