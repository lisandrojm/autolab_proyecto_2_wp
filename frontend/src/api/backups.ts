import axios from "./axiosConfig";

export interface ResultadoBackup {
  carpeta: string;
  colecciones: number;
  documentos: number;
  bytes: number;
  borrados: number;
}

export interface ConfigBackup {
  /** Estado del segundo destino (otro Mongo). `sin_configurar` no es un error: falta la variable. */
  mongoDestino?: { estado: "ok" | "sin_configurar" | "error"; prefijo?: string; clusterAparte?: boolean; ultimaBase?: string; error?: string };
  enCurso: boolean;
  carpeta: string;
  intervaloHoras: number;
  retener: number;
  ultimoBackupAt: string | null;
  ultimoError: string | null;
  intervalosValidos: number[];
  dropboxConectado: boolean;
}

export interface CopiaBackup {
  nombre: string;
  path: string;
  /** ISO. `null` cuando la copia no tiene manifiesto: quedó a medias. */
  fecha: string | null;
  colecciones: number;
  documentos: number;
  /** Suma de los `.json` de la copia. */
  bytes: number;
  completa: boolean;
}

export const backupsAPI = {
  /**
   * Fuerza un backup y espera a que termine.
   *
   * Timeout largo a propósito: el server contesta recién cuando el archivo quedó subido, y recorrer la
   * base entera con la conexión de Atlas puede tardar varios minutos. Con el timeout por defecto el
   * navegador cortaría antes y mostraría un error sobre un backup que en realidad terminó bien.
   */
  async ejecutar(): Promise<ResultadoBackup> {
    const { data } = await axios.post("/backups/ejecutar", {}, { timeout: 15 * 60 * 1000 });
    return data;
  },

  async config(): Promise<ConfigBackup> {
    const { data } = await axios.get("/backups/config");
    return data;
  },

  async copias(): Promise<{ copias: CopiaBackup[]; dropboxConectado: boolean }> {
    const { data } = await axios.get("/backups/copias");
    return data;
  },

  /** Link temporal de Dropbox. El token nunca llega al browser. */
  async linkDescarga(path: string): Promise<string> {
    const { data } = await axios.get("/backups/copias/descargar", { params: { path } });
    return data.url;
  },

  async borrarCopia(path: string): Promise<void> {
    await axios.delete("/backups/copias", { params: { path } });
  },

  async guardarConfig(intervaloHoras: number, retener: number): Promise<{ intervaloHoras: number; retener: number }> {
    const { data } = await axios.put("/backups/config", { intervaloHoras, retener });
    return data;
  },
};
