/**
 * BACKFILL DE LA CLAVE EN LAS REFERENCIAS (etapa 2c, 18/11/2026): a lo que nombra un contrato por su
 * posición en otra colección se le agrega la `contratoKey` del contrato que hoy está en esa posición,
 * SÓLO si la referencia es consistente con ese contrato.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/backfillClaveEnReferencias.ts   # dry-run (por defecto)
 *   ... --commit | --detalle | --revertir migraciones-respaldo/clave-en-referencias-<fecha>.json
 *   En el VPS: NODE_ENV=production node dist/scripts/backfillClaveEnReferencias.js [--commit]
 *
 * LAS 7: verificaciones de ARCA, constancias de ARCA, logs de corridas de altas (cada contrato del log),
 * decisiones de renovación, solicitudes de renovación (`User.metadata.renovacionDe`), recibos enviados y
 * recibos de cada lote.
 *
 * ANTES DE --commit: el código de la 2c deployado (lo que escriba el viejo mientras tanto queda sin clave
 * y lo toma la próxima corrida).
 *
 * LA HUELLA (`utils/referenciasCorridas.ts`). Antes de la 2b los borrados físicos corrían las posiciones:
 * una referencia vieja puede apuntar hoy al contrato de al lado. Copiarle la clave de esa posición la
 * ataría para siempre al contrato equivocado. Por eso:
 *  - CORRIDA (lo que guardó no coincide con el contrato de su posición) o FUERA (posición inexistente):
 *    NO recibe clave. La resuelve `reubicarReferencias.ts`, aparte, y recién ahí recibe la clave.
 *  - CONSISTENTE: recibe la clave. La columna «débil» cuenta las que coinciden con poca evidencia (p. ej.
 *    un log de una presentación rechazada: sólo la empleadora).
 *  - SIN HUELLA (los recibos no guardan nada del contrato): reciben la clave de su posición; no quedan
 *    peor que hoy. `--sin-huella-no` las deja afuera.
 *  - LÁPIDA: recibe la clave de la lápida (es el contrato que nombraba; el contenido está en
 *    `contratos_anulados`).
 * Cada escritura además exige que la referencia siga en la misma posición y sin clave.
 *
 * Idempotente. Respaldo en `migraciones-respaldo/`; `--revertir` borra exactamente esas claves.
 */
import mongoose, { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { clasificarReferencia } from "../utils/referenciasCorridas.js";
import { campoClave, campoVinculo, contratosDe, leerReferencias, RefPorPosicion, SIN_CLAVE } from "../services/referenciasPorPosicion.js";

const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");
interface Escritura extends RefPorPosicion { clave: Types.ObjectId }
const db = () => mongoose.connection.db!;

async function escribir(e: Escritura): Promise<boolean> {
  const col = db().collection(e.coleccion);
  if (e.arreglo) {
    const r = await col.updateOne({ _id: e._id }, { $set: { [`${e.arreglo}.$[e].contratoKey`]: e.clave } }, { arrayFilters: [{ "e.userProjectId": e.userProjectId, [`e.${e.campoIndice}`]: e.indice, "e.contratoKey": null }] });
    return r.modifiedCount > 0;
  }
  const r = await col.updateOne({ _id: e._id, [campoVinculo(e.coleccion)]: e.userProjectId, [e.campoIndice]: e.indice, [campoClave(e.coleccion)]: SIN_CLAVE }, { $set: { [campoClave(e.coleccion)]: e.clave } });
  return r.modifiedCount > 0;
}

async function main() {
  const commit = process.argv.includes("--commit");
  const detalle = process.argv.includes("--detalle");
  const sinHuellaNo = process.argv.includes("--sin-huella-no");
  const iRevertir = process.argv.indexOf("--revertir");
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  if (iRevertir >= 0) return revertir(process.argv[iRevertir + 1]);
  console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");

  const refs = await leerReferencias();
  const contratos = await contratosDe(refs.map((r) => r.userProjectId));

  type Fila = { consistente: number; debil: number; lapida: number; sinHuella: number; corrida: number; fuera: number; sinVinculo: number; contratoSinClave: number };
  const resumen = new Map<string, Fila>();
  const fila = (c: string) => resumen.get(c) ?? (resumen.set(c, { consistente: 0, debil: 0, lapida: 0, sinHuella: 0, corrida: 0, fuera: 0, sinVinculo: 0, contratoSinClave: 0 }), resumen.get(c)!);
  const aEscribir: Escritura[] = [];
  const noSeTocan: string[] = [];

  for (const r of refs) {
    const f = fila(r.coleccion);
    const lista = contratos.get(String(r.userProjectId));
    if (!lista) { f.sinVinculo++; noSeTocan.push(`${r.coleccion} ${r._id} · ${r.texto} · el vínculo ya no existe`); continue; }
    const k = clasificarReferencia(lista, r);
    if (k.tipo === "corrida" || k.tipo === "fuera") {
      f[k.tipo]++;
      const cand = k.candidatos?.length === 1 ? `candidato único #${k.candidatos[0]}` : k.candidatos?.length ? `${k.candidatos.length} candidatos (#${k.candidatos.join(", #")})` : "ningún candidato";
      noSeTocan.push(`${r.coleccion} ${r._id} · ${r.texto} · ${k.tipo === "corrida" ? `#${r.indice}: ` : ""}${k.motivo} → ${cand} [evidencia ${k.evidencia.join("+") || "ninguna"}, ${k.fuerza}]`);
      continue;
    }
    if (k.tipo === "sin_huella" && sinHuellaNo) { f.sinHuella++; continue; }
    const c = lista[Number(r.indice)];
    if (!c?.contratoKey) { f.contratoSinClave++; noSeTocan.push(`${r.coleccion} ${r._id} · ${r.texto} · el contrato #${r.indice} no tiene clave`); continue; }
    if (k.tipo === "lapida") f.lapida++;
    else if (k.tipo === "sin_huella") f.sinHuella++;
    else { f.consistente++; if (k.fuerza === "debil") f.debil++; }
    aEscribir.push({ ...r, clave: new Types.ObjectId(String(c.contratoKey)) });
  }

  console.log("Colección                  | RECIBEN CLAVE: consistente (débil) lápida sin-huella | NO: corrida fuera sin-vínculo contrato-sin-clave");
  for (const [c, f] of resumen) {
    const p = (n: number, w: number) => String(n).padStart(w);
    console.log(`${c.padEnd(26)} | ${p(f.consistente, 25)} ${p(f.debil, 8)} ${p(f.lapida, 6)} ${p(f.sinHuella, 10)} | ${p(f.corrida, 11)} ${p(f.fuera, 5)} ${p(f.sinVinculo, 11)} ${p(f.contratoSinClave, 18)}`);
  }
  console.log(`\nTotal: ${aEscribir.length} referencias reciben clave, ${noSeTocan.length} quedan sin tocar${sinHuellaNo ? " (más las sin huella, por --sin-huella-no)" : ""}.`);
  if (noSeTocan.length) {
    console.log(detalle ? "\nNO SE TOCAN:" : `\nNO SE TOCAN (primeras 30; --detalle para todas):`);
    for (const t of detalle ? noSeTocan : noSeTocan.slice(0, 30)) console.log(`  ${t}`);
  }
  if (!commit) return;

  fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
  const archivo = path.join(CARPETA_RESPALDOS, `clave-en-referencias-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(archivo, JSON.stringify(aEscribir.map((e) => ({ coleccion: e.coleccion, arreglo: e.arreglo, _id: String(e._id), userProjectId: String(e.userProjectId), indice: e.indice, campoIndice: e.campoIndice, clave: String(e.clave) })), null, 1));
  console.log(`\nRespaldo: ${archivo}`);
  let ok = 0, nada = 0;
  for (const e of aEscribir) (await escribir(e)) ? ok++ : nada++;
  console.log(`Escritas: ${ok}. Sin cambios (algo cambió entre la lectura y la escritura, o el mismo documento tenía la referencia repetida): ${nada}.`);
  console.log("Corré de nuevo sin --commit: lo escrito ya no tiene que aparecer.");
}

/** Borra las claves de un respaldo, filtrando por la CLAVE. */
async function revertir(archivo: string | undefined) {
  if (!archivo || !fs.existsSync(archivo)) throw new Error("Falta el archivo de respaldo (--revertir <archivo>).");
  const filas: any[] = JSON.parse(fs.readFileSync(archivo, "utf8"));
  let n = 0;
  for (const f of filas) {
    const col = db().collection(f.coleccion);
    const clave = new Types.ObjectId(f.clave);
    const r = f.arreglo
      ? await col.updateOne({ _id: new Types.ObjectId(f._id) }, { $set: { [`${f.arreglo}.$[e].contratoKey`]: null } }, { arrayFilters: [{ "e.contratoKey": clave }] })
      : await col.updateOne({ _id: new Types.ObjectId(f._id), [campoClave(f.coleccion)]: clave }, { $unset: { [campoClave(f.coleccion)]: "" } });
    n += r.modifiedCount;
  }
  console.log(`Revertidas: ${n} de ${filas.length}.`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
