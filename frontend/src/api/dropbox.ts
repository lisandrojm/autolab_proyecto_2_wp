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

  /**
   * `full`: permite una ruta fuera del rootPath (ver /dropbox/temp-link).
   *
   * El `id` es opcional pero conviene mandarlo: es con lo que el server va a pedirle el archivo a
   * Dropbox. Ver `downloadZip`.
   */
  async tempLink(path: string, full?: boolean, id?: string): Promise<string> {
    const { data } = await axios.get("/dropbox/temp-link", { params: { path, id, full: full ? "1" : undefined } });
    return data.link;
  },

  /**
   * Descarga varios archivos como un ZIP.
   *
   * Se manda el `id` de Dropbox de cada archivo además del path, y el server baja POR ID. El path
   * sigue viajando porque es con lo que se valida que la selección esté dentro de la carpeta
   * permitida —un id no dice dónde vive— y porque es el nombre que termina adentro del ZIP.
   *
   * Por qué por id: el path es texto y el texto de un nombre de archivo puede volver distinto de como
   * está guardado —acentos en otra forma Unicode, mayúsculas, puntos suspensivos, cualquier cosa que
   * el generador del PDF haya metido en el nombre—, y ahí Dropbox contesta `path/not_found` sobre un
   * archivo que está a la vista en la lista. El id es opaco y ASCII: no depende de cómo se llame.
   */
  async downloadZip(
    items: Array<{ path: string; id?: string }>,
    full?: boolean,
    /**
     * Progreso de la BAJADA del ZIP al navegador (bytes recibidos / total, si el server manda
     * Content-Length — que lo manda).
     *
     * Ojo con qué mide: la espera tiene dos etapas y esta es la segunda. Primero el server baja de
     * Dropbox todos los archivos y arma el ZIP —ahí no hay bytes viajando y esto no se mueve—, y
     * recién después empieza a llegar. Por eso quien lo use tiene que mostrar también el estado
     * "preparando": si no, un minuto en 0 MB se lee como colgado.
     */
    onProgreso?: (recibidos: number, total?: number) => void,
  ): Promise<Blob> {
    const { data } = await axios.post(
      "/dropbox/download-zip",
      // `paths` va además de `items` por la ventana de deploy: el front (Vercel) y el server (VPS) se
      // publican por separado, así que un front nuevo puede pegarle un rato a un server viejo.
      { items, paths: items.map((i) => i.path), full },
      {
        responseType: "blob",
        /*
          Timeout propio, mucho más largo que los 60 s del cliente general.

          El server tiene que bajar de Dropbox todos los archivos ANTES de poder devolver el ZIP: no
          hay nada que mandar hasta que estén todos. Con el timeout general, 34 archivos cortaban el
          pedido a mitad de camino y el trabajo ya hecho se tiraba entero — y el operador veía "la
          solicitud tardó demasiado" sin ninguna pista de que en realidad estaba funcionando.

          Es generoso a propósito: el tope real de la tanda lo pone el peso (200 MB), no el reloj.
        */
        timeout: 10 * 60 * 1000,
        onDownloadProgress: onProgreso ? (e) => onProgreso(e.loaded, e.total) : undefined,
      },
    );
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

  /**
   * Fuerza ya mismo el escaneo de transición automática (carpetas de Dropbox) de este tenant. Puede
   * tardar bastante más que el resto de las llamadas (lista varias carpetas y, si hace falta, descarga y
   * lee el contenido de PDFs sin CUIT en el nombre) — timeout propio más largo que el default (60s).
   */
  async forzarEscaneoEstados(): Promise<{ estadosEscaneados: number; transicionesAplicadas: number }> {
    const { data } = await axios.post("/dropbox/estado-scan/trigger", undefined, { timeout: 180000 });
    return data;
  },

  /** Intervalo configurado + cuándo fue el último escaneo / cuándo es el próximo (para la cuenta regresiva). */
  async getEscaneoConfig(): Promise<EscaneoConfig> {
    const { data } = await axios.get("/dropbox/estado-scan/config");
    return data;
  },

  /** Cambia cada cuántos minutos se revisan las carpetas vigiladas (solo admin). */
  async setEscaneoIntervalo(intervalMinutos: number): Promise<EscaneoConfig> {
    const { data } = await axios.patch("/dropbox/estado-scan/config", { intervalMinutos });
    return data;
  },
};

export interface EscaneoConfig {
  intervalMinutos: number;
  ultimoEscaneoAt: number | null;
  proximoEscaneoAt: number | null;
}
