import axios from './axiosConfig';

/**
 * Vigilancia de paritarias: detectar que salió un PDF nuevo.
 *
 * Esta entrega SOLO DETECTA. No hay ningún método que abra un PDF, lea importes o toque una escala —
 * eso es la segunda entrega, y si aparece acá antes de tiempo se fue de alcance.
 */

export type ResultadoRevision = 'ok' | 'sin_enlaces' | 'error_red' | 'error_parseo';

/**
 * El estado de una fuente, tal como lo arma el server. UNA sola forma para las dos pantallas.
 *
 * Lo produce un único mapper del backend (`utils/vistaFuenteParitaria.ts`) y lo consumen tanto
 * `/arca/fuentes-paritaria` como la columna de `/convenios`. Antes eran dos armados paralelos, y por
 * eso pudieron decir cosas distintas de la misma fuente: una decía «vigilando» y la otra «vigilancia
 * pausada», las dos con cara de estar informando.
 */
export interface FuenteResumen {
  _id: string;
  /** Quién publica: "SATSAID". */
  entidad: string;
  /** Etiqueta corta: "Actores · televisión". */
  nombre: string;
  /**
   * OPCIONAL A PROPÓSITO, aunque el server siempre lo mande.
   *
   * Un backend viejo, una proyección incompleta o un `select` de más lo dejan afuera, y ahí
   * `!f.activa` da `true` y la pantalla escribe «pausada» sobre una fuente que está corriendo. El
   * tipo obliga a pasar por `vigilanciaDe()`, que distingue ausente de `false` y lo reporta.
   */
  activa?: boolean;
  /**
   * CÓMO SE MIRA ESTA FUENTE.
   *
   *   listado_html  una página con enlaces a PDF, que la rutina diaria baja y compara.
   *   manual        se sabe dónde consultar, y se consulta a mano. Sin vigilancia automática.
   *
   * El caso que obliga a `manual` es el buscador oficial del Ministerio: cubre TODOS los convenios
   * homologados —o sea que ninguno queda estructuralmente sin fuente— pero es un formulario, no un
   * listado raspable. Registrar dónde se consulta cuesta cero y ya es mejor que «nadie miró».
   */
  tipo?: 'listado_html' | 'manual';
  /** Un INSTANTE en ISO. `null` = nunca revisada, y de eso depende la línea de base. */
  ultimaRevision: string | null;
  ultimoResultado?: ResultadoRevision;
  ultimoError?: string;
  /** La última revisión no terminó en `ok`: la fuente está ciega. */
  conProblema: boolean;
}

export interface FuenteParitaria extends FuenteResumen {
  /** La página de LISTADO, no el PDF. */
  url: string;
  convenios: string[];
  patronIncluir: string;
  patronExcluir: string;
  enlacesUltimaExitosa?: number;
  publicaciones: number;
  sinVer: number;
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
  porConvenio: Record<string, FuenteResumen[]>;
  /**
   * Por `_id` de convenio, lo declarado a mano. SOLO los que alguien tocó.
   *
   * Va por `_id` y no por código: el código es opcional en el ABM y hay 1.555 con sufijo « E», así
   * que como clave no distingue con la seguridad que hace falta para escribir un dato.
   */
  declarado: Record<string, DeclaracionFuente>;
  sinVer: PublicacionParitaria[];
  conProblema: Array<FuenteResumen & { url: string }>;
  sinRevisar: number;
  /**
   * Convenios que alguna empresa USA y que nadie revisó todavía. La tarea concreta.
   *
   * Sobre los 2.669 del catálogo, «sin revisar» es cobertura preventiva y se mide en porcentaje.
   * Acá es trabajo que alguien pidió sin saberlo: registró una empresa con ese convenio.
   */
  enUsoSinRevisar: Array<{ _id: string; externalId: string; name: string }>;
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
  declararEstadoFuente: async (convenioId: string, estado: EstadoDeclarado, nota: string) => paritariasAPI.declararEstadoFuenteMasivo([convenioId], estado, nota),

  /**
   * El mismo endpoint, con la lista entera.
   *
   * Existe porque `sin_fuente_conocida` es un resultado FRECUENTE y llega de a entidades, no de a
   * convenios: un gremio que no publica cubre todos los suyos —la Federación de la Alimentación
   * firma once—. De a uno no se hace, y esos once vuelven a «nadie miró».
   *
   * `salteados` nombra los que no se pudieron marcar (tienen una fuente que los vigila) sin frenar
   * a los demás: abortar cincuenta por uno obligaría a rehacer el trabajo entero.
   */
  declararEstadoFuenteMasivo: async (convenioIds: string[], estado: EstadoDeclarado, nota: string): Promise<{ marcados: number; salteados: string[] }> =>
    (await axios.put(`${BASE}/convenios/estado-fuente`, { convenioIds, estado, nota })).data,

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
