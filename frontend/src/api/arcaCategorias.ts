import axios from "./axiosConfig";

/**
 * Categorías profesionales de ARCA, en la forma en que ARCA las modela:
 *
 *   Convenio (0634/11)
 *     └── Grupo 1..12        ← la ESCALA salarial
 *           └── Categoría    ← código de 6 dígitos + nombre, SIN importes
 *
 * Reemplaza al ABM plano de `categoriasSat.ts`, que quedó como lectura de compatibilidad para el TXT
 * de ARCA, el chequeo de completitud, las Funciones FRAME y los PDFs.
 */

/** Nivel 1: un convenio con categorías cargadas. */
export interface ConvenioConCategorias {
  /** Código de CCT, formato ARCA ("0634/11"). */
  convenio: string;
  /** Descripción del catálogo de Convenios; "" si el código no está cargado ahí. */
  nombre: string;
  grupos: number;
  categorias: number;
  /** Escala más reciente entre sus grupos: cuándo se aplicó la última paritaria. */
  ultimaActualizacion: string | null;
  /**
   * `true` si alguna empleadora lo tiene registrado ante ARCA.
   *
   * Con `categorias: 0` es el caso a resolver: el CCT está registrado pero no se le cargaron las
   * categorías, así que ningún alta bajo ese convenio se puede generar. `false` con categorías
   * cargadas es el inverso — categorías de un convenio que ninguna empleadora registró, que ARCA va
   * a rechazar.
   */
  registrado: boolean;
}

/** Los cinco importes de una escala salarial, vengan del grupo o de la categoría. */
export interface EscalaResuelta {
  sueldoBasico: number;
  sueldoAdicional: number;
  presentismo: number;
  sueldoBruto: number;
  sueldoBrutoLetras: string;
  neto: number;
  sueldoNetoLetras: string;
  fechaActualizacion: string | null;
}

/**
 * Nivel 3. La escala llega DOS VECES y las dos hacen falta:
 *
 *   · los campos de `EscalaResuelta` son lo que RIGE (propia, o heredada del grupo) → para mostrar.
 *   · `escalaPropia` es lo que tiene cargado esta categoría, sin heredar → para editar.
 *
 * Precargar un formulario con la heredada la convierte en propia al guardar, y esa categoría deja de
 * seguir a su grupo: la próxima paritaria se aplica al grupo y ella se queda con el número viejo.
 */
export interface CategoriaArca extends EscalaResuelta {
  _id: string;
  /** Canónico de ARCA: 6 dígitos con ceros a la izquierda. */
  codigoArca: string;
  nombre: string;
  /** Descripción completa de ARCA, con el sufijo "- GRUPO N" si lo trae. */
  descripcionArca: string;
  /** `false` = resuelve para contratos ya cargados, pero no se ofrece en contratos nuevos. */
  isActive: boolean;
  legacyId: number | null;
  /** Contratos que la usan. Es lo que decide si se puede eliminar o solo desactivar. */
  contratos: number;
  /** De dónde salieron los importes de arriba. `null` = no hay escala en ningún lado. */
  escalaOrigen: 'categoria' | 'grupo' | null;
  /** Lo cargado en ESTA categoría. `null` = nada propio, y el formulario arranca vacío. */
  escalaPropia: EscalaResuelta | null;
}

/** Nivel 2: el grupo es donde vive la escala, y por lo tanto donde se edita. */
export interface GrupoConvenio {
  _id: string;
  numero: number;
  nombre: string;
  sueldoBasico: number;
  sueldoAdicional: number;
  presentismo: number;
  sueldoBruto: number;
  sueldoBrutoLetras: string;
  neto: number;
  sueldoNetoLetras: string;
  fechaActualizacion: string | null;
  categorias: CategoriaArca[];
}

export interface ConvenioDetalle {
  convenio: string;
  nombre: string;
  grupos: GrupoConvenio[];
  /**
   * Las categorías del convenio que NO cuelgan de ningún grupo, con su escala propia.
   *
   * NO es excluyente con `grupos`: un mismo convenio puede tener las dos cosas. 0131/75 tiene 12
   * grupos vigentes y 206 categorías históricas sin grupo, y una pantalla que elija una vista según
   * `grupos.length` hace desaparecer 206 filas sin decir nada.
   */
  sinGrupo: CategoriaArca[];
}

/** Por qué una categoría no se puede usar. Ninguno de los tres es un estado con el que convivir. */
export type MotivoHuerfana = "sin_convenio" | "sin_convenio_ni_codigo" | "codigo_invalido";

/**
 * Contratos que apuntan a una categoría que no existe.
 *
 * El desglose POR ROL no es un detalle: es lo que separa casos distintos que comparten el mismo id
 * roto. Con el id 43, 163 contratos eran de «Director de Programas» —de donde venía ese id— y 1 de
 * «Jefe de Produccion», que ni siquiera propone esa categoría. Un solo número los habría hecho ver
 * como un grupo homogéneo al que aplicarle un solo arreglo.
 */
export interface PunterosHuerfanos {
  total: number;
  porCategoria: Array<{
    categoriaSatId: number;
    /** El nombre denormalizado en el contrato: la única pista de a qué apuntaba. */
    nombreGuardado: string;
    contratos: number;
    roles: Array<{ rolFrameId: number | null; nombre: string; contratos: number }>;
  }>;
}

/**
 * Convenios cuya escala declara una vigencia que ya pasó.
 *
 * A diferencia de los otros tres chequeos, este NO señala algo roto: la escala vencida sigue siendo
 * la última paritaria pactada y el alta se genera igual. Avisa para que nadie mande un TXT creyendo
 * que el importe está al día.
 */
export interface EscalasVencidas {
  total: number;
  porConvenio: Array<{ convenio: string; escalas: number; vigenciaHasta: string; diasVencida: number }>;
  /** Contra qué día se calculó. Hace el número reproducible al leer un reporte viejo. */
  hoy: string;
}

export interface CategoriaHuerfana {
  _id: string;
  nombre: string;
  convenio: string;
  codigoArca: string;
  grupoId: string;
  legacyId: number | null;
  motivo: MotivoHuerfana;
  contratos: number;
}

/** Valores de la escala salarial de un grupo. */
export interface EscalaGrupo {
  nombre?: string;
  sueldoBasico?: number;
  sueldoAdicional?: number;
  presentismo?: number;
  sueldoBruto?: number;
  sueldoBrutoLetras?: string;
  neto?: number;
  sueldoNetoLetras?: string;
  fechaActualizacion?: string;
}

const BASE = "/arca/categorias";

class ArcaCategoriasAPI {
  /** Nivel 1. No hay "todos": una categoría se lee dentro de su convenio. */
  async convenios(): Promise<ConvenioConCategorias[]> {
    const { data } = await axios.get(`${BASE}/convenios`);
    return data;
  }

  /** Convenios con la escala vencida. Avisa, no bloquea. */
  async escalasVencidas(): Promise<EscalasVencidas> {
    const { data } = await axios.get(`${BASE}/escalas-vencidas`);
    return data;
  }

  /**
   * Contratos con un `categoria_sat_id` que no resuelve.
   *
   * Va aparte de `huerfanas()` porque mira el problema desde el otro lado: aquella recorre categorías
   * y les busca defectos, esta recorre contratos y les busca punteros a la nada. Un id inexistente no
   * aparece en ninguna lista de categorías, así que solo se ve desde acá.
   */
  async contratosHuerfanos(): Promise<PunterosHuerfanos> {
    const { data } = await axios.get(`${BASE}/contratos-huerfanos`);
    return data;
  }

  /** Las que no se pueden usar. Van en un banner de error, no en un filtro. */
  async huerfanas(): Promise<CategoriaHuerfana[]> {
    const { data } = await axios.get(`${BASE}/huerfanas`);
    return data;
  }

  /**
   * Niveles 2 y 3 juntos: los grupos del convenio con sus categorías colgando.
   *
   * OJO: `convenio` es el CÓDIGO DE CCT (`externalId`, "0634/11"), NO el `_id` del catálogo. Pasarle
   * un `_id` no da 404: devuelve un detalle vacío con `nombre: ""` y cero grupos, que se lee igual
   * que "este convenio no tiene categorías". Es un error que se disfraza de dato.
   */
  async detalle(convenio: string): Promise<ConvenioDetalle> {
    const { data } = await axios.get(BASE, { params: { convenio } });
    return data;
  }

  async crearGrupo(payload: { convenio: string; numero: number } & EscalaGrupo): Promise<GrupoConvenio> {
    const { data } = await axios.post(`${BASE}/grupos`, payload);
    return data;
  }

  /**
   * Aplicar una paritaria. `categoriasAlcanzadas` dice a cuántas categorías llegó el cambio: la
   * escala vive en el grupo, así que tocarla alcanza a todas las suyas de una sola vez.
   */
  async actualizarGrupo(id: string, payload: EscalaGrupo & { numero?: number }): Promise<{ grupo: GrupoConvenio; categoriasAlcanzadas: number }> {
    const { data } = await axios.put(`${BASE}/grupos/${id}`, payload);
    return data;
  }

  async eliminarGrupo(id: string): Promise<{ message: string }> {
    const { data } = await axios.delete(`${BASE}/grupos/${id}`);
    return data;
  }

  /** La categoría no lleva importes: van `convenio`, `grupo`, `codigoArca` y `nombre`. */
  /**
   * Lo identificatorio de una categoría, más su escala PROPIA.
   *
   * `numeroGrupo` acepta `''` —no solo un número— porque «sin grupo» es un valor válido y hay que
   * poder mandarlo: ARCA no publica grupo en todos los convenios. Omitir la clave no sirve, porque
   * el backend distingue «no vino» (no toques el grupo) de «vino vacío» (sacale el grupo).
   *
   * Los importes solo tienen sentido SIN grupo. Con grupo la escala vive en el grupo, y mandarlos
   * acá la convierte en propia: esa categoría deja de seguir las paritarias del grupo para siempre.
   */
  async crearCategoria(payload: { convenio: string; grupoId?: string; numeroGrupo?: number | ''; codigoArca: string; nombre: string; descripcionArca?: string } & Partial<EscalaGrupo>): Promise<CategoriaArca> {
    const { data } = await axios.post(BASE, payload);
    return data;
  }

  async actualizarCategoria(id: string, payload: { convenio?: string; grupoId?: string; numeroGrupo?: number | ''; codigoArca?: string; nombre?: string; descripcionArca?: string; isActive?: boolean } & Partial<EscalaGrupo>): Promise<CategoriaArca> {
    const { data } = await axios.put(`${BASE}/${id}`, payload);
    return data;
  }

  /** Falla con 409 si hay contratos usándola: en ese caso se desactiva, no se borra. */
  async eliminarCategoria(id: string): Promise<{ message: string }> {
    const { data } = await axios.delete(`${BASE}/${id}`);
    return data;
  }

  /** Plantilla de paritarias del convenio: sale con sus grupos reales y la escala vigente. */
  async plantilla(convenio: string): Promise<Blob> {
    const { data } = await axios.get(`${BASE}/plantilla`, { params: { convenio }, responseType: "blob" });
    return data;
  }

  /** Carga masiva de escalas. La planilla identifica cada fila por `{convenio, grupo}`. */
  async importar(file: File): Promise<{ message: string; count: number; noEncontrados: string[] }> {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await axios.post(`${BASE}/importar`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    return data;
  }
}

export const arcaCategoriasAPI = new ArcaCategoriasAPI();
