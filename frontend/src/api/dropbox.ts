import axios from "./axiosConfig";

export interface DropboxEntry {
  tag: "file" | "folder";
  name: string;
  path: string;
  id?: string;
  size?: number;
  serverModified?: string;
  isDownloadable?: boolean;
}

export interface DropboxStatus {
  connected: boolean;
  rootPath: string;
  accountEmail: string | null;
  connectedAt: string | null;
  canManageConnection: boolean;
}

export const dropboxAPI = {
  async status(): Promise<DropboxStatus> {
    const { data } = await axios.get("/dropbox/status");
    return data;
  },

  async connect(payload: { appKey: string; appSecret: string; refreshToken: string; rootPath?: string }): Promise<DropboxStatus> {
    const { data } = await axios.post("/dropbox/connect", payload);
    return data;
  },

  async disconnect(): Promise<void> {
    await axios.post("/dropbox/disconnect");
  },

  /** `full`: ignora el límite del rootPath y navega desde una raíz más amplia (ver /dropbox/list). */
  async list(path?: string, full?: boolean): Promise<{ entries: DropboxEntry[]; path: string; rootPath: string }> {
    const { data } = await axios.get("/dropbox/list", { params: { path: path || "", full: full ? "1" : undefined } });
    return data;
  },

  /** `full`: permite una ruta fuera del rootPath (ver /dropbox/temp-link). */
  async tempLink(path: string, full?: boolean): Promise<string> {
    const { data } = await axios.get("/dropbox/temp-link", { params: { path, full: full ? "1" : undefined } });
    return data.link;
  },

  /** `full`: permite rutas fuera del rootPath (ver /dropbox/download-zip). */
  async downloadZip(paths: string[], full?: boolean): Promise<Blob> {
    const { data } = await axios.post("/dropbox/download-zip", { paths, full }, { responseType: "blob" });
    return data;
  },

  /** `full`: permite subir fuera del rootPath (ver /dropbox/upload). */
  async upload(path: string, file: File, full?: boolean): Promise<DropboxEntry> {
    const form = new FormData();
    form.append("path", path);
    form.append("file", file);
    if (full) form.append("full", "1");
    const { data } = await axios.post("/dropbox/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
    return data;
  },

  /** `full`: permite crear fuera del rootPath (ver /dropbox/create-folder). */
  async createFolder(path: string, full?: boolean): Promise<DropboxEntry> {
    const { data } = await axios.post("/dropbox/create-folder", { path, full });
    return data;
  },

  /** `full`: permite mover/renombrar fuera del rootPath (ver /dropbox/move). */
  async move(fromPath: string, toPath: string, full?: boolean): Promise<DropboxEntry> {
    const { data } = await axios.post("/dropbox/move", { fromPath, toPath, full });
    return data;
  },

  /** `full`: permite eliminar fuera del rootPath (ver /dropbox/delete). */
  async remove(path: string, full?: boolean): Promise<void> {
    await axios.delete("/dropbox/delete", { data: { path, full } });
  },

  /** Fuerza ya mismo el escaneo de transición automática (carpetas de Dropbox) de este tenant. */
  async forzarEscaneoEstados(): Promise<{ estadosEscaneados: number; transicionesAplicadas: number }> {
    const { data } = await axios.post("/dropbox/estado-scan/trigger");
    return data;
  },
};
