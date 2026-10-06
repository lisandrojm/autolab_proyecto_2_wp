import mongoose from "mongoose";
import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { validarPatron, TipoNomenclatura, asegurarCodigo } from "../utils/nomenclatura.js";

/**
 * Deja GUARDADO `{{codigo}}` al final de todos los patrones del ABM de Nomenclatura de archivos.
 *
 * Ya rige sin esto: `asegurarCodigo` se lo agrega a cualquier patrón al leerlo, para generar y para
 * mostrar en el ABM. El script lo escribe en la base para que lo guardado diga lo mismo que lo que
 * rige, y nadie que lea la colección se pregunte de dónde sale el código.
 *
 * Uso (desde server/):
 *   npm run nomenclatura:codigo:dry   → muestra el antes/después, no escribe nada
 *   npm run nomenclatura:codigo       → aplica
 */

const DRY_RUN = process.env.DRY_RUN === "true";

async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  await mongoose.connect(uri, { dbName });
  console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Base: ${dbName}`);

  const filas = await NomenclaturaArchivo.find({}).lean();
  let cambiadas = 0;
  for (const f of filas) {
    const nuevo = asegurarCodigo(f.patron);
    if (nuevo === f.patron) {
      console.log(`= ${f.tipo} (tenant ${f.tenantId}): ya tiene {{codigo}}`);
      continue;
    }
    const errores = validarPatron(f.tipo as TipoNomenclatura, nuevo);
    if (errores.length > 0) {
      console.log(`✖ ${f.tipo} (tenant ${f.tenantId}): el patrón nuevo no valida, no se toca → ${errores.map((e) => e.motivo).join(" | ")}`);
      continue;
    }
    console.log(`~ ${f.tipo} (tenant ${f.tenantId})\n    antes:   ${f.patron}\n    después: ${nuevo}`);
    if (!DRY_RUN) await NomenclaturaArchivo.updateOne({ _id: f._id }, { $set: { patron: nuevo } });
    cambiadas++;
  }
  console.log(`\n${filas.length} patrones guardados · ${cambiadas} ${DRY_RUN ? "se cambiarían" : "cambiados"}.`);
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
