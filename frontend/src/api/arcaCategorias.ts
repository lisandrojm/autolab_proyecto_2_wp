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

/** Nivel 3: la categoría no lleva importes — los hereda de su grupo. */
export interface CategoriaArca {
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
}

/** Por qué una categoría no se puede usar. Ninguno de los tres es un estado con el que convivir. */
export type MotivoHuerfana = "sin_convenio" | "sin_convenio_ni_codigo" | "codigo_invalido";

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
  async crearCategoria(payload: { convenio: string; grupoId?: string; numeroGrupo?: number; codigoArca: string; nombre: string; descripcionArca?: string }): Promise<CategoriaArca> {
    const { data } = await axios.post(BASE, payload);
    return data;
  }

  async actualizarCategoria(id: string, payload: { convenio?: string; grupoId?: string; numeroGrupo?: number; codigoArca?: string; nombre?: string; descripcionArca?: string; isActive?: boolean }): Promise<CategoriaArca> {
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
