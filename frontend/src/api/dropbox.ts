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

  async tempLink(path: string): Promise<string> {
    const { data } = await axios.get("/dropbox/temp-link", { params: { path } });
    return data.link;
  },

  async downloadZip(paths: string[]): Promise<Blob> {
    const { data } = await axios.post("/dropbox/download-zip", { paths }, { responseType: "blob" });
    return data;
  },

  async upload(path: string, file: File): Promise<DropboxEntry> {
    const form = new FormData();
    form.append("path", path);
    form.append("file", file);
    const { data } = await axios.post("/dropbox/upload", form, { headers: { "Content-Type": "multipart/form-data" } });
    return data;
  },

  async createFolder(path: string): Promise<DropboxEntry> {
    const { data } = await axios.post("/dropbox/create-folder", { path });
    return data;
  },

  async move(fromPath: string, toPath: string): Promise<DropboxEntry> {
    const { data } = await axios.post("/dropbox/move", { fromPath, toPath });
    return data;
  },

  async remove(path: string): Promise<void> {
    await axios.delete("/dropbox/delete", { data: { path } });
  },
};
