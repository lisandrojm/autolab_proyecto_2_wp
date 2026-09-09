import axios from "./axiosConfig";

export interface ResultadoBackup {
  carpeta: string;
  colecciones: number;
  documentos: number;
  bytes: number;
  borrados: number;
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
};
