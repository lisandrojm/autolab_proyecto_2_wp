import fs from "fs";
import mongoose from "mongoose";

/**
 * Mueve las registraciones que quedaron en `companies.sedes[]` al catálogo de Sucursales de ARCA.
 *
 * Contexto: en una primera iteración el código de sucursal y las actividades se cargaban dentro de
 * cada empresa, colgados de una Sede. Estaba mal: la Sucursal es una entidad propia del padrón de
 * ARCA y no tiene nada que ver con la Sede (que es el lugar de trabajo con el que opera el sistema).
 * Ahora las sucursales viven en su propia colección y las empresas solo las referencian.
 *
 * Qué hace: por cada entrada de `companies.sedes[]` crea (o reusa, por código) una sucursal en
 * `arca-sucursales` y la agrega a `companies.sucursalIds`.
 *
 * El domicilio sale del CSV del padrón si se le pasa CSV=... (filas SUCURSAL_DOMICILIO, que traen el
 * domicilio completo como lo declara ARCA). Sin CSV cae al nombre de la Sede, que es corto
 * ("Tronador" en vez de "TRONADOR 671") y hay que corregir después a mano.
 *
 * NO borra `companies.sedes[]`: queda como respaldo hasta que verifiques la migración. Para
 * limpiarlo después, correr con LIMPIAR=true.
 *
 * Uso (desde server/):
 *   DRY_RUN=true CSV=../documentation/arca_tablas_simplificacion_registral.csv \
 *     ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/migrarSedesEmpresaASucursales.ts
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const LIMPIAR = process.env.LIMPIAR === "true";
const CSV_PATH = process.env.CSV || "";

/** Igual que en los otros scripts: las descripciones traen comas y comillas dobladas. */
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

/**
 * Domicilios del padrón por código de sucursal. ARCA los declara en una sola línea con esta forma:
 *   "ZAPIOLA 392 Cod. Postal 1426, CIUDAD AUTONOMA BUENOS AIRES"
 * Se parte en domicilio / CP / localidad; si no matchea, va entero al domicilio.
 */
function leerDomicilios(ruta: string): Map<string, { domicilio: string; codigoPostal: string; localidad: string }> {
  const filas = parseCsv(fs.readFileSync(ruta, "utf-8").replace(/^﻿/, ""));
  const enc = filas.shift();
  if (!enc) throw new Error("El CSV está vacío");
  const iTabla = enc.indexOf("tabla");
  const iPadded = enc.indexOf("codigo_padded");
  const iDesc = enc.indexOf("descripcion");
  if (iTabla < 0 || iPadded < 0 || iDesc < 0) throw new Error("Al CSV le faltan columnas (tabla / codigo_padded / descripcion)");

  const out = new Map<string, { domicilio: string; codigoPostal: string; localidad: string }>();
  for (const f of filas) {
    if (f[iTabla] !== "SUCURSAL_DOMICILIO") continue;
    const codigo = String(f[iPadded] || "").trim();
    const texto = String(f[iDesc] || "").trim();
    if (!codigo || !texto) continue;
    const m = /^(.*?)\s*Cod\.?\s*Postal\s*(\d+)\s*,\s*(.*)$/i.exec(texto);
    out.set(codigo, m ? { domicilio: m[1].trim(), codigoPostal: m[2].trim(), localidad: m[3].trim() } : { domicilio: texto, codigoPostal: "", localidad: "" });
  }
  return out;
}

type SedeEmpresa = { sedeId: number; codigoSucursal: string; actividades: Array<{ codigo: string; descripcion?: string }> };

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  if (CSV_PATH && !fs.existsSync(CSV_PATH)) throw new Error(`No existe el CSV: ${CSV_PATH}`);
  const domicilios = CSV_PATH ? leerDomicilios(CSV_PATH) : new Map<string, { domicilio: string; codigoPostal: string; localidad: string }>();

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);

  const empresas = await db.collection("companies").find({ sedes: { $exists: true, $ne: [] } }).toArray();
  if (empresas.length === 0) {
    console.log("Ninguna empresa tiene registraciones en companies.sedes[]: no hay nada para migrar.\n");
    await mongoose.disconnect();
    return;
  }

  const sedes = await db.collection("infos").find({ type: "sede" }).toArray();
  const nombreSede = (id: number) => sedes.find((s) => Number(s.data?.id) === Number(id))?.name || `Sede ${id}`;

  // Índice por código: las sucursales son únicas por código, y dos empresas pueden haber registrado
  // la misma sede con el mismo código (mismo padrón) — en ese caso se reusa la sucursal.
  const existentes = await db.collection("arca-sucursales").find({}).toArray();
  const porCodigo = new Map<string, any>(existentes.map((s) => [String(s.codigo), s]));

  for (const empresa of empresas) {
    const registros: SedeEmpresa[] = Array.isArray(empresa.sedes) ? empresa.sedes : [];
    const sucursalIds: string[] = (empresa.sucursalIds || []).map((x: any) => String(x));
    console.log(`\n${empresa.razonSocial} [${empresa.cuit || "sin CUIT"}] — ${registros.length} registración(es):`);

    for (const reg of registros) {
      const codigo = String(reg.codigoSucursal || "").trim().padStart(5, "0");
      if (!codigo || codigo === "00000") {
        console.log(`  ⚠ sede ${reg.sedeId} sin código de sucursal, se saltea.`);
        continue;
      }

      let sucursal = porCodigo.get(codigo);
      if (!sucursal) {
        const delPadron = domicilios.get(codigo);
        const domicilio = delPadron?.domicilio || nombreSede(reg.sedeId);
        sucursal = {
          _id: new mongoose.Types.ObjectId(),
          codigo,
          domicilio,
          localidad: delPadron?.localidad || "",
          codigoPostal: delPadron?.codigoPostal || "",
          actividades: (reg.actividades || []).map((a) => ({ codigo: String(a.codigo).padStart(6, "0"), descripcion: a.descripcion || "" })),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        console.log(`  - ${codigo}: se crea la sucursal "${domicilio}"${delPadron ? " (del padrón)" : " (del nombre de la sede — REVISAR contra el padrón)"} con ${sucursal.actividades.length} actividad(es).`);
        if (!DRY_RUN) await db.collection("arca-sucursales").insertOne(sucursal);
        porCodigo.set(codigo, sucursal);
      } else {
        console.log(`  - ${codigo}: ya existe la sucursal "${sucursal.domicilio}", se reusa.`);
      }

      if (!sucursalIds.includes(String(sucursal._id))) sucursalIds.push(String(sucursal._id));
    }

    console.log(`  → queda con ${sucursalIds.length} sucursal(es) asignada(s).`);
    if (!DRY_RUN) {
      const update: Record<string, unknown> = { $set: { sucursalIds: sucursalIds.map((id) => new mongoose.Types.ObjectId(id)) } };
      if (LIMPIAR) update.$unset = { sedes: "" };
      await db.collection("companies").updateOne({ _id: empresa._id }, update);
    }
  }

  if (!DRY_RUN && !LIMPIAR) {
    console.log("\ncompanies.sedes[] se dejó como está (correr con LIMPIAR=true para borrarlo una vez verificado).");
  }

  await mongoose.disconnect();
  console.log(`\n${DRY_RUN ? "DRY RUN terminado: no se escribió nada." : "Listo."}\n`);
}

run().catch(async (err) => {
  console.error("Error:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
