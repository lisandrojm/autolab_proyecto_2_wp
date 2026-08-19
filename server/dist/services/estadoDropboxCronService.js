import { Info } from "../models/Info.js";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent } from "./dropboxService.js";
import { cargarEstadosPorEvento, aplicarTransicion } from "./estadoTransicionAutomaticaService.js";
import { normalizarCuit, parseConstanciaPdf } from "../utils/constanciaPdf.js";
/**
 * Job periódico: revisa, para cada Estado con transición automática "dropbox_carpeta", si aparecieron
 * archivos nuevos en la carpeta de Dropbox configurada, y si matchean a un contrato que está esperando
 * ese paso, lo avanza. No hay webhooks de Dropbox en la app, así que esto se resuelve por polling.
 *
 * El intervalo de escaneo es configurable POR TENANT (`tenant.integrations.dropbox.scanIntervalMinutes`,
 * default 20 min) — por eso el scheduler despierta cada TICK_MS (mucho más seguido que el intervalo
 * mínimo posible) y, en cada tick, decide para CADA tenant si ya le toca escanear de nuevo, en vez de un
 * único `setInterval` fijo para todos.
 */
const ESTADO_TYPE = "estado-empleado";
const TICK_MS = 60 * 1000; // cada cuánto se FIJA si a algún tenant ya le toca (no es el intervalo real de escaneo)
const LOCK_STALE_MS = 5 * 60 * 1000; // si el candado de un tenant lleva más de esto tomado, se considera trabado
export const DEFAULT_INTERVAL_MINUTES = 20;
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 24 * 60; // 1 día
// Candado POR TENANT (no global): un tenant lento no debe bloquear el escaneo/botón manual de otro.
// Guarda CUÁNDO se tomó (no solo un booleano) para poder auto-liberarlo si algo lo deja trabado — p. ej.
// una llamada a Dropbox que se cuelga sin timeout.
const runningSince = new Map();
function tomarCandado(tenantId) {
    const since = runningSince.get(tenantId);
    if (since !== undefined && Date.now() - since < LOCK_STALE_MS)
        return false;
    runningSince.set(tenantId, Date.now());
    return true;
}
function liberarCandado(tenantId) {
    runningSince.delete(tenantId);
}
// Último escaneo (manual o automático) INICIADO por tenant — en memoria, se resetea si el server
// reinicia (aceptable: en el peor caso, el tenant escanea de nuevo apenas arranca el server).
const lastScanAt = new Map();
function intervalMinutesDe(tenant) {
    const raw = Number(tenant?.integrations?.dropbox?.scanIntervalMinutes);
    if (!Number.isFinite(raw) || raw <= 0)
        return DEFAULT_INTERVAL_MINUTES;
    return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(raw)));
}
function leTocaEscanear(tenant) {
    const ultimo = lastScanAt.get(String(tenant._id));
    if (ultimo === undefined)
        return true;
    return Date.now() - ultimo >= intervalMinutesDe(tenant) * 60_000;
}
// De-dupe de warnings: no repetir el mismo log en cada corrida mientras el archivo siga sin poder
// asignarse (se resetea si el server reinicia — aceptable para un log de diagnóstico).
const lastWarned = new Map();
export const initEstadoDropboxScheduler = () => {
    console.log("[ESTADO-DROPBOX-CRON] Initializing scheduler...");
    setTimeout(() => {
        tick().catch((err) => console.error("[ESTADO-DROPBOX-CRON] Initial tick error:", err));
    }, 10 * 1000);
    setInterval(() => {
        tick().catch((err) => console.error("[ESTADO-DROPBOX-CRON] Interval tick error:", err));
    }, TICK_MS);
};
/** minúsculas, sin acentos, solo alfanumérico/espacios — para comparar nombres sin depender del formato exacto. */
function normalizarTexto(s) {
    return (s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function logSiCambio(key, estadoLog, mensaje) {
    if (lastWarned.get(key) === estadoLog)
        return;
    lastWarned.set(key, estadoLog);
    console.warn(mensaje);
}
/** "YYYY-MM-DD" → "YYYYMMDD". "" si no matchea ese formato (mismo criterio que `employeeDocData.ts`). */
function fechaCompacta(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
    return m ? `${m[1]}${m[2]}${m[3]}` : "";
}
/**
 * Busca en el nombre de archivo un token de 11 dígitos aislado (un CUIT, con o sin guiones, sin
 * pegarse a otros dígitos alrededor — para no capturar un fragmento de un número más largo, como el
 * id de proyecto o una fecha adyacente). "" si no hay ninguno.
 */
function extraerCuitDeNombre(nombreArchivo) {
    const m = /(?<!\d)(\d{2}-?\d{8}-?\d)(?!\d)/.exec(nombreArchivo);
    return m ? normalizarCuit(m[1]) : "";
}
/**
 * Todos los tokens de 8 dígitos aislados del nombre de archivo (candidatos a `YYYYMMDD`).
 * Se excluyen los que vienen etiquetados como número de documento (`DNI-23232274` y variantes, ver
 * `buildIdentidadTag` en employeeDocData.ts): un DNI de 8 dígitos puede parecer una fecha válida
 * (ej. 20010115 → 2001-01-15) y desempataría contra el contrato equivocado.
 */
function extraerFechasDeNombre(nombreArchivo) {
    const out = [];
    const re = /(?<!\d)(?<!(?:DNI|CI|LE|LC|PAS|DOC)-)(\d{8})(?!\d)/g;
    let m;
    while ((m = re.exec(nombreArchivo)))
        out.push(m[1]);
    return out;
}
/** El tick del scheduler: por cada tenant conectado a Dropbox, escanea SOLO si ya le toca según su
 *  propio intervalo configurado. */
async function tick() {
    const estadosConTrigger = await cargarEstadosPorEvento("dropbox_carpeta");
    if (estadosConTrigger.length === 0)
        return;
    const tenants = await Tenant.find({ "integrations.dropbox.refreshTokenEnc": { $exists: true } });
    for (const tenant of tenants) {
        const tenantId = String(tenant._id);
        if (!leTocaEscanear(tenant))
            continue;
        if (!tomarCandado(tenantId))
            continue; // ya hay un escaneo (manual o de este mismo tick) en curso
        lastScanAt.set(tenantId, Date.now());
        try {
            await scanTenant(tenant, estadosConTrigger);
        }
        catch (err) {
            console.error(`[ESTADO-DROPBOX-CRON] Falló el escaneo del tenant ${tenantId}:`, err);
        }
        finally {
            liberarCandado(tenantId);
        }
    }
}
/**
 * Dispara un escaneo inmediato de UN tenant (botón "Forzar escaneo ahora" de la UI), sin esperar a que
 * le toque el turno según su intervalo configurado. Actualiza `lastScanAt` igual que un escaneo
 * automático, así el conteo regresivo del próximo escaneo se reinicia desde acá.
 */
export async function escanearTenantAhora(tenantId) {
    if (!tomarCandado(tenantId))
        return { enCurso: true };
    try {
        const tenant = await Tenant.findById(tenantId);
        const cfg = tenant ? getTenantDropboxConfig(tenant) : null;
        if (!cfg)
            return { error: "dropbox_no_conectado" };
        const estadosConTrigger = await cargarEstadosPorEvento("dropbox_carpeta");
        if (estadosConTrigger.length === 0)
            return { error: "sin_transiciones_configuradas" };
        lastScanAt.set(tenantId, Date.now());
        const transicionesAplicadas = await scanTenant(tenant, estadosConTrigger);
        return { estadosEscaneados: estadosConTrigger.length, transicionesAplicadas };
    }
    finally {
        liberarCandado(tenantId);
    }
}
/** Config + estado actual del escaneo automático de un tenant, para mostrar en la UI (intervalo, cuenta
 *  regresiva al próximo escaneo). */
export async function getEscaneoConfig(tenantId) {
    const tenant = await Tenant.findById(tenantId).select("integrations.dropbox.scanIntervalMinutes").lean();
    const intervalMinutos = intervalMinutesDe(tenant);
    const ultimoEscaneoAt = lastScanAt.get(tenantId) ?? null;
    const proximoEscaneoAt = ultimoEscaneoAt !== null ? ultimoEscaneoAt + intervalMinutos * 60_000 : null;
    return { intervalMinutos, ultimoEscaneoAt, proximoEscaneoAt };
}
/** Cambia el intervalo de escaneo de un tenant (minutos, acotado a [MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES]). */
export async function setEscaneoIntervalo(tenantId, minutos) {
    const clamped = Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(minutos)));
    await Tenant.updateOne({ _id: tenantId }, { $set: { "integrations.dropbox.scanIntervalMinutes": clamped } });
    return getEscaneoConfig(tenantId);
}
async function scanTenant(tenant, estadosConTrigger) {
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        return 0;
    let transicionesAplicadas = 0;
    for (const estadoDestino of estadosConTrigger) {
        try {
            transicionesAplicadas += await scanEstadoParaTenant(tenant, cfg, estadoDestino);
        }
        catch (err) {
            console.error(`[ESTADO-DROPBOX-CRON] Falló el escaneo de "${estadoDestino.name}" para el tenant ${tenant._id}:`, err);
        }
    }
    return transicionesAplicadas;
}
async function scanEstadoParaTenant(tenant, cfg, estadoDestino) {
    const carpetas = estadoDestino.data?.transicionAutomatica?.carpetas || [];
    const ordenDestino = estadoDestino.data?.ordenDependencia;
    if (carpetas.length === 0 || typeof ordenDestino !== "number")
        return 0;
    // Candidatos elegibles: contratos de ESTE tenant cuyo estado actual ocupa CUALQUIER paso anterior a
    // este (no hace falta que sea el inmediato) — si el contrato se saltó pasos intermedios (p. ej. nunca
    // se detectó el evento de un paso anterior), este evento igual certifica que ya llegó hasta acá. Los
    // contratos SIN estado asignado ("paso 0") también cuentan — es lo que permite que un evento apunte
    // directo a un estado del Paso 1 (p. ej. un impositivo detectado por carpeta de Dropbox).
    const estadosAnteriores = await Info.find({ type: ESTADO_TYPE, "data.ordenDependencia": { $lt: ordenDestino } })
        .select("data.id")
        .lean();
    const idsAnteriores = estadosAnteriores.map((e) => e.data?.id).filter((id) => typeof id === "number");
    const projects = await Project.find({ tenantId: tenant._id }).select("_id").lean();
    const projectIds = projects.map((p) => p._id);
    if (projectIds.length === 0)
        return 0;
    const userProjects = await UserProject.find({
        projectId: { $in: projectIds },
        $or: [{ "contracts.estado_id": { $in: idsAnteriores } }, { "contracts.estado_id": null }],
    });
    const candidatosBase = [];
    const userIdsSet = new Set();
    for (const up of userProjects) {
        up.contracts.forEach((c, idx) => {
            const sinEstado = c.estado_id === null || c.estado_id === undefined;
            if (sinEstado || idsAnteriores.includes(c.estado_id)) {
                userIdsSet.add(String(up.userId));
                candidatosBase.push({
                    up,
                    idx,
                    userId: String(up.userId),
                    palabras: [],
                    cuit: "",
                    fechaAlta: fechaCompacta(c.fecha_alta_contrato),
                    fechaBaja: fechaCompacta(c.fecha_baja_contrato),
                });
            }
        });
    }
    if (candidatosBase.length === 0)
        return 0;
    const users = await User.find({ _id: { $in: [...userIdsSet] } })
        .select("firstName lastName metadata.cuit")
        .lean();
    const nombrePorUserId = new Map(users.map((u) => [String(u._id), normalizarTexto(`${u.firstName || ""} ${u.lastName || ""}`)]));
    const cuitPorUserId = new Map(users.map((u) => [String(u._id), normalizarCuit(u.metadata?.cuit)]));
    for (const c of candidatosBase) {
        c.palabras = (nombrePorUserId.get(c.userId) || "").split(" ").filter(Boolean);
        c.cuit = cuitPorUserId.get(c.userId) || "";
    }
    // Compartido entre TODAS las carpetas de este estado: un candidato ya avanzado en una carpeta no
    // hace falta seguir buscándolo en las demás.
    let disponibles = candidatosBase.filter((c) => c.palabras.length > 0 || c.cuit);
    if (disponibles.length === 0)
        return 0;
    let transicionesAplicadas = 0;
    for (const { dropboxCarpeta: carpeta } of carpetas) {
        if (disponibles.length === 0)
            break;
        const ruta = carpeta.startsWith("/") ? carpeta : `/${carpeta}`;
        let entries;
        try {
            ({ entries } = await listFolder(String(tenant._id), cfg, ruta));
        }
        catch (err) {
            console.error(`[ESTADO-DROPBOX-CRON] No se pudo listar "${ruta}" para "${estadoDestino.name}":`, err);
            continue;
        }
        const archivos = entries.filter((e) => e.tag === "file");
        // Resolución del CUIT de cada archivo (nombre, y si hace falta contenido del PDF) EN PARALELO: es la
        // parte lenta (baja y parsea PDFs enteros), y no toca `disponibles` — sacarla del loop secuencial de
        // abajo evita que un escaneo con varios archivos sin CUIT en el nombre tarde la suma de todos ellos
        // (riesgo real de superar el timeout del botón "Forzar escaneo ahora").
        const cuitPorArchivo = new Map();
        await Promise.all(archivos.map(async (file) => {
            // 1) CUIT en el nombre del archivo — la vía más barata y la que van a traer los documentos que
            //    genera el propio sistema (`buildDocFileName`) apenas Dropbox Sign los devuelva firmados.
            let cuitEncontrado = extraerCuitDeNombre(file.name);
            let viaCuit = cuitEncontrado ? "nombre" : null;
            // 2) Si el nombre no trae CUIT, intentar leerlo del contenido del PDF (documentos de AFIP que
            //    el usuario sube a mano y que no siguen la convención de nombre, pero sí traen el CUIT como
            //    texto — mismo parser que ya usa la carga masiva de constancias).
            if (!cuitEncontrado && /\.pdf$/i.test(file.name)) {
                try {
                    const buffer = await downloadFileContent(String(tenant._id), cfg, file.path);
                    const datos = await parseConstanciaPdf(buffer);
                    if (datos.cuit) {
                        cuitEncontrado = datos.cuit;
                        viaCuit = "contenido";
                    }
                }
                catch (err) {
                    console.warn(`[ESTADO-DROPBOX-CRON] No se pudo leer el CUIT del contenido de "${file.path}":`, err?.message || err);
                }
            }
            cuitPorArchivo.set(file.path, { cuit: cuitEncontrado, via: viaCuit });
        }));
        for (const file of archivos) {
            const key = `${tenant._id}:${estadoDestino._id}:${file.path}`;
            const { cuit: cuitEncontrado, via: viaCuit } = cuitPorArchivo.get(file.path) || { cuit: "", via: null };
            let matches;
            if (cuitEncontrado) {
                matches = disponibles.filter((c) => c.cuit === cuitEncontrado);
                // Mismo CUIT en más de un candidato (p. ej. dos contratos superpuestos de la misma persona):
                // desambiguar con las fechas del nombre del archivo antes de rendirse.
                if (matches.length > 1) {
                    const fechasArchivo = extraerFechasDeNombre(file.name);
                    if (fechasArchivo.length > 0) {
                        const porFecha = matches.filter((c) => (c.fechaAlta && fechasArchivo.includes(c.fechaAlta)) || (c.fechaBaja && fechasArchivo.includes(c.fechaBaja)));
                        if (porFecha.length > 0)
                            matches = porFecha;
                    }
                }
            }
            else {
                // 3) Ningún CUIT disponible (ni nombre ni contenido) → fallback al matching difuso de siempre.
                const nombreArchivoNormalizado = normalizarTexto(file.name.replace(/\.[^.]+$/, ""));
                matches = disponibles.filter((c) => c.palabras.length > 0 && c.palabras.every((p) => nombreArchivoNormalizado.includes(p)));
            }
            if (matches.length !== 1) {
                logSiCambio(key, matches.length === 0 ? "sin_candidato" : `ambiguo_${matches.length}`, `[ESTADO-DROPBOX-CRON] ${file.path}: ${matches.length === 0 ? "sin candidato" : `ambiguo (${matches.length} candidatos)`}${cuitEncontrado ? ` (CUIT ${cuitEncontrado} vía ${viaCuit})` : ""} — se omite (destino: ${estadoDestino.name})`);
                continue;
            }
            const candidato = matches[0];
            disponibles = disponibles.filter((c) => c !== candidato);
            const resultado = await aplicarTransicion(candidato.up, candidato.idx, estadoDestino);
            if (resultado.aplicada) {
                lastWarned.delete(key);
                transicionesAplicadas++;
                console.log(`[ESTADO-DROPBOX-CRON] ${candidato.userId}: ${resultado.estadoAnteriorId} → ${estadoDestino.name} (archivo: ${file.name}, carpeta: ${ruta}${cuitEncontrado ? `, CUIT vía ${viaCuit}` : ", por nombre"})`);
            }
        }
    }
    return transicionesAplicadas;
}
