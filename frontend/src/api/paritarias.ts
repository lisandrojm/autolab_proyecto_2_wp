import axios from './axiosConfig';

/**
 * Vigilancia de paritarias: detectar que salió un PDF nuevo.
 *
 * Esta entrega SOLO DETECTA. No hay ningún método que abra un PDF, lea importes o toque una escala —
 * eso es la segunda entrega, y si aparece acá antes de tiempo se fue de alcance.
 */

export type ResultadoRevision = 'ok' | 'sin_enlaces' | 'error_red' | 'error_parseo';

export interface FuenteParitaria {
  _id: string;
  /** Quién publica: "SATSAID". */
  entidad: string;
  /** Etiqueta corta: "Actores · televisión". */
  nombre: string;
  /** La página de LISTADO, no el PDF. */
  url: string;
  convenios: string[];
  patronIncluir: string;
  patronExcluir: string;
  activa: boolean;
  /** `null` = nunca revisada. Su primera revisión establece la línea de base. */
  ultimaRevision: string | null;
  ultimoResultado?: ResultadoRevision;
  ultimoError?: string;
  enlacesUltimaExitosa?: number;
  publicaciones: number;
  sinVer: number;
  /** La última revisión no terminó en `ok`: la fuente está ciega. */
  conProblema: boolean;
}

export interface PublicacionParitaria {
  _id: string;
  url: string;
  /** Cómo figuraba en la página. Es lo que dice de qué acuerdo se trata sin abrir el PDF. */
  textoEnlace: string;
  detectadaEl: string;
  fuente: { _id: string; entidad: string; nombre: string; convenios: string[] };
}

/**
 * En qué estado está el conocimiento sobre dónde publica sus paritarias un convenio.
 *
 * Cuatro valores, y `con_fuente` es DERIVADO: sale de que haya una fuente que liste el código, no de
 * un campo guardado. Los otros tres se declaran. La diferencia entre `sin_revisar` y
 * `sin_fuente_conocida` es la que hace que esto valga la pena: «nadie buscó» contra «se buscó y no
 * hay nada publicado». Sin esa distinción, la próxima persona repite la búsqueda.
 */
export type EstadoFuenteConvenio = 'con_fuente' | 'sin_revisar' | 'sin_fuente_conocida' | 'no_aplica';
export type EstadoDeclarado = Exclude<EstadoFuenteConvenio, 'con_fuente'>;

export interface DeclaracionFuente {
  estado: EstadoDeclarado;
  /** Qué se buscó y por qué se concluyó eso. Es lo que evita repetir el trabajo. */
  nota: string;
  revisadaPor: string;
  revisadaEl: string | null;
}

/**
 * Lo que alimenta el banner y la columna.
 *
 * `sinVer` y `conProblema` van SEPARADOS y no en una sola lista, porque dicen cosas opuestas: una
 * novedad sin leer es trabajo pendiente; una fuente caída significa que puede haber salido algo y
 * nadie se enteró. Juntas, la segunda se leería como «no hay novedades».
 */
export interface EstadoParitarias {
  /** Por código de convenio, qué fuentes lo alimentan. Vacío = ninguna registrada. */
  porConvenio: Record<string, Array<{ _id: string; entidad: string; nombre: string; activa: boolean; ultimaRevision: string | null; conProblema: boolean }>>;
  /**
   * Por `_id` de convenio, lo declarado a mano. SOLO los que alguien tocó.
   *
   * Va por `_id` y no por código: el código es opcional en el ABM y hay 1.555 con sufijo « E», así
   * que como clave no distingue con la seguridad que hace falta para escribir un dato.
   */
  declarado: Record<string, DeclaracionFuente>;
  sinVer: PublicacionParitaria[];
  conProblema: Array<{ _id: string; entidad: string; nombre: string; url: string; ultimoResultado: ResultadoRevision; ultimoError: string; ultimaRevision: string | null }>;
  sinRevisar: number;
  /** `true` cuando lo de arriba viene acotado a una empresa. */
  filtradoPorEmpresa: boolean;
}

export interface ResultadoDeRevision {
  fuenteId: string;
  nombre: string;
  resultado: ResultadoRevision;
  enlaces: number;
  nuevas: number;
  /** `true` = era la primera revisión y todo quedó registrado como ya visto. */
  lineaBase: boolean;
  error?: string;
  aviso?: string;
}

const BASE = '/paritarias';

export const paritariasAPI = {
  fuentes: async (): Promise<FuenteParitaria[]> => (await axios.get(`${BASE}/fuentes`)).data,
  crearFuente: async (f: Partial<FuenteParitaria>): Promise<FuenteParitaria> => (await axios.post(`${BASE}/fuentes`, f)).data,
  /**
   * Devuelve además `lineaBaseReiniciada`: el server borra `ultimaRevision` cuando cambia un patrón.
   * Es un hecho sobre ESA edición y hay que decirlo en el momento —quien la hizo tiene que saber que
   * la próxima revisión vuelve a ser línea de base—, por eso viaja en la respuesta y no en el modelo.
   */
  actualizarFuente: async (id: string, f: Partial<FuenteParitaria>): Promise<FuenteParitaria & { lineaBaseReiniciada?: boolean }> => (await axios.put(`${BASE}/fuentes/${id}`, f)).data,
  eliminarFuente: async (id: string): Promise<{ message: string }> => (await axios.delete(`${BASE}/fuentes/${id}`)).data,

  /**
   * Anota lo que se averiguó sobre un convenio. NO es una acción de vigilancia.
   *
   * `con_fuente` no se puede mandar: el server lo rechaza con 400. Se gana asignándole una fuente.
   */
  declararEstadoFuente: async (convenioId: string, estado: EstadoDeclarado, nota: string): Promise<void> => {
    await axios.put(`${BASE}/convenios/${convenioId}/estado-fuente`, { estado, nota });
  },

  /** El MISMO recorrido que la rutina diaria, con otro disparador. No hay dos caminos. */
  revisar: async (id: string): Promise<ResultadoDeRevision> => (await axios.post(`${BASE}/fuentes/${id}/revisar`)).data,
  revisarTodas: async (): Promise<ResultadoDeRevision[]> => (await axios.post(`${BASE}/revisar`)).data,

  /**
   * Con `empresaId`, el banner queda acotado a las fuentes que alimentan convenios que esa empresa
   * tiene registrados. Sin él no se filtra nada — es la vista de plataforma, la de quien puede
   * arreglar una fuente ciega. La revisión sigue siendo una sola para todos: lo que cambia es a
   * quién se le muestra.
   */
  estado: async (empresaId?: string): Promise<EstadoParitarias> => (await axios.get(`${BASE}/estado${empresaId ? `?empresaId=${encodeURIComponent(empresaId)}` : ''}`)).data,
  publicaciones: async (sinVer = false): Promise<PublicacionParitaria[]> => (await axios.get(`${BASE}/publicaciones${sinVer ? '?sinVer=1' : ''}`)).data,
  marcarVista: async (id: string): Promise<PublicacionParitaria> => (await axios.put(`${BASE}/publicaciones/${id}`, { vista: true })).data,
};
