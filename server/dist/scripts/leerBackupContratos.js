/**
 * SOLO LECTURA. Trae `contratos.json` y `contratos-frame.json` de un backup de Dropbox y los compara
 * con lo que hay hoy en la base.
 *
 * No escribe en Mongo ni en Dropbox: sólo descarga y lista. Sirve para elegir de qué copia restaurar
 * y ver exactamente qué documentos volverían.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx \
 *     src/scripts/leerBackupContratos.ts [nombreCarpetaBackup]
 *
 * Sin argumento, lista las carpetas disponibles y sale.
 */
import mongoose from "mongoose";
import { EJSON } from "bson";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent } from "../services/dropboxService.js";
import { CARPETA_BACKUPS } from "../services/backupService.js";
const TENANT_SLUG = process.env.TENANT_SLUG || "demo-tenant";
/** Un `.json` del backup: EJSON, un documento por línea. */
const parsearEjsonPorLinea = (buf) => buf
    .toString("utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => EJSON.parse(l));
const main = async () => {
    await mongoose.connect(process.env.MONGO_URI || "", { dbName: process.env.MONGO_DB_NAME });
    const db = mongoose.connection.db;
    const tenant = await Tenant.findOne({ slug: TENANT_SLUG }).lean();
    if (!tenant)
        throw new Error(`No existe el tenant ${TENANT_SLUG}`);
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        throw new Error(`El tenant ${TENANT_SLUG} no tiene Dropbox conectado`);
    const tenantId = String(tenant._id);
    const carpeta = process.argv[2];
    if (!carpeta) {
        const { entries } = await listFolder(tenantId, cfg, CARPETA_BACKUPS);
        console.log(`Copias en ${CARPETA_BACKUPS}:`);
        for (const e of entries)
            console.log(`   · ${e.name}`);
        await mongoose.disconnect();
        return;
    }
    const base = `${CARPETA_BACKUPS}/${carpeta}`;
    console.log(`Backup: ${base}\n`);
    for (const coleccion of ["contratos", "contratos-frame"]) {
        let docs = [];
        try {
            docs = parsearEjsonPorLinea(await downloadFileContent(tenantId, cfg, `${base}/${coleccion}.json`));
        }
        catch (e) {
            console.log(`── ${coleccion}: no se pudo leer (${e?.message || e})\n`);
            continue;
        }
        const actuales = await db.collection(coleccion).find({}).project({ name: 1 }).toArray();
        const idsActuales = new Set(actuales.map((d) => String(d._id)));
        const faltan = docs.filter((d) => !idsActuales.has(String(d._id)));
        console.log(`── ${coleccion}: ${docs.length} en el backup, ${actuales.length} hoy → FALTAN ${faltan.length}`);
        for (const d of faltan)
            console.log(`   · ${d.name}   _id=${String(d._id)}`);
        // Al revés: lo que hay hoy y no estaba en esa copia (creado después). No se toca, pero conviene verlo.
        const idsBackup = new Set(docs.map((d) => String(d._id)));
        const posteriores = actuales.filter((d) => !idsBackup.has(String(d._id)));
        if (posteriores.length > 0) {
            console.log(`   (y ${posteriores.length} que hoy existen y no estaban en la copia: ${posteriores.map((d) => d.name).join(", ")})`);
        }
        console.log("");
    }
    await mongoose.disconnect();
};
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
