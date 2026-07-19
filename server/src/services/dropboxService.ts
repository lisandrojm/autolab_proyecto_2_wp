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
  });
  return data;
}

/** Valida las credenciales y devuelve el email de la cuenta conectada. */
export async function verifyAccount(tenantId: string, cfg: TenantDropboxConfig): Promise<{ email?: string; name?: string }> {
  const token = await getAccessToken(tenantId, cfg);
  // get_current_account no lleva argumentos: Dropbox exige un Content-Type de su lista
  // (usamos el "cors-hack" que soporta body nulo). Sin esto, axios manda
  // application/x-www-form-urlencoded por defecto y Dropbox lo rechaza.
  const { data } = await axios.post(`${RPC}/users/get_current_account`, null, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain; charset=dropbox-cors-hack" },
  });
  return { email: data?.email, name: data?.name?.display_name };
}

const mapEntry = (e: any): DropboxEntry => ({
  tag: e[".tag"] === "folder" ? "folder" : "file",
  name: e.name,
  path: e.path_display || e.path_lower,
  id: e.id,
  size: e.size,
  serverModified: e.server_modified,
  isDownloadable: e.is_downloadable,
});

/** Lista el contenido de una carpeta (no recursivo). path vacío → rootPath del tenant. */
export async function listFolder(tenantId: string, cfg: TenantDropboxConfig, path: string): Promise<{ entries: DropboxEntry[]; path: string }> {
  // Dropbox usa "" para el raíz del espacio; para una carpeta concreta, su path.
  const target = path && path !== "/" ? path : cfg.rootPath;
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

export async function uploadFile(tenantId: string, cfg: TenantDropboxConfig, path: string, buffer: Buffer): Promise<DropboxEntry> {
  const token = await getAccessToken(tenantId, cfg);
  const arg = { path, mode: "add", autorename: true, mute: false, strict_conflict: false };
  const { data } = await axios.post(`${CONTENT}/files/upload`, buffer, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify(arg),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
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
