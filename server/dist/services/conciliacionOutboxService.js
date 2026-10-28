import path from "node:path";
import { Types } from "mongoose";
import { createFolder, listFolder, moveEntry } from "./dropboxService.js";
import { resolverCarpetaPorProposito } from "../utils/estadoCarpetas.js";
import { DropboxSignEnvio } from "../models/DropboxSignEnvio.js";
import { Tenant } from "../models/Tenant.js";
import { leerAnclas } from "../utils/anclasNombre.js";
import { codigosDe, describirConciliacion, planConciliacionOutbox, posiblesPorNombre } from "../utils/conciliacionOutbox.js";
export const CARPETA_YA_ENVIADOS = "Outbox_ya_enviados";
const soloArchivos = (xs) => xs.filter((e) => e.tag === "file").map((e) => ({ name: e.name, path: e.path }));
/** Los códigos que ya están en Pendbox y en Firmados: dos listados. La red de la corrida de envío. */
export async function codigosYaEnviados(tenantId, cfg) {
    const [pendbox, firmados] = await Promise.all([resolverCarpetaPorProposito("pendbox"), resolverCarpetaPorProposito("firmados")]);
    if (!pendbox && !firmados)
        return null;
    const [p, f] = await Promise.all([pendbox ? listFolder(tenantId, cfg, pendbox, true) : null, firmados ? listFolder(tenantId, cfg, firmados, true) : null]);
    return { pendbox: codigosDe(soloArchivos(p?.entries || [])), firmados: codigosDe(soloArchivos(f?.entries || [])) };
}
export async function conciliarOutbox(tenantId, cfg, opts) {
    const log = opts.log || (() => { });
    const [outbox, pendbox, firmados] = await Promise.all([resolverCarpetaPorProposito("outbox"), resolverCarpetaPorProposito("pendbox"), resolverCarpetaPorProposito("firmados")]);
    const vacio = { plan: { mover: [], quedan: [] }, movidos: 0, registrosCerrados: 0, registrosHuerfanos: [], destino: null, fallas: [] };
    if (!outbox || (!pendbox && !firmados))
        return { ...vacio, salteada: "sin_carpetas" };
    const [o, p, f] = await Promise.all([listFolder(tenantId, cfg, outbox, true), pendbox ? listFolder(tenantId, cfg, pendbox, true) : null, firmados ? listFolder(tenantId, cfg, firmados, true) : null]);
    const plan = planConciliacionOutbox(soloArchivos(o.entries || []), soloArchivos(p?.entries || []), soloArchivos(f?.entries || []));
    const destino = `${path.posix.dirname(outbox.replace(/\/$/, ""))}/${CARPETA_YA_ENVIADOS}`.replace(/^\/\//, "/");
    for (const l of describirConciliacion(plan, opts.enSeco))
        log(l);
    // Los registros colgados: código en Pendbox/Firmados, archivo fuera del Outbox, registro sin cerrar.
    const codPendbox = codigosDe(soloArchivos(p?.entries || []));
    const codFirmados = codigosDe(soloArchivos(f?.entries || []));
    const codOutbox = codigosDe(soloArchivos(o.entries || []));
    const alla = [...new Set([...codPendbox.keys(), ...codFirmados.keys()])].filter((c) => !codOutbox.has(c));
    const colgados = alla.length ? await DropboxSignEnvio.find({ tenantId: new Types.ObjectId(tenantId), codigo: { $in: alla }, estado: { $in: ["requiere_revision", "en_cola", "limite", "error"] } }).select("codigo archivo estado").lean() : [];
    const registrosHuerfanos = colgados.map((x) => ({ codigo: String(x.codigo), archivo: String(x.archivo || ""), estado: String(x.estado), donde: (codFirmados.has(x.codigo) ? "firmado" : "esperando_firma") }));
    if (registrosHuerfanos.length)
        log(`  ${registrosHuerfanos.length} registro(s) de la cola colgados (ya en Pendbox/Firmados, fuera del Outbox)  → ${opts.enSeco ? "se cerrarían" : "se cierran"}`);
    const resumen = (cual, ruta, xs) => {
        const docs = xs.filter((x) => !/\.json$/i.test(x.name));
        return { cual, ruta, archivos: docs.length, conCodigo: codigosDe(docs.map((d) => ({ name: d.name, path: "" }))).size, ejemplos: docs.slice(0, 3).map((d) => d.name) };
    };
    const listaP = soloArchivos(p?.entries || []);
    const listaF = soloArchivos(f?.entries || []);
    const diagnostico = {
        carpetas: [resumen("Outbox", outbox, soloArchivos(o.entries || [])), resumen("Pendbox", pendbox, listaP), resumen("Firmados", firmados, listaF)],
        posibles: posiblesPorNombre(plan.quedan, listaP, listaF),
    };
    const r = { ...vacio, plan, destino, diagnostico, registrosHuerfanos };
    if (opts.enSeco)
        return r;
    for (const h of registrosHuerfanos) {
        const u = await DropboxSignEnvio.updateOne({ tenantId: new Types.ObjectId(tenantId), codigo: h.codigo, estado: h.estado }, { $set: { estado: "enviado", detalle: `Ya estaba ${h.donde === "firmado" ? "en Firmados (firmado)" : "en Pendbox (esperando firma)"} y fuera del Outbox: el registro había quedado como «${h.estado}».` } }).catch(() => null);
        if (u?.modifiedCount)
            r.registrosCerrados++;
    }
    if (plan.mover.length === 0)
        return r;
    // La carpeta destino: si ya existe, Dropbox contesta conflicto y se sigue.
    await createFolder(tenantId, cfg, destino).catch(() => { });
    for (const m of plan.mover) {
        try {
            await moveEntry(tenantId, cfg, m.archivo.path, `${destino}/${m.archivo.name}`);
            r.movidos++;
        }
        catch (e) {
            r.fallas.push({ archivo: m.archivo.name, error: String(e?.message || e) });
            continue;
        }
        // Su registro de la cola (en cola, trabado, con error) pasa a enviado: se envió, por fuera del bot.
        const u = await DropboxSignEnvio.updateOne({ tenantId: new Types.ObjectId(tenantId), codigo: m.codigo, estado: { $ne: "enviado" } }, { $set: { estado: "enviado", detalle: `Ya estaba ${m.estado === "firmado" ? "en Firmados (firmado)" : "en Pendbox (esperando firma)"}: «${m.prueba}». La copia del Outbox se movió a ${CARPETA_YA_ENVIADOS}.` } }).catch(() => null);
        if (u?.modifiedCount)
            r.registrosCerrados++;
    }
    return r;
}
/**
 * YA ENVIADOS CONFIRMADOS A MANO: códigos que una persona verificó en Dropbox Sign (enviados por fuera de
 * estas carpetas, sin rastro en Pendbox ni Firmados). Mismo destino y mismo cierre del registro que la
 * conciliación; nunca borra. Por cada código devuelve, como evidencia para revisar, lo que hay en Pendbox
 * y en Firmados del MISMO CUIL (no decide nada con eso).
 */
export async function moverConfirmadosAMano(tenantId, cfg, codigos, opts) {
    const [outbox, pendbox, firmados] = await Promise.all([resolverCarpetaPorProposito("outbox"), resolverCarpetaPorProposito("pendbox"), resolverCarpetaPorProposito("firmados")]);
    if (!outbox)
        throw new Error("No hay carpeta con el propósito Outbox.");
    const [o, p, f] = await Promise.all([listFolder(tenantId, cfg, outbox, true), pendbox ? listFolder(tenantId, cfg, pendbox, true) : null, firmados ? listFolder(tenantId, cfg, firmados, true) : null]);
    const enOutbox = soloArchivos(o.entries || []);
    const otros = [...soloArchivos(p?.entries || []).map((x) => ({ ...x, carpeta: "Pendbox" })), ...soloArchivos(f?.entries || []).map((x) => ({ ...x, carpeta: "Firmados" }))];
    const destino = `${path.posix.dirname(outbox.replace(/\/$/, ""))}/${CARPETA_YA_ENVIADOS}`.replace(/^\/\//, "/");
    const filas = [];
    if (!opts.enSeco)
        await createFolder(tenantId, cfg, destino).catch(() => { });
    for (const codigo of codigos) {
        const archivo = enOutbox.find((a) => leerAnclas(a.name).codigo === codigo) || null;
        const cuit = archivo ? leerAnclas(archivo.name).cuit : "";
        const evidencia = cuit ? otros.filter((x) => x.name.includes(cuit)).map((x) => `${x.carpeta}: ${x.name}`) : [];
        const fila = { codigo, archivo: archivo?.name || null, evidencia, movido: false };
        filas.push(fila);
        if (opts.enSeco || !archivo)
            continue;
        try {
            await moveEntry(tenantId, cfg, archivo.path, `${destino}/${archivo.name}`);
            fila.movido = true;
            await DropboxSignEnvio.updateOne({ tenantId: new Types.ObjectId(tenantId), codigo, estado: { $ne: "enviado" } }, { $set: { estado: "enviado", detalle: `Confirmado a mano como ya enviado (por fuera de las carpetas). La copia del Outbox se movió a ${CARPETA_YA_ENVIADOS}.` } }).catch(() => { });
        }
        catch (e) {
            fila.error = String(e?.message || e);
        }
    }
    return { destino, filas };
}
/** ¿Ya hubo una pasada real confirmada a mano? Hasta entonces el escaneo la corre en seco. */
export async function conciliacionConfirmada(tenantId) {
    const t = await Tenant.findById(tenantId).select("integrations.dropbox.conciliacionOutboxConfirmadaAt").lean();
    return !!t?.integrations?.dropbox?.conciliacionOutboxConfirmadaAt;
}
