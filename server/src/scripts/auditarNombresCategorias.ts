import fs from "fs";
import mongoose from "mongoose";

/**
 * SOLO LECTURA. Compara, para cada categoría cargada en WeProdu, el NOMBRE local contra la
 * descripción que ARCA da para ese mismo (convenio, código).
 *
 * La auditoría ya verificaba que el par (convenio, código) exista en ARCA. Esto es otra cosa: que el
 * código signifique lo mismo de los dos lados. Si 035358 acá se llama "Utilero" y en ARCA es
 * "Asistente de Cámara", el TXT viene declarando una categoría distinta de la que el operador ve.
 */
const CSV_PATH = process.env.CSV || "../documentation/arca_tablas_simplificacion_registral.csv";

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
    } else if (c === '"') enComillas = true;
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
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
}

/**
 * Nombres que difieren a propósito, y no son un código corrido.
 *
 * Existe para que la auditoría no grite por diferencias de redacción: si reporta ruido, la próxima
 * vez que reporte algo real nadie le va a creer. El mismo mapa vive en
 * `corregirCodigosCategorias.ts`, que es el que decide a qué código apunta cada nombre.
 */
const ALIAS: Record<string, string> = {
  // Aclaración agregada localmente; ARCA dice solo "CADETE".
  "CADETE MAYOR DE 18 ANOS": "CADETE",
  // Rename deliberado: "SIN CATEGORIAS" no se entiende, "Excluido de convenio" sí.
  "EXCLUIDO DE CONVENIO": "SIN CATEGORIAS",
};

/** Compara ignorando mayúsculas, acentos, paréntesis y espacios de más: interesa el significado. */
const norm = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    // ARCA embebe el grupo en la descripción ("… - GRUPO 7") y WeProdu lo guarda aparte: no es una
    // diferencia de significado. También se ignora la puntuación, que difiere por estilo.
    .replace(/\s*-\s*GRUPO\s*\d+\s*$/, "")
    .replace(/[.,/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");

  const filas = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const [cabRaw, ...datos] = filas;
  // El CSV viene con BOM: sin sacarlo, `indexOf("tabla")` da -1 y el filtro descarta TODO en silencio.
  const cab = cabRaw.map((h) => h.replace(String.fromCharCode(65279), "").trim());
  const iTabla = cab.indexOf("tabla");
  const iCodigo = cab.indexOf("codigo_padded");
  const iDesc = cab.indexOf("descripcion");
  const iPadre = cab.indexOf("filtro_padre");

  /** (convenio|codigo) → descripción oficial de ARCA. */
  const arca = new Map<string, string>();
  for (const f of datos) {
    if (f[iTabla] !== "CATEGORIA_CCT") continue;
    arca.set(`${f[iPadre]}|${f[iCodigo]}`, f[iDesc]);
  }

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db!;
  const cats = await db.collection("categorias").find({}).project({ convenio: 1, codigoArca: 1, nombre: 1, legacyId: 1 }).toArray();

  // Cuántos contratos usa cada categoría (por el id viejo, que es con lo que apuntan).
  const usos = new Map<number, number>();
  const ups = await db.collection("users_&_projects").find({}).project({ "contracts.categoria_sat_id": 1 }).toArray();
  for (const up of ups) for (const c of ((up as any).contracts || [])) if (c?.categoria_sat_id != null) usos.set(c.categoria_sat_id, (usos.get(c.categoria_sat_id) || 0) + 1);

  const distintas: Array<{ convenio: string; codigo: string; local: string; oficial: string; contratos: number }> = [];
  let iguales = 0;
  let sinPar = 0;

  for (const cat of cats as any[]) {
    if (!cat.convenio || !cat.codigoArca) continue;
    const oficial = arca.get(`${cat.convenio}|${cat.codigoArca}`);
    if (!oficial) {
      sinPar++;
      continue;
    }
    const buscado = ALIAS[norm(cat.nombre)] || norm(cat.nombre);
    if (norm(oficial) === buscado) iguales++;
    else distintas.push({ convenio: cat.convenio, codigo: cat.codigoArca, local: cat.nombre, oficial, contratos: usos.get(cat.legacyId) || 0 });
  }

  console.log(`\nCategorías comparables: ${iguales + distintas.length}  (sin par en ARCA: ${sinPar})`);
  console.log(`  coinciden : ${iguales}`);
  console.log(`  DIFIEREN  : ${distintas.length}\n`);

  const contratosAfectados = distintas.reduce((a, d) => a + d.contratos, 0);
  const totalContratos = [...usos.values()].reduce((a, b) => a + b, 0);
  console.log(`  CONTRATOS con una categoría corrida: ${contratosAfectados} de ${totalContratos}
`);
  distintas.sort((a, b) => b.contratos - a.contratos || a.codigo.localeCompare(b.codigo));
  for (const d of distintas) {
    console.log(`  ${d.convenio}  ${d.codigo}   ${d.contratos} contrato(s)`);
    console.log(`      WeProdu : ${d.local}`);
    console.log(`      ARCA    : ${d.oficial}`);
  }

  // Los tres que menciona el relevamiento, estén o no en la lista de arriba.
  console.log(`\n── Los tres del relevamiento ──`);
  for (const codigo of ["035358", "035340", "035346"]) {
    const local = (cats as any[]).find((c) => c.codigoArca === codigo && c.convenio === "0634/11");
    console.log(`  ${codigo}  ARCA: ${arca.get(`0634/11|${codigo}`) || "(no está)"}`);
    console.log(`          WeProdu: ${local ? `${local.nombre}  (${usos.get(local.legacyId) || 0} contratos)` : "(no cargada)"}`);
  }

  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
