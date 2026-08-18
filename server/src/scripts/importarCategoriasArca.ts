import fs from "fs";
import mongoose from "mongoose";

/**
 * Carga las categorías de un Convenio Colectivo desde el export de tablas de ARCA
 * (`documentation/arca_tablas_simplificacion_registral.csv`, filas `CATEGORIA_CCT`).
 *
 * Por qué hace falta: el ABM heredado de FRAME solo sabía del SAT (0634/11), así que las categorías
 * de cualquier otro convenio no tenían dónde entrar. Lo que se hizo en su lugar fue inventar filas
 * —"Actor" y "Musico", con código `0` y sueldo `0`— que ARCA no reconoce y que bloquean el TXT.
 * Este script trae las categorías REALES: para los convenios de actores son
 *
 *   0322/75  002344 APUNTADOR · 002359 APUNTADOR DE REEMPLAZO · 032564 TIRA · 032879 UNITARIO
 *   0102/90  009483 COPROTAGONISTA A · 026505 PERSONAJE MENOR · 026507 PERSONAJE SECUNDARIO ·
 *            028155 PROTAGONISTA A
 *
 * Cómo arma los grupos:
 *  - Si ARCA embebe el grupo en la descripción ("DIRECTOR DE PROGRAMAS - GRUPO 1"), se usa ese número
 *    y el nombre queda sin el sufijo.
 *  - Si no lo embebe (los convenios de actores no lo hacen), se crea UN GRUPO POR CATEGORÍA, numerado
 *    1..N por código. No es un capricho: sin evidencia de agrupamiento, meterlas todas en un grupo
 *    les impondría una escala compartida que el convenio no dice que compartan, y una paritaria las
 *    movería a todas juntas. Un grupo por categoría deja cada escala editable por separado.
 *
 * La escala se crea en CERO y NO se inventa: el chequeo de completitud va a frenar los contratos que
 * usen estas categorías con "La categoría no tiene sueldo bruto cargado", que es la verdad. Cargar
 * los importes es un acto de paritaria, y se hace desde la pantalla de grupos.
 *
 * Es idempotente: no duplica categorías ya cargadas ni pisa escalas existentes.
 *
 * Uso (desde server/):
 *   DRY_RUN=true CONVENIOS=0322/75,0102/90 \
 *     CSV=../documentation/arca_tablas_simplificacion_registral.csv \
 *     ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/importarCategoriasArca.ts
 */

const DRY_RUN = process.env.DRY_RUN === "true";
const CSV_PATH = process.env.CSV || "../documentation/arca_tablas_simplificacion_registral.csv";
const CONVENIOS = String(process.env.CONVENIOS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Las descripciones traen comas y comillas dobladas: no alcanza con un `split(",")`. */
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
 * Separa el grupo salarial que ARCA embebe en la descripción. Hay DOS formas, y reconocer una sola
 * no es un detalle cosmético: la categoría que no cae en ninguna se lleva un grupo propio, así que
 * un convenio con 219 categorías genera 219 escalas para cargar a mano en vez de 3.
 *
 *   sufijo   0634/11  "DIRECTOR DE PROGRAMAS - GRUPO 1"   → grupo 1, sin nombre
 *   prefijo  0131/75  "1ª CATEGORIA - ASISTENTE DE DIRECCION" → grupo 1, llamado "1ª CATEGORIA"
 *
 * El ordinal se matchea por code point (`ª` ª / `º` º / `°` °) y no con el carácter
 * literal: escrito a mano, cualquier reguardado del archivo con otro encoding lo rompe en silencio y
 * el script vuelve a la rama de "un grupo por categoría" sin decir nada.
 */
const partirDescripcion = (descripcion: string): { nombre: string; grupo: number | null; nombreGrupo: string } => {
  const sufijo = descripcion.match(/^(.*?)\s*-\s*GRUPO\s+(\d+)\s*$/i);
  if (sufijo) return { nombre: sufijo[1].trim(), grupo: Number(sufijo[2]), nombreGrupo: "" };

  const prefijo = descripcion.match(/^((\d+)\s*[ªº°]?\s*CATEGORIA)\s*-\s*(.+)$/i);
  if (prefijo) return { nombre: prefijo[3].trim(), grupo: Number(prefijo[2]), nombreGrupo: prefijo[1].trim() };

  return { nombre: descripcion.trim(), grupo: null, nombreGrupo: "" };
};

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
  if (!fs.existsSync(CSV_PATH)) throw new Error(`No existe el CSV: ${CSV_PATH}`);

  const filas = parseCsv(fs.readFileSync(CSV_PATH, "utf-8").replace(/^﻿/, ""));
  const enc = filas.shift();
  if (!enc) throw new Error("El CSV está vacío");
  const iTabla = enc.indexOf("tabla");
  const iPadded = enc.indexOf("codigo_padded");
  const iDesc = enc.indexOf("descripcion");
  const iPadre = enc.indexOf("filtro_padre");
  if ([iTabla, iPadded, iDesc, iPadre].some((i) => i < 0)) throw new Error("Al CSV le faltan columnas (tabla / codigo_padded / descripcion / filtro_padre)");

  // Categorías del CSV, agrupadas por convenio.
  const porConvenio = new Map<string, Array<{ codigo: string; descripcion: string }>>();
  for (const f of filas) {
    if (f[iTabla] !== "CATEGORIA_CCT") continue;
    const cct = String(f[iPadre] || "").trim();
    const codigo = String(f[iPadded] || "").trim();
    if (!cct || !/^\d{6}$/.test(codigo)) continue;
    if (!porConvenio.has(cct)) porConvenio.set(cct, []);
    porConvenio.get(cct)!.push({ codigo, descripcion: String(f[iDesc] || "").trim() });
  }

  const objetivo = CONVENIOS.length > 0 ? CONVENIOS : [...porConvenio.keys()];
  const desconocidos = objetivo.filter((c) => !porConvenio.has(c));
  if (desconocidos.length > 0) throw new Error(`El CSV no tiene categorías para: ${desconocidos.join(", ")}. Convenios disponibles: ${[...porConvenio.keys()].join(", ")}`);

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db;
  if (!db) throw new Error("No se pudo establecer la conexión");

  console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}`);
  console.log(`CSV: ${CSV_PATH}\nConvenios: ${objetivo.join(", ")}\n`);

  const enCatalogo = new Set((await db.collection("convenios").find({}).project({ externalId: 1 }).toArray()).map((c: any) => String(c.externalId).trim()));

  for (const cct of objetivo) {
    const items = porConvenio.get(cct)!.sort((a, b) => a.codigo.localeCompare(b.codigo));
    console.log(`── ${cct} · ${items.length} categoría(s) en ARCA ${enCatalogo.has(cct) ? "" : "⚠ (no está en el catálogo de Convenios)"}`);

    // Grupo de cada categoría: el que ARCA embebe en la descripción, o uno propio si no lo embebe.
    const sinGrupoPropio: Array<{ codigo: string; nombre: string }> = [];
    const asignaciones: Array<{ codigo: string; nombre: string; descripcion: string; grupo: number; nombreGrupo: string }> = [];
    for (const it of items) {
      const { nombre, grupo, nombreGrupo } = partirDescripcion(it.descripcion);
      if (grupo === null) sinGrupoPropio.push({ codigo: it.codigo, nombre });
      else asignaciones.push({ codigo: it.codigo, nombre, descripcion: it.descripcion, grupo, nombreGrupo });
    }

    // Dos nombres distintos reclamando el mismo número serían dos escalas fusionadas en silencio (un
    // "GRUPO 1" y una "1ª CATEGORIA" en el mismo CCT). No pasa en los datos de hoy; si algún día
    // pasa, es mejor que el script se plante a que las junte.
    const nombresPorNumero = new Map<number, Set<string>>();
    for (const a of asignaciones.filter((x) => x.nombreGrupo)) {
      if (!nombresPorNumero.has(a.grupo)) nombresPorNumero.set(a.grupo, new Set());
      nombresPorNumero.get(a.grupo)!.add(a.nombreGrupo);
    }
    for (const [numero, nombres] of nombresPorNumero) {
      if (nombres.size > 1) throw new Error(`${cct}: el grupo ${numero} aparece con dos nombres distintos (${[...nombres].join(" / ")}). Revisá el CSV antes de importar.`);
    }
    // Numeración de los grupos inventados: arranca después del último que ARCA sí nombró, para no
    // pisar un "GRUPO 3" real con un grupo sintético que casualmente cayó tercero.
    let siguiente = asignaciones.reduce((max, a) => Math.max(max, a.grupo), 0) + 1;
    for (const s of sinGrupoPropio) {
      asignaciones.push({ codigo: s.codigo, nombre: s.nombre, descripcion: s.nombre, grupo: siguiente, nombreGrupo: s.nombre });
      siguiente++;
    }

    // ── Grupos
    const gruposExistentes = new Map<number, any>(((await db.collection("convenio-grupos").find({ convenio: cct }).toArray()) as any[]).map((g) => [Number(g.numero), g]));
    const numerosNecesarios = [...new Set(asignaciones.map((a) => a.grupo))].sort((a, b) => a - b);

    for (const numero of numerosNecesarios) {
      if (gruposExistentes.has(numero)) continue;
      const nombreGrupo = asignaciones.find((a) => a.grupo === numero)?.nombreGrupo || "";
      const doc = {
        _id: new mongoose.Types.ObjectId(),
        convenio: cct,
        numero,
        nombre: nombreGrupo,
        // Escala en cero, a propósito: los importes son un dato de paritaria, no del nomenclador.
        sueldoBasico: 0,
        sueldoAdicional: 0,
        presentismo: 0,
        sueldoBruto: 0,
        sueldoBrutoLetras: "",
        neto: 0,
        sueldoNetoLetras: "",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (!DRY_RUN) await db.collection("convenio-grupos").insertOne(doc as any);
      gruposExistentes.set(numero, doc);
      console.log(`   + grupo ${numero}${nombreGrupo ? ` "${nombreGrupo}"` : ""} (escala en 0, cargar desde la pantalla de grupos)`);
    }

    // ── Categorías
    const yaCargadas = new Set(((await db.collection("categorias").find({ convenio: cct }).project({ codigoArca: 1 }).toArray()) as any[]).map((c) => String(c.codigoArca)));
    let creadas = 0;
    for (const a of asignaciones.sort((x, y) => x.grupo - y.grupo || x.codigo.localeCompare(y.codigo))) {
      if (yaCargadas.has(a.codigo)) continue;
      // Se marca ACÁ y no solo al leer la base: el propio export de ARCA repite filas textualmente
      // (0131/75 trae dos veces "2ª CATEGORIA - OPERADOR TECNICO DE PLANTA TRANSMISORA", código
      // 000401), y sin esto la primera corrida crea las dos. El código es la identidad de la
      // categoría dentro del convenio; dos filas con el mismo código son la misma categoría.
      yaCargadas.add(a.codigo);
      const grupo = gruposExistentes.get(a.grupo);
      if (!DRY_RUN) {
        await db.collection("categorias").insertOne({
          convenio: cct,
          grupoId: grupo._id,
          codigoArca: a.codigo,
          nombre: a.nombre,
          descripcionArca: a.descripcion,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
      }
      creadas++;
      console.log(`   + ${a.codigo}  ${a.nombre}  → grupo ${a.grupo}`);
    }
    const salteadas = asignaciones.length - creadas;
    console.log(`   ${creadas} categoría(s) ${DRY_RUN ? "se crearían" : "creadas"}${salteadas > 0 ? `, ${salteadas} ya estaban` : ""}\n`);
  }

  console.log(`${DRY_RUN ? "DRY RUN terminado: no se escribió nada." : "Listo."}\n`);
  await mongoose.disconnect();
}

run().catch(async (e) => {
  console.error("\nFALLÓ:", e.message, "\n");
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
