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
 * Lo que alimenta el banner y la columna.
 *
 * `sinVer` y `conProblema` van SEPARADOS y no en una sola lista, porque dicen cosas opuestas: una
 * novedad sin leer es trabajo pendiente; una fuente caída significa que puede haber salido algo y
 * nadie se enteró. Juntas, la segunda se leería como «no hay novedades».
 */
export interface EstadoParitarias {
  /** Por código de convenio, qué fuentes lo vigilan. Vacío = no vigilado. */
  porConvenio: Record<string, Array<{ _id: string; entidad: string; nombre: string; ultimaRevision: string | null; conProblema: boolean }>>;
  sinVer: PublicacionParitaria[];
  conProblema: Array<{ _id: string; entidad: string; nombre: string; url: string; ultimoResultado: ResultadoRevision; ultimoError: string; ultimaRevision: string | null }>;
  sinRevisar: number;
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
  actualizarFuente: async (id: string, f: Partial<FuenteParitaria>): Promise<FuenteParitaria> => (await axios.put(`${BASE}/fuentes/${id}`, f)).data,
  eliminarFuente: async (id: string): Promise<{ message: string }> => (await axios.delete(`${BASE}/fuentes/${id}`)).data,

  /** El MISMO recorrido que la rutina diaria, con otro disparador. No hay dos caminos. */
  revisar: async (id: string): Promise<ResultadoDeRevision> => (await axios.post(`${BASE}/fuentes/${id}/revisar`)).data,
  revisarTodas: async (): Promise<ResultadoDeRevision[]> => (await axios.post(`${BASE}/revisar`)).data,

  estado: async (): Promise<EstadoParitarias> => (await axios.get(`${BASE}/estado`)).data,
  publicaciones: async (sinVer = false): Promise<PublicacionParitaria[]> => (await axios.get(`${BASE}/publicaciones${sinVer ? '?sinVer=1' : ''}`)).data,
  marcarVista: async (id: string): Promise<PublicacionParitaria> => (await axios.put(`${BASE}/publicaciones/${id}`, { vista: true })).data,
};
