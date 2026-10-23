import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { DropboxSignEnvio } from "../../models/DropboxSignEnvio.js";
import { DropboxSignEnvioLog } from "../../models/DropboxSignEnvioLog.js";
import { leerAnclas } from "../../utils/anclasNombre.js";
import { abrirOcr } from "../../utils/ocrPaginas.js";
import { CONFIG_POR_DEFECTO, estimarEnvios, fechaYHoraArgentina, planificar, puedeCorrer, validarEncolado } from "./planificador.js";
import { esTextoDeLimite, guardDeEnvio } from "./reglas.js";
import { pantallaAPdf, pdfAPantalla, reglaDe } from "../../compartido/reglasColocacionFirma.js";
import { abrirSesionDropboxSign, anotarError, guardarSesion } from "./navegador.js";
import { quienTieneDropboxSign, soltarCandadoDropboxSign, tomarCandadoDropboxSign } from "./candado.js";
import { MOTOR_DROPBOX_SIGN } from "./motor.js";
import { leerOutbox, resolverFirmante } from "./outbox.js";
import { reglasDelTenant } from "./reglasTenant.js";
import { detectarParaArchivo, guardarResumen, resumenDe } from "./colocacion.js";
export { leerOutbox, resolverFirmante };
/**
 * LA CORRIDA DE ENVÍO A LA FIRMA (patrón `arca/corridaAltas.ts`): una tanda de documentos DE LA COLA
 * pasa por el motor de pantalla de Dropbox Sign, de a uno. Vive en memoria, arranca sin esperar y la
 * UI la sigue por polling (`GET /dropbox-sign/bot/corrida`).
 *
 *  · LA COLA la arma la gente desde «Para Firmar» (`encolar`); nada se envía si no fue encolado. El
 *    PLAN lo hace `planificador.ts` (puro) con la cola y el Outbox: nunca se envía dos veces un código.
 *  · EL FIRMANTE sale de la base (`DocumentoGenerado` por código → usuario), no del nombre de archivo.
 *  · El click «Enviar para firmar» es el único irreversible: pasa por el guard de `reglas.ts` y por el
 *    modo seco, y a partir de ahí «Detener» ya no corta ese documento.
 *  · El LÍMITE antiabuso frena la tanda, deja `enfriadoHasta`, el documento queda `limite` (sigue en la
 *    cola) y el scheduler no reintenta hasta que venza.
 *  · DÓNDE VA LA FIRMA se resuelve ANTES de abrir el navegador (`compartido/reglasColocacionFirma.ts`,
 *    con las reglas del tenant): se baja el PDF, se lee su texto con posiciones (y el OCR de la franja
 *    si la regla lo pide) y se busca el ancla del tipo. Sin ancla → requiere_revision con el motivo; sin
 *    regla → requiere_revision sin abrir Chromium. No hay recetas de pantalla de respaldo: lo que se
 *    coloca es lo que muestra la previsualización (`colocacion.ts`).
 */
const BASE = "integrations.dropboxSign.bot";
const corridas = new Map();
export const corridaEnvioDe = (tenantId) => corridas.get(tenantId);
export const ocupadaPor = (tenantId) => quienTieneDropboxSign(tenantId);
/** Seco salvo que se diga lo contrario fuera de producción; en producción, real salvo que se fuerce seco. */
export function enSecoForzado() {
    const v = String(process.env.DROPBOX_SIGN_BOT_EN_SECO || "").toLowerCase();
    if (v === "true")
        return true;
    if (v === "false")
        return false;
    return process.env.NODE_ENV !== "production";
}
export function detenerCorridaEnvio(tenantId) {
    const c = corridas.get(tenantId);
    if (!c || c.terminada)
        return { ok: false, motivo: "No hay una corrida en curso." };
    c.señal.cortada = true;
    c.eventos.push({ tipo: "info", at: new Date(), texto: c.irreversible ? "Se pidió detener: se termina el documento que está enviándose y se frena ahí." : "Se pidió detener: se frena antes del próximo documento." });
    return { ok: true };
}
/** La configuración y el estado del throttle del tenant, con los defaults. */
export async function configDelTenant(tenantId) {
    const t = await Tenant.findById(tenantId).select("integrations.dropboxSign").lean();
    const ds = t?.integrations?.dropboxSign || {};
    const bot = ds.bot || {};
    const e = bot.envio || {};
    const config = {
        activo: !!e.activo,
        tamanoTanda: Number(e.tamanoTanda) || CONFIG_POR_DEFECTO.tamanoTanda,
        intervaloHoras: Number(e.intervaloHoras) || CONFIG_POR_DEFECTO.intervaloHoras,
        topeDiario: Number(e.topeDiario) || CONFIG_POR_DEFECTO.topeDiario,
        enfriamientoHoras: Number(e.enfriamientoHoras) || CONFIG_POR_DEFECTO.enfriamientoHoras,
        horaDesde: e.horaDesde ?? CONFIG_POR_DEFECTO.horaDesde,
        horaHasta: e.horaHasta ?? CONFIG_POR_DEFECTO.horaHasta,
    };
    const estado = {
        contadorDia: { fecha: bot.contadorDia?.fecha || "", enviados: Number(bot.contadorDia?.enviados) || 0 },
        enfriadoHasta: bot.enfriadoHasta ? new Date(bot.enfriadoHasta) : null,
        ultimaCorridaAt: bot.ultimaCorridaAt ? new Date(bot.ultimaCorridaAt) : null,
    };
    return { config, estado, cc: String(ds.email || "").trim(), bot };
}
const itemDe = (r) => ({ archivo: r.archivo, codigo: r.codigo, tipo: r.tipo, email: r.email, firmante: r.firmante, orden: Number(r.orden) || 0, colocacion: r.colocacion || null });
/**
 * ENCOLAR desde «Para Firmar»: cada archivo se valida (`validarEncolado`) y entra con el próximo
 * `orden`. Lo que no pasa queda `requiere_revision` con su motivo (salvo lo ya enviado o encolado,
 * que no se toca). `todosElegibles` recorre el Outbox entero.
 */
export async function encolar(tenantId, userId, pedido) {
    const { archivos: enOutbox } = await leerOutbox(tenantId);
    const { reglas } = await reglasDelTenant(tenantId);
    const setOutbox = new Set(enOutbox);
    const pedidos = pedido.todosElegibles ? enOutbox : [...new Set((pedido.archivos || []).map((a) => String(a).trim()).filter(Boolean))];
    const codigos = pedidos.map((a) => leerAnclas(a).codigo).filter(Boolean);
    const previos = new Map((await DropboxSignEnvio.find({ tenantId, codigo: { $in: codigos } }).lean()).map((r) => [r.codigo, r]));
    const ultimo = await DropboxSignEnvio.findOne({ tenantId, orden: { $ne: null } }).sort({ orden: -1 }).select("orden").lean();
    let orden = Number(ultimo?.orden) || 0;
    const tid = new Types.ObjectId(tenantId);
    const quien = userId && Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
    let encolados = 0;
    const rechazados = [];
    const porMotivo = {};
    for (const archivo of pedidos) {
        const { codigo } = leerAnclas(archivo);
        const { firmante, motivoSinFirmante } = setOutbox.has(archivo) ? await resolverFirmante(tenantId, archivo) : { firmante: null, motivoSinFirmante: undefined };
        const r = validarEncolado(archivo, { enOutbox: setOutbox.has(archivo), registroPrevio: codigo ? previos.get(codigo) || null : null, firmante, motivoSinFirmante, reglas });
        if (r.ok && r.firmante) {
            orden++;
            await DropboxSignEnvio.updateOne({ tenantId: tid, codigo: r.codigo }, { $set: { archivo, email: r.firmante.email, firmante: r.firmante.nombre, tipo: r.tipo || "", estado: "en_cola", detalle: "", orden, encoladoAt: new Date(), encoladoPor: quien, probadoEnSecoAt: null }, $setOnInsert: { tenantId: tid, codigo: r.codigo } }, { upsert: true });
            encolados++;
            continue;
        }
        rechazados.push({ archivo, motivo: r.motivo });
        porMotivo[r.motivo] = (porMotivo[r.motivo] || 0) + 1;
        // Queda registrado como «requiere revisión» para que se vea en el tab, salvo lo que ya está enviado/encolado.
        if (r.reencolable && r.codigo) {
            await DropboxSignEnvio.updateOne({ tenantId: tid, codigo: r.codigo }, { $set: { archivo, estado: "requiere_revision", detalle: r.motivo }, $setOnInsert: { tenantId: tid, codigo: r.codigo } }, { upsert: true }).catch(() => { });
        }
    }
    return { encolados, rechazados, porMotivo };
}
/** Saca de la cola. Sólo afecta `en_cola`: lo enviado, lo frenado por el límite y lo demás no se toca. */
export async function desencolar(tenantId, codigos) {
    const r = await DropboxSignEnvio.deleteMany({ tenantId, codigo: { $in: codigos }, estado: "en_cola" });
    return { quitados: r.deletedCount || 0 };
}
/** El estado de cada archivo del listado del tab: una query por lote, sin tocar Dropbox. */
export async function estadoDeArchivos(tenantId, archivos) {
    const codigoDe = new Map(archivos.map((a) => [a, leerAnclas(a).codigo]));
    const codigos = [...new Set([...codigoDe.values()].filter(Boolean))];
    const registros = new Map((await DropboxSignEnvio.find({ tenantId, codigo: { $in: codigos } }).lean()).map((r) => [r.codigo, r]));
    const enCola = await DropboxSignEnvio.find({ tenantId, estado: { $in: ["en_cola", "limite"] } }).sort({ orden: 1 }).select("codigo archivo orden").lean();
    const posicion = new Map(enCola.map((r, i) => [r.codigo, i + 1]));
    const { config, estado: throttle } = await configDelTenant(tenantId);
    const estimados = estimarEnvios(enCola.map(itemDe), config, throttle, new Date());
    const corrida = corridas.get(tenantId);
    const actual = corrida && !corrida.terminada ? corrida.actual : null;
    return archivos.map((archivo) => {
        const codigo = codigoDe.get(archivo) || "";
        const r = registros.get(codigo);
        if (!r)
            return { archivo, codigo, estado: "", detalle: "", enviadoAt: null, posicion: null, colocacion: null, estimadoAt: null };
        const estado = archivo === actual ? "enviando" : r.estado === "en_cola" && r.probadoEnSecoAt ? "seco" : r.estado;
        return { archivo, codigo, estado, detalle: r.detalle || "", enviadoAt: r.enviadoAt ? new Date(r.enviadoAt).toISOString() : null, posicion: posicion.get(codigo) ?? null, colocacion: r.colocacion || null, estimadoAt: estimados.get(codigo)?.toISOString() || null };
    });
}
/** Qué enviaría la próxima tanda: la cola contra el Outbox, planificada. No envía nada. */
export async function armarCola(tenantId, opciones = {}) {
    const { config, estado } = await configDelTenant(tenantId);
    const { outbox, archivos } = await leerOutbox(tenantId);
    const enCola = await DropboxSignEnvio.find({ tenantId, estado: { $in: ["en_cola", "limite"] } }).sort({ orden: 1 }).lean();
    const ahora = new Date();
    const items = enCola.map(itemDe);
    const estimados = estimarEnvios(items, config, estado, ahora);
    for (const it of items)
        it.estimadoAt = estimados.get(it.codigo) || null;
    const plan = planificar(items, new Set(archivos), config, estado, ahora);
    const puede = puedeCorrer(config, estado, ahora, opciones);
    return { ...plan, outbox, archivosEnOutbox: archivos.length, enCola: enCola.length, motivoNoCorre: puede.ok ? null : puede.motivo || "No se puede correr ahora." };
}
/** Arranca una corrida y vuelve en el acto. Manual (botón) respeta sólo enfriamiento y cupo. */
export async function arrancarCorridaEnvio(tenantId, opciones = {}) {
    const automatica = !!opciones.automatica;
    tomarCandadoDropboxSign(tenantId, automatica);
    try {
        const { config, estado, cc } = await configDelTenant(tenantId);
        const puede = puedeCorrer(config, estado, new Date(), { manual: !automatica });
        if (!puede.ok)
            throw Object.assign(new Error(puede.motivo || "No se puede correr ahora."), { status: 409 });
        if (!cc)
            throw Object.assign(new Error("Falta la casilla de CC (Configuración → DropboxSign → correo que recibe los avisos)."), { status: 400 });
        const enSeco = enSecoForzado() || !!opciones.enSeco;
        const corrida = { tenantId, enSeco, automatica, eventos: [], terminada: false, irreversible: false, señal: { cortada: false }, arrancadaEl: new Date(), total: 0, enviados: 0, errores: 0, limite: false, actual: null, lineas: [] };
        corridas.set(tenantId, corrida);
        await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.ultimaCorridaAt`]: corrida.arrancadaEl } });
        void correr(corrida, cc, config);
        return { enSeco };
    }
    catch (e) {
        soltarCandadoDropboxSign(tenantId);
        throw e;
    }
}
const dirTemporal = (tenantId) => path.join(os.tmpdir(), "weprodu-dropbox-sign", tenantId);
async function sumarAlContador(tenantId) {
    const { fecha } = fechaYHoraArgentina(new Date());
    const r = await Tenant.updateOne({ _id: tenantId, [`${BASE}.contadorDia.fecha`]: fecha }, { $inc: { [`${BASE}.contadorDia.enviados`]: 1 } });
    if (r.modifiedCount === 0)
        await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.contadorDia`]: { fecha, enviados: 1 } } });
}
async function actualizarRegistro(tenantId, codigo, set) {
    await DropboxSignEnvio.updateOne({ tenantId, codigo }, { $set: set }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo actualizar el registro:", e?.message || e));
}
async function correr(corrida, cc, config) {
    const { tenantId } = corrida;
    const emitir = (e) => {
        if (e.tipo === "irreversible")
            corrida.irreversible = true;
        corrida.eventos.push({ ...e, at: new Date() });
    };
    let sesion = null;
    let error = null;
    let capturaError;
    let resultado = "ok";
    const dir = dirTemporal(tenantId);
    fs.mkdirSync(dir, { recursive: true });
    try {
        emitir({ tipo: "cola", texto: "Leyendo la cola y el Outbox…" });
        const cola = await armarCola(tenantId, { manual: !corrida.automatica });
        for (const f of cola.faltantes) {
            const detalle = "El archivo ya no está en Outbox (¿se movió a Pendbox o se borró?): salió de la cola.";
            corrida.lineas.push({ archivo: f.archivo, codigo: f.codigo, email: f.email, estado: "requiere_revision", detalle });
            await actualizarRegistro(tenantId, f.codigo, { estado: "requiere_revision", detalle });
        }
        corrida.total = cola.tanda.length;
        emitir({ tipo: "cola", texto: `${cola.enCola} en la cola · ${cola.tanda.length} en esta tanda · ${cola.pendientesDespues} quedan para después · ${cola.faltantes.length} ya no están en Outbox · cupo hoy ${cola.cupoHoy}${corrida.enSeco ? " · MODO SECO: no se envía nada" : ""}` });
        if (cola.tanda.length === 0) {
            resultado = "sin_tanda";
            return;
        }
        // Resolver la colocación de cada documento ANTES de abrir el navegador (el mismo código que la
        // previsualización): los que no tienen dónde firmar salen como requiere_revision sin gastar un
        // intento de pantalla. Un solo worker de OCR para toda la tanda, sólo si algún tipo lo necesita.
        const { cfg } = await leerOutbox(tenantId);
        const { reglas } = await reglasDelTenant(tenantId);
        const resueltos = new Map();
        const worker = cola.tanda.some((c) => reglaDe(c.archivo, reglas)?.ocr) ? await abrirOcr() : null;
        try {
            for (const c of cola.tanda) {
                const rutaPdf = path.join(dir, c.archivo);
                try {
                    const d = await detectarParaArchivo(tenantId, { cfg, outbox: cola.outbox || "" }, c.archivo, reglas, { firmante: { nombre: c.firmante, email: c.email }, worker: worker || undefined });
                    await guardarResumen(tenantId, c.codigo, resumenDe(d.deteccion));
                    if (d.deteccion.ok === false) {
                        const motivo = d.deteccion.motivo;
                        corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado: "requiere_revision", detalle: motivo });
                        emitir({ tipo: "resultado", archivo: c.archivo, codigo: c.codigo, estado: "requiere_revision", texto: `requiere_revision: ${motivo}` });
                        await actualizarRegistro(tenantId, c.codigo, { estado: "requiere_revision", detalle: motivo });
                        continue;
                    }
                    fs.writeFileSync(rutaPdf, d.buffer);
                    emitir({ tipo: "info", archivo: c.archivo, texto: `Colocación: ${d.deteccion.colocacion.nota}${d.ocrMs ? ` (OCR ${d.ocrMs} ms)` : ""}` });
                    resueltos.set(c.codigo, { rutaPdf, colocacion: d.deteccion.colocacion });
                }
                catch (e) {
                    fs.rmSync(rutaPdf, { force: true });
                    const detalle = `No se pudo bajar o leer el PDF: ${e?.message || e}`;
                    corrida.errores++;
                    corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado: "error", detalle });
                    emitir({ tipo: "resultado", archivo: c.archivo, codigo: c.codigo, estado: "error", texto: `error: ${detalle}` });
                    await actualizarRegistro(tenantId, c.codigo, { estado: "error", detalle });
                }
            }
        }
        finally {
            await worker?.terminate().catch(() => { });
        }
        const tanda = cola.tanda.filter((c) => resueltos.has(c.codigo));
        if (tanda.length === 0) {
            resultado = corrida.errores > 0 ? "con_errores" : "sin_tanda";
            emitir({ tipo: "info", texto: "Ningún documento de la tanda tiene colocación de firma: no se abre el navegador." });
            return;
        }
        emitir({ tipo: "abriendo", texto: "Abriendo el navegador con la sesión de Dropbox Sign…" });
        sesion = await abrirSesionDropboxSign(tenantId);
        emitir({ tipo: "sesion", texto: sesion.seLogueo ? "Sesión iniciada con usuario y contraseña." : "Sesión guardada vigente." });
        const motor = await import(pathToFileURL(MOTOR_DROPBOX_SIGN).href);
        // Borradores que dejó un envío frenado por el límite: se informan (eliminarlos desde el menú es frágil).
        try {
            const b = await motor.revisarBorradores({ page: sesion.page, onProgreso: (t) => emitir({ tipo: "info", texto: t }) });
            if (b?.encontrados)
                emitir({ tipo: "info", texto: `Hay ${b.encontrados} borrador(es) en Dropbox Sign sin enviar: conviene eliminarlos a mano desde Documentos.` });
        }
        catch (e) {
            emitir({ tipo: "info", texto: `No se pudieron revisar los borradores: ${e?.message || e}` });
        }
        for (const c of tanda) {
            if (corrida.señal.cortada) {
                resultado = "detenida";
                emitir({ tipo: "info", texto: "Detenida antes del siguiente documento." });
                break;
            }
            // Segunda mirada al dedupe, por si otra corrida (otro proceso) lo mandó mientras se armaba la cola.
            const vigente = await DropboxSignEnvio.findOne({ tenantId, codigo: c.codigo }).select("estado").lean();
            if (!vigente || !["en_cola", "limite"].includes(vigente.estado)) {
                corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado: "salteado", detalle: vigente?.estado === "enviado" ? "Ya figuraba como enviado." : "Salió de la cola mientras se armaba la tanda." });
                continue;
            }
            corrida.actual = c.archivo;
            emitir({ tipo: "documento", archivo: c.archivo, codigo: c.codigo, texto: `${c.archivo} → ${c.firmante} (${c.email})` });
            const { rutaPdf, colocacion } = resueltos.get(c.codigo);
            let r;
            try {
                r = await motor.enviarDocumento({
                    page: sesion.page,
                    rutaPdf,
                    archivo: c.archivo,
                    firmante: { nombre: c.firmante, email: c.email },
                    cc,
                    colocacion,
                    geometria: { pdfAPantalla, pantallaAPdf },
                    enSeco: corrida.enSeco,
                    señal: corrida.señal,
                    onProgreso: (texto) => emitir({ tipo: "info", archivo: c.archivo, texto }),
                    antesDelIrreversible: () => emitir({ tipo: "irreversible", archivo: c.archivo, codigo: c.codigo, texto: "Apretando «Enviar para firmar»…" }),
                    guard: (d) => guardDeEnvio({ ...d, archivo: c.archivo, ccEsperado: cc, firmanteNombre: c.firmante, firmanteEmail: c.email, reglas }),
                    esLimite: esTextoDeLimite,
                });
            }
            catch (e) {
                r = { resultado: "error", detalle: e?.message || String(e), captura: e?.captura };
            }
            finally {
                corrida.irreversible = false;
                corrida.actual = null;
                fs.rmSync(rutaPdf, { force: true });
            }
            const estado = r?.resultado || "error";
            const detalle = String(r?.detalle || "");
            corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado, detalle });
            emitir({ tipo: estado === "limite" ? "limite" : "resultado", archivo: c.archivo, codigo: c.codigo, estado, texto: `${estado}: ${detalle}` });
            if (r?.captura && !capturaError)
                capturaError = Buffer.from(r.captura).toString("base64");
            if (estado === "enviado") {
                corrida.enviados++;
                await actualizarRegistro(tenantId, c.codigo, { estado: "enviado", detalle, enviadoAt: new Date() });
                await sumarAlContador(tenantId);
            }
            else if (estado === "limite") {
                corrida.limite = true;
                resultado = "limite";
                const hasta = new Date(Date.now() + config.enfriamientoHoras * 3600_000);
                await actualizarRegistro(tenantId, c.codigo, { estado: "limite", detalle: `${detalle} Se reintenta después del enfriamiento.` });
                await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.enfriadoHasta`]: hasta } });
                emitir({ tipo: "limite", texto: `Dropbox Sign frenó los envíos. Enfriamiento hasta ${hasta.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}. Quedó un borrador en Dropbox Sign.` });
                break;
            }
            else if (estado === "seco") {
                await actualizarRegistro(tenantId, c.codigo, { detalle, probadoEnSecoAt: new Date() });
            }
            else if (estado === "requiere_revision") {
                await actualizarRegistro(tenantId, c.codigo, { estado: "requiere_revision", detalle });
            }
            else {
                corrida.errores++;
                await actualizarRegistro(tenantId, c.codigo, { estado: "error", detalle });
            }
        }
        if (resultado === "ok" && corrida.errores > 0)
            resultado = "con_errores";
    }
    catch (e) {
        error = e?.message || String(e);
        resultado = "fallo";
        emitir({ tipo: "fallo", texto: error });
        await anotarError(tenantId, error);
    }
    finally {
        fs.rmSync(dir, { recursive: true, force: true });
        if (sesion && !error)
            await guardarSesion(tenantId, sesion.ctx).catch(() => { });
        await sesion?.browser.close().catch(() => { });
        soltarCandadoDropboxSign(tenantId);
        corrida.actual = null;
        corrida.terminada = true;
        emitir({ tipo: "fin", texto: `Fin: ${corrida.enviados} enviado(s), ${corrida.errores} error(es)${corrida.limite ? ", frenada por el límite" : ""}.` });
        const resumen = { arrancadaEl: corrida.arrancadaEl, fin: new Date(), resultado, enviados: corrida.enviados, errores: corrida.errores, limite: corrida.limite, enSeco: corrida.enSeco, total: corrida.total, automatica: corrida.automatica };
        await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.ultimaCorrida`]: resumen, ...(error ? {} : { [`${BASE}.ultimoError`]: null }) } }).catch(() => { });
        await DropboxSignEnvioLog.create({ tenantId: new Types.ObjectId(tenantId), inicio: corrida.arrancadaEl, fin: new Date(), resultado, enviados: corrida.enviados, errores: corrida.errores, limite: corrida.limite, enSeco: corrida.enSeco, automatica: corrida.automatica, lineas: corrida.lineas, error: error || undefined, capturaError }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo guardar el log:", e?.message || e));
    }
}
