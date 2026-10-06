import { Info, IInfo } from "../models/Info.js";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject, { IUserProject } from "../models/UserProject.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent, verifyAccount, DropboxEntry } from "./dropboxService.js";
import { cargarEstadosPorEvento, aplicarTransicion } from "./estadoTransicionAutomaticaService.js";
import { normalizarCuit, parseConstanciaPdf } from "../utils/constanciaPdf.js";
import { leerAnclas, normalizarEmail } from "../utils/anclasNombre.js";
import { esElAltaEnviada, momentoDeCarga, motivoParaDescartarArchivo, TEXTO_DESCARTE } from "../utils/archivoDeContrato.js";

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

/** El CUIT leído del CONTENIDO de cada PDF, por archivo y fecha de modificación (ver `scanEstadoParaTenant`). */
const cuitPorContenido = new Map<string, { cuit: string; at: number }>();
const REINTENTO_CONTENIDO_MS = 6 * 60 * 60 * 1000;
const DESCARGAS_EN_PARALELO = 2;
/** Tope de lo recordado: si se pasa, se olvidan los más viejos (un Map conserva el orden de inserción). */
const MAX_RECORDADOS = 20000;
function recordarContenido(clave: string, cuit: string): void {
  cuitPorContenido.delete(clave);
  cuitPorContenido.set(clave, { cuit, at: Date.now() });
  while (cuitPorContenido.size > MAX_RECORDADOS) cuitPorContenido.delete(cuitPorContenido.keys().next().value as string);
}

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
  /** `fecha_carga` del contrato en ms: un archivo anterior no puede ser su documento (ver `archivoDeContrato`). */
  creadoEl: number | null;
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
          creadoEl: momentoDeCarga(c.fecha_carga),
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
  for (const { dropboxCarpeta: carpeta, proposito } of carpetas as Array<{ dropboxCarpeta: string; proposito?: string | string[] }>) {
    if (disponibles.length === 0) break;
    const esCarpetaDeAlta = ([] as string[]).concat(proposito || []).includes("alta_temprana");
    const ruta = carpeta.startsWith("/") ? carpeta : `/${carpeta}`;
    let entries: DropboxEntry[];
    try {
      ({ entries } = await listFolder(String(tenant._id), cfg, ruta));
    } catch (err) {
      console.error(`[ESTADO-DROPBOX-CRON] No se pudo listar "${ruta}" para "${estadoDestino.name}":`, err);
      continue;
    }
    const archivos = entries.filter((e) => e.tag === "file");

    /*
      EL CUIT DE CADA ARCHIVO: del nombre siempre; del CONTENIDO del PDF solo si hace falta y sirve.

      Leer el contenido es descargar el PDF entero y parsearlo, y parsear es trabajo SÍNCRONO: mientras
      corre, Node no atiende nada. Se hacía con TODOS los archivos sin CUIT en el nombre, todos a la
      vez y en cada escaneo —y hay un escaneo por cada aviso de Dropbox—. El 06/10/2026 eso dejó al
      servidor al 85 % de CPU con 1,6 GB de RAM y bloqueos de 20–55 s: los PDFs viejos de
      «Requested signatures» se bajaban una y otra vez, las descargas vencían por el mismo bloqueo, y
      como nada quedaba guardado, el escaneo siguiente volvía a empezar. Ahora:

        · NO se lee el contenido de un archivo ANTERIOR al contrato más viejo que se busca: se iba a
          descartar igual (`anterior_al_contrato`), así que bajarlo no servía para nada;
        · lo leído se RECUERDA por archivo y fecha de modificación (`cuitPorContenido`): un PDF se
          parsea una vez, no en cada escaneo. Si falló, se reintenta recién a las 6 horas;
        · de a DOS descargas por vez, devolviéndole el hilo a Node entre una y otra.
    */
    const creados = disponibles.map((c) => c.creadoEl);
    const cotaMinima = creados.some((c) => c === null) ? null : Math.min(...(creados as number[]));
    const identidadPorArchivo = new Map<string, { cuit: string; email: string; via: "nombre" | "contenido" | null }>();
    const porContenido: DropboxEntry[] = [];
    for (const file of archivos) {
      const cuit = extraerCuitDeNombre(file.name);
      const email = normalizarEmail(leerAnclas(file.name).email);
      identidadPorArchivo.set(file.path, { cuit, email, via: cuit ? "nombre" : null });
      if (cuit || email || !/\.pdf$/i.test(file.name)) continue;
      const modificado = Date.parse(String(file.serverModified || ""));
      if (cotaMinima !== null && Number.isFinite(modificado) && modificado < cotaMinima) continue;
      porContenido.push(file);
    }
    const leerContenido = async (file: DropboxEntry) => {
      const clave = `${tenant._id}:${file.path}:${file.serverModified || ""}`;
      const previo = cuitPorContenido.get(clave);
      if (previo && (previo.cuit || Date.now() - previo.at < REINTENTO_CONTENIDO_MS)) {
        if (previo.cuit) identidadPorArchivo.set(file.path, { cuit: previo.cuit, email: "", via: "contenido" });
        return;
      }
      let cuit = "";
      try {
        const buffer = await downloadFileContent(String(tenant._id), cfg, file.path);
        cuit = (await parseConstanciaPdf(buffer)).cuit || "";
      } catch (err) {
        console.warn(`[ESTADO-DROPBOX-CRON] No se pudo leer el CUIT del contenido de "${file.path}":`, (err as any)?.message || err);
      }
      recordarContenido(clave, cuit);
      if (cuit) identidadPorArchivo.set(file.path, { cuit, email: "", via: "contenido" });
    };
    for (let i = 0; i < porContenido.length; i += DESCARGAS_EN_PARALELO) {
      await Promise.all(porContenido.slice(i, i + DESCARGAS_EN_PARALELO).map(leerContenido));
      await new Promise((r) => setImmediate(r));
    }

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
      // EL ALTA NO ES EL CONTRATO. La constancia de alta que este contrato mandó a firmar pasa por
      // Outbox, Pendbox y Firmados igual que el contrato, pero no lo mueve por esos pasos: los mueve
      // el contrato. (En la carpeta de altas sí cuenta: ahí es justamente lo que se espera.)
      if (!esCarpetaDeAlta && esElAltaEnviada(file.name, (candidato.up.contracts[candidato.idx] as any)?.altaConstancia?.enviadaComo)) {
        logSiCambio(key, "es_el_alta", `[ESTADO-DROPBOX-CRON] ${file.path}: es el alta temprana del contrato, no mueve su estado (${candidato.userId} [${candidato.idx}]) — se omite (destino: ${estadoDestino.name})`);
        continue;
      }

      /*
        ES LA PERSONA, PERO ¿ES ESTE CONTRATO? Identificar a la persona no alcanza: en las carpetas quedan
        para siempre archivos viejos que la nombran (contratos firmados de antes, recibos de sueldo) y,
        con un solo contrato suyo en estado anterior —el recién creado—, cualquiera de ellos lo
        "avanzaba". Así un recibo de julio pasó a «Disponible» un contrato aprobado el 1/10, que se fue de
        la bandeja de ARCA sin alta. El archivo tiene que ser posterior al contrato y, si trae fechas,
        tienen que ser las suyas (`archivoDeContrato`). El archivo descartado no se "consume": queda
        para el contrato que sí le corresponda, si lo hay.
      */
      const descarte = motivoParaDescartarArchivo({ modificadoEl: file.serverModified }, candidato, extraerFechasDeNombre(file.name));
      if (descarte) {
        logSiCambio(key, descarte, `[ESTADO-DROPBOX-CRON] ${file.path}: ${TEXTO_DESCARTE[descarte]} (${candidato.userId} [${candidato.idx}]) — se omite (destino: ${estadoDestino.name})`);
        continue;
      }

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
