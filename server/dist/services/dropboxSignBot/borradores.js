import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { DropboxSignEnvio } from "../../models/DropboxSignEnvio.js";
import { DropboxSignEnvioLog } from "../../models/DropboxSignEnvioLog.js";
import { abrirSesionDropboxSign, guardarSesion } from "./navegador.js";
import { soltarCandadoDropboxSign, tomarCandadoDropboxSign } from "./candado.js";
import { cargarMotor } from "./motor.js";
const BASE = "integrations.dropboxSign.bot";
const VIGENCIA_REVISION_MS = 60 * 60_000;
const ultimos = new Map();
/** La última revisión EN SECO terminada bien: es lo único que se puede confirmar para borrar. */
const revisiones = new Map();
export const estadoBorradores = (tenantId) => ({ ultimo: ultimos.get(tenantId) || null, revision: revisiones.get(tenantId) || null, vigenciaMin: VIGENCIA_REVISION_MS / 60_000 });
/** Los nombres de archivo que pasaron por el bot: los únicos títulos de borrador que se pueden borrar. */
async function titulosDelBot(tenantId) {
    const archivos = await DropboxSignEnvio.distinct("archivo", { tenantId: new Types.ObjectId(tenantId) });
    return archivos.filter((a) => typeof a === "string" && a.trim().length > 5);
}
function arrancar(tenantId, tipo, trabajo) {
    tomarCandadoDropboxSign(tenantId, false, "borradores");
    const r = { tipo, corriendo: true, arrancadaEl: new Date(), terminadaEl: null, total: null, candidatos: [], salteados: [], borrados: [], cortada: null, error: null, eventos: [] };
    ultimos.set(tenantId, r);
    void (async () => {
        let sesion = null;
        try {
            const titulos = await titulosDelBot(tenantId);
            r.eventos.push({ at: new Date(), texto: `${titulos.length} archivo(s) del bot para comparar títulos. Abriendo Dropbox Sign…` });
            sesion = await abrirSesionDropboxSign(tenantId);
            const { motor, version } = await cargarMotor();
            r.eventos.push({ at: new Date(), texto: `Motor del bot: ${version}${motor.VERSION_MOTOR ? ` · ${motor.VERSION_MOTOR}` : ""}.` });
            await trabajo(r, sesion, motor, titulos);
        }
        catch (e) {
            r.error = e?.message || String(e);
            r.eventos.push({ at: new Date(), texto: `Error: ${r.error}` });
        }
        finally {
            if (sesion && !r.error)
                await guardarSesion(tenantId, sesion.ctx).catch(() => { });
            await sesion?.browser.close().catch(() => { });
            soltarCandadoDropboxSign(tenantId);
            r.corriendo = false;
            r.terminadaEl = new Date();
            if (tipo === "revision" && !r.error)
                revisiones.set(tenantId, r);
            if (tipo === "limpieza")
                revisiones.delete(tenantId); // el listado cambió: hay que volver a revisar
            // Una limpieza confirmada que borró sin cortarse prueba los selectores contra el sitio real: recién
            // entonces las corridas descartan solas los borradores que dejan (ver `descartarBorradoresDeLaCorrida`).
            if (tipo === "limpieza" && !r.error && !r.cortada && r.borrados.length > 0)
                await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.limpiezaBorradoresVerificadaAt`]: new Date() } }).catch(() => { });
            const lineas = [
                ...r.borrados.map((b) => ({ archivo: b.archivo, codigo: "", email: "", estado: "borrado", detalle: `Borrador «${b.titulo}» eliminado en Dropbox Sign («Eliminar para ti»).` })),
                ...(tipo === "revision" ? r.candidatos.map((c) => ({ archivo: c.archivo, codigo: "", email: "", estado: "seco", detalle: `Borrador «${c.titulo}»: se eliminaría.` })) : []),
                ...r.salteados.slice(0, 300).map((s) => ({ archivo: s.texto.slice(0, 160), codigo: "", email: "", estado: "salteado", detalle: s.motivo })),
            ];
            await DropboxSignEnvioLog.create({ tenantId: new Types.ObjectId(tenantId), inicio: r.arrancadaEl, fin: r.terminadaEl, resultado: tipo === "revision" ? "revision_borradores" : "limpieza_borradores", enviados: 0, errores: r.error || r.cortada ? 1 : 0, limite: false, enSeco: tipo === "revision", automatica: false, lineas, error: r.error || r.cortada || undefined }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo guardar el log de borradores:", e?.message || e));
        }
    })();
    return r;
}
/** Paso 1: la revisión en seco. */
export function revisarBorradoresDelBot(tenantId) {
    return arrancar(tenantId, "revision", async (r, sesion, motor, titulos) => {
        const x = await motor.limpiarBorradores({ page: sesion.page, titulos, enSeco: true, onProgreso: (texto) => r.eventos.push({ at: new Date(), texto }) });
        Object.assign(r, { total: x.total, candidatos: x.candidatos, salteados: x.salteados });
    });
}
/** Paso 2: borrar los candidatos de la última revisión. `confirmados` tiene que ser su número exacto. */
export function limpiarBorradoresDelBot(tenantId, confirmados) {
    const rev = revisiones.get(tenantId);
    if (!rev || !rev.terminadaEl)
        throw Object.assign(new Error("Primero revisá los borradores (en seco): sólo se borra lo que muestra esa revisión."), { status: 400 });
    if (Date.now() - rev.terminadaEl.getTime() > VIGENCIA_REVISION_MS)
        throw Object.assign(new Error("La revisión tiene más de una hora: volvé a revisar antes de borrar."), { status: 400 });
    if (!rev.candidatos.length)
        throw Object.assign(new Error("La revisión no encontró borradores del bot para eliminar."), { status: 400 });
    if (confirmados !== rev.candidatos.length)
        throw Object.assign(new Error(`El número confirmado (${confirmados}) no es el de la revisión (${rev.candidatos.length}).`), { status: 400 });
    const soloTitulos = rev.candidatos.map((c) => c.archivo);
    return arrancar(tenantId, "limpieza", async (r, sesion, motor, titulos) => {
        r.candidatos = rev.candidatos;
        const x = await motor.limpiarBorradores({ page: sesion.page, titulos, soloTitulos, enSeco: false, tope: soloTitulos.length, onProgreso: (texto) => r.eventos.push({ at: new Date(), texto }) });
        Object.assign(r, { total: x.total, borrados: x.borrados, salteados: x.salteados, cortada: x.cortada || null });
    });
}
/**
 * AL TERMINAR UNA CORRIDA (con la sesión todavía abierta): descarta los borradores que dejaron SUS
 * documentos no enviados, uno por documento. Sólo si una limpieza manual ya funcionó en este tenant
 * (`limpiezaBorradoresVerificadaAt`); si no, se informa y quedan para «Limpiar borradores».
 */
export async function descartarBorradoresDeLaCorrida(tenantId, page, motor, archivos, onProgreso) {
    if (!archivos.length || typeof motor?.limpiarBorradores !== "function")
        return;
    const t = await Tenant.findById(tenantId).select(`${BASE}.limpiezaBorradoresVerificadaAt`).lean();
    if (!t?.integrations?.dropboxSign?.bot?.limpiezaBorradoresVerificadaAt) {
        onProgreso(`Esta corrida dejó ${archivos.length} borrador(es) en Dropbox Sign. Se descartan solos recién después de una «Limpiar borradores» confirmada que funcione; hasta entonces, usala desde Envío automático.`);
        return;
    }
    onProgreso(`Descartando los ${archivos.length} borrador(es) que dejó esta corrida…`);
    const x = await motor.limpiarBorradores({ page, titulos: archivos, soloTitulos: archivos, enSeco: false, tope: archivos.length, onProgreso });
    if (x?.cortada)
        onProgreso(`El descarte se cortó (${x.cortada}): los que quedan se limpian desde «Limpiar borradores».`);
}
