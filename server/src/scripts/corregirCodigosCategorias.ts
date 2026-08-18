import fs from "fs";
import mongoose from "mongoose";

/**
 * Corrige el CÓDIGO de ARCA de las categorías que quedaron apuntando a otra categoría.
 *
 * El problema, medido: de las 107 categorías con convenio, 44 tienen un `codigoArca` cuyo significado
 * en el nomenclador de ARCA es OTRO. No es aleatorio — son bloques corridos un lugar (035286-035292,
 * 035312-035319, 035340-035359), con tramos intactos en el medio. 1.329 contratos de 6.549 usan una
 * de esas categorías, así que el TXT viene declarando la categoría equivocada desde siempre, y ARCA
 * la acepta sin chistar.
 *
 * QUÉ SE CORRIGE Y POR QUÉ ASÍ:
 *
 * Se re-apunta el CÓDIGO, no el nombre. El nombre es lo que el operador eligió y lo que describe a la
 * persona —alguien cargó "Peinador" porque es peinador—; el código es la traducción a ARCA, y es la
 * que está mal. Renombrar la categoría para que coincida con su código haría lo contrario: dejaría a
 * 415 peinadores convertidos en "REFLECTORISTA" sin que nadie lo note, que es el mismo error de
 * significado pero ahora también en la pantalla.
 *
 * El GRUPO se mueve con el código. En 0634/11 la escala vive en el grupo, y ARCA lo trae embebido en
 * la descripción ("PEINADOR - GRUPO 6"). Si una categoría cambia de código a uno de otro grupo, tiene
 * que pasar a ese grupo o quedaría cobrando la escala de otra categoría. El grupo destino se crea si
 * no existe, con la escala en CERO: inventarle un sueldo sería peor que dejar el faltante a la vista.
 *
 * NO toca los contratos ya presentados en ARCA. Esto arregla lo que se va a mandar de acá en adelante;
 * las altas ya registradas con el código viejo hay que corregirlas en el organismo, y el script las
 * lista para saber cuáles son.
 *
 * Uso (desde server/):
 *   DRY_RUN=true ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/corregirCodigosCategorias.ts
 */

const DRY_RUN = process.env.DRY_RUN === "true";
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

/** El grupo va embebido en la descripción de ARCA: "PEINADOR - GRUPO 6". */
const partirDescripcion = (desc: string): { nombre: string; grupo: number | null } => {
  const m = /^(.*?)\s*-\s*GRUPO\s*(\d+)\s*$/i.exec(desc || "");
  return m ? { nombre: m[1].trim(), grupo: Number(m[2]) } : { nombre: (desc || "").trim(), grupo: null };
};

/**
 * Equivalencias declaradas a mano, nombre local → descripción de ARCA.
 *
 * Son las únicas tres que la comparación por nombre no resuelve sola. Van explícitas y no como una
 * comparación más laxa (por prefijo, o por distancia de edición) a propósito: aflojar el criterio
 * emparejaría también categorías que apenas se parecen —"Asistente de Cámara" con "Asistente de
 * Cámara Especializado / Grip"— y este script cambia el código que viaja a ARCA. Tres líneas
 * auditables son mejores que una heurística que nadie puede verificar.
 */
const ALIAS: Record<string, string> = {
  // Typo local: le falta la "r". Es la que bloqueaba la permutación entera, porque su código
  // (035292) es el que le corresponde a "Camarógrafo Realizador".
  "TECNICO DE MANTENIMIENTO ELECTONICO": "TECNICO DE MANTENIMIENTO ELECTRONICO",
  // Aclaración agregada localmente; ARCA dice solo "CADETE". El código ya es el correcto.
  "CADETE MAYOR DE 18 ANOS": "CADETE",
  // Rename deliberado del proyecto: "SIN CATEGORIAS" no se entiende, "Excluido de convenio" sí.
  // El código 999999 ya es el correcto — se declara para que no aparezca como faltante.
  "EXCLUIDO DE CONVENIO": "SIN CATEGORIAS",
};

/** Compara por significado: sin acentos, sin puntuación, sin diferencias de espaciado ni de caja. */
const norm = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[.,/()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function run() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");

  const filas = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const [cabRaw, ...datos] = filas;
  // El CSV viene con BOM: sin sacarlo, `indexOf("tabla")` da -1 y el filtro descarta TODO en silencio
  // — el mismo bug que hacía que la auditoría diera un ✓ falso.
  const cab = cabRaw.map((h) => h.replace(String.fromCharCode(65279), "").trim());
  const iTabla = cab.indexOf("tabla");
  const iCodigo = cab.indexOf("codigo_padded");
  const iDesc = cab.indexOf("descripcion");
  const iPadre = cab.indexOf("filtro_padre");
  if (iTabla < 0 || iCodigo < 0 || iDesc < 0 || iPadre < 0) throw new Error("El CSV no tiene las columnas esperadas");

  /** convenio → [{ codigo, nombre, grupo }] del nomenclador oficial. */
  const arcaPorConvenio = new Map<string, Array<{ codigo: string; nombre: string; grupo: number | null }>>();
  for (const f of datos) {
    if (f[iTabla] !== "CATEGORIA_CCT") continue;
    const { nombre, grupo } = partirDescripcion(f[iDesc]);
    const lista = arcaPorConvenio.get(f[iPadre]) || [];
    lista.push({ codigo: f[iCodigo], nombre, grupo });
    arcaPorConvenio.set(f[iPadre], lista);
  }

  await mongoose.connect(uri, { dbName });
  const db = mongoose.connection.db!;
  console.log(`Conectado a ${dbName}${DRY_RUN ? "  [DRY RUN]" : ""}\n`);

  const cats = await db.collection("categorias").find({}).toArray();
  const grupos = await db.collection("convenio-grupos").find({}).toArray();

  // Contratos por categoría, para poder decir a cuántos alcanza cada cambio.
  const usos = new Map<number, number>();
  const ups = await db.collection("users_&_projects").find({}).project({ "contracts.categoria_sat_id": 1 }).toArray();
  for (const up of ups) for (const c of ((up as any).contracts || [])) if (c?.categoria_sat_id != null) usos.set(c.categoria_sat_id, (usos.get(c.categoria_sat_id) || 0) + 1);

  const grupoPorId = new Map((grupos as any[]).map((g) => [String(g._id), g]));
  const grupoPorNumero = new Map((grupos as any[]).map((g) => [`${g.convenio}|${g.numero}`, g]));

  type Cambio = { _id: any; nombre: string; convenio: string; de: string; a: string; grupoDe: number | null; grupoA: number | null; contratos: number };
  const cambios: Cambio[] = [];
  const sinMatch: Array<{ nombre: string; convenio: string; codigo: string; contratos: number }> = [];
  let yaCorrectas = 0;

  for (const cat of cats as any[]) {
    if (!cat.convenio || !cat.codigoArca) continue;
    const oficiales = arcaPorConvenio.get(cat.convenio) || [];
    const contratos = usos.get(cat.legacyId) || 0;

    // ¿Qué código le da ARCA a ESTE nombre?
    const buscado = ALIAS[norm(cat.nombre)] || norm(cat.nombre);
    const porNombre = oficiales.filter((o) => norm(o.nombre) === buscado);
    if (porNombre.length === 0) {
      sinMatch.push({ nombre: cat.nombre, convenio: cat.convenio, codigo: cat.codigoArca, contratos });
      continue;
    }
    if (porNombre.length > 1) {
      // Dos categorías con el mismo nombre en el mismo convenio: no se puede elegir sin criterio.
      sinMatch.push({ nombre: `${cat.nombre} (ambiguo: ${porNombre.map((o) => o.codigo).join(", ")})`, convenio: cat.convenio, codigo: cat.codigoArca, contratos });
      continue;
    }

    const correcto = porNombre[0];
    const grupoActual = grupoPorId.get(String(cat.grupoId));
    if (correcto.codigo === cat.codigoArca && (correcto.grupo == null || correcto.grupo === grupoActual?.numero)) {
      yaCorrectas++;
      continue;
    }
    cambios.push({
      _id: cat._id,
      nombre: cat.nombre,
      convenio: cat.convenio,
      de: cat.codigoArca,
      a: correcto.codigo,
      grupoDe: grupoActual?.numero ?? null,
      grupoA: correcto.grupo,
      contratos,
    });
  }

  // Un código no puede quedar en dos categorías del mismo convenio: sería ambiguo para el TXT.
  const destino = new Map<string, string[]>();
  for (const c of cambios) {
    const k = `${c.convenio}|${c.a}`;
    destino.set(k, [...(destino.get(k) || []), c.nombre]);
  }
  const intactas = (cats as any[]).filter((c) => c.convenio && c.codigoArca && !cambios.some((x) => String(x._id) === String(c._id)));
  const colisiones = [...destino.entries()].filter(([k, nombres]) => nombres.length > 1 || intactas.some((c) => `${c.convenio}|${c.codigoArca}` === k));

  console.log(`Categorías ya correctas : ${yaCorrectas}`);
  console.log(`A corregir              : ${cambios.length}  (${cambios.reduce((a, c) => a + c.contratos, 0)} contratos)`);
  console.log(`Sin equivalente en ARCA : ${sinMatch.length}`);
  console.log(`Colisiones de código    : ${colisiones.length}\n`);

  if (sinMatch.length > 0) {
    console.log("── Sin equivalente exacto en ARCA (se dejan como están) ──");
    for (const s of sinMatch) console.log(`   ${s.convenio}  ${s.codigo}  "${s.nombre}"  (${s.contratos} contratos)`);
    console.log("");
  }

  if (colisiones.length > 0) {
    // Casi siempre significa que la categoría que HOY ocupa ese código también está corrida, pero no
    // se pudo emparejar por nombre (un typo alcanza) y quedó en `sinMatch`. Se corta entero: aplicar
    // media permutación deja dos categorías apuntando al mismo código, que es peor que el estado actual.
    console.log("── COLISIONES: dos categorías quedarían con el mismo código. No se aplica nada. ──");
    for (const [k, nombres] of colisiones) {
      const ocupante = intactas.find((c) => `${c.convenio}|${c.codigoArca}` === k);
      console.log(`   ${k} ← ${nombres.join(" + ")}${ocupante ? `   (hoy lo ocupa "${ocupante.nombre}")` : ""}`);
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  cambios.sort((a, b) => b.contratos - a.contratos);
  console.log("── Cambios ──");
  for (const c of cambios) {
    const g = c.grupoDe !== c.grupoA ? `  · grupo ${c.grupoDe ?? "?"} → ${c.grupoA ?? "?"}` : "";
    console.log(`   ${c.nombre}  (${c.contratos} contratos)`);
    console.log(`      ${c.convenio}  ${c.de} → ${c.a}${g}`);
  }

  if (sinMatch.length > 0) {
    console.log("\n── Sin equivalente exacto en ARCA (se dejan como están, hay que mirarlas a mano) ──");
    for (const s of sinMatch) console.log(`   ${s.convenio}  ${s.codigo}  ${s.nombre}  (${s.contratos} contratos)`);
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN] No se escribió nada.`);
    await mongoose.disconnect();
    return;
  }

  // Respaldo del estado anterior ANTES de tocar nada. Es un cambio de 41 códigos que alcanza a 1.279
  // contratos: si algo sale mal, sin esto no hay forma de reconstruir a qué apuntaba cada categoría.
  const backup = cambios.map((c) => ({ _id: String(c._id), nombre: c.nombre, convenio: c.convenio, codigoArcaAnterior: c.de, codigoArcaNuevo: c.a }));
  const rutaBackup = `backup-codigos-categorias-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.json`;
  fs.writeFileSync(rutaBackup, JSON.stringify(backup, null, 2), "utf8");
  console.log(`\nRespaldo del estado anterior: ${rutaBackup}`);

  let aplicados = 0;
  for (const c of cambios) {
    const set: Record<string, unknown> = { codigoArca: c.a };
    if (c.grupoA != null && c.grupoA !== c.grupoDe) {
      let grupo = grupoPorNumero.get(`${c.convenio}|${c.grupoA}`);
      if (!grupo) {
        // Grupo nuevo con la escala en CERO: el chequeo de completitud va a frenar esos contratos con
        // "el grupo no tiene sueldo bruto", que es la verdad. Inventar un importe sería peor.
        const nuevo = { convenio: c.convenio, numero: c.grupoA, nombre: "", sueldoBasico: 0, sueldoAdicional: 0, presentismo: 0, sueldoBruto: 0, sueldoBrutoLetras: "", neto: 0, sueldoNetoLetras: "", createdAt: new Date(), updatedAt: new Date() };
        const r = await db.collection("convenio-grupos").insertOne(nuevo as any);
        grupo = { ...nuevo, _id: r.insertedId };
        grupoPorNumero.set(`${c.convenio}|${c.grupoA}`, grupo);
        console.log(`   + grupo ${c.grupoA} de ${c.convenio} creado (escala en cero)`);
      }
      set.grupoId = grupo._id;
    }
    await db.collection("categorias").updateOne({ _id: c._id }, { $set: set });
    aplicados++;
  }

  console.log(`\n${aplicados} categoría(s) corregida(s).`);
  console.log(`OJO: las altas YA presentadas en ARCA siguen con el código viejo. Hay que corregirlas en el organismo.`);
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
