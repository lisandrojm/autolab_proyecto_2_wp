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
}

export interface Nomenclatura {
  tipo: string;
  patron: string;
  patronPorDefecto: string;
  /** `false` = está usando el patrón de fábrica. */
  personalizado: boolean;
  /** Va a Dropbox Sign y vuelve: su nombre se parsea, así que tiene variables obligatorias. */
  vuelveDeLaFirma: boolean;
  variables: VariableNomenclatura[];
  ejemplo: string;
  actualizadoEl: string | null;
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
  async previsualizar(tipo: string, patron: string): Promise<{ errores: ErrorPatron[]; ejemplo: string }> {
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
