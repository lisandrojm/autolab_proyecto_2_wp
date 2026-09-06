import { Info, IInfo } from "../models/Info.js";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject, { IUserProject } from "../models/UserProject.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent, verifyAccount, DropboxEntry } from "./dropboxService.js";
import { cargarEstadosPorEvento, aplicarTransicion } from "./estadoTransicionAutomaticaService.js";
import { normalizarCuit, parseConstanciaPdf } from "../utils/constanciaPdf.js";
import { leerAnclas, normalizarEmail } from "../utils/anclasNombre.js";

/**
 * Job periódico: revisa, para cada Estado con transición automática "dropbox_carpeta", si aparecieron
 * archivos nuevos en la carpeta de Dropbox configurada, y si matchean a un contrato que está esperando
 * ese paso, lo avanza.
 *
 * ESTE RELOJ NO ES EL ÚNICO DISPARADOR, y sigue haciendo falta igual. Dropbox avisa por webhook
 * cuando algo cambia (`dropboxWebhookService.ts`), y ese aviso baja la espera de minutos a segundos.
 * Pero la entrega es «al menos una vez» y sin reintentos eternos: una notificación que llega mientras
 * el servidor se reinicia se pierde y nadie la reclama. El polling es la red que recoge eso, y por eso
 * ninguno de los dos reemplaza al otro.
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
const runningSince = new Map<string, number>();

function tomarCandado(tenantId: string): boolean {
  const since = runningSince.get(tenantId);
  if (since !== undefined && Date.now() - since < LOCK_STALE_MS) return false;
  runningSince.set(tenantId, Date.now());
  return true;
}

function liberarCandado(tenantId: string): void {
  runningSince.delete(tenantId);
}

// Último escaneo (manual o automático) INICIADO por tenant — en memoria, se resetea si el server
// reinicia (aceptable: en el peor caso, el tenant escanea de nuevo apenas arranca el server).
const lastScanAt = new Map<string, number>();

function intervalMinutesDe(tenant: any): number {
  const raw = Number(tenant?.integrations?.dropbox?.scanIntervalMinutes);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_INTERVAL_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(raw)));
}

function leTocaEscanear(tenant: any): boolean {
  const ultimo = lastScanAt.get(String(tenant._id));
  if (ultimo === undefined) return true;
  return Date.now() - ultimo >= intervalMinutesDe(tenant) * 60_000;
}

// De-dupe de warnings: no repetir el mismo log en cada corrida mientras el archivo siga sin poder
// asignarse (se resetea si el server reinicia — aceptable para un log de diagnóstico).
const lastWarned = new Map<string, string>();

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
  /** Normalizado con `normalizarEmail`: se compara contra el que trae el nombre del archivo. */
  email: string;
  fechaAlta: string;
  fechaBaja: string;
}

/** "YYYY-MM-DD" → "YYYYMMDD". "" si no matchea ese formato (mismo criterio que `employeeDocData.ts`). */
function fechaCompacta(s?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : "";
}

/**
 * El CUIT y las fechas que trae el nombre del archivo — los campos que la nomenclatura marca como
 * obligatorios justamente para esto.
 *
 * Las expresiones viven en `utils/anclasNombre.ts`, compartidas con el circuito de correo de Dropbox
 * Sign. Antes cada servicio tenía su copia, y eso hacía que un cambio en el patrón por defecto
 * arreglara un lado y dejara al otro leyendo un formato que ya no se emite.
 */
function extraerCuitDeNombre(nombreArchivo: string): string {
  return leerAnclas(nombreArchivo).cuit;
}

function extraerFechasDeNombre(nombreArchivo: string): string[] {
  return leerAnclas(nombreArchivo).fechas;
}

/** El tick del scheduler: por cada tenant conectado a Dropbox, escanea SOLO si ya le toca según su
 *  propio intervalo configurado. */
async function tick() {
  const estadosConTrigger = await cargarEstadosPorEvento("dropbox_carpeta");
  if (estadosConTrigger.length === 0) return;

  const tenants = await Tenant.find({ "integrations.dropbox.refreshTokenEnc": { $exists: true } });
  for (const tenant of tenants) {
    const tenantId = String(tenant._id);
    if (!leTocaEscanear(tenant)) continue;
    if (!tomarCandado(tenantId)) continue; // ya hay un escaneo (manual o de este mismo tick) en curso
    lastScanAt.set(tenantId, Date.now());
    try {
      await scanTenant(tenant, estadosConTrigger);
    } catch (err) {
      console.error(`[ESTADO-DROPBOX-CRON] Falló el escaneo del tenant ${tenantId}:`, err);
    } finally {
      liberarCandado(tenantId);
    }
  }
}

export interface ResultadoEscaneoManual {
  /** Ya había un escaneo en curso para ESTE tenant — no se disparó uno nuevo. */
  enCurso?: boolean;
  error?: "dropbox_no_conectado" | "sin_transiciones_configuradas";
  estadosEscaneados?: number;
  transicionesAplicadas?: number;
}

/**
 * Dispara un escaneo inmediato de UN tenant (botón "Forzar escaneo ahora" de la UI), sin esperar a que
 * le toque el turno según su intervalo configurado. Actualiza `lastScanAt` igual que un escaneo
 * automático, así el conteo regresivo del próximo escaneo se reinicia desde acá.
 */
export async function escanearTenantAhora(tenantId: string): Promise<ResultadoEscaneoManual> {
  if (!tomarCandado(tenantId)) return { enCurso: true };
  try {
    const tenant = await Tenant.findById(tenantId);
    const cfg = tenant ? getTenantDropboxConfig(tenant) : null;
    if (!cfg) return { error: "dropbox_no_conectado" };

    const estadosConTrigger = await cargarEstadosPorEvento("dropbox_carpeta");
    if (estadosConTrigger.length === 0) return { error: "sin_transiciones_configuradas" };

    lastScanAt.set(tenantId, Date.now());
    const transicionesAplicadas = await scanTenant(tenant, estadosConTrigger);
    return { estadosEscaneados: estadosConTrigger.length, transicionesAplicadas };
  } finally {
    liberarCandado(tenantId);
  }
}

export interface EscaneoConfig {
  intervalMinutos: number;
  ultimoEscaneoAt: number | null;
  proximoEscaneoAt: number | null;
}

/** Config + estado actual del escaneo automático de un tenant, para mostrar en la UI (intervalo, cuenta
 *  regresiva al próximo escaneo). */
export async function getEscaneoConfig(tenantId: string): Promise<EscaneoConfig> {
  const tenant = await Tenant.findById(tenantId).select("integrations.dropbox.scanIntervalMinutes").lean();
  const intervalMinutos = intervalMinutesDe(tenant);
  const ultimoEscaneoAt = lastScanAt.get(tenantId) ?? null;
  const proximoEscaneoAt = ultimoEscaneoAt !== null ? ultimoEscaneoAt + intervalMinutos * 60_000 : null;
  return { intervalMinutos, ultimoEscaneoAt, proximoEscaneoAt };
}

/** Cambia el intervalo de escaneo de un tenant (minutos, acotado a [MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES]). */
export async function setEscaneoIntervalo(tenantId: string, minutos: number): Promise<EscaneoConfig> {
  const clamped = Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(minutos)));
  await Tenant.updateOne({ _id: tenantId }, { $set: { "integrations.dropbox.scanIntervalMinutes": clamped } });
  return getEscaneoConfig(tenantId);
}

async function scanTenant(tenant: any, estadosConTrigger: IInfo[]): Promise<number> {
  const cfg = getTenantDropboxConfig(tenant);
  if (!cfg) return 0;

  /*
    RELLENO DEL `accountId`, para los tenants que ya estaban conectados.

    El id de cuenta de Dropbox se guarda al conectar, pero los que conectaron antes de que el webhook
    existiera no lo tienen — y sin él, sus notificaciones no se pueden atribuir a nadie y se descartan
    en silencio. Se completa acá, en el primer escaneo que corran, en lugar de pedirles que
    desconecten y vuelvan a conectar para arreglar algo que el sistema puede resolver solo.

    VA EN `scanTenant` Y NO EN LOS QUE LLAMAN: el escaneo entra por dos puertas —el tick del reloj y
    el botón de forzar— y ésta es la única que las dos atraviesan. Puesto en una sola, la mitad de los
    tenants se quedaba sin completar según por dónde hubieran entrado.

    Cuesta una llamada, UNA vez: con el id guardado esta rama no se vuelve a entrar. Y si falla no
    rompe nada — el escaneo sigue igual y se reintenta en la pasada siguiente.
  */
  if (!tenant?.integrations?.dropbox?.accountId) {
    try {
      const { accountId } = await verifyAccount(String(tenant._id), cfg);
      if (accountId) await Tenant.updateOne({ _id: tenant._id }, { $set: { "integrations.dropbox.accountId": accountId } });
    } catch (e: any) {
      console.warn("[Dropbox] no se pudo completar el accountId del tenant (se reintenta):", e?.message || e);
    }
  }

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
          email: "",
          fechaAlta: fechaCompacta(c.fecha_alta_contrato),
          fechaBaja: fechaCompacta(c.fecha_baja_contrato),
        });
      }
    });
  }
  if (candidatosBase.length === 0) return 0;

  const users = await User.find({ _id: { $in: [...userIdsSet] } })
    .select("firstName lastName email metadata.cuit")
    .lean();
  const nombrePorUserId = new Map(users.map((u: any) => [String(u._id), normalizarTexto(`${u.firstName || ""} ${u.lastName || ""}`)]));
  const cuitPorUserId = new Map(users.map((u: any) => [String(u._id), normalizarCuit(u.metadata?.cuit)]));
  const emailPorUserId = new Map(users.map((u: any) => [String(u._id), normalizarEmail(u.email)]));
  for (const c of candidatosBase) {
    c.palabras = (nombrePorUserId.get(c.userId) || "").split(" ").filter(Boolean);
    c.cuit = cuitPorUserId.get(c.userId) || "";
    c.email = emailPorUserId.get(c.userId) || "";
  }
  // Compartido entre TODAS las carpetas de este estado: un candidato ya avanzado en una carpeta no
  // hace falta seguir buscándolo en las demás.
  let disponibles = candidatosBase.filter((c) => c.palabras.length > 0 || c.cuit || c.email);
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

    // Resolución del CUIT de cada archivo (nombre, y si hace falta contenido del PDF) EN PARALELO: es la
    // parte lenta (baja y parsea PDFs enteros), y no toca `disponibles` — sacarla del loop secuencial de
    // abajo evita que un escaneo con varios archivos sin CUIT en el nombre tarde la suma de todos ellos
    // (riesgo real de superar el timeout del botón "Forzar escaneo ahora").
    const identidadPorArchivo = new Map<string, { cuit: string; email: string; via: "nombre" | "contenido" | null }>();
    await Promise.all(
      archivos.map(async (file) => {
        // 1) CUIT en el nombre del archivo — la vía más barata y la que van a traer los documentos que
        //    genera el propio sistema (`buildDocFileName`) apenas Dropbox Sign los devuelva firmados.
        //    El EMAIL sale del mismo lado y en la misma pasada: es el identificador que siempre está,
        //    porque hay personas sin CUIL y ninguna sin email.
        let cuitEncontrado = extraerCuitDeNombre(file.name);
        const emailEncontrado = normalizarEmail(leerAnclas(file.name).email);
        let viaCuit: "nombre" | "contenido" | null = cuitEncontrado ? "nombre" : null;

        // 2) Si el nombre no trae CUIT, intentar leerlo del contenido del PDF (documentos de AFIP que
        //    el usuario sube a mano y que no siguen la convención de nombre, pero sí traen el CUIT como
        //    texto — mismo parser que ya usa la carga masiva de constancias). Solo si tampoco hay email:
        //    con email ya se sabe de quién es, y bajar y parsear el PDF entero es la parte lenta.
        if (!cuitEncontrado && !emailEncontrado && /\.pdf$/i.test(file.name)) {
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
        identidadPorArchivo.set(file.path, { cuit: cuitEncontrado, email: emailEncontrado, via: viaCuit });
      }),
    );

    for (const file of archivos) {
      const key = `${tenant._id}:${estadoDestino._id}:${file.path}`;
      const { cuit: cuitEncontrado, email: emailEncontrado, via: viaCuit } = identidadPorArchivo.get(file.path) || { cuit: "", email: "", via: null };

      /*
       * QUIÉN es, por los dos identificadores obligatorios de la nomenclatura.
       *
       * El CUIT primero, que es el fuerte. Si el archivo no lo trae —o lo trae y no hay ningún
       * candidato con ese CUIT, que es el caso de las 39 personas del padrón sin CUIL válido: su
       * archivo sale con el CUIT de nadie o sin CUIT— decide el EMAIL. Es el único dato que siempre
       * está, porque es obligatorio al registrarse.
       */
      let matches: Candidato[] = [];
      let viaIdentidad: "cuit" | "email" | "nombre" = "nombre";
      if (cuitEncontrado) {
        matches = disponibles.filter((c) => c.cuit === cuitEncontrado);
        if (matches.length > 0) viaIdentidad = "cuit";
      }
      if (matches.length === 0 && emailEncontrado) {
        matches = disponibles.filter((c) => c.email === emailEncontrado);
        if (matches.length > 0) viaIdentidad = "email";
      }
      if (matches.length === 0 && !cuitEncontrado && !emailEncontrado) {
        // Ningún identificador (ni nombre ni contenido) → fallback al matching difuso de siempre.
        const nombreArchivoNormalizado = normalizarTexto(file.name.replace(/\.[^.]+$/, ""));
        matches = disponibles.filter((c) => c.palabras.length > 0 && c.palabras.every((p) => nombreArchivoNormalizado.includes(p)));
      }

      // CUÁL de sus contratos. Una misma persona puede tener dos superpuestos, y ahí desempatan las
      // fechas del nombre — obligatorias en la nomenclatura justamente para esto.
      if (matches.length > 1) {
        const fechasArchivo = extraerFechasDeNombre(file.name);
        if (fechasArchivo.length > 0) {
          const porFecha = matches.filter((c) => (c.fechaAlta && fechasArchivo.includes(c.fechaAlta)) || (c.fechaBaja && fechasArchivo.includes(c.fechaBaja)));
          if (porFecha.length > 0) matches = porFecha;
        }
      }

      if (matches.length !== 1) {
        const identificado = cuitEncontrado ? `CUIT ${cuitEncontrado} vía ${viaCuit}` : emailEncontrado ? `email ${emailEncontrado}` : "";
        logSiCambio(
          key,
          matches.length === 0 ? "sin_candidato" : `ambiguo_${matches.length}`,
          `[ESTADO-DROPBOX-CRON] ${file.path}: ${matches.length === 0 ? "sin candidato" : `ambiguo (${matches.length} candidatos)`}${identificado ? ` (${identificado})` : ""} — se omite (destino: ${estadoDestino.name})`,
        );
        continue;
      }

      const candidato = matches[0];
      disponibles = disponibles.filter((c) => c !== candidato);
      const resultado = await aplicarTransicion(candidato.up, candidato.idx, estadoDestino);
      if (resultado.aplicada) {
        lastWarned.delete(key);
        transicionesAplicadas++;
        console.log(`[ESTADO-DROPBOX-CRON] ${candidato.userId}: ${resultado.estadoAnteriorId} → ${estadoDestino.name} (archivo: ${file.name}, carpeta: ${ruta}, identificado por ${viaIdentidad === "cuit" ? `CUIT vía ${viaCuit}` : viaIdentidad})`);
      }
    }
  }
  return transicionesAplicadas;
}
