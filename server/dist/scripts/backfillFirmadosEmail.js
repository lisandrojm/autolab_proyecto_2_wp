import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { DocumentoGenerado } from "../models/DocumentoGenerado.js";
import { FirmadoRescatado } from "../models/FirmadoRescatado.js";
import { clienteImap, documentoPorPrefijo } from "../services/dropboxSignMailService.js";
import { getTenantDropboxConfig, listFolder, uploadFileEstricto } from "../services/dropboxService.js";
import { adjuntosPdf, extraerAvisoFirmado, fechaDelAviso, rescatarFirmados, REMITENTE_FIRMADO, TERMINOS_BUSQUEDA_FIRMADO } from "../services/rescateFirmados.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
/**
 * BACKFILL DE FIRMADOS DESDE EL EMAIL (25/10/2026).
 *
 * La lectura de la casilla nunca encontró los avisos «Fulano firmó …» (buscaba «firm» y Gmail busca
 * palabras enteras) y la integración nativa dejó de depositar en la carpeta de firmados el 07/10.
 * Esto recorre los avisos de firmado desde una fecha de corte y sube a la carpeta de firmados, con el
 * nombre que pone la integración, cada PDF adjunto que todavía no esté. Es la misma lógica que la
 * lectura periódica (`rescatarFirmados`), con fecha de corte, tope y reporte.
 *
 *   · IDEMPOTENTE: la carpeta se lista una vez y se saltea todo lo que ya tenga su `ID-NNNNNN` ahí
 *     (y dos avisos del mismo código en la corrida suben uno solo: el más nuevo).
 *   · SOLO LECTURA sobre la casilla: se abre con EXAMINE (`readOnly`) y los adjuntos se bajan con
 *     BODY.PEEK, así que ningún mail queda marcado como leído.
 *   · Los estados de los contratos no se tocan acá: los mueve el escaneo de carpetas (cada 15 min o
 *     «Forzar escaneo»), igual que con un firmado que depositó la integración.
 *
 *   npm run dropbox-sign:backfill-firmados -- [--dry-run] [--limit N] [--desde 2026-10-07T19:07:00Z] [--tenant slug] [--csv ruta]
 *
 * Sin --desde arranca el 07/10/2026 16:07 hora argentina (19:07 UTC), el último firmado que depositó
 * la integración. Deja un CSV con una fila por aviso: qué se subió, qué se salteó y por qué.
 */
const CORTE_POR_DEFECTO = "2026-10-07T19:07:00Z";
function argumentos() {
    const a = process.argv.slice(2);
    const valor = (k) => {
        const i = a.indexOf(k);
        return i >= 0 ? a[i + 1] : undefined;
    };
    const limite = valor("--limit");
    return {
        seco: a.includes("--dry-run"),
        limite: limite !== undefined ? Number(limite) : undefined,
        desde: new Date(valor("--desde") || CORTE_POR_DEFECTO),
        tenant: valor("--tenant") || process.env.TENANT || "",
        csv: valor("--csv"),
    };
}
const celda = (v) => {
    const s = v === undefined || v === null ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
async function main() {
    const args = argumentos();
    if (Number.isNaN(args.desde.getTime()))
        throw new Error("--desde no es una fecha válida (ISO, p. ej. 2026-10-07T19:07:00Z).");
    if (args.limite !== undefined && (!Number.isInteger(args.limite) || args.limite < 1))
        throw new Error("--limit tiene que ser un entero ≥ 1.");
    await mongoose.connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB_NAME });
    const tenant = args.tenant
        ? await Tenant.findOne(mongoose.isValidObjectId(args.tenant) ? { _id: args.tenant } : { slug: args.tenant }).lean()
        : await Tenant.findOne({ "integrations.dropboxSign.imapHost": { $exists: true, $ne: "" } }).lean();
    if (!tenant)
        throw new Error(`No se encontró el tenant «${args.tenant || "(con casilla)"}».`);
    const tenantId = String(tenant._id);
    const cfg = tenant.integrations?.dropboxSign || {};
    if (!cfg.email || !cfg.imapHost || !cfg.imapPasswordEnc)
        throw new Error("La casilla no está configurada.");
    const dropboxCfg = getTenantDropboxConfig(tenant);
    if (!dropboxCfg)
        throw new Error("Dropbox no está conectado en este tenant.");
    const carpeta = await resolverCarpetaPorProposito("firmados");
    if (!carpeta)
        throw new Error("No hay carpeta con propósito «firmados».");
    console.log(`${args.seco ? "EN SECO (no se sube nada)" : "CORRIDA REAL"} · tenant ${tenant.slug} · casilla ${cfg.email}`);
    console.log(`Avisos de firmado desde ${args.desde.toISOString()} · carpeta «${carpeta}»${args.limite ? ` · tope ${args.limite}` : ""}`);
    const enFirmados = ((await listFolder(tenantId, dropboxCfg, carpeta, true)).entries || []).filter((e) => e.tag === "file").map((e) => ({ name: e.name, path: e.path }));
    const antes = enFirmados.length;
    console.log(`La carpeta tiene ${antes} archivo(s).`);
    const client = clienteImap(cfg);
    client.on("error", (e) => console.warn("IMAP:", e?.message || e));
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    let avisos = [];
    let resumen;
    let sinReconocer = 0;
    try {
        const uids = new Set();
        // El SEARCH SINCE es por día: se trae desde el día del corte y se filtra la hora después.
        for (const termino of TERMINOS_BUSQUEDA_FIRMADO) {
            for (const u of (await client.search({ from: REMITENTE_FIRMADO, subject: termino, since: args.desde }, { uid: true })) || [])
                uids.add(u);
        }
        if (uids.size > 0) {
            for await (const m of client.fetch([...uids].join(","), { envelope: true, bodyStructure: true, internalDate: true }, { uid: true })) {
                const asunto = String(m?.envelope?.subject || "");
                const aviso = extraerAvisoFirmado(asunto);
                if (!aviso) {
                    sinReconocer++;
                    continue;
                }
                const fecha = fechaDelAviso(m);
                if (!fecha || fecha < args.desde)
                    continue;
                avisos.push({ uid: Number(m.uid), asunto, titulo: aviso.archivo, quien: aviso.quien, adjuntos: adjuntosPdf(m.bodyStructure), fecha });
            }
        }
        // Los más nuevos primero: si un documento tiene dos avisos, se queda el último (el firmado completo).
        avisos = avisos.sort((a, b) => b.uid - a.uid);
        console.log(`${avisos.length} aviso(s) de firmado desde el corte (${sinReconocer} asunto(s) con «firm…» que no son un aviso con archivo .pdf).`);
        resumen = await rescatarFirmados(avisos, {
            carpetaFirmados: carpeta,
            enFirmados,
            soloPrueba: args.seco,
            detallarPrueba: true,
            limite: args.limite,
            existeDocumento: async (codigo) => !!(await DocumentoGenerado.exists({ tenantId, codigo })),
            documentoPorPrefijo: documentoPorPrefijo(tenantId),
            descargar: async (uid, adjunto) => {
                const r = await client.downloadMany(String(uid), [adjunto.part], { uid: true });
                const contenido = r?.[adjunto.part]?.content;
                if (!contenido)
                    throw new Error("No se pudo bajar el adjunto del mensaje.");
                return Buffer.from(contenido);
            },
            subir: async (ruta, buffer) => {
                await uploadFileEstricto(tenantId, dropboxCfg, ruta, buffer);
            },
            verificados: new Set(),
        });
    }
    finally {
        lock.release();
        await client.logout().catch(() => client.close());
    }
    // El registro permanente, igual que la lectura periódica (pantalla «Rescatados desde el email»).
    for (const l of resumen.logs) {
        if (l.resultado !== "firmado-rescatado" || !l.rescate)
            continue;
        const d = l.rescate;
        await FirmadoRescatado.updateOne({ tenantId, archivo: l.archivo }, { $set: { codigo: d.codigo, path: d.path, carpeta: d.carpeta, titulo: d.titulo, asunto: l.asunto, firmante: d.quien, cuit: l.cuit || "", uid: d.uid, bytes: d.bytes, rescatadoEl: new Date() }, $inc: { veces: 1 }, $setOnInsert: { tenantId } }, { upsert: true });
    }
    // EL REPORTE: una fila por aviso, también los que el tope dejó sin mirar.
    const porUid = new Map();
    for (const l of resumen.logs)
        if (l.uid !== undefined)
            porUid.set(l.uid, l);
    const filas = avisos.map((a) => {
        const l = porUid.get(a.uid);
        return [
            l?.resultado || "sin-mirar-por-limite",
            a.uid,
            a.fecha,
            a.quien || "",
            a.titulo,
            l && l.archivo !== a.titulo ? l.archivo : "",
            l?.cuit || "",
            l?.detalle || "El tope (--limit) cortó la corrida antes de este aviso.",
        ];
    });
    const destino = args.csv || path.join(process.cwd(), "tmp", `backfill-firmados-${args.seco ? "seco-" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const encabezado = ["resultado", "uid", "fecha_aviso_utc", "firmante", "titulo", "archivo_subido", "cuil", "detalle"];
    fs.writeFileSync(destino, "﻿" + [encabezado, ...filas].map((f) => f.map(celda).join(",")).join("\n") + "\n", "utf8");
    const conteo = new Map();
    for (const f of filas)
        conteo.set(String(f[0]), (conteo.get(String(f[0])) || 0) + 1);
    console.log("\nResultado por aviso:");
    for (const [k, n] of [...conteo.entries()].sort((a, b) => b[1] - a[1]))
        console.log(`  ${String(n).padStart(4)}  ${k}`);
    if (!args.seco) {
        const despues = ((await listFolder(tenantId, dropboxCfg, carpeta, true)).entries || []).filter((e) => e.tag === "file").length;
        console.log(`\nLa carpeta pasó de ${antes} a ${despues} archivo(s).`);
    }
    if (resumen.cortadoPorLimite)
        console.log(`Cortado por el tope de ${args.limite}: quedan avisos sin mirar (ver CSV).`);
    console.log(`Reporte: ${destino}`);
    await mongoose.disconnect();
}
main().catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});
