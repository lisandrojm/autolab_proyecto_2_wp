/**
 * MIGRACIÓN: PONER `estadoContrato` A CADA CONTRATO (etapa 3, 19/11/2026).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/migrarEstadoContrato.ts [--commit]
 *   ... --revertir migraciones-respaldo/estado-contrato-<fecha>.json
 *   En el VPS: NODE_ENV=production node dist/scripts/migrarEstadoContrato.js [--commit]
 *
 * Decisiones del usuario que esto cumple:
 *  1. CORRE CON LA AUDITORÍA ANDANDO. Cada vínculo se escribe con `escribirContratosAuditado`, así que cada
 *     contrato deja su evento en `auditoria_contratos`. Y antes de escribir verifica que la app ya esté
 *     registrando (hay eventos con origen «app»): si no, el código de la auditoría no está deployado y la
 *     migración se niega. El deploy tiene que incluir también el modelo con SIN_DETERMINAR.
 *  2. SÓLO DATO LOCAL. El estado sale de `estadoSegunDatosLocales` (alta, baja y si el tipo es de tiempo
 *     indeterminado). Nada de ARCA: las bajas del espejo son otro paso, con su regla de evidencia fuerte.
 *  3. LO INDECIDIBLE NO VA A VIGENTE. Queda SIN_DETERMINAR con el motivo en `estadoContratoMotivo`, y se
 *     lista acá abajo (y en el reporte `reporteEstadoVsVigencia`).
 *  4. No cambia ningún comportamiento: los helpers de vigencia todavía no miran este campo. Antes de
 *     que lo miren, el reporte compara contrato por contrato.
 *
 * Sólo escribe contratos SIN estado (los anulados y los que ya tienen uno no se tocan): idempotente.
 * Respaldo con cada clave y el estado que se le puso; `--revertir` lo saca sólo donde sigue igual.
 */
import mongoose, { Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { escribirContratosAuditado } from "../services/auditoriaContratos.js";
import { contextoDeScript } from "../utils/contextoAuditoria.js";
import { hoyArgentina, fechaISO } from "../utils/contratoVigencia.js";
import { estadoSegunDatosLocales, tipoEsIndeterminado } from "../utils/estadoDeContrato.js";
const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const db = () => mongoose.connection.db;
const MOTIVO = "Migración etapa 3: estado del contrato según sus datos locales (alta, baja, tipo indeterminado)";
async function main() {
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    contextoDeScript("migrarEstadoContrato", { motivo: MOTIVO });
    if (arg("--revertir"))
        return revertir(arg("--revertir"));
    const commit = process.argv.includes("--commit");
    console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");
    // 1. La auditoría tiene que estar andando en la app.
    const deLaApp = await db().collection("auditoria_contratos").countDocuments({ origen: "app" });
    console.log(`Auditoría: ${deLaApp} evento(s) registrados por la app.`);
    if (!deLaApp) {
        const msg = "La app todavía no registró ningún evento de auditoría: el código de la auditoría no está deployado (o nadie tocó un contrato desde el deploy). La migración corre con la auditoría andando.";
        if (commit)
            throw new Error(msg);
        console.log(`  ⚠ ${msg} Con --commit, se niega.\n`);
    }
    const hoy = hoyArgentina();
    const tipos = await db().collection("contratos").find({}).project({ name: 1, "data.esTiempoIndeterminado": 1 }).toArray();
    const porId = new Map(tipos.map((t) => [String(t._id), !!t.data?.esTiempoIndeterminado]));
    const porNombre = new Map(tipos.map((t) => [String(t.name || "").trim().toLowerCase(), !!t.data?.esTiempoIndeterminado]));
    const ups = await db()
        .collection("users_&_projects")
        .find({ contracts: { $elemMatch: { estadoContrato: { $in: [null] } } } })
        .project({ userId: 1, nombre_proyecto: 1, "contracts.contratoKey": 1, "contracts.estadoContrato": 1, "contracts.fecha_alta_contrato": 1, "contracts.fecha_baja_contrato": 1, "contracts.contrato_id": 1, "contracts.nombre_contrato": 1 })
        .toArray();
    const conteo = new Map();
    const indecidibles = [];
    const sinClave = [];
    const respaldo = { hoy, el: new Date().toISOString(), contratos: [] };
    let vinculosEscritos = 0;
    for (const up of ups) {
        // Grupos (estado, motivo) → claves, para escribir el vínculo de una vez.
        const grupos = new Map();
        (up.contracts || []).forEach((c, i) => {
            if (c?.estadoContrato)
                return; // anulados y ya migrados
            if (!c?.contratoKey) {
                sinClave.push({ up: String(up._id), i });
                return;
            }
            const r = estadoSegunDatosLocales(c, tipoEsIndeterminado(c, porId, porNombre), hoy);
            conteo.set(r.estado, (conteo.get(r.estado) || 0) + 1);
            if (r.estado === "SIN_DETERMINAR")
                indecidibles.push({ up, i, c, motivo: r.motivo });
            const k = `${r.estado}|${r.motivo || ""}`;
            (grupos.get(k) || grupos.set(k, { ...r, claves: [] }).get(k)).claves.push(c.contratoKey);
            respaldo.contratos.push({ userProjectId: String(up._id), contratoKey: String(c.contratoKey), estado: r.estado, motivo: r.motivo || null });
        });
        if (!commit || grupos.size === 0)
            continue;
        const set = {};
        const arrayFilters = [];
        [...grupos.values()].forEach((g, n) => {
            set[`contracts.$[e${n}].estadoContrato`] = g.estado;
            if (g.motivo)
                set[`contracts.$[e${n}].estadoContratoMotivo`] = g.motivo;
            // Sólo si sigue sin estado: algo que cambió en el medio no se pisa.
            arrayFilters.push({ [`e${n}.contratoKey`]: { $in: g.claves }, [`e${n}.estadoContrato`]: { $in: [null] } });
        });
        await escribirContratosAuditado(db().collection("users_&_projects"), { _id: up._id }, { $set: set }, { arrayFilters });
        vinculosEscritos++;
        if (vinculosEscritos % 200 === 0)
            console.log(`  … ${vinculosEscritos} vínculos`);
    }
    console.log(`\nHoy: ${hoy} · vínculos con contratos sin estado: ${ups.length}`);
    for (const [e, n] of [...conteo].sort())
        console.log(`  ${String(n).padStart(6)}  ${e}`);
    if (sinClave.length)
        console.log(`  ⚠ ${sinClave.length} contrato(s) sin contratoKey: no se tocan (${sinClave.slice(0, 5).map((x) => `${x.up}#${x.i}`).join(", ")}).`);
    if (indecidibles.length) {
        console.log(`\nSIN_DETERMINAR (los resuelve una persona):`);
        for (const x of indecidibles) {
            const u = await db().collection("users").findOne({ _id: x.up.userId }, { projection: { firstName: 1, lastName: 1 } });
            console.log(`  - ${u?.firstName || ""} ${u?.lastName || ""} · ${x.up.nombre_proyecto || ""} · #${x.i} ${x.c.nombre_contrato || ""} · alta ${fechaISO(x.c.fecha_alta_contrato) || "—"} · baja ${fechaISO(x.c.fecha_baja_contrato) || "—"} · ${x.motivo} · clave ${x.c.contratoKey}`);
        }
    }
    if (commit && respaldo.contratos.length) {
        fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
        const archivo = path.join(CARPETA_RESPALDOS, `estado-contrato-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
        fs.writeFileSync(archivo, JSON.stringify(respaldo));
        console.log(`\n✔ ${vinculosEscritos} vínculos escritos. Respaldo: ${archivo}`);
    }
}
async function revertir(archivo) {
    const r = JSON.parse(fs.readFileSync(archivo, "utf8"));
    const porUp = new Map();
    for (const c of r.contratos)
        (porUp.get(c.userProjectId) || porUp.set(c.userProjectId, []).get(c.userProjectId)).push(c);
    let n = 0;
    for (const [up, cs] of porUp) {
        const unset = {};
        const arrayFilters = [];
        cs.forEach((c, i) => {
            unset[`contracts.$[r${i}].estadoContrato`] = "";
            unset[`contracts.$[r${i}].estadoContratoMotivo`] = "";
            arrayFilters.push({ [`r${i}.contratoKey`]: new Types.ObjectId(c.contratoKey), [`r${i}.estadoContrato`]: c.estado });
        });
        const res = await escribirContratosAuditado(db().collection("users_&_projects"), { _id: new Types.ObjectId(up) }, { $unset: unset }, { arrayFilters });
        n += res?.modifiedCount || 0;
    }
    console.log(`Revertido en ${n} vínculo(s).`);
}
main()
    .catch((e) => { console.error(`✖ ${e?.message || e}`); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
