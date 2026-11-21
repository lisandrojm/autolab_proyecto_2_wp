/**
 * CARGAR LA OBRA SOCIAL QUE USA LIQUIDACIONES COMO REFERENCIA (20/11/2026), desde su planilla.
 *
 * Lee NOVEDADES_LICHA.xlsx (hojas «MM-AAAA - 2030 SRL» y «MM-AAAA - FZERO SRL»: encabezado en la fila 4, Cuil en la
 * columna 7, «Código Obra Social» en la 10) y escribe, en cada contrato MENSUALIZADO de esa persona y esa empresa
 * que toque el período, `obraSocialSegunLiquidaciones` (RNOS de 6 dígitos). NO toca `obraSocialId`: es sólo la
 * referencia para que el Consolidado Empresas avise «Obra social discrepa con liquidaciones» con los dos valores,
 * y lo decida laboral.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/cargarObraSocialLiquidaciones.ts \
 *       --planilla /ruta/NOVEDADES_LICHA.xlsx --desde 2026-09-21 --hasta 2026-10-20        # dry-run
 *   ... --commit
 *   En el VPS: NODE_ENV=production node dist/scripts/cargarObraSocialLiquidaciones.js ...
 *
 * Escribe con `escribirContratosAuditado` (auditoría de contratos, a nombre del script) y deja respaldo en
 * migraciones-respaldo/obra-social-liquidaciones-<fecha>.json con antes y después por contrato.
 */
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { escribirContratosAuditado } from "../services/auditoriaContratos.js";
import { contextoDeScript } from "../utils/contextoAuditoria.js";
import { fechaISO } from "../utils/contratoVigencia.js";
const CARPETA_RESPALDOS = path.resolve(process.cwd(), "migraciones-respaldo");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const dig = (s) => String(s ?? "").replace(/\D/g, "");
const esFecha = (s) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const HOJAS = [{ patron: /2030/i, empresa: "2030 S.R.L." }, { patron: /FZERO/i, empresa: "FZERO S.R.L" }];
async function main() {
    const commit = process.argv.includes("--commit");
    const planilla = arg("--planilla"), desde = arg("--desde"), hasta = arg("--hasta");
    if (!planilla || !fs.existsSync(planilla))
        throw new Error("Falta --planilla (ruta a NOVEDADES_LICHA.xlsx).");
    if (!esFecha(desde) || !esFecha(hasta))
        throw new Error("Faltan --desde y --hasta (AAAA-MM-DD): el período que la planilla liquida.");
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const db = mongoose.connection.db;
    contextoDeScript(path.basename(process.argv[1] || "", path.extname(process.argv[1] || "")), { motivo: `Referencia de obra social de liquidaciones (${path.basename(planilla)}) por CUIL y empresa; campo obraSocialSegunLiquidaciones; no toca obraSocialId.` });
    console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(planilla);
    const cell = (c) => { const x = c?.value; if (x == null)
        return ""; if (typeof x === "object")
        return "result" in x ? String(x.result ?? "") : ""; return String(x).trim(); };
    const ref = [];
    for (const ws of wb.worksheets) {
        const h = HOJAS.find((x) => x.patron.test(ws.name));
        if (!h)
            continue;
        ws.eachRow((r, i) => { if (i < 5)
            return; const cuil = dig(cell(r.getCell(7))), os = dig(cell(r.getCell(10))); if (cuil.length === 11 && os)
            ref.push({ cuil, apellido: cell(r.getCell(5)), os: os.padStart(6, "0"), empresa: h.empresa }); });
    }
    console.log(`referencias en la planilla: ${ref.length} (${HOJAS.map((h) => `${h.empresa} ${ref.filter((r) => r.empresa === h.empresa).length}`).join(", ")})`);
    const cambios = [];
    let sinPersona = 0, sinContrato = 0, yaIgual = 0;
    for (const r of ref) {
        const u = await db.collection("users").findOne({ "metadata.cuit": { $in: [r.cuil, r.cuil.replace(/^(\d{2})(\d{8})(\d)$/, "$1-$2-$3")] } }, { projection: { _id: 1 } });
        if (!u) {
            sinPersona++;
            console.log(`  sin persona con ese CUIL: ${r.apellido} ${r.cuil}`);
            continue;
        }
        const ups = await db.collection("users_&_projects").find({ userId: u._id }).project({ _id: 1, contracts: 1 }).toArray();
        let hallados = 0;
        for (const up of ups)
            for (const c of up.contracts || []) {
                if (!c || c.estadoContrato === "ANULADO" || !/tiempo indeterminado|plazo fijo/i.test(c.nombre_contrato || "") || (c.nombre_empresa_contrato || "") !== r.empresa)
                    continue;
                const alta = fechaISO(c.fecha_alta_contrato), baja = c.fecha_baja_contrato ? fechaISO(c.fecha_baja_contrato) : "";
                if (!alta || !(alta <= hasta && (!baja || baja >= desde)))
                    continue;
                hallados++;
                if ((c.obraSocialSegunLiquidaciones || "") === r.os) {
                    yaIgual++;
                    continue;
                }
                cambios.push({ userProjectId: String(up._id), contratoKey: String(c.contratoKey), persona: `${r.apellido} ${r.cuil}`, empresa: r.empresa, contrato: `${c.nombre_contrato} ${alta}→${baja || "abierto"}`, antes: c.obraSocialSegunLiquidaciones || null, despues: r.os, obraSocialDelContrato: c.obraSocialId ?? null });
            }
        if (!hallados) {
            sinContrato++;
            console.log(`  sin contrato mensualizado de ${r.empresa} en el período: ${r.apellido}`);
        }
    }
    console.log(`\ncambios: ${cambios.length} · ya iguales ${yaIgual} · sin persona ${sinPersona} · sin contrato ${sinContrato}`);
    for (const x of cambios)
        console.log(`  ${x.persona} · ${x.empresa} · ${x.contrato} · ${x.antes ?? "(vacío)"} → ${x.despues} (obraSocialId del contrato: ${x.obraSocialDelContrato ?? "-"})`);
    if (!commit || !cambios.length)
        return;
    fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
    const respaldo = path.join(CARPETA_RESPALDOS, `obra-social-liquidaciones-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(respaldo, JSON.stringify({ planilla: path.basename(planilla), desde, hasta, fecha: new Date().toISOString(), cambios }, null, 2));
    let ok = 0;
    for (const x of cambios) {
        const k = new mongoose.Types.ObjectId(x.contratoKey);
        const r = await escribirContratosAuditado(db.collection("users_&_projects"), { _id: new mongoose.Types.ObjectId(x.userProjectId), "contracts.contratoKey": k }, { $set: { "contracts.$[c].obraSocialSegunLiquidaciones": x.despues } }, { arrayFilters: [{ "c.contratoKey": k }] });
        if (r?.modifiedCount === 1)
            ok++;
    }
    console.log(`\n✔ Aplicado ${ok}/${cambios.length}. Respaldo: ${respaldo}`);
}
main().then(() => mongoose.disconnect()).then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); mongoose.disconnect().finally(() => process.exit(1)); });
