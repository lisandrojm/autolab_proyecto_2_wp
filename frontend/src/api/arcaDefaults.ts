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
  /**
   * RNOS de la obra social que se ofrece primero. PRESELECCIÓN, no un escalón de la cascada: si la
   * cascada real no resuelve, el checklist sigue marcando FALTANTE y no se genera el TXT.
   */
  obraSocial?: string;
  /** Código de actividad que se ofrece primero al cargarlas en un domicilio. Tampoco decide el alta. */
  actividad?: string;
  /** `codigoArca` de la categoría que se ofrece primero. Preselección: no decide el alta. */
  categoria?: string;
  /** `_id` de la fuente de paritarias que se ofrece primero. No cambia qué escala rige. */
  fuenteParitariaId?: string | null;
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
