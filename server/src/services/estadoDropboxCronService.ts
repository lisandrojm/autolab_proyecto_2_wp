import { Info, IInfo } from "../models/Info.js";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject, { IUserProject } from "../models/UserProject.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent, DropboxEntry } from "./dropboxService.js";
import { cargarEstadosPorEvento, aplicarTransicion } from "./estadoTransicionAutomaticaService.js";
import { normalizarCuit, parseConstanciaPdf } from "../utils/constanciaPdf.js";

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
const lastWarned = new Map<string, string>();

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
function normalizarTexto(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function logSiCambio(key: string, estadoLog: string, mensaje: string) {
  if (lastWarned.get(key) === estadoLog) return;
  lastWarned.set(key, estadoLog);
  console.warn(mensaje);
}

interface Candidato {
  up: IUserProject;
  idx: number;
  userId: string;
  palabras: string[];
  cuit: string;
  fechaAlta: string;
  fechaBaja: string;
}

/** "YYYY-MM-DD" → "YYYYMMDD". "" si no matchea ese formato (mismo criterio que `employeeDocData.ts`). */
function fechaCompacta(s?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

/**
 * Busca en el nombre de archivo un token de 11 dígitos aislado (un CUIT, con o sin guiones, sin
 * pegarse a otros dígitos alrededor — para no capturar un fragmento de un número más largo, como el
 * id de proyecto o una fecha adyacente). "" si no hay ninguno.
 */
function extraerCuitDeNombre(nombreArchivo: string): string {
  const m = /(?<!\d)(\d{2}-?\d{8}-?\d)(?!\d)/.exec(nombreArchivo);
  return m ? normalizarCuit(m[1]) : "";
}

/** Todos los tokens de 8 dígitos aislados del nombre de archivo (candidatos a `YYYYMMDD`). */
function extraerFechasDeNombre(nombreArchivo: string): string[] {
  const out: string[] = [];
  const re = /(?<!\d)(\d{8})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(nombreArchivo))) out.push(m[1]);
  return out;
}

async function scanDropboxTriggers() {
  if (isRunning) {
    console.log("[ESTADO-DROPBOX-CRON] Ya hay una corrida en curso. Se omite esta.");
    return;
  }
  isRunning = true;
  try {
    const estadosConTrigger = await cargarEstadosPorEvento("dropbox_carpeta");
    if (estadosConTrigger.length === 0) return;

    const tenants = await Tenant.find({ "integrations.dropbox.refreshTokenEnc": { $exists: true } });
    for (const tenant of tenants) {
      try {
        await scanTenant(tenant, estadosConTrigger);
      } catch (err) {
        console.error(`[ESTADO-DROPBOX-CRON] Falló el escaneo del tenant ${tenant._id}:`, err);
      }
    }
  } finally {
    isRunning = false;
  }
}

export interface ResultadoEscaneoManual {
  /** Ya había un escaneo (manual o del cron) en curso — no se disparó uno nuevo. */
  enCurso?: boolean;
  error?: "dropbox_no_conectado" | "sin_transiciones_configuradas";
  estadosEscaneados?: number;
  transicionesAplicadas?: number;
}

/**
 * Dispara un escaneo inmediato de UN tenant (botón "Forzar escaneo ahora" de la UI), sin esperar al
 * cron. Comparte el candado `isRunning` con `scanDropboxTriggers` para que nunca corran dos escaneos en
 * simultáneo, sea manual o automático.
 */
export async function escanearTenantAhora(tenantId: string): Promise<ResultadoEscaneoManual> {
  if (isRunning) return { enCurso: true };
  isRunning = true;
  try {
    const tenant = await Tenant.findById(tenantId);
    const cfg = tenant ? getTenantDropboxConfig(tenant) : null;
    if (!cfg) return { error: "dropbox_no_conectado" };

    const estadosConTrigger = await cargarEstadosPorEvento("dropbox_carpeta");
    if (estadosConTrigger.length === 0) return { error: "sin_transiciones_configuradas" };

    const transicionesAplicadas = await scanTenant(tenant, estadosConTrigger);
    return { estadosEscaneados: estadosConTrigger.length, transicionesAplicadas };
  } finally {
    isRunning = false;
  }
}

async function scanTenant(tenant: any, estadosConTrigger: IInfo[]): Promise<number> {
  const cfg = getTenantDropboxConfig(tenant);
  if (!cfg) return 0;

  let transicionesAplicadas = 0;
  for (const estadoDestino of estadosConTrigger) {
    try {
      transicionesAplicadas += await scanEstadoParaTenant(tenant, cfg, estadoDestino);
    } catch (err) {
      console.error(`[ESTADO-DROPBOX-CRON] Falló el escaneo de "${estadoDestino.name}" para el tenant ${tenant._id}:`, err);
    }
  }
  return transicionesAplicadas;
}

async function scanEstadoParaTenant(tenant: any, cfg: NonNullable<ReturnType<typeof getTenantDropboxConfig>>, estadoDestino: IInfo): Promise<number> {
  const carpetas = estadoDestino.data?.transicionAutomatica?.carpetas || [];
  const ordenDestino = estadoDestino.data?.ordenDependencia;
  if (carpetas.length === 0 || typeof ordenDestino !== "number") return 0;

  // Candidatos elegibles: contratos de ESTE tenant cuyo estado actual ocupa CUALQUIER paso anterior a
  // este (no hace falta que sea el inmediato) — si el contrato se saltó pasos intermedios (p. ej. nunca
  // se detectó el evento de un paso anterior), este evento igual certifica que ya llegó hasta acá. Los
  // contratos SIN estado asignado ("paso 0") también cuentan — es lo que permite que un evento apunte
  // directo a un estado del Paso 1 (p. ej. un impositivo detectado por carpeta de Dropbox).
  const estadosAnteriores = await Info.find({ type: ESTADO_TYPE, "data.ordenDependencia": { $lt: ordenDestino } })
    .select("data.id")
    .lean();
  const idsAnteriores = estadosAnteriores.map((e: any) => e.data?.id).filter((id: any) => typeof id === "number");

  const projects = await Project.find({ tenantId: tenant._id }).select("_id").lean();
  const projectIds = projects.map((p: any) => p._id);
  if (projectIds.length === 0) return 0;

  const userProjects = await UserProject.find({
    projectId: { $in: projectIds },
    $or: [{ "contracts.estado_id": { $in: idsAnteriores } }, { "contracts.estado_id": null }],
  });
  const candidatosBase: Candidato[] = [];
  const userIdsSet = new Set<string>();
  for (const up of userProjects) {
    up.contracts.forEach((c: any, idx: number) => {
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
  if (candidatosBase.length === 0) return 0;

  const users = await User.find({ _id: { $in: [...userIdsSet] } })
    .select("firstName lastName metadata.cuit")
    .lean();
  const nombrePorUserId = new Map(users.map((u: any) => [String(u._id), normalizarTexto(`${u.firstName || ""} ${u.lastName || ""}`)]));
  const cuitPorUserId = new Map(users.map((u: any) => [String(u._id), normalizarCuit(u.metadata?.cuit)]));
  for (const c of candidatosBase) {
    c.palabras = (nombrePorUserId.get(c.userId) || "").split(" ").filter(Boolean);
    c.cuit = cuitPorUserId.get(c.userId) || "";
  }
  // Compartido entre TODAS las carpetas de este estado: un candidato ya avanzado en una carpeta no
  // hace falta seguir buscándolo en las demás.
  let disponibles = candidatosBase.filter((c) => c.palabras.length > 0 || c.cuit);
  if (disponibles.length === 0) return 0;

  let transicionesAplicadas = 0;
  for (const { dropboxCarpeta: carpeta } of carpetas) {
    if (disponibles.length === 0) break;
    const ruta = carpeta.startsWith("/") ? carpeta : `/${carpeta}`;
    let entries: DropboxEntry[];
    try {
      ({ entries } = await listFolder(String(tenant._id), cfg, ruta));
    } catch (err) {
      console.error(`[ESTADO-DROPBOX-CRON] No se pudo listar "${ruta}" para "${estadoDestino.name}":`, err);
      continue;
    }
    const archivos = entries.filter((e) => e.tag === "file");

    for (const file of archivos) {
      const key = `${tenant._id}:${estadoDestino._id}:${file.path}`;

      // 1) CUIT en el nombre del archivo — la vía más barata y la que van a traer los documentos que
      //    genera el propio sistema (`buildDocFileName`) apenas Dropbox Sign los devuelva firmados.
      let cuitEncontrado = extraerCuitDeNombre(file.name);
      let viaCuit: "nombre" | "contenido" | null = cuitEncontrado ? "nombre" : null;

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
        } catch (err) {
          console.warn(`[ESTADO-DROPBOX-CRON] No se pudo leer el CUIT del contenido de "${file.path}":`, (err as any)?.message || err);
        }
      }

      let matches: Candidato[];
      if (cuitEncontrado) {
        matches = disponibles.filter((c) => c.cuit === cuitEncontrado);
        // Mismo CUIT en más de un candidato (p. ej. dos contratos superpuestos de la misma persona):
        // desambiguar con las fechas del nombre del archivo antes de rendirse.
        if (matches.length > 1) {
          const fechasArchivo = extraerFechasDeNombre(file.name);
          if (fechasArchivo.length > 0) {
            const porFecha = matches.filter((c) => (c.fechaAlta && fechasArchivo.includes(c.fechaAlta)) || (c.fechaBaja && fechasArchivo.includes(c.fechaBaja)));
            if (porFecha.length > 0) matches = porFecha;
          }
        }
      } else {
        // 3) Ningún CUIT disponible (ni nombre ni contenido) → fallback al matching difuso de siempre.
        const nombreArchivoNormalizado = normalizarTexto(file.name.replace(/\.[^.]+$/, ""));
        matches = disponibles.filter((c) => c.palabras.length > 0 && c.palabras.every((p) => nombreArchivoNormalizado.includes(p)));
      }

      if (matches.length !== 1) {
        logSiCambio(
          key,
          matches.length === 0 ? "sin_candidato" : `ambiguo_${matches.length}`,
          `[ESTADO-DROPBOX-CRON] ${file.path}: ${matches.length === 0 ? "sin candidato" : `ambiguo (${matches.length} candidatos)`}${cuitEncontrado ? ` (CUIT ${cuitEncontrado} vía ${viaCuit})` : ""} — se omite (destino: ${estadoDestino.name})`,
        );
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
