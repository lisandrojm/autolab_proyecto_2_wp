import axios from "axios";
import { Tenant } from "../models/Tenant.js";
import { decryptSecret } from "../utils/secretCrypto.js";

// Integración con Dropbox POR TENANT: las credenciales (appKey/appSecret/refreshToken)
// se guardan cifradas en tenant.integrations.dropbox. Con el refresh token se obtiene
// un access token de corta duración (~4h), que se cachea en memoria por tenant.
// Se usa la API HTTP de Dropbox directamente (sin SDK) para no sumar dependencias.

const OAUTH_URL = "https://api.dropbox.com/oauth2/token";
const RPC = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

// axios no tiene timeout por defecto (queda en Infinity): si Dropbox no responde, un `await` puede
// colgarse para siempre. Eso es especialmente grave en `estadoDropboxCronService.ts`, que usa un
// candado (`isRunning`) para no correr dos escaneos en simultáneo — sin timeout, una sola llamada
// colgada deja ese candado trabado hasta reiniciar el server. Los de contenido (descarga/subida) llevan
// más margen porque los archivos pueden ser más pesados.
const RPC_TIMEOUT_MS = 20_000;
const CONTENT_TIMEOUT_MS = 60_000;

export interface DropboxEntry {
  tag: "file" | "folder";
  name: string;
  path: string; // path_display
  id?: string;
  size?: number;
  serverModified?: string;
  isDownloadable?: boolean;
}

interface TenantDropboxConfig {
  appKey: string;
  appSecret: string;
  refreshToken: string;
  rootPath: string;
}

// Cache de access tokens por tenant.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Lee y descifra la config de Dropbox del tenant. Devuelve null si no está conectado. */
export function getTenantDropboxConfig(tenant: any): TenantDropboxConfig | null {
  const d = tenant?.integrations?.dropbox;
  if (!d?.appKey || !d?.appSecretEnc || !d?.refreshTokenEnc) return null;
  return {
    appKey: d.appKey,
    appSecret: decryptSecret(d.appSecretEnc),
    refreshToken: decryptSecret(d.refreshTokenEnc),
    rootPath: normalizeRoot(d.rootPath || "/HelloSign"),
  };
}

export function isTenantDropboxConnected(tenant: any): boolean {
  return !!getTenantDropboxConfig(tenant);
}

function normalizeRoot(p: string): string {
  let s = String(p || "").trim();
  if (!s.startsWith("/")) s = "/" + s;
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s;
}

/** Obtiene un access token válido para el tenant (usa cache; renueva con el refresh token). */
async function getAccessToken(tenantId: string, cfg: TenantDropboxConfig): Promise<string> {
  const cached = tokenCache.get(tenantId);
  const now = Date.now();
  if (cached && cached.expiresAt > now + 60_000) return cached.token;

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", cfg.refreshToken);
  params.append("client_id", cfg.appKey);
  params.append("client_secret", cfg.appSecret);

  const { data } = await axios.post(OAUTH_URL, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: RPC_TIMEOUT_MS,
  });
  const token = data.access_token as string;
  const expiresIn = Number(data.expires_in) || 14400;
  tokenCache.set(tenantId, { token, expiresAt: now + expiresIn * 1000 });
  return token;
}

/** Invalida el token cacheado del tenant (al desconectar o cambiar credenciales). */
export function clearTenantToken(tenantId: string): void {
  tokenCache.delete(tenantId);
}

async function rpc(tenantId: string, cfg: TenantDropboxConfig, endpoint: string, body: any): Promise<any> {
  const token = await getAccessToken(tenantId, cfg);
  const { data } = await axios.post(`${RPC}${endpoint}`, body === undefined ? null : body, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    timeout: RPC_TIMEOUT_MS,
  });
  return data;
}

/**
 * Valida las credenciales. La conexión es válida si el refresh token funciona (obtener
 * el access token ya valida appKey/appSecret/refreshToken). El email de la cuenta es
 * best-effort: requiere el scope account_info.read; si no está, NO rompe la conexión.
 */
export async function verifyAccount(tenantId: string, cfg: TenantDropboxConfig): Promise<{ email?: string; name?: string; accountId?: string }> {
  const token = await getAccessToken(tenantId, cfg); // lanza si las credenciales son inválidas
  try {
    // get_current_account no lleva argumentos: body JSON `null` (string "null") + application/json.
    const { data } = await axios.post(`${RPC}/users/get_current_account`, "null", {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      timeout: RPC_TIMEOUT_MS,
    });
    // El `account_id` es lo ÚNICO que trae el webhook para decir DE QUIÉN es el cambio: la
    // notificación no nombra ni la carpeta ni el archivo. Ver `dropboxWebhookService.ts`.
    return { email: data?.email, name: data?.name?.display_name, accountId: data?.account_id };
  } catch (e: any) {
    console.warn("[Dropbox] get_current_account falló (se conecta igual):", e?.response?.data?.error_summary || e?.message);
    return {};
  }
}

/**
 * El argumento de las llamadas de CONTENIDO viaja en una cabecera HTTP, y una cabecera es ASCII.
 *
 * `/files/download` y `/files/upload` no mandan el path en el body sino en el header
 * `Dropbox-API-Arg`. Con un nombre acentuado —«Antunes Fernández», «Der atamian»— ese JSON deja de
 * ser ASCII, los bytes llegan mal del otro lado y Dropbox contesta **409 path/not_found**: no es que
 * el archivo no exista, es que el path que recibió no es el que se mandó.
 *
 * Era invisible porque depende del nombre: una carpeta de altas con nombres sin acentos baja
 * perfecto y la de al lado falla entera, sin ningún patrón aparente. Y como la respuesta de error
 * llega como arraybuffer, el motivo real quedaba adentro de un Buffer sin leer (ver `dropboxError`).
 *
 * La solución es la del SDK oficial: escapar todo lo que pase de \u007f como `\uXXXX`, que JSON
 * entiende igual y una cabecera sí puede transportar.
 *
 * ESTABA ESCRITO Y NO LO LLAMABA NADIE. Las dos llamadas de contenido —`downloadFileContent` y
 * `uploadFile`— serializaban con `JSON.stringify` pelado, así que el defecto que este comentario
 * describe seguía pasando: al subir, el nombre llega con U+FFFD en lugar del acento y el archivo
 * queda guardado con el nombre roto; al bajar, el path no matchea y Dropbox contesta 409
 * `path/not_found`. Toda ruta con acento, «ñ» o «·» pasa por acá: si alguna vez se vuelve a
 * serializar a mano, `argHeader.test.ts` falla.
 */
export const argHeader = (obj: unknown): string =>
  JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (c) => "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4));

const mapEntry = (e: any): DropboxEntry => ({
  tag: e[".tag"] === "folder" ? "folder" : "file",
  name: e.name,
  path: e.path_display || e.path_lower,
  id: e.id,
  size: e.size,
  serverModified: e.server_modified,
  isDownloadable: e.is_downloadable,
});

/**
 * Lista el contenido de una carpeta (no recursivo). path vacío → rootPath del tenant, salvo que
 * `full` sea true: ahí path vacío es la raíz REAL del Dropbox conectado (para poder elegir carpetas
 * fuera del subárbol de rootPath, como una carpeta "AFIP" separada de "HelloSign"). Ojo: "" es la
 * única forma válida de pedirle a la API la raíz — un path literal como "/FZERO S.R.L" no existe
 * como tal ahí adentro (ese nombre es cómo lo muestra la interfaz web, no un path real) y tira
 * `path/not_found`.
 */
export async function listFolder(tenantId: string, cfg: TenantDropboxConfig, path: string, full = false): Promise<{ entries: DropboxEntry[]; path: string }> {
  // Dropbox usa "" para el raíz del espacio; para una carpeta concreta, su path.
  const target = path && path !== "/" ? path : full ? "" : cfg.rootPath;
  const first = await rpc(tenantId, cfg, "/files/list_folder", { path: target, recursive: false, limit: 2000 });
  let entries: any[] = first.entries || [];
  let cursor = first.cursor;
  let hasMore = first.has_more;
  while (hasMore) {
    const next = await rpc(tenantId, cfg, "/files/list_folder/continue", { cursor });
    entries = entries.concat(next.entries || []);
    cursor = next.cursor;
    hasMore = next.has_more;
  }
  return { path: target, entries: entries.map(mapEntry) };
}


/** Link temporal (4h) para descargar/previsualizar un archivo directamente desde Dropbox. */
export async function getTemporaryLink(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<string> {
  const data = await rpc(tenantId, cfg, "/files/get_temporary_link", { path });
  return data.link as string;
}

/** Descarga el contenido de un archivo como Buffer (para armar ZIPs, etc.). */
export async function downloadFileContent(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<Buffer> {
  const token = await getAccessToken(tenantId, cfg);
  const { data } = await axios.post(`${CONTENT}/files/download`, null, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Dropbox-API-Arg": argHeader({ path }),
    },
    responseType: "arraybuffer",
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: CONTENT_TIMEOUT_MS,
  });
  return Buffer.from(data);
}

export async function uploadFile(tenantId: string, cfg: TenantDropboxConfig, path: string, buffer: Buffer): Promise<DropboxEntry> {
  const token = await getAccessToken(tenantId, cfg);
  const arg = { path, mode: "add", autorename: true, mute: false, strict_conflict: false };
  const { data } = await axios.post(`${CONTENT}/files/upload`, buffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": argHeader(arg),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: CONTENT_TIMEOUT_MS,
  });
  return mapEntry(data);
}

/**
 * Subida por SESIÓN, para archivos que no entran en `uploadFile`.
 *
 * El endpoint simple de Dropbox (`/files/upload`) corta en 150 MB y contesta un error que no dice eso.
 * Un backup de la base crece con el tiempo, así que el día que cruce el límite el job fallaría en
 * silencio cada doce horas. Con sesión se manda en pedazos de 8 MB y no hay techo práctico.
 *
 * Se usa SOLO cuando hace falta (ver `subirArchivoGrande` en backupService): abrir una sesión para un
 * PDF de 200 KB son tres viajes de red en vez de uno.
 */
export async function uploadFileSession(tenantId: string, cfg: TenantDropboxConfig, path: string, buffer: Buffer): Promise<DropboxEntry> {
  const token = await getAccessToken(tenantId, cfg);
  const TROZO = 8 * 1024 * 1024;
  const headers = (arg: unknown) => ({
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/octet-stream",
    "Dropbox-API-Arg": argHeader(arg),
  });
  const comun = { maxBodyLength: Infinity, maxContentLength: Infinity, timeout: CONTENT_TIMEOUT_MS };

  const primero = buffer.subarray(0, Math.min(TROZO, buffer.length));
  const { data: inicio } = await axios.post(`${CONTENT}/files/upload_session/start`, primero, { headers: headers({ close: false }), ...comun });
  const sessionId = inicio?.session_id;
  if (!sessionId) throw new Error("Dropbox no devolvió session_id al abrir la subida por sesión");

  let offset = primero.length;
  while (offset < buffer.length) {
    const trozo = buffer.subarray(offset, Math.min(offset + TROZO, buffer.length));
    await axios.post(`${CONTENT}/files/upload_session/append_v2`, trozo, { headers: headers({ cursor: { session_id: sessionId, offset }, close: false }), ...comun });
    offset += trozo.length;
  }

  const { data } = await axios.post(`${CONTENT}/files/upload_session/finish`, Buffer.alloc(0), {
    headers: headers({ cursor: { session_id: sessionId, offset }, commit: { path, mode: "add", autorename: true, mute: false } }),
    ...comun,
  });
  return mapEntry(data);
}

export async function deleteEntry(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<void> {
  await rpc(tenantId, cfg, "/files/delete_v2", { path });
}

export async function moveEntry(tenantId: string, cfg: TenantDropboxConfig, fromPath: string, toPath: string): Promise<DropboxEntry> {
  const data = await rpc(tenantId, cfg, "/files/move_v2", { from_path: fromPath, to_path: toPath, autorename: false });
  return mapEntry(data.metadata);
}

export async function createFolder(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<DropboxEntry> {
  const data = await rpc(tenantId, cfg, "/files/create_folder_v2", { path, autorename: false });
  return mapEntry(data.metadata);
}

/** Verifica que un path esté dentro del rootPath del tenant (evita salir de /HelloSign). */
export function isWithinRoot(cfg: TenantDropboxConfig, path: string): boolean {
  if (!path) return true; // vacío = root
  const p = String(path).toLowerCase();
  const root = cfg.rootPath.toLowerCase();
  return p === root || p.startsWith(root + "/");
}
