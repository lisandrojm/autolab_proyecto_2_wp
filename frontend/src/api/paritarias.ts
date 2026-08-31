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

/**
 * El PDF guardado de una publicación.
 *
 * `disponible` NO es lo mismo que que el registro tenga archivo: el server comprueba que el
 * archivo esté REALMENTE en el disco. Confundirlos ofrecería una descarga que devuelve 404 — el
 * caso real es una base restaurada sin la carpeta `storage`.
 */
export interface ArchivoPublicacion {
  nombreOriginal: string;
  bytes: number;
  descargadoEl: string;
  disponible: boolean;
}

/** Una publicación con todo lo que hace falta para mirarla. Es lo que lista la pantalla de la fuente. */
export interface PublicacionDeFuente {
  _id: string;
  url: string;
  textoEnlace: string;
  hash: string;
  detectadaEl: string;
  vista: boolean;
  estado: 'detectada' | 'descartada';
  archivo: ArchivoPublicacion | null;
  /**
   * Por qué NO hay archivo. Distingue «todavía no se guardó» de «se intentó y falló», que es la
   * diferencia entre una publicación vieja y un PDF que el gremio repuso o borró.
   */
  archivoError: string;
  /** Lo detectado en el texto del PDF. `null` = todavía no se extrajo. */
  extraccion: ExtraccionPublicacion | null;
  /** El espejo en Dropbox. Puntero de conveniencia: la descarga NUNCA sale de acá. */
  dropbox: EspejoDropbox | null;
}

/** Una señal y el fragmento del que salió. Sin el fragmento no se puede verificar sin abrir el PDF. */
export interface SenalDetectada {
  valor: string;
  fragmento: string;
}

/**
 * Cómo se lleva lo que el acuerdo cita con lo que la fuente alimenta.
 *
 * `ajeno` y `sin_mencion` NO son lo mismo: la página del SATSAID cuelga acuerdos de 0223/75, que es
 * de otro gremio (16 de sus 31 publicaciones), mientras que los tarifarios de actores son tablas de
 * escala que no citan ningún CCT y son perfectamente nuestros. Fundirlos convertiría un documento
 * válido en uno sospechoso.
 */
export type CotejoConvenios = 'coinciden' | 'ajeno' | 'sin_mencion';

export interface ExtraccionPublicacion {
  paginas: number;
  extraidoEl: string;
  /** `vacio` = el PDF es imagen escaneada. NO es éxito: cero caracteres es un error, no un resultado. */
  estado: 'ok' | 'vacio' | 'error';
  motivo: string;
  extractor: 'pdftotext' | 'pdf-parse' | null;
  conveniosMencionados: SenalDetectada[];
  periodoMencionado: SenalDetectada | null;
  expediente: SenalDetectada | null;
  /** Presente = el documento dice que sus importes no son mensuales. La señal que más importa. */
  unidadSospechosa: SenalDetectada | null;
  cotejoConvenios: CotejoConvenios;
  /** El período del PDF contra el del enlace. `null` = no hay con qué comparar, que no es `false`. */
  periodoCoincide: boolean | null;
}

export interface EspejoDropbox {
  path: string;
  estado: 'ok' | 'pendiente' | 'error';
  motivo: string;
  subidoEl: string | null;
}

export interface TextoPublicacion {
  texto: string;
  paginas: number;
  estado: 'ok' | 'vacio' | 'error';
  motivo: string;
  extractor: string | null;
  nombreArchivo: string;
  caracteres: number;
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

  /**
   * Todas las publicaciones de una fuente. La pantalla que faltaba.
   *
   * El ABM decía «31 publicación(es)» y no había forma de verlas: el sistema avisaba de algo que
   * nadie podía abrir.
   */
  publicacionesDeFuente: async (fuenteId: string, q = ''): Promise<PublicacionDeFuente[]> =>
    (await axios.get(`${BASE}/fuentes/${fuenteId}/publicaciones`, { params: q.trim() ? { q: q.trim() } : {} })).data,

  /**
   * El texto plano de una publicación. Aparte de la lista a propósito: son ~25 KB por publicación, y
   * mandarlos todos juntos convertiría una lista de 8 KB en una de 800 KB cada vez que se abre el modal.
   */
  textoDePublicacion: async (publicacionId: string): Promise<TextoPublicacion> => (await axios.get(`${BASE}/publicaciones/${publicacionId}/texto`)).data,

  /**
   * Baja el PDF guardado y lo entrega con el nombre que tenía en la página del gremio.
   *
   * Va por axios y no por un `<a href>` porque el endpoint pide token. Devuelve el blob y el
   * nombre; el disparo de la descarga queda en la pantalla, como el resto de la app.
   */
  descargarArchivo: async (publicacionId: string): Promise<Blob> => (await axios.get(`${BASE}/publicaciones/${publicacionId}/archivo`, { responseType: "blob" })).data,
};
