import "dotenv/config";
import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { clienteImap, extraerArchivoDeAsunto } from "../services/dropboxSignMailService.js";
import { adjuntosPdf, extraerArchivoFirmado, REMITENTE_FIRMADO } from "../services/rescateFirmados.js";
/**
 * DIAGNÓSTICO DE ASUNTOS DE DROPBOX SIGN. Solo lectura: la casilla se abre con EXAMINE (`readOnly`),
 * así que ningún mensaje cambia de flags (no se marca nada como leído), y sólo se piden el sobre y la
 * estructura, nunca el cuerpo.
 *
 * Lista TODAS las formas de asunto que mandó Dropbox Sign en los últimos DIAS días, con el nombre del
 * archivo reemplazado por «<archivo>» (y nombres de personas por «<quien>»), cuántas veces aparece
 * cada una, cómo la clasifica el parser (envío / firmado / sin clasificar) y cuántos traen PDF
 * adjunto. Sirve para agregar formas reales en vez de inventarlas.
 *
 *   TENANT=<slug|id> [DIAS=30] npm run dropbox-sign:asuntos
 */
async function main() {
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const ref = String(process.env.TENANT || "").trim();
    const dias = Number(process.env.DIAS || 30);
    // Sin TENANT, el primero que TENGA la casilla configurada (no el primero de la colección: ése es
    // el de administración de la plataforma, que no tiene casilla).
    const tenant = ref
        ? await Tenant.findOne(mongoose.isValidObjectId(ref) ? { _id: ref } : { slug: ref }).lean()
        : await Tenant.findOne({ "integrations.dropboxSign.imapHost": { $exists: true, $ne: "" } }).lean();
    if (!tenant)
        throw new Error(`No se encontró el tenant «${ref || "(con casilla)"}».`);
    const cfg = tenant.integrations?.dropboxSign || {};
    if (!cfg.email || !cfg.imapHost || !cfg.imapPasswordEnc)
        throw new Error("La casilla no está configurada.");
    console.log(`Tenant: ${tenant.name || tenant.slug} · casilla ${cfg.email} · últimos ${dias} días · SOLO LECTURA (EXAMINE)`);
    // La clave es tipo + forma: un asunto reconocido y uno que no, con la misma forma, son dos filas.
    /** El asunto sin datos de personas: el archivo y quien firmó se reemplazan por marcadores. */
    const forma = (asunto) => {
        const archivo = extraerArchivoDeAsunto(asunto) || extraerArchivoFirmado(asunto);
        let s = asunto;
        if (archivo)
            s = s.split(archivo).join("<archivo>");
        else
            s = s.replace(/\S*\d{3,}_[A-Z+]+_\S*(\s\S+)*/g, "<archivo>");
        s = s.replace(/^.+?\s+(firm[oó]|ha firmado|signed|has signed)\s+/i, "<quien> $1 ");
        s = s.replace(/[A-Za-z0-9.%+-]+@[A-Za-z0-9.-]+/g, "<email>").replace(/\d+/g, "N");
        return s.slice(0, 140);
    };
    const client = clienteImap(cfg);
    client.on("error", (e) => console.warn("IMAP:", e?.message || e));
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    const formas = new Map();
    let total = 0;
    try {
        const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
        const uids = await client.search({ from: REMITENTE_FIRMADO, since: desde }, { uid: true });
        total = (uids || []).length;
        if (uids && uids.length) {
            for await (const m of client.fetch(uids.join(","), { envelope: true, bodyStructure: true }, { uid: true })) {
                const asunto = String(m?.envelope?.subject || "");
                const tipo = extraerArchivoDeAsunto(asunto) ? "ENVÍO" : extraerArchivoFirmado(asunto) ? "FIRMADO" : "sin clasificar";
                const f = `${tipo}|${forma(asunto)}`;
                const fila = formas.get(f) || { n: 0, tipo, conPdf: 0 };
                fila.n++;
                if (adjuntosPdf(m.bodyStructure).length > 0)
                    fila.conPdf++;
                formas.set(f, fila);
            }
        }
    }
    finally {
        lock.release();
        await client.logout().catch(() => client.close());
    }
    console.log(`${total} mensaje(s) de ${REMITENTE_FIRMADO}.\n`);
    const porTipo = new Map();
    for (const v of formas.values())
        porTipo.set(v.tipo, (porTipo.get(v.tipo) || 0) + v.n);
    console.log([...porTipo.entries()].map(([t, n]) => `${t}: ${n}`).join(" · "));
    console.log("\n   cant  con PDF  tipo            forma del asunto");
    for (const [clave, v] of [...formas.entries()].sort((a, b) => b[1].n - a[1].n)) {
        const f = clave.slice(clave.indexOf("|") + 1);
        console.log(`  ${String(v.n).padStart(5)}  ${String(v.conPdf).padStart(7)}  ${v.tipo.padEnd(14)}  ${f}`);
    }
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
});
