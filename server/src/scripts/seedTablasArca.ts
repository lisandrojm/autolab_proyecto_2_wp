import fs from "fs";
import mongoose from "mongoose";

/**
 * Siembra las tablas oficiales de ARCA (Simplificación Registral) desde el CSV extraído de la
 * pantalla de alta individual del organismo.
 *
 * Solo carga las TRES que necesita el formato de 130 caracteres (Carga Masiva):
 *   - MODALIDAD_CONTRATACION → pos. 17-19
 *   - TIPO_SERVICIO          → pos. 107-109
 *   - MODALIDAD_LIQUIDACION  → pos. 73
 *
 * Las demás tablas del CSV quedan afuera a propósito: puesto desempeñado y convenio colectivo van en
 * blanco en este layout, y la situación de revista directamente no existe como campo. Sirven para el
 * formato de 85 caracteres (el que se pega a mano, máximo 9 registros), que hoy no se usa.
 *
 * Es idempotente: hace upsert por (colección, código), así que se puede volver a correr cuando ARCA
 * actualice el nomenclador. NO borra los códigos que ya no estén en el CSV — si ARCA da de baja uno,
 * se avisa por consola y se decide a mano (puede haber contratos históricos que lo usen).
 *
 * Uso (desde server/):
 *   DRY_RUN=true CSV=../documentation/arca_tablas_simplificacion_registral.csv \
 *     ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/seedTablasArca.ts
 *
 *   (sin DRY_RUN=true escribe de verdad)
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const CSV_PATH = process.env.CSV || "";

/** Tabla del CSV → colección destino y largo del código en el TXT. */
const TABLAS = [
  { csv: "MODALIDAD_CONTRATACION", coleccion: "arca-modalidades-contratacion", largo: 3, etiqueta: "Modalidades de Contrato" },
  { csv: "TIPO_SERVICIO", coleccion: "arca-tipos-servicio", largo: 3, etiqueta: "Tipos de servicio" },
  { csv: "MODALIDAD_LIQUIDACION", coleccion: "arca-modalidades-liquidacion", largo: 1, etiqueta: "Modalidades de liquidación" },
];

/**
 * Parser de CSV con comillas: las descripciones de ARCA traen comas adentro (y alguna comilla
 * doblada), así que un `split(",")` parte mal las filas.
 */
function parseCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let campo = "";
  let fila: string[] = [];
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else enComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"') enComillas = true;
    else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }
  if (campo !== "" || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  if (!CSV_PATH) throw new Error("Falta CSV=/ruta/al/arca_tablas_simplificacion_registral.csv");
  if (!fs.existsSync(CSV_PATH)) throw new Error(`No existe el CSV: ${CSV_PATH}`);

  // El CSV puede venir con BOM (se exportó desde el navegador): sin sacarlo, el primer encabezado
  // queda como "﻿tabla" y no matchea nunca.
  const texto = fs.readFileSync(CSV_PATH, "utf-8").replace(/^﻿/, "");
  const filas = parseCsv(texto);
  const encabezado = filas.shift();
  if (!encabezado) throw new Error("El CSV está vacío");

  const col = (nombre: string) => {
    const i = encabezado.indexOf(nombre);
    if (i < 0) throw new Error(`Al CSV le falta la columna "${nombre}". Tiene: ${encabezado.join(", ")}`);
    return i;
  };
  const iTabla = col("tabla");
  const iPadded = col("codigo_padded");
  const iDesc = col("descripcion");

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   CSV: ${CSV_PATH}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  for (const tabla of TABLAS) {
    const propias = filas.filter((f) => f[iTabla] === tabla.csv);
    if (propias.length === 0) {
      console.log(`- ${tabla.etiqueta}: el CSV no trae filas de ${tabla.csv}, se saltea.`);
      continue;
    }

    // Dedup por código: si el CSV trajera el mismo dos veces, gana el primero y se avisa.
    const porCodigo = new Map<string, string>();
    for (const f of propias) {
      const codigo = String(f[iPadded] || "").trim();
      const desc = String(f[iDesc] || "").trim();
      if (!codigo || !desc) continue;
      if (codigo.length !== tabla.largo) {
        console.log(`  ⚠ ${tabla.etiqueta}: el código "${codigo}" no tiene ${tabla.largo} dígitos, se saltea.`);
        continue;
      }
      if (porCodigo.has(codigo)) {
        console.log(`  ⚠ ${tabla.etiqueta}: código ${codigo} repetido en el CSV, se queda el primero.`);
        continue;
      }
      porCodigo.set(codigo, desc);
    }

    const coleccion = db.collection(tabla.coleccion);
    const existentes = await coleccion.find({}).toArray();
    const existentesPorCodigo = new Map(existentes.map((d) => [String(d.externalId || ""), d]));

    // `data.id` numérico: lo usan los catálogos simples para vincularse. El código es numérico en las
    // tres tablas, así que alcanza con parsearlo (los ceros a la izquierda viven en `externalId`).
    let nuevos = 0;
    let actualizados = 0;
    let iguales = 0;

    for (const [codigo, desc] of porCodigo) {
      const previo = existentesPorCodigo.get(codigo);
      const doc = { externalId: codigo, name: desc, data: { id: Number(codigo), nombre: desc } };

      if (!previo) {
        nuevos++;
        if (!DRY_RUN) await coleccion.insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
      } else if (previo.name !== desc) {
        actualizados++;
        if (!DRY_RUN) await coleccion.updateOne({ _id: previo._id }, { $set: { ...doc, updatedAt: new Date() } });
      } else {
        iguales++;
      }
    }

    // Códigos que están en la base pero ya no en el CSV: pueden ser bajas de ARCA, pero también
    // contratos históricos que los usan. No se tocan; se avisa para decidir a mano.
    const sobrantes = existentes.filter((d) => !porCodigo.has(String(d.externalId || "")));
    console.log(`- ${tabla.etiqueta}: ${porCodigo.size} en el CSV → ${nuevos} nuevo(s), ${actualizados} actualizado(s), ${iguales} sin cambios.`);
    if (sobrantes.length > 0) {
      console.log(`  ⚠ ${sobrantes.length} código(s) en la base que el CSV ya no trae (NO se borran): ${sobrantes.map((d) => d.externalId).join(", ")}`);
    }
  }

  await mongoose.disconnect();
  console.log(`\n${DRY_RUN ? "DRY RUN terminado: no se escribió nada." : "Listo."}\n`);
}

run().catch(async (err) => {
  console.error("Error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
