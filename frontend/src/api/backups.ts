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
  mongoDestino?: {
    estado: "ok" | "sin_configurar" | "error";
    prefijo?: string;
    clusterAparte?: boolean;
    ultimaBase?: string;
    /** La base que va a usar la próxima copia, y cuánto ocupa contra el límite de Atlas. */
    proximaBase?: string;
    proximaBytes?: number;
    maximoBytes?: number;
    error?: string;
  };
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

export interface ArchivoCopia {
  nombre: string;
  path: string;
  bytes: number;
}

export interface ColeccionViva {
  nombre: string;
  documentos: number;
  bytes: number;
}

export interface BaseActual {
  base: string;
  colecciones: ColeccionViva[];
  documentos: number;
  bytes: number;
}

/** El `_backup.json` de una copia, con el detalle por colección. */
export interface ManifiestoCopia {
  base: string;
  fecha: string;
  documentos: number;
  colecciones: Array<{ nombre: string; documentos: number; bytes: number }>;
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

  /**
   * Baja la copia ENTERA como ZIP. El servidor reenvía lo que arma Dropbox: el token nunca llega acá.
   *
   * `responseType: "blob"` es obligatorio — sin eso axios interpreta el zip como texto y el archivo
   * queda corrupto al guardarlo.
   */
  async descargarCopia(path: string): Promise<Blob> {
    const { data } = await axios.get("/backups/copias/descargar", { params: { path }, responseType: "blob", timeout: 10 * 60 * 1000 });
    return data;
  },

  /** Qué colecciones hay adentro de una copia, sin bajar el zip entero. */
  /** La base viva, colección por colección: es contra esto que se compara una copia. */
  async baseActual(): Promise<BaseActual> {
    const { data } = await axios.get("/backups/base-actual", { timeout: 2 * 60 * 1000 });
    return data;
  },

  async manifiesto(path: string): Promise<ManifiestoCopia> {
    const { data } = await axios.get("/backups/copias/manifiesto", { params: { path } });
    return data;
  },

  async archivosDeCopia(path: string): Promise<ArchivoCopia[]> {
    const { data } = await axios.get("/backups/copias/archivos", { params: { path } });
    return data.archivos;
  },

  /** El contenido de un `.json`, recortado por el servidor para no colgar el navegador. */
  async verArchivo(path: string): Promise<{ contenido: string; bytes: number; recortado: boolean; limite: number }> {
    const { data } = await axios.get("/backups/copias/ver", { params: { path }, timeout: 2 * 60 * 1000 });
    return data;
  },

  async linkArchivo(path: string): Promise<string> {
    const { data } = await axios.get("/backups/copias/link", { params: { path } });
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
