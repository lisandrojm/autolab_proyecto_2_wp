import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Types } from "mongoose";
import { Tenant } from "../../models/Tenant.js";
import { User } from "../../models/User.js";
import UserProject from "../../models/UserProject.js";
import { DocumentoGenerado } from "../../models/DocumentoGenerado.js";
import { DropboxSignEnvio } from "../../models/DropboxSignEnvio.js";
import { DropboxSignEnvioLog } from "../../models/DropboxSignEnvioLog.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent } from "../dropboxService.js";
import { resolverCarpetaPorProposito } from "../../utils/estadoCarpetas.js";
import { leerAnclas } from "../../utils/anclasNombre.js";
import { CONFIG_POR_DEFECTO, fechaYHoraArgentina, planificar, puedeCorrer } from "./planificador.js";
import { colocacionDe, esTextoDeLimite, guardDeEnvio, nombreDeFirmante } from "./reglas.js";
import { abrirSesionDropboxSign, anotarError, guardarSesion } from "./navegador.js";
import { quienTieneDropboxSign, soltarCandadoDropboxSign, tomarCandadoDropboxSign } from "./candado.js";
import { MOTOR_DROPBOX_SIGN } from "./motor.js";
/**
 * LA CORRIDA DE ENVÍO A LA FIRMA (patrón `arca/corridaAltas.ts`): una tanda de documentos del Outbox
 * pasa por el motor de pantalla de Dropbox Sign, de a uno. Vive en memoria, arranca sin esperar y la
 * UI la sigue por polling (`GET /dropbox-sign/bot/corrida`).
 *
 *  · El PLAN lo arma `planificador.ts` (puro) con el Outbox leído por la API de Dropbox y los envíos
 *    ya registrados (`DropboxSignEnvio`): nunca se envía dos veces el mismo código.
 *  · EL FIRMANTE sale de la base (`DocumentoGenerado` por código → usuario), no del nombre de archivo.
 *  · El click «Enviar para firmar» es el único irreversible: pasa por el guard de `reglas.ts` y por el
 *    modo seco, y a partir de ahí «Detener» ya no corta ese documento.
 *  · El LÍMITE antiabuso frena la tanda, deja `enfriadoHasta` y el scheduler no reintenta hasta que venza.
 */
const BASE = "integrations.dropboxSign.bot";
const corridas = new Map();
export const corridaEnvioDe = (tenantId) => corridas.get(tenantId);
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
/**
 * QUIÉN FIRMA, desde la base. El código del nombre («ID-000123») lleva al `DocumentoGenerado` y de ahí
 * al usuario: su email manda sobre el del nombre de archivo (caso real: el archivo decía
 * `korova-oi@hotmail.com` y la persona tiene `korova_oi@hotmail.com`), y el nombre es «PRIMER NOMBRE
 * APELLIDOS». Sin registro en la base, se busca al usuario por el email del nombre de archivo y se
 * deja constancia del respaldo.
 */
export async function resolverFirmante(tenantId, archivo, avisar) {
    const anclas = leerAnclas(archivo);
    let user = null;
    let viaRegistro = false;
    if (anclas.codigo) {
        const doc = await DocumentoGenerado.findOne({ tenantId: new Types.ObjectId(tenantId), codigo: anclas.codigo }).select("userId userProjectId").lean();
        let userId = doc?.userId || null;
        if (!userId && doc?.userProjectId)
            userId = (await UserProject.findById(doc.userProjectId).select("userId").lean())?.userId || null;
        if (userId) {
            user = await User.findOne({ _id: userId, tenantId }).select("firstName lastName email").lean();
            viaRegistro = !!user;
        }
    }
    if (!user && anclas.email) {
        user = await User.findOne({ tenantId, email: new RegExp(`^${anclas.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }).select("firstName lastName email").lean();
        if (user)
            avisar?.(`${archivo}: sin registro en la base para ${anclas.codigo || "el código"}; se tomó al usuario por el email del nombre de archivo.`);
    }
    if (!user)
        return { archivo, firmante: null, motivoSinFirmante: anclas.codigo ? `No hay usuario para el código ${anclas.codigo} ni para el email del nombre de archivo.` : "El nombre de archivo no trae código ni email reconocibles." };
    const email = String(user.email || "").trim().toLowerCase() || anclas.email;
    if (viaRegistro && anclas.email && email !== anclas.email)
        avisar?.(`${archivo}: el email del nombre de archivo (${anclas.email}) difiere del de la base (${email}); se usa el de la base.`);
    const nombre = nombreDeFirmante(user);
    if (!nombre || !email)
        return { archivo, firmante: null, motivoSinFirmante: "El usuario no tiene nombre o email cargados." };
    return { archivo, firmante: { nombre, email } };
}
/** Qué enviaría la próxima tanda: lee el Outbox, resuelve firmantes y planifica. */
export async function armarCola(tenantId, opciones = {}) {
    const { config, estado } = await configDelTenant(tenantId);
    const tenant = await Tenant.findById(tenantId).lean();
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        throw new Error("Dropbox no está conectado para esta organización.");
    const outbox = await resolverCarpetaPorProposito("outbox");
    if (!outbox)
        throw new Error('No hay ninguna carpeta de Dropbox configurada como "Outbox".');
    const { entries } = await listFolder(tenantId, cfg, outbox);
    const archivos = entries.filter((e) => e.tag === "file" && /\.pdf$/i.test(e.name));
    const avisos = [];
    const resueltos = [];
    for (const a of archivos)
        resueltos.push(await resolverFirmante(tenantId, a.name, (t) => avisos.push(t)));
    const enviados = await DropboxSignEnvio.find({ tenantId, estado: "enviado" }).select("codigo").lean();
    const ahora = new Date();
    const plan = planificar(resueltos, new Set(enviados.map((e) => e.codigo)), config, estado, ahora);
    const puede = puedeCorrer(config, estado, ahora, opciones);
    return { ...plan, outbox, archivosEnOutbox: archivos.length, avisos, motivoNoCorre: puede.ok ? null : puede.motivo || "No se puede correr ahora." };
}
/** Arranca una corrida y vuelve en el acto. `manual` = botón de la UI (respeta sólo enfriamiento y cupo). */
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
        const corrida = { tenantId, enSeco, automatica, eventos: [], terminada: false, irreversible: false, señal: { cortada: false }, arrancadaEl: new Date(), total: 0, enviados: 0, errores: 0, limite: false, lineas: [] };
        corridas.set(tenantId, corrida);
        await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.ultimaCorridaAt`]: corrida.arrancadaEl } });
        void correr(corrida, cc, config);
        return { total: 0, enSeco };
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
async function registrarEnvio(tenantId, c, estado, detalle) {
    await DropboxSignEnvio.updateOne({ tenantId, codigo: c.codigo }, { $set: { archivo: c.archivo, email: c.email, firmante: c.firmante, tipo: c.tipo, estado, detalle, ...(estado === "enviado" ? { enviadoAt: new Date() } : {}) }, $setOnInsert: { tenantId: new Types.ObjectId(tenantId), codigo: c.codigo } }, { upsert: true }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo registrar el envío:", e?.message || e));
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
        emitir({ tipo: "cola", texto: "Leyendo el Outbox y armando la tanda…" });
        const cola = await armarCola(tenantId, { manual: !corrida.automatica });
        for (const a of cola.avisos)
            emitir({ tipo: "info", texto: a });
        for (const r of cola.requiereRevision) {
            corrida.lineas.push({ archivo: r.archivo, codigo: r.codigo, email: "", estado: "requiere_revision", detalle: r.motivo });
            if (r.codigo)
                await DropboxSignEnvio.updateOne({ tenantId, codigo: r.codigo, estado: { $ne: "enviado" } }, { $set: { archivo: r.archivo, estado: "requiere_revision", detalle: r.motivo }, $setOnInsert: { tenantId: new Types.ObjectId(tenantId), codigo: r.codigo } }, { upsert: true }).catch(() => { });
        }
        corrida.total = cola.tanda.length;
        emitir({ tipo: "cola", texto: `${cola.archivosEnOutbox} archivo(s) en Outbox · ${cola.tanda.length} en esta tanda · ${cola.requiereRevision.length} requieren revisión · ${cola.yaEnviados.length} ya enviados · ${cola.pendientesDespues} quedan para después${corrida.enSeco ? " · MODO SECO: no se envía nada" : ""}` });
        if (cola.tanda.length === 0) {
            resultado = "sin_tanda";
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
        const tenant = await Tenant.findById(tenantId).lean();
        const cfg = getTenantDropboxConfig(tenant);
        for (const c of cola.tanda) {
            if (corrida.señal.cortada) {
                resultado = "detenida";
                emitir({ tipo: "info", texto: "Detenida antes del siguiente documento." });
                break;
            }
            // Segunda mirada al dedupe, por si otra corrida (otro proceso) lo mandó mientras se armaba la cola.
            const ya = await DropboxSignEnvio.findOne({ tenantId, codigo: c.codigo, estado: "enviado" }).select("_id").lean();
            if (ya) {
                corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado: "salteado", detalle: "Ya figuraba como enviado." });
                continue;
            }
            emitir({ tipo: "documento", archivo: c.archivo, codigo: c.codigo, texto: `${c.archivo} → ${c.firmante} (${c.email})` });
            const rutaPdf = path.join(dir, c.archivo);
            let r;
            try {
                fs.writeFileSync(rutaPdf, await downloadFileContent(tenantId, cfg, `${cola.outbox.replace(/\/$/, "")}/${c.archivo}`));
                r = await motor.enviarDocumento({
                    page: sesion.page,
                    rutaPdf,
                    archivo: c.archivo,
                    firmante: { nombre: c.firmante, email: c.email },
                    cc,
                    colocacion: colocacionDe(c.archivo),
                    enSeco: corrida.enSeco,
                    señal: corrida.señal,
                    onProgreso: (texto) => emitir({ tipo: "info", archivo: c.archivo, texto }),
                    antesDelIrreversible: () => emitir({ tipo: "irreversible", archivo: c.archivo, codigo: c.codigo, texto: "Apretando «Enviar para firmar»…" }),
                    guard: (d) => guardDeEnvio({ ...d, archivo: c.archivo, ccEsperado: cc, firmanteNombre: c.firmante, firmanteEmail: c.email }),
                    esLimite: esTextoDeLimite,
                });
            }
            catch (e) {
                r = { resultado: "error", detalle: e?.message || String(e), captura: e?.captura };
            }
            finally {
                corrida.irreversible = false;
                fs.rmSync(rutaPdf, { force: true });
            }
            const estado = r?.resultado || "error";
            const detalle = String(r?.detalle || "");
            corrida.lineas.push({ archivo: c.archivo, codigo: c.codigo, email: c.email, estado: estado === "seco" ? "seco" : estado, detalle });
            emitir({ tipo: estado === "limite" ? "limite" : "resultado", archivo: c.archivo, codigo: c.codigo, estado, texto: `${estado}: ${detalle}` });
            if (r?.captura && !capturaError)
                capturaError = Buffer.from(r.captura).toString("base64");
            if (estado === "enviado") {
                corrida.enviados++;
                await registrarEnvio(tenantId, c, "enviado", detalle);
                await sumarAlContador(tenantId);
            }
            else if (estado === "limite") {
                corrida.limite = true;
                resultado = "limite";
                await registrarEnvio(tenantId, c, "limite", detalle);
                const hasta = new Date(Date.now() + config.enfriamientoHoras * 3600_000);
                await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.enfriadoHasta`]: hasta } });
                emitir({ tipo: "limite", texto: `Dropbox Sign frenó los envíos. Enfriamiento hasta ${hasta.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}. Quedó un borrador en Dropbox Sign.` });
                break;
            }
            else if (estado === "requiere_revision") {
                await registrarEnvio(tenantId, c, "requiere_revision", detalle);
            }
            else if (estado === "seco") {
                /* nada que registrar: no se envió */
            }
            else {
                corrida.errores++;
                await registrarEnvio(tenantId, c, "error", detalle);
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
        if (sesion && !error)
            await guardarSesion(tenantId, sesion.ctx).catch(() => { });
        await sesion?.browser.close().catch(() => { });
        soltarCandadoDropboxSign(tenantId);
        corrida.terminada = true;
        emitir({ tipo: "fin", texto: `Fin: ${corrida.enviados} enviado(s), ${corrida.errores} error(es)${corrida.limite ? ", frenada por el límite" : ""}.` });
        const resumen = { arrancadaEl: corrida.arrancadaEl, fin: new Date(), resultado, enviados: corrida.enviados, errores: corrida.errores, limite: corrida.limite, enSeco: corrida.enSeco, total: corrida.total, automatica: corrida.automatica };
        await Tenant.updateOne({ _id: tenantId }, { $set: { [`${BASE}.ultimaCorrida`]: resumen, ...(error ? {} : { [`${BASE}.ultimoError`]: null }) } }).catch(() => { });
        await DropboxSignEnvioLog.create({ tenantId: new Types.ObjectId(tenantId), inicio: corrida.arrancadaEl, fin: new Date(), resultado, enviados: corrida.enviados, errores: corrida.errores, limite: corrida.limite, enSeco: corrida.enSeco, automatica: corrida.automatica, lineas: corrida.lineas, error: error || undefined, capturaError }).catch((e) => console.warn("[DROPBOX-SIGN-BOT] No se pudo guardar el log:", e?.message || e));
    }
}
export const ocupadaPor = (tenantId) => quienTieneDropboxSign(tenantId);
