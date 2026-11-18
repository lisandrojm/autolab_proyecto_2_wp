/**
 * CORREGIR LA FECHA DE ALTA DE UN CONTRATO A LA DE ARCA (18/11/2026), por su `contratoKey`, sin pasar por
 * el wizard. Cambia SÓLO `fecha_alta_contrato` (con el mismo formato que tenía).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/corregirFechaAltaContrato.ts \
 *       --clave <contratoKey> --de AAAA-MM-DD --a AAAA-MM-DD --motivo "..."      # dry-run
 *   ... --commit
 *   ... --revertir migraciones-respaldo/fecha-alta-contrato-<fecha>.json
 *   En el VPS: NODE_ENV=production node dist/scripts/corregirFechaAltaContrato.js ...
 *
 * SÓLO PARA ERRORES DE CARGA. Una fecha distinta de ARCA puede ser otra cosa: dos relaciones fusionadas
 * en un contrato (Jordan, Fernández: alinearla borra antigüedad) o días trabajados sin registrar
 * (Pellegrini: alinearla borra la evidencia). Esos NO se corrigen con esto.
 *
 * Se niega si:
 *  - el contrato no existe o está anulado;
 *  - la fecha de alta actual no es `--de` (algo cambió desde el análisis);
 *  - el contrato tiene un alta presentada (o en curso) en ARCA: se presentó con OTRA fecha;
 *  - ARCA no tiene una relación de esa persona con la empleadora del contrato que empiece EXACTO en `--a`
 *    (alinear a ARCA es eso: si ARCA no lo dice, no se alinea);
 *  - falta el motivo.
 * La escritura filtra por la clave Y por la fecha vieja. Respaldo con antes, después, motivo y la
 * relación de ARCA que lo respalda; `--revertir` vuelve sólo si sigue como la dejó.
 */
import mongoose, { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { fechaISO } from "../utils/contratoVigencia.js";

const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const db = () => mongoose.connection.db!;
const dig = (s: unknown) => String(s || "").replace(/\D/g, "");
const esFecha = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  if (arg("--revertir")) return revertir(arg("--revertir")!);
  const commit = process.argv.includes("--commit");
  const [clave, de, a, motivo] = [arg("--clave"), arg("--de"), arg("--a"), (arg("--motivo") || "").trim()];
  if (!clave || !Types.ObjectId.isValid(clave) || !esFecha(de) || !esFecha(a)) throw new Error("Faltan --clave (ObjectId), --de y --a (AAAA-MM-DD).");
  if (!motivo) throw new Error("Falta --motivo.");
  console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");

  const k = new Types.ObjectId(clave);
  const up: any = await db().collection("users_&_projects").findOne({ "contracts.contratoKey": k });
  if (!up) throw new Error(`No hay ningún contrato con la clave ${clave}.`);
  const idx = up.contracts.findIndex((c: any) => String(c?.contratoKey) === clave);
  const c = up.contracts[idx];
  const u: any = await db().collection("users").findOne({ _id: up.userId }, { projection: { firstName: 1, lastName: 1, "metadata.cuit": 1 } });
  const empresa: any = c.empresaContratoId ? await db().collection("companies").findOne({ _id: new Types.ObjectId(String(c.empresaContratoId)) }) : null;
  console.log(`${u?.firstName} ${u?.lastName} (${dig(u?.metadata?.cuit)}) · vínculo ${up._id} · contrato #${idx} (${clave})`);
  console.log(`  ${c.nombre_contrato} · alta ${fechaISO(c.fecha_alta_contrato)} · baja ${c.fecha_baja_contrato ? fechaISO(c.fecha_baja_contrato) : "—"} · ${c.nombre_empresa_contrato || "sin empleadora"} · estado ${c.nombre_estado_empleado}`);

  if (c.estadoContrato === "ANULADO") throw new Error("Ese contrato está anulado.");
  if (fechaISO(c.fecha_alta_contrato) !== de) throw new Error(`La fecha de alta actual es ${fechaISO(c.fecha_alta_contrato)}, no ${de}: no se toca.`);
  const r = c.altaArcaPresentada?.resultado;
  if (r && r !== "fallida") throw new Error(`El contrato tiene el alta de ARCA en «${r}» (presentada con ${de}): cambiarle la fecha no es corregir un dato.`);
  if (!empresa || dig(empresa.cuit).length !== 11) throw new Error("El contrato no tiene una empleadora con CUIT: primero la empleadora (desde ARCA).");
  const rel: any = await db().collection("relaciones_laborales_arca").findOne({ cuil: dig(u?.metadata?.cuit), empleadoraCuit: dig(empresa.cuit), fechaInicio: new Date(`${a}T00:00:00.000Z`) });
  if (!rel) throw new Error(`ARCA no tiene una relación de ${dig(u?.metadata?.cuit)} con ${empresa.razonSocial} que empiece el ${a}: no se alinea.`);
  const dia = (d: any) => (d instanceof Date ? d.toISOString().slice(0, 10) : fechaISO(d));
  console.log(`  ARCA: ${empresa.razonSocial} desde ${dia(rel.fechaInicio)} · ${rel.fechaFin ? `hasta ${dia(rel.fechaFin)}` : "abierta"} · ${rel.modalidadContrato || ""}`);
  console.log(`  → alta: ${de} ⇒ ${a}`);
  console.log(`  Motivo: ${motivo}`);
  if (!commit) return;

  // Mismo formato que tenía: texto «AAAA-MM-DD» o fecha.
  const nueva = c.fecha_alta_contrato instanceof Date ? new Date(`${a}T00:00:00.000Z`) : a;
  const respaldo = { coleccion: "users_&_projects", userProjectId: String(up._id), contratoKey: clave, posicion: idx, antes: { fecha_alta_contrato: c.fecha_alta_contrato }, despues: { fecha_alta_contrato: nueva }, arca: { empleadoraCuit: rel.empleadoraCuit, fechaInicio: rel.fechaInicio, fechaFin: rel.fechaFin, modalidad: rel.modalidadContrato }, motivo, por: arg("--por") || "script corregirFechaAltaContrato", el: new Date().toISOString() };
  fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
  const archivo = path.join(CARPETA_RESPALDOS, `fecha-alta-contrato-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 1));
  const res = await db().collection("users_&_projects").updateOne({ _id: up._id }, { $set: { "contracts.$[c].fecha_alta_contrato": nueva } }, { arrayFilters: [{ "c.contratoKey": k, "c.fecha_alta_contrato": c.fecha_alta_contrato }] });
  console.log(res.modifiedCount === 1 ? `  ✔ Corregido. Respaldo: ${archivo}` : "  = No se modificó (cambió entre la lectura y la escritura).");
}

async function revertir(archivo: string) {
  const r: any = JSON.parse(fs.readFileSync(archivo, "utf8"));
  const k = new Types.ObjectId(r.contratoKey);
  const fecha = (v: any) => (typeof v === "string" && /T/.test(v) ? new Date(v) : v);
  const res = await db().collection("users_&_projects").updateOne({ _id: new Types.ObjectId(r.userProjectId) }, { $set: { "contracts.$[c].fecha_alta_contrato": fecha(r.antes.fecha_alta_contrato) } }, { arrayFilters: [{ "c.contratoKey": k, "c.fecha_alta_contrato": fecha(r.despues.fecha_alta_contrato) }] });
  console.log(res.modifiedCount === 1 ? "Revertido." : "No se revirtió: el contrato ya no está como lo dejó la corrección.");
}

main()
  .catch((e) => { console.error(`✖ ${e?.message || e}`); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
