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
  mongoDestino?: { estado: "ok" | "sin_configurar" | "error"; base?: string; error?: string };
  enCurso: boolean;
  carpeta: string;
  intervaloHoras: number;
  retener: number;
  ultimoBackupAt: string | null;
  ultimoError: string | null;
  intervalosValidos: number[];
  dropboxConectado: boolean;
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

  async guardarConfig(intervaloHoras: number, retener: number): Promise<{ intervaloHoras: number; retener: number }> {
    const { data } = await axios.put("/backups/config", { intervaloHoras, retener });
    return data;
  },
};
