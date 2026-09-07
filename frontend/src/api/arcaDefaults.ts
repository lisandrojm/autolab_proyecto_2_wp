import axios from "./axiosConfig";

/**
 * Los valores por defecto de ARCA de la instalación. Ver `server/src/models/ArcaDefault.ts`.
 *
 * La cascada, de más específico a más general: el contrato → la empresa → esto.
 */
export interface ArcaDefaults {
  /** `_id` de `ArcaSucursal` (domicilio de explotación). */
  sucursalId?: string | null;
  /** `_id` de `Convenio`. */
  convenioId?: string | null;
  grupoTipoServicio?: string;
  tipoServicio?: string;
  modalidadContratacion?: string;
  modalidadLiquidacion?: string;
}

/** Las claves que puede marcar una pantalla de nomenclador con su ★. */
export type CampoDefaultArca = keyof ArcaDefaults;

export const arcaDefaultsAPI = {
  get: async (): Promise<ArcaDefaults> => {
    const { data } = await axios.get<ArcaDefaults>("/arca/defaults");
    return data;
  },

  /**
   * Parchea UN campo. Se manda solo esa clave a propósito: mandar el objeto entero haría que dos
   * pantallas abiertas en dos pestañas se pisaran los defaults entre sí.
   */
  set: async (campo: CampoDefaultArca, valor: string | null): Promise<ArcaDefaults> => {
    const { data } = await axios.patch<ArcaDefaults>("/arca/defaults", { [campo]: valor });
    return data;
  },
};
