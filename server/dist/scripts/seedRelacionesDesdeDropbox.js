import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { Company } from "../models/Company.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent } from "../services/dropboxService.js";
import { parsearBytesRelaciones } from "../compartido/arca/relacionesLaboralesTxt.js";
import { guardarRelaciones, recalcularAntiguedad } from "../services/arca/relacionesArcaStore.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
/**
 * SEED HISTÓRICO DE LAS RELACIONES LABORALES DE ARCA desde los TXT que ya están en Dropbox:
 * /WEPRODU/ARCA/Contratos/<Empresa>/<cuit>_inicio_YYYY-MM.txt (uno por empleadora y mes de inicio,
 * bajados a mano de «Consultas de Relaciones Laborales»). Cada archivo se parsea con
 * `compartido/arca/relacionesLaboralesTxt.ts` y se guarda por clave natural en
 * `RelacionLaboralArca` (origen `seed-dropbox`); al final se recalcula `AntiguedadArca` de los
 * CUIL tocados.
 *
 * Idempotente: correrlo dos veces no duplica ni cambia nada (el store no escribe lo que ya está
 * igual, y entre dos versiones de la misma relación gana la más nueva; ver
 * `utils/versionRelacionArca.ts`). La subcarpeta `_reemplazados-paginacion` se ignora: son los
 * archivos viejos que se reemplazaron al corregir la paginación.
 *
 * La empleadora sale del nombre del archivo (el CUIT va adelante), no de la carpeta: el nombre de la
 * carpeta es un rótulo («FZERO S.R.L») y el CUIT es el dato.
 *
 * Uso (desde server/):
 *   TENANT_SLUG=demo-tenant npm run arca:seed-relaciones:dry   → cuenta qué haría, no escribe
 *   TENANT_SLUG=demo-tenant npm run arca:seed-relaciones       → escribe
 *   SOLO=30710295839_inicio_2021-03.txt ...                    → un archivo puntual (por nombre)
 *   EMPRESA="FZERO S.R.L" ...                                   → una sola carpeta
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const RAIZ = process.env.CARPETA || "/WEPRODU/ARCA/Contratos";
const SOLO = (process.env.SOLO || "").trim().toLowerCase();
const EMPRESA = (process.env.EMPRESA || "").trim().toLowerCase();
const NOMBRE_TXT = /^(\d{11})_inicio_(\d{4}-\d{2})\.txt$/i;
const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    const slug = process.env.TENANT_SLUG?.trim();
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    if (!slug)
        throw new Error("Falta TENANT_SLUG=<slug>.");
    // En DRY RUN no se crea nada en Atlas, ni las colecciones ni sus índices: eso lo hace el server
    // al arrancar con los modelos nuevos (o la corrida real de este script).
    await mongoose.connect(uri, { dbName, autoIndex: !DRY_RUN, autoCreate: !DRY_RUN });
    console.log(`${DRY_RUN ? "[DRY RUN] " : ""}Base: ${dbName} · tenant ${slug} · carpeta ${RAIZ}`);
    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant)
        throw new Error(`No existe el tenant ${slug}.`);
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        throw new Error("El tenant no tiene Dropbox conectado.");
    const tid = String(tenant._id);
    // Las empresas son globales en esta instalación (Company no tiene tenantId): se enlazan por CUIT.
    const empresas = await Company.find({ cuit: { $exists: true, $ne: "" } }).select("cuit razonSocial").lean();
    const companyPorCuit = new Map(empresas.map((e) => [soloDigitos(e.cuit), e]));
    const { entries: carpetas } = await listFolder(tid, cfg, RAIZ, true);
    const archivos = [];
    for (const c of carpetas) {
        if (c.tag !== "folder")
            continue;
        if (EMPRESA && c.name.toLowerCase() !== EMPRESA)
            continue;
        const { entries } = await listFolder(tid, cfg, c.path, true);
        for (const e of entries) {
            if (e.tag !== "file")
                continue; // las subcarpetas (_reemplazados-paginacion) no se recorren
            const m = NOMBRE_TXT.exec(e.name);
            if (!m) {
                console.log(`  (se ignora ${c.name}/${e.name}: el nombre no es <cuit>_inicio_YYYY-MM.txt)`);
                continue;
            }
            if (SOLO && e.name.toLowerCase() !== SOLO)
                continue;
            archivos.push({ carpeta: c.name, name: e.name, path: e.path, cuit: m[1], mes: m[2] });
        }
    }
    // En orden cronológico por empleadora: así, a igual fecha de fin, la versión que queda es la del archivo más nuevo.
    archivos.sort((a, b) => a.cuit.localeCompare(b.cuit) || a.mes.localeCompare(b.mes));
    console.log(`${archivos.length} archivos para leer`);
    const porEmpleadora = new Map();
    const cuilsTocados = new Set();
    const ahora = new Date();
    for (const a of archivos) {
        const buf = await downloadFileContent(tid, cfg, a.path);
        const r = parsearBytesRelaciones(new Uint8Array(buf));
        if (r.descartes.length) {
            console.log(`  ${a.carpeta}/${a.name}: ${r.descartes.length} fila(s) sin leer. Primera (línea ${r.descartes[0].linea}): ${r.descartes[0].motivo}`);
            console.log(`    ${JSON.stringify(r.descartes[0].rawLinea.slice(0, 160))}`);
        }
        const company = companyPorCuit.get(a.cuit);
        const g = await guardarRelaciones({
            tenantId: tenant._id,
            empleadoraCuit: a.cuit,
            empleadoraCompanyId: company?._id ?? null,
            filas: r.filas,
            origen: "seed-dropbox",
            modo: "seed",
            ahora,
            dryRun: DRY_RUN,
        });
        for (const c of g.cuilsTocados)
            cuilsTocados.add(c);
        const t = porEmpleadora.get(a.cuit) || { filas: 0, descartes: 0, nuevas: 0, actualizadas: 0, bajasAplicadas: 0, sinCambios: 0, conservadas: 0 };
        t.filas += r.filas.length;
        t.descartes += r.descartes.length;
        t.nuevas += g.nuevas;
        t.actualizadas += g.actualizadas;
        t.bajasAplicadas += g.bajasAplicadas;
        t.sinCambios += g.sinCambios;
        t.conservadas += g.conservadas;
        porEmpleadora.set(a.cuit, t);
        console.log(`  ${a.carpeta}/${a.name}: ${r.filas.length} filas → ${g.nuevas} nuevas, ${g.actualizadas} actualizadas (${g.bajasAplicadas} bajas), ${g.sinCambios} sin cambios, ${g.conservadas} conservadas`);
    }
    console.log("\nPor empleadora:");
    for (const [cuit, t] of porEmpleadora) {
        const e = companyPorCuit.get(cuit);
        console.log(`  ${cuit} ${e ? e.razonSocial : "(sin Company con ese CUIT)"}: ${t.filas} filas, ${t.descartes} sin leer → ${t.nuevas} nuevas, ${t.actualizadas} actualizadas (${t.bajasAplicadas} bajas), ${t.sinCambios} sin cambios, ${t.conservadas} conservadas`);
    }
    const hoy = hoyArgentina();
    const escritas = await recalcularAntiguedad(tenant._id, cuilsTocados, hoy, DRY_RUN);
    console.log(`\nAntigüedad: ${cuilsTocados.size} CUIL tocados → ${escritas} filas ${DRY_RUN ? "se escribirían" : "escritas"} (hoy = ${hoy})`);
    if (DRY_RUN)
        console.log("\n[DRY RUN] No se escribió nada.");
}
main()
    .then(() => mongoose.disconnect())
    .catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
