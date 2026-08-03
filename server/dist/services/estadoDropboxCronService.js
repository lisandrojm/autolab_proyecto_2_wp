import { Info } from "../models/Info.js";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { getTenantDropboxConfig, listFolder } from "./dropboxService.js";
import { cargarEstadosPorEvento, aplicarTransicion } from "./estadoTransicionAutomaticaService.js";
/**
 * Job periódico: revisa, para cada Estado con transición automática "dropbox_carpeta", si aparecieron
 * archivos nuevos en la carpeta de Dropbox configurada, y si matchean (por nombre) a un contrato que
 * está esperando ese paso, lo avanza. No hay webhooks de Dropbox en la app, así que esto se resuelve
 * por polling (mismo patrón que `cronService.ts`).
 */
const ESTADO_TYPE = "estado-empleado";
const INTERVAL_MS = 20 * 60 * 1000; // 20 min: no es tiempo-crítico, alcanza sobrado.
let isRunning = false;
// De-dupe de warnings: no repetir el mismo log en cada corrida mientras el archivo siga sin poder
// asignarse (se resetea si el server reinicia — aceptable para un log de diagnóstico).
const lastWarned = new Map();
export const initEstadoDropboxScheduler = () => {
    console.log("[ESTADO-DROPBOX-CRON] Initializing scheduler...");
    setTimeout(() => {
        scanDropboxTriggers().catch((err) => console.error("[ESTADO-DROPBOX-CRON] Initial scan error:", err));
    }, 10 * 1000);
    setInterval(() => {
        scanDropboxTriggers().catch((err) => console.error("[ESTADO-DROPBOX-CRON] Interval scan error:", err));
    }, INTERVAL_MS);
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
async function scanDropboxTriggers() {
    if (isRunning) {
        console.log("[ESTADO-DROPBOX-CRON] Ya hay una corrida en curso. Se omite esta.");
        return;
    }
    isRunning = true;
    try {
        const estadosConTrigger = await cargarEstadosPorEvento("dropbox_carpeta");
        if (estadosConTrigger.length === 0)
            return;
        const tenants = await Tenant.find({ "integrations.dropbox.refreshTokenEnc": { $exists: true } });
        for (const tenant of tenants) {
            try {
                await scanTenant(tenant, estadosConTrigger);
            }
            catch (err) {
                console.error(`[ESTADO-DROPBOX-CRON] Falló el escaneo del tenant ${tenant._id}:`, err);
            }
        }
    }
    finally {
        isRunning = false;
    }
}
async function scanTenant(tenant, estadosConTrigger) {
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        return;
    for (const estadoDestino of estadosConTrigger) {
        try {
            await scanEstadoParaTenant(tenant, cfg, estadoDestino);
        }
        catch (err) {
            console.error(`[ESTADO-DROPBOX-CRON] Falló el escaneo de "${estadoDestino.name}" para el tenant ${tenant._id}:`, err);
        }
    }
}
async function scanEstadoParaTenant(tenant, cfg, estadoDestino) {
    const carpetas = estadoDestino.data?.transicionAutomatica?.carpetas || [];
    const ordenDestino = estadoDestino.data?.ordenDependencia;
    if (carpetas.length === 0 || typeof ordenDestino !== "number")
        return;
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
        return;
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
                candidatosBase.push({ up, idx, userId: String(up.userId), palabras: [] });
            }
        });
    }
    if (candidatosBase.length === 0)
        return;
    const users = await User.find({ _id: { $in: [...userIdsSet] } })
        .select("firstName lastName")
        .lean();
    const nombrePorUserId = new Map(users.map((u) => [String(u._id), normalizarTexto(`${u.firstName || ""} ${u.lastName || ""}`)]));
    for (const c of candidatosBase) {
        c.palabras = (nombrePorUserId.get(c.userId) || "").split(" ").filter(Boolean);
    }
    // Compartido entre TODAS las carpetas de este estado: un candidato ya avanzado en una carpeta no
    // hace falta seguir buscándolo en las demás.
    let disponibles = candidatosBase.filter((c) => c.palabras.length > 0);
    if (disponibles.length === 0)
        return;
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
        for (const file of archivos) {
            const nombreArchivoNormalizado = normalizarTexto(file.name.replace(/\.[^.]+$/, ""));
            const matches = disponibles.filter((c) => c.palabras.every((p) => nombreArchivoNormalizado.includes(p)));
            const key = `${tenant._id}:${estadoDestino._id}:${file.path}`;
            if (matches.length !== 1) {
                logSiCambio(key, matches.length === 0 ? "sin_candidato" : `ambiguo_${matches.length}`, `[ESTADO-DROPBOX-CRON] ${file.path}: ${matches.length === 0 ? "sin candidato" : `ambiguo (${matches.length} candidatos)`} — se omite (destino: ${estadoDestino.name})`);
                continue;
            }
            const candidato = matches[0];
            disponibles = disponibles.filter((c) => c !== candidato);
            const resultado = await aplicarTransicion(candidato.up, candidato.idx, estadoDestino);
            if (resultado.aplicada) {
                lastWarned.delete(key);
                console.log(`[ESTADO-DROPBOX-CRON] ${candidato.userId}: ${resultado.estadoAnteriorId} → ${estadoDestino.name} (archivo: ${file.name}, carpeta: ${ruta})`);
            }
        }
    }
}
