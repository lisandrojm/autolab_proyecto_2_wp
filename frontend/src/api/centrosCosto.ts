import axios from "./axiosConfig";
import { createSimpleCatalogApi, SimpleCatalogItem } from "./simpleCatalog";

/*
  CENTROS DE COSTO: EL AUXILIAR DE TANGO.

  Tiene su propio módulo —y no el genérico a secas— porque dejó de ser «nombre + id externo»: son los
  cuatro campos de Tango y un import que reemplaza el catálogo completo. El CRUD sigue siendo el del
  genérico (misma ruta, mismos verbos): lo que se agrega acá es el tipo y el import JSON.

  EL CÓDIGO (`codAuxiliar`) ES LO QUE SE MUESTRA en todas las pantallas: es el número con el que se lo
  nombra en producción. `name` y `data` siguen existiendo, derivados en el server, para el código que
  todavía los lee.
*/

export interface CentroCosto extends SimpleCatalogItem {
  /** El id del auxiliar en Tango. Es lo que guarda `Project.metadata.centroCostoId`. */
  idAuxiliar?: number;
  /** El número real del centro («682», «99», «SinAsignar»). Es lo que se muestra. */
  codAuxiliar?: string;
  descAuxiliar?: string;
  /** "S" | "N" tal cual viene de Tango. Un centro en "N" no se ofrece para elegir. */
  habilitado?: "S" | "N";
}

export interface ItemImportCentroCosto {
  idAuxiliar: number;
  codAuxiliar: string;
  descAuxiliar: string;
  habilitado: "S" | "N";
}

export interface PayloadImportCentrosCosto {
  tipo?: string;
  modo: "reemplazar" | "actualizar";
  total?: number;
  items: ItemImportCentroCosto[];
  /** Corregir además a qué centro apuntan los proyectos. Sólo aplica al reemplazar. */
  remapearProyectos?: boolean;
}

export interface ResultadoImportCentrosCosto {
  message: string;
  total: number;
  borrados: number;
  creados: number;
  actualizados: number;
  remapeados?: number;
  /** Los proyectos cuyo centro no existe en Tango: quedaron como estaban y hay que resolverlos. */
  sinEquivalente?: Array<{ projectId: string; nombre: string; centroCostoId: number; motivo: string }>;
}

/** El CRUD genérico sobre `/centros-costo` (listar, crear, editar, borrar, plantilla e import Excel). */
export const centrosCostoApi = createSimpleCatalogApi("/centros-costo");

/**
 * Importa el catálogo de Tango.
 *
 * En `reemplazar` el server BORRA todo el catálogo y lo deja como el archivo, y con
 * `remapearProyectos` corrige los `centroCostoId` de los proyectos —que es lo que hace que un
 * proyecto que decía «682» siga diciendo «682»—. Valida todo el archivo antes de escribir: si algo
 * falla contesta 400 con la lista de errores y no toca nada.
 */
export const importarCentrosCostoJson = async (payload: PayloadImportCentrosCosto): Promise<ResultadoImportCentrosCosto> => {
  const { data } = await axios.post("/centros-costo/import-json", payload);
  return data;
};
