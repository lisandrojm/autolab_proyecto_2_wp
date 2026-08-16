import axios from "./axiosConfig";

export interface CategoriaSatItem {
  _id: string;
  externalId: string;
  name: string;
  /**
   * `false` = resuelve pero no se elige. Son alias que existen para que contratos históricos
   * encuentren su sueldo y su código ARCA, y no deben ofrecerse al cargar un contrato nuevo.
   * El listado las trae SIEMPRE: filtrar es responsabilidad de cada selector, nunca de la
   * resolución (si el TXT las filtrara, esos contratos saldrían sin sueldo). Usar `esElegible`.
   */
  isActive?: boolean;
  data: {
    id: number;
    numeroCategoria: number;
    sueldoBruto: number;
    sueldoBrutoLetras: string;
    neto: number;
    sueldoNetoLetras: string;
    fechaActualizacion: string;
    /** Numérico, por compatibilidad: pierde los ceros a la izquierda (35283, no "035283"). */
    codigoAfip: number;
    /**
     * El MISMO código, canónico: 6 dígitos con ceros a la izquierda, tal como lo escribe ARCA.
     * Es lo que hay que mostrar; `codigoAfip` queda para los consumidores que esperan un número.
     */
    codigoArca?: string;
    /**
     * Código de CCT al que pertenece la categoría ("0131/75"). NO va al TXT: se usa para validar
     * que la categoría sea de un convenio habilitado para la empleadora del contrato.
     */
    convenio?: string;
    presentismo: number;
    sueldoBasico: number;
    sueldoAdicional: number;
    nombre: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * ¿Se puede ELEGIR esta categoría para un contrato nuevo? Usarla en los selectores; nunca en la
 * resolución de un contrato ya cargado. Está acá y no inline en cada pantalla para que el criterio
 * sea uno solo: si mañana aparece otro motivo de no-elegible, se cambia en un lugar.
 */
export const esElegible = (cat: CategoriaSatItem): boolean => cat.isActive !== false;

/**
 * SOLO LECTURA. La escritura vive en `api/arcaCategorias.ts`, que trabaja sobre el modelo real
 * (convenio → grupo → categoría). Acá no quedó ningún método de alta/edición a propósito: mientras
 * existieran, seguía habiendo un camino para crear una categoría sin convenio o con código `0`.
 *
 * Lo que sí sigue: la lista plana, que consumen el TXT de ARCA, el chequeo de completitud, las
 * Funciones FRAME, el wizard de contratos y los PDFs.
 */
class CategoriaSatAPI {
  async list(): Promise<CategoriaSatItem[]> {
    const { data } = await axios.get("/categorias-sat");
    return data;
  }
}

export const categoriaSatAPI = new CategoriaSatAPI();
