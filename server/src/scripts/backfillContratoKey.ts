/**
 * BACKFILL DE `contratoKey` (etapa 2, 18/11/2026): una clave para cada contrato que no la tiene.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/backfillContratoKey.ts             # dry-run (por defecto): cuenta, no escribe
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/backfillContratoKey.ts --commit    # escribe
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/backfillContratoKey.ts --revertir migraciones-respaldo/contrato-key-<fecha>.json
 *
 * ANTES DE CORRER CON --commit, el código con el campo `contratoKey` tiene que estar deployado y
 * corriendo en el VPS. El código viejo no conoce el campo: lo conserva en los contratos que no toca,
 * pero lo PIERDE en cuanto reemplaza un contrato entero (editar desde el wizard), y ese contrato volvería
 * a quedar sin clave.
 *
 * LA HUELLA. Cada clave se escribe con un filtro que exige que en esa posición siga estando el MISMO
 * contrato que se leyó: misma `fecha_alta_contrato`, misma `fecha_carga`, mismo `nombre_contrato` y
 * todavía sin clave. Si entre la
 * lectura y la escritura alguien borró un contrato (las posiciones se corren) o lo editó, el filtro no
 * coincide y no se escribe nada en el equivocado: queda para la próxima corrida. NO sacar la huella por
 * rendimiento: es lo que hace seguro correr esto con la plataforma andando.
 *
 * Idempotente: sólo toca contratos sin clave; correrlo dos veces no cambia nada la segunda.
 * Respaldo: antes de escribir deja en `migraciones-respaldo/` cada (vínculo, posición, huella, clave);
 * `--revertir` borra exactamente esas claves, filtrando por la clave (no por la posición).
 */
import mongoose, { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import UserProject from "../models/UserProject.js";

const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");
const LOTE = 500;

interface Asignacion {
  userProjectId: string;
  indice: number;
  alta: unknown;
  carga: unknown;
  nombre: unknown;
  contratoKey: string;
}

/** La huella como la guarda la base (Date o texto), para filtrar por igualdad. `null` también encuentra el campo ausente. */
const valorDeHuella = (v: unknown) => (v === undefined || v === "" ? null : v);
const huellaTexto = (v: unknown) => (v instanceof Date ? v.toISOString() : v === null || v === undefined ? "∅" : String(v));

async function main() {
  const commit = process.argv.includes("--commit");
  const iRevertir = process.argv.indexOf("--revertir");
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  if (iRevertir >= 0) return revertir(process.argv[iRevertir + 1]);

  const t0 = Date.now();
  // Sólo lo necesario: la huella y si ya tiene clave (la base está lejos, ver memoria «Atlas dev lento por volumen»).
  const vinculos: any[] = await UserProject.find({}).select("contracts.contratoKey contracts.fecha_alta_contrato contracts.fecha_carga contracts.nombre_contrato").lean();
  let contratos = 0;
  let conClave = 0;
  const asignaciones: Asignacion[] = [];
  const huellasRepetidas: string[] = [];
  const sinHuella: string[] = [];
  const clavesVistas = new Map<string, string>();
  const clavesRepetidas: string[] = [];
  for (const v of vinculos) {
    const vistas = new Set<string>();
    (v.contracts || []).forEach((c: any, i: number) => {
      contratos++;
      if (c.contratoKey) {
        conClave++;
        const k = String(c.contratoKey);
        if (clavesVistas.has(k)) clavesRepetidas.push(`${k}: ${clavesVistas.get(k)} y ${v._id}#${i}`);
        else clavesVistas.set(k, `${v._id}#${i}`);
        return;
      }
      const alta = valorDeHuella(c.fecha_alta_contrato);
      const carga = valorDeHuella(c.fecha_carga);
      const nombre = valorDeHuella(c.nombre_contrato);
      const huella = `${huellaTexto(alta)}|${huellaTexto(carga)}|${huellaTexto(nombre)}`;
      if (alta === null && carga === null) sinHuella.push(`${v._id}#${i}`);
      if (vistas.has(huella)) huellasRepetidas.push(`${v._id}#${i} (${huella})`);
      vistas.add(huella);
      asignaciones.push({ userProjectId: String(v._id), indice: i, alta, carga, nombre, contratoKey: new Types.ObjectId().toHexString() });
    });
  }

  console.log(`Vínculos: ${vinculos.length} · contratos: ${contratos} · ya con clave: ${conClave} · a completar: ${asignaciones.length} (${Date.now() - t0} ms)`);
  console.log(`  Huella vacía (sin alta ni carga: la guarda sólo protege por «todavía sin clave»): ${sinHuella.length}${sinHuella.length ? ` → ${sinHuella.slice(0, 10).join(", ")}` : ""}`);
  console.log(`  Huella repetida dentro del mismo vínculo (dos contratos con igual alta, carga y nombre): ${huellasRepetidas.length}${huellasRepetidas.length ? ` → ${huellasRepetidas.slice(0, 10).join(", ")}` : ""}`);
  console.log(`  Claves repetidas entre contratos que ya tienen clave: ${clavesRepetidas.length}${clavesRepetidas.length ? ` → ${clavesRepetidas.slice(0, 10).join(" · ")}` : ""}`);
  if (!commit) {
    console.log("\nDry-run: no se escribió nada. Con --commit se escribe (con el código nuevo ya deployado).");
    return;
  }
  if (asignaciones.length === 0) {
    console.log("Nada que hacer.");
    return;
  }

  fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
  const fecha = new Date().toISOString();
  const archivo = path.join(CARPETA_RESPALDOS, `contrato-key-${fecha.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(archivo, JSON.stringify({ fecha, asignaciones }, null, 2));
  console.log(`Respaldo: ${archivo}`);

  let escritas = 0;
  let sinCoincidir = 0;
  for (let i = 0; i < asignaciones.length; i += LOTE) {
    const lote = asignaciones.slice(i, i + LOTE);
    const r = await UserProject.collection.bulkWrite(
      lote.map((a) => ({
        updateOne: {
          // LA HUELLA: el mismo contrato que se leyó, en la misma posición, todavía sin clave.
          filter: {
            _id: new Types.ObjectId(a.userProjectId),
            [`contracts.${a.indice}.contratoKey`]: { $exists: false },
            [`contracts.${a.indice}.fecha_alta_contrato`]: a.alta as any,
            [`contracts.${a.indice}.fecha_carga`]: a.carga as any,
            [`contracts.${a.indice}.nombre_contrato`]: a.nombre as any,
          },
          update: { $set: { [`contracts.${a.indice}.contratoKey`]: new Types.ObjectId(a.contratoKey) } },
        },
      })),
      { ordered: false },
    );
    escritas += r.modifiedCount;
    sinCoincidir += lote.length - r.matchedCount;
    console.log(`  ${Math.min(i + LOTE, asignaciones.length)}/${asignaciones.length}: ${r.modifiedCount} escritas`);
  }
  console.log(`\nEscritas: ${escritas}. Sin coincidir (el contrato cambió o se corrió entre la lectura y la escritura): ${sinCoincidir}. Esas quedan para la próxima corrida.`);
}

/** Borra las claves de un respaldo, filtrando por la CLAVE: si el contrato se movió, igual se encuentra. */
async function revertir(archivo: string | undefined) {
  if (!archivo || !fs.existsSync(archivo)) throw new Error("Falta el archivo de respaldo (--revertir <archivo>).");
  const { asignaciones } = JSON.parse(fs.readFileSync(archivo, "utf8")) as { asignaciones: Asignacion[] };
  let revertidas = 0;
  for (let i = 0; i < asignaciones.length; i += LOTE) {
    const lote = asignaciones.slice(i, i + LOTE);
    const r = await UserProject.collection.bulkWrite(
      lote.map((a) => ({
        updateOne: {
          filter: { _id: new Types.ObjectId(a.userProjectId), "contracts.contratoKey": new Types.ObjectId(a.contratoKey) },
          update: { $unset: { "contracts.$[c].contratoKey": "" } },
          arrayFilters: [{ "c.contratoKey": new Types.ObjectId(a.contratoKey) }],
        },
      })),
      { ordered: false },
    );
    revertidas += r.modifiedCount;
  }
  console.log(`Revertidas: ${revertidas} de ${asignaciones.length}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
