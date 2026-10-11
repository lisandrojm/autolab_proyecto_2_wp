import axios from "./axiosConfig";


import type { CategoriaSatItem } from "@compartido/arca/tiposArca";
export type { CategoriaSatItem } from "@compartido/arca/tiposArca";

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
