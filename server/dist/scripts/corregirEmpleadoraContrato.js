/**
 * CORREGIR LA EMPLEADORA DE UN CONTRATO (18/11/2026), por su `contratoKey`, sin pasar por el wizard
 * (que reemplaza el contrato entero). Cambia SÓLO `empresaContratoId` y su nombre copiado
 * `nombre_empresa_contrato`; la empleadora del release y todo lo demás quedan como están.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/corregirEmpleadoraContrato.ts \
 *       --clave <contratoKey> --de <companyId actual | ninguna> --a <companyId nuevo> --motivo "..."      # dry-run
 *   ... --commit
 *   ... --revertir migraciones-respaldo/empleadora-contrato-<fecha>.json
 *   En el VPS: NODE_ENV=production node dist/scripts/corregirEmpleadoraContrato.js ...
 *
 * REGLA (18/11/2026, decisión del usuario): NINGÚN SCRIPT DEDUCE UNA EMPLEADORA. La empleadora sale de ARCA
 * (misma persona y fecha de alta EXACTA, una sola empleadora en esa fecha) o de una persona que la sabe.
 * Nunca «por defecto» (asignarEmpresaPorDefecto puso 2030 a 495 contratos y hubo que revertirlo) ni de un
 * texto libre (unificarTiposDeContrato sacó FZERO del nombre de FRAME: el caso Pereda). Este script sólo
 * escribe la que se le indica, y el motivo tiene que decir de dónde salió.
 *
 * Se niega si: el contrato no existe o está anulado; la empleadora actual no es `--de` (alguien la cambió
 * en el medio); el contrato ya tiene un alta presentada en ARCA (cambiar la empleadora de un alta
 * presentada no es corregir un dato: es otra relación laboral); falta el motivo.
 * La escritura filtra por la clave Y por la empleadora vieja. El respaldo guarda antes, después, motivo y
 * autor; `--revertir` vuelve sólo si sigue como la dejó.
 */
import mongoose, { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { escribirContratosAuditado } from "../services/auditoriaContratos.js";
import { contextoDeScript } from "../utils/contextoAuditoria.js";
const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const db = () => mongoose.connection.db;
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    if (arg("--revertir"))
        return revertir(arg("--revertir"));
    const commit = process.argv.includes("--commit");
    const [clave, de, a, motivo] = [arg("--clave"), arg("--de"), arg("--a"), (arg("--motivo") || "").trim()];
    const sinEmpleadora = de === "ninguna";
    if (![clave, a].every((x) => x && Types.ObjectId.isValid(x)) || !(sinEmpleadora || (de && Types.ObjectId.isValid(de))))
        throw new Error("Faltan --clave, --de (ObjectId o «ninguna») o --a (ObjectId).");
    if (!motivo)
        throw new Error("Falta --motivo.");
    // Auditoría de contratos (etapa 3): el cambio queda a nombre del script, con el motivo.
    contextoDeScript(path.basename(process.argv[1] || "", path.extname(process.argv[1] || "")), { motivo, ...(arg("--por") ? { por: { userId: arg("--por") } } : {}) });
    console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");
    const k = new Types.ObjectId(clave);
    const up = await db().collection("users_&_projects").findOne({ "contracts.contratoKey": k });
    if (!up)
        throw new Error(`No hay ningún contrato con la clave ${clave}.`);
    const idx = up.contracts.findIndex((c) => String(c?.contratoKey) === clave);
    const c = up.contracts[idx];
    const [u, desde, hacia] = await Promise.all([
        db().collection("users").findOne({ _id: up.userId }, { projection: { firstName: 1, lastName: 1 } }),
        sinEmpleadora ? Promise.resolve({ razonSocial: "(ninguna)", cuit: "" }) : db().collection("companies").findOne({ _id: new Types.ObjectId(de) }),
        db().collection("companies").findOne({ _id: new Types.ObjectId(a) }),
    ]);
    console.log(`${u?.firstName} ${u?.lastName} · vínculo ${up._id} · contrato #${idx} (${clave})`);
    console.log(`  ${c.nombre_contrato} · alta ${String(c.fecha_alta_contrato).slice(0, 10)} · baja ${c.fecha_baja_contrato ? String(c.fecha_baja_contrato).slice(0, 10) : "—"}`);
    console.log(`  empleadora del contrato: ${c.nombre_empresa_contrato} (${c.empresaContratoId}) · del release: ${c.nombre_empresa_release || "—"} (${c.empresaReleaseId || "—"}, no se toca)`);
    if (c.estadoContrato === "ANULADO")
        throw new Error("Ese contrato está anulado.");
    if (!desde || !hacia)
        throw new Error("No encuentro alguna de las dos empresas.");
    if (sinEmpleadora ? !!c.empresaContratoId : String(c.empresaContratoId) !== de)
        throw new Error(`La empleadora actual es ${c.empresaContratoId || "ninguna"}, no ${de}: no se toca.`);
    const r = c.altaArcaPresentada?.resultado;
    if (r && r !== "fallida")
        throw new Error(`El contrato tiene el alta de ARCA en «${r}»: cambiar su empleadora no es corregir un dato.`);
    console.log(`  → empleadora: ${desde.razonSocial} (${desde.cuit}) ⇒ ${hacia.razonSocial} (${hacia.cuit})`);
    console.log(`  Motivo: ${motivo}`);
    if (!commit)
        return;
    const respaldo = { coleccion: "users_&_projects", userProjectId: String(up._id), contratoKey: clave, posicion: idx, antes: { empresaContratoId: c.empresaContratoId, nombre_empresa_contrato: c.nombre_empresa_contrato }, despues: { empresaContratoId: a, nombre_empresa_contrato: hacia.razonSocial }, motivo, por: arg("--por") || "script corregirEmpleadoraContrato", el: new Date().toISOString() };
    fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
    const archivo = path.join(CARPETA_RESPALDOS, `empleadora-contrato-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 1));
    // El tipo se respeta: si estaba guardado como texto, sigue como texto.
    // Sin empleadora previa: como texto, que es como la guardan los demás contratos de estos vínculos.
    const nuevoId = sinEmpleadora || typeof c.empresaContratoId === "string" ? a : new Types.ObjectId(a);
    const res = await escribirContratosAuditado(db().collection("users_&_projects"), { _id: up._id }, { $set: { "contracts.$[c].empresaContratoId": nuevoId, "contracts.$[c].nombre_empresa_contrato": hacia.razonSocial } }, { arrayFilters: [{ "c.contratoKey": k, "c.empresaContratoId": sinEmpleadora ? { $in: [null, ""] } : c.empresaContratoId }] });
    console.log(res.modifiedCount === 1 ? `  ✔ Corregido. Respaldo: ${archivo}` : "  = No se modificó (cambió entre la lectura y la escritura).");
}
async function revertir(archivo) {
    const r = JSON.parse(fs.readFileSync(archivo, "utf8"));
    const k = new Types.ObjectId(r.contratoKey);
    const res = await escribirContratosAuditado(db().collection("users_&_projects"), { _id: new Types.ObjectId(r.userProjectId) }, { $set: { "contracts.$[c].empresaContratoId": r.antes.empresaContratoId, "contracts.$[c].nombre_empresa_contrato": r.antes.nombre_empresa_contrato } }, { arrayFilters: [{ "c.contratoKey": k, "c.nombre_empresa_contrato": r.despues.nombre_empresa_contrato }] });
    console.log(res.modifiedCount === 1 ? "Revertido." : "No se revirtió: el contrato ya no está como lo dejó la corrección.");
}
main()
    .catch((e) => { console.error(`✖ ${e?.message || e}`); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
