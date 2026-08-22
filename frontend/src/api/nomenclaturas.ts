import axios from "./axiosConfig";

/**
 * Nomenclatura de archivos: el patrón de nombre por tipo de documento.
 *
 * El catálogo de variables y la validación viven en el SERVER, no acá. No es casualidad: la
 * validación tiene que correr del lado del servidor igual —el front se puede saltear— y tener dos
 * listas de variables es cómo terminan discrepando, con el ABM ofreciendo una que el validador
 * rechaza. Por eso esta API devuelve las variables junto con cada fila.
 */
export interface VariableNomenclatura {
  variable: string;
  descripcion: string;
  /** Sin ella no se puede guardar: el archivo dejaría de poder reencontrarse. */
  requerida?: boolean;
  /** De qué habla: el editor las agrupa por esto, como el de Plantillas de Contrato. */
  grupo: string;
}

/**
 * Cuánto mide el nombre contra el tope de Dropbox (255 caracteres).
 *
 * `ejemplo` es el del preview, con datos cómodos. `peorCaso` arma el mismo patrón con los valores
 * más largos que hoy existen en la base — y es el único que sirve para decidir: un patrón puede
 * verse holgado en el ejemplo y pasarse con la persona de nombre más largo del padrón.
 *
 * `recortaria` = con esos valores el nombre no entra y el generador va a acortar los campos
 * descriptivos. No se pierde nada del bloque que permite reencontrar el archivo, pero conviene
 * saberlo antes de guardar.
 */
export interface LargoNomenclatura {
  ejemplo: number;
  peorCaso: number;
  maximo: number;
  recortaria: boolean;
}

export interface Nomenclatura {
  tipo: string;
  patron: string;
  patronPorDefecto: string;
  /** `false` = está usando el patrón de fábrica. */
  personalizado: boolean;
  /**
   * El archivo vuelve a entrar al sistema por su nombre —firmado desde Dropbox Sign, o levantado de
   * la carpeta de Dropbox—. Es `true` en TODOS los tipos: por eso todos tienen variables obligatorias.
   */
  seLeeDeVuelta: boolean;
  variables: VariableNomenclatura[];
  /** Los grupos presentes en este tipo, en el orden en que se muestran. */
  grupos: string[];
  ejemplo: string;
  /** Qué valor toma cada variable en el ejemplo. Es lo que hace legible la previsualización. */
  valores: Record<string, string>;
  actualizadoEl: string | null;
  largo: LargoNomenclatura;
}

export interface ErrorPatron {
  campo: "patron";
  motivo: string;
}

export const nomenclaturasAPI = {
  async getAll(): Promise<Nomenclatura[]> {
    const { data } = await axios.get("/nomenclaturas");
    return data;
  },

  /** Valida y renderiza sin guardar: es lo que alimenta el preview en vivo. */
  async previsualizar(tipo: string, patron: string): Promise<{ errores: ErrorPatron[]; ejemplo: string; valores: Record<string, string>; largo: LargoNomenclatura }> {
    const { data } = await axios.post("/nomenclaturas/previsualizar", { tipo, patron });
    return data;
  },

  async guardar(tipo: string, patron: string): Promise<Nomenclatura> {
    const { data } = await axios.put(`/nomenclaturas/${tipo}`, { patron });
    return data;
  },

  /** Vuelve al patrón de fábrica. */
  async restaurar(tipo: string): Promise<Nomenclatura> {
    const { data } = await axios.delete(`/nomenclaturas/${tipo}`);
    return data;
  },
};

/** Cómo se llama cada tipo en pantalla. El backend usa los identificadores internos. */
export const ETIQUETA_TIPO: Record<string, string> = {
  Contrato: "Contratos",
  Release: "Releases",
  AltaAFIP: "Altas de ARCA",
  ConstanciaCUIT: "Constancias de CUIT",
  Documentacion: "Documentación de respaldo",
  Pedido: "Pedidos",
  Vacacion: "Vacaciones",
};
