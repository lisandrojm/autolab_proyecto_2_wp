/**
 * BACKFILL DE LA CLAVE EN LAS REFERENCIAS (etapa 2c, 18/11/2026): a lo que nombra un contrato por su
 * posición en otra colección se le agrega la `contratoKey` del contrato que hoy está en esa posición.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/backfillClaveEnReferencias.ts             # dry-run (por defecto)
 *   ... --commit                                                   # escribe
 *   ... --revertir migraciones-respaldo/clave-en-referencias-<fecha>.json
 *   ... --detalle                                                  # lista cada referencia que no se toca
 *   En el VPS: NODE_ENV=production node dist/scripts/backfillClaveEnReferencias.js [--commit]
 *
 * LAS 7: verificaciones de ARCA, constancias de ARCA, logs de corridas de altas (cada contrato del log),
 * decisiones de renovación, solicitudes de renovación (`User.metadata.renovacionDe`), recibos enviados y
 * recibos de cada lote.
 *
 * ANTES DE --commit: el código de la 2c deployado. El viejo no conoce el campo, pero tampoco lo pisa
 * (nunca reemplaza estos documentos enteros); lo que escriba mientras tanto queda sin clave y lo toma la
 * próxima corrida.
 *
 * LA HUELLA. Antes de la 2b los borrados físicos corrían las posiciones: una referencia vieja puede
 * apuntar hoy a OTRO contrato. Si la referencia guardó algo del contrato (alta, baja, empleadora), tiene
 * que coincidir con el que está en su posición; si no, NO se le pone clave y se lista para revisar a mano
 * (`huellaNoCoincide`). Los recibos no guardan nada comparable: se informan aparte («sin huella»).
 * Cada escritura además exige que la referencia siga en la misma posición y sin clave.
 *
 * Una referencia que apunta a una lápida (contrato anulado) recibe la clave de la lápida: es el contrato
 * que nombraba, y su contenido está en `contratos_anulados`.
 *
 * Idempotente: sólo toca referencias sin clave. Respaldo en `migraciones-respaldo/`; `--revertir` borra
 * exactamente esas claves, filtrando por la clave.
 */
import mongoose, { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { huellaNoCoincide } from "../utils/identidadContrato.js";
const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");
const LOTE_VINCULOS = 300;
const db = () => mongoose.connection.db;
const oid = (v) => (v && Types.ObjectId.isValid(String(v)) ? new Types.ObjectId(String(v)) : null);
const SIN_CLAVE = { $in: [null] }; // null o sin el campo
async function leerReferencias() {
    const refs = [];
    const top = async (coleccion, campoIndice, proy, huella, texto, sinHuella = false) => {
        const docs = await db().collection(coleccion).find({ contratoKey: SIN_CLAVE, userProjectId: { $ne: null } }).project({ userProjectId: 1, [campoIndice]: 1, ...proy }).toArray();
        for (const d of docs)
            refs.push({ coleccion, _id: d._id, userProjectId: d.userProjectId, indice: d[campoIndice] ?? null, campoIndice, huella: huella(d), sinHuella, texto: texto(d) });
    };
    await top("arca_verificaciones_altas", "contractIndex", { alta: 1, empresaId: 1, nombre: 1 }, (d) => ({ alta: d.alta, empresaId: d.empresaId }), (d) => `${d.nombre || ""} · alta ${d.alta || "?"}`);
    await top("constancias_arca", "contractIndex", { fechaAlta: 1, empresaId: 1, nombre: 1 }, (d) => ({ alta: d.fechaAlta, empresaId: d.empresaId }), (d) => `${d.nombre || ""} · alta ${d.fechaAlta || "?"}`);
    await top("renovaciones_contrato", "indiceContrato", { fechaBajaContrato: 1, decision: 1 }, (d) => ({ baja: d.fechaBajaContrato }), (d) => `${d.decision} · baja ${d.fechaBajaContrato}`);
    await top("recibos_sueldo_enviados", "contractIndex", { periodo: 1, nombreUsuario: 1 }, () => ({}), (d) => `${d.nombreUsuario || ""} · ${d.periodo || ""}`, true);
    // Solicitudes de renovación (en `users`).
    const sols = await db().collection("users").find({ "metadata.renovacionDe.userProjectId": { $ne: null }, "metadata.renovacionDe.contratoKey": SIN_CLAVE }).project({ "metadata.renovacionDe": 1, firstName: 1, lastName: 1 }).toArray();
    for (const d of sols) {
        const r = d.metadata.renovacionDe;
        const up = oid(r.userProjectId);
        if (!up)
            continue;
        refs.push({ coleccion: "users", _id: d._id, userProjectId: up, indice: r.indiceContrato ?? null, campoIndice: "metadata.renovacionDe.indiceContrato", huella: { baja: r.fechaBajaContrato }, texto: `solicitud ${d.firstName || ""} ${d.lastName || ""} · baja ${r.fechaBajaContrato}` });
    }
    // Los que viven en arrays.
    const logs = await db().collection("arca_altas_logs").find({ contratos: { $elemMatch: { userProjectId: { $ne: null }, contratoKey: SIN_CLAVE } } }).project({ empresaId: 1, "contratos.userProjectId": 1, "contratos.contractIndex": 1, "contratos.contratoKey": 1, "contratos.nombre": 1 }).toArray();
    for (const l of logs)
        for (const c of l.contratos || []) {
            if (!c?.userProjectId || c.contratoKey)
                continue;
            refs.push({ coleccion: "arca_altas_logs", arreglo: "contratos", _id: l._id, userProjectId: c.userProjectId, indice: c.contractIndex ?? null, campoIndice: "contractIndex", huella: { empresaId: l.empresaId }, texto: `log · ${c.nombre || ""}` });
        }
    const lotes = await db().collection("recibos_sueldo_lotes").find({ recibos: { $elemMatch: { userProjectId: { $ne: null }, contratoKey: SIN_CLAVE } } }).project({ periodo: 1, "recibos.userProjectId": 1, "recibos.contractIndex": 1, "recibos.contratoKey": 1, "recibos.nombreUsuario": 1 }).toArray();
    for (const l of lotes)
        for (const r of l.recibos || []) {
            if (!r?.userProjectId || r.contratoKey)
                continue;
            refs.push({ coleccion: "recibos_sueldo_lotes", arreglo: "recibos", _id: l._id, userProjectId: r.userProjectId, indice: r.contractIndex ?? null, campoIndice: "contractIndex", huella: {}, sinHuella: true, texto: `lote ${l.periodo || ""} · ${r.nombreUsuario || ""}` });
        }
    return refs;
}
async function contratosDe(ids) {
    const out = new Map();
    const unicos = [...new Set(ids.map(String))].map((s) => new Types.ObjectId(s));
    for (let i = 0; i < unicos.length; i += LOTE_VINCULOS) {
        const ups = await db().collection("users_&_projects").find({ _id: { $in: unicos.slice(i, i + LOTE_VINCULOS) } })
            .project({ "contracts.contratoKey": 1, "contracts.fecha_alta_contrato": 1, "contracts.fecha_baja_contrato": 1, "contracts.empresaContratoId": 1, "contracts.estadoContrato": 1 }).toArray();
        for (const u of ups)
            out.set(String(u._id), u.contracts || []);
    }
    return out;
}
async function escribir(e) {
    const col = db().collection(e.coleccion);
    if (e.arreglo) {
        const r = await col.updateOne({ _id: e._id }, { $set: { [`${e.arreglo}.$[e].contratoKey`]: e.clave } }, { arrayFilters: [{ "e.userProjectId": e.userProjectId, [`e.${e.campoIndice}`]: e.indice, "e.contratoKey": null }] });
        return r.modifiedCount > 0;
    }
    const campoClave = e.coleccion === "users" ? "metadata.renovacionDe.contratoKey" : "contratoKey";
    const campoUp = e.coleccion === "users" ? "metadata.renovacionDe.userProjectId" : "userProjectId";
    const r = await col.updateOne({ _id: e._id, [campoUp]: e.userProjectId, [e.campoIndice]: e.indice, [campoClave]: SIN_CLAVE }, { $set: { [campoClave]: e.clave } });
    return r.modifiedCount > 0;
}
async function main() {
    const commit = process.argv.includes("--commit");
    const detalle = process.argv.includes("--detalle");
    const iRevertir = process.argv.indexOf("--revertir");
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    if (iRevertir >= 0)
        return revertir(process.argv[iRevertir + 1]);
    console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");
    const refs = await leerReferencias();
    const contratos = await contratosDe(refs.map((r) => r.userProjectId));
    const resumen = new Map();
    const fila = (c) => resumen.get(c) ?? (resumen.set(c, { ponen: 0, lapida: 0, sinHuella: 0, noCoincide: 0, sinVinculo: 0, fuera: 0, contratoSinClave: 0 }), resumen.get(c));
    const aEscribir = [];
    const noSeTocan = [];
    /*
      DÓNDE DEBERÍA APUNTAR (sólo informa, no escribe): los contratos del vínculo que coinciden con lo que
      la referencia guardó. Uno solo = el candidato a reubicarla; corregirla es una decisión aparte.
    */
    const candidatos = (lista, r) => {
        if (!r.huella.alta && !r.huella.baja)
            return "";
        const ks = lista.flatMap((c, i) => (c?.estadoContrato !== "ANULADO" && huellaNoCoincide(c, r.huella) === null ? [i] : []));
        return ks.length === 1 ? ` → candidato único #${ks[0]}` : ks.length ? ` → ${ks.length} candidatos (#${ks.join(", #")})` : " → ningún contrato coincide";
    };
    for (const r of refs) {
        const f = fila(r.coleccion);
        const lista = contratos.get(String(r.userProjectId));
        if (!lista) {
            f.sinVinculo++;
            noSeTocan.push(`${r.coleccion} ${r._id} · ${r.texto} · el vínculo ya no existe`);
            continue;
        }
        const n = Number(r.indice);
        if (r.indice == null || !Number.isInteger(n) || n < 0 || n >= lista.length) {
            f.fuera++;
            noSeTocan.push(`${r.coleccion} ${r._id} · ${r.texto} · posición ${r.indice} fuera de los ${lista.length} contratos${candidatos(lista, r)}`);
            continue;
        }
        const c = lista[n];
        const lapida = c?.estadoContrato === "ANULADO";
        // La lápida no guarda alta/baja/empleadora: su huella está en `contratos_anulados`. Se acepta tal cual.
        const motivo = lapida ? null : huellaNoCoincide(c, r.huella);
        if (motivo) {
            f.noCoincide++;
            noSeTocan.push(`${r.coleccion} ${r._id} · ${r.texto} · #${n}: ${motivo}${candidatos(lista, r)}`);
            continue;
        }
        if (!c?.contratoKey) {
            f.contratoSinClave++;
            noSeTocan.push(`${r.coleccion} ${r._id} · ${r.texto} · el contrato #${n} no tiene clave`);
            continue;
        }
        f.ponen++;
        if (lapida)
            f.lapida++;
        if (r.sinHuella)
            f.sinHuella++;
        aEscribir.push({ ...r, indice: n, clave: new Types.ObjectId(String(c.contratoKey)), lapida });
    }
    console.log("Colección                    se pone  (lápida) (sin huella) | NO: no coincide  sin vínculo  fuera  contrato sin clave");
    for (const [c, f] of resumen)
        console.log(`${c.padEnd(28)} ${String(f.ponen).padStart(7)}  ${String(f.lapida).padStart(8)} ${String(f.sinHuella).padStart(12)} | ${String(f.noCoincide).padStart(15)}  ${String(f.sinVinculo).padStart(11)}  ${String(f.fuera).padStart(5)}  ${String(f.contratoSinClave).padStart(18)}`);
    console.log(`\nTotal: ${aEscribir.length} referencias reciben clave, ${noSeTocan.length} quedan sin tocar.`);
    if (noSeTocan.length) {
        console.log(detalle ? "\nNO SE TOCAN:" : `\nNO SE TOCAN (primeras 30; --detalle para todas):`);
        for (const t of detalle ? noSeTocan : noSeTocan.slice(0, 30))
            console.log(`  ${t}`);
    }
    if (!commit)
        return;
    fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
    const archivo = path.join(CARPETA_RESPALDOS, `clave-en-referencias-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(archivo, JSON.stringify(aEscribir.map((e) => ({ coleccion: e.coleccion, arreglo: e.arreglo, _id: String(e._id), userProjectId: String(e.userProjectId), indice: e.indice, campoIndice: e.campoIndice, clave: String(e.clave) })), null, 1));
    console.log(`\nRespaldo: ${archivo}`);
    let ok = 0, nada = 0;
    for (const e of aEscribir)
        (await escribir(e)) ? ok++ : nada++;
    console.log(`Escritas: ${ok}. Sin cambios (algo cambió entre la lectura y la escritura, o el mismo documento tenía la referencia repetida): ${nada}.`);
    console.log("Corré de nuevo sin --commit: lo escrito ya no tiene que aparecer.");
}
/** Borra las claves de un respaldo, filtrando por la CLAVE. */
async function revertir(archivo) {
    if (!archivo || !fs.existsSync(archivo))
        throw new Error("Falta el archivo de respaldo (--revertir <archivo>).");
    const filas = JSON.parse(fs.readFileSync(archivo, "utf8"));
    let n = 0;
    for (const f of filas) {
        const col = db().collection(f.coleccion);
        const clave = new Types.ObjectId(f.clave);
        const r = f.arreglo
            ? await col.updateOne({ _id: new Types.ObjectId(f._id) }, { $set: { [`${f.arreglo}.$[e].contratoKey`]: null } }, { arrayFilters: [{ "e.contratoKey": clave }] })
            : await col.updateOne({ _id: new Types.ObjectId(f._id), [f.coleccion === "users" ? "metadata.renovacionDe.contratoKey" : "contratoKey"]: clave }, { $unset: { [f.coleccion === "users" ? "metadata.renovacionDe.contratoKey" : "contratoKey"]: "" } });
        n += r.modifiedCount;
    }
    console.log(`Revertidas: ${n} de ${filas.length}.`);
}
main()
    .catch((e) => { console.error(e); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
