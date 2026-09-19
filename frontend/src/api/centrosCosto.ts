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

export interface ResultadoEmpresaSync {
  empresaId: string;
  empresa: string;
  ok: boolean;
  /** Cómo llama Tango a este tipo de auxiliar en esa empresa («CC — CENTRO DE COSTOS»). */
  tipo?: string;
  creados: number;
  actualizados: number;
  inhabilitados: number;
  total: number;
  errores: string[];
}

export interface ResultadoSyncTango {
  ok: boolean;
  message: string;
  empresas: ResultadoEmpresaSync[];
  totalCatalogo: number;
  sincronizadoEl: string;
}

export interface EstadoSyncCentrosCosto {
  sincronizadoEl: string | null;
  total: number;
  porEmpresa: Array<{ empresa: string; total: number }>;
  /** `false` = falta `TANGO_API_URL` en el server: el botón no tiene a quién preguntarle. */
  tangoConfigurado: boolean;
}

export interface CentroCosto extends SimpleCatalogItem {
  /** De qué empresa vino: cada una tiene su Tango y sus códigos, que se repiten entre empresas. */
  empresaId?: string;
  empresaNombre?: string;
  origen?: "tango" | "import" | "manual";
  sincronizadoEl?: string;
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

/*
  ═══════════════════════════════════════════════════════════════════════
  BUSCAR EN EL SERVER, NO BAJAR EL CATÁLOGO
  ═══════════════════════════════════════════════════════════════════════

  El catálogo son 2.208 registros y más de un megabyte. Bajarlo entero para elegir UNO —o peor, para
  mostrar el que ya está elegido— era lo que tenía la pantalla de Proyectos bloqueada casi veinte
  segundos. Estas tres funciones son lo único que necesita el selector: buscar lo que se tipea, y
  resolver el que el proyecto ya tiene.
*/

/** Una fila del listado, ya proyectada por el server (sin el subdocumento `data` ni timestamps). */
export interface CentroCostoFila {
  _id: string;
  idAuxiliar?: number;
  codAuxiliar?: string;
  descAuxiliar?: string;
  habilitado?: string;
  empresaId?: string;
  empresaTangoId?: number;
  empresaNombre?: string;
  name?: string;
}

interface RespuestaPaginada {
  items: CentroCostoFila[];
  total: number;
  page: number;
  limit: number;
}

/** El listado siempre devuelve array cuando no se pagina; con parámetros, `{ items, total }`. */
const filas = (data: CentroCostoFila[] | RespuestaPaginada): CentroCostoFila[] => (Array.isArray(data) ? data : data?.items || []);

/** Busca por código, descripción o nombre. `limit` alto a propósito: un código vive en varias empresas. */
export const buscarCentrosCosto = async (q: string, limit = 50): Promise<CentroCostoFila[]> => {
  const { data } = await axios.get("/centros-costo", { params: { q, limit } });
  return filas(data);
};

/**
 * El centro que un proyecto tiene guardado. Ojo: se guarda el par (`idAuxiliar`, `empresaTangoId`) y
 * NO el `_id` de Mongo, porque el mismo id existe en cada empresa de Tango y significa otra cosa.
 */
export const centroCostoPorIdAuxiliar = async (idAuxiliar: number, empresaTangoId?: number): Promise<CentroCostoFila[]> => {
  const { data } = await axios.get("/centros-costo", { params: { idAuxiliar, ...(empresaTangoId ? { empresaTangoId } : {}), limit: 20 } });
  return filas(data);
};

/** Todas las filas de un código: son las empresas de Tango donde ese centro existe (los badges). */
export const centrosCostoPorCodigo = async (codAuxiliar: string): Promise<CentroCostoFila[]> => {
  const { data } = await axios.get("/centros-costo", { params: { codAuxiliar, limit: 20 } });
  return filas(data);
};

/**
 * Importa el catálogo de Tango.
 *
 * En `reemplazar` el server BORRA todo el catálogo y lo deja como el archivo, y con
 * `remapearProyectos` corrige los `centroCostoId` de los proyectos —que es lo que hace que un
 * proyecto que decía «682» siga diciendo «682»—. Valida todo el archivo antes de escribir: si algo
 * falla contesta 400 con la lista de errores y no toca nada.
 */
/**
 * Trae el catálogo de las tres empresas desde Tango (proceso 1656, registro 1 de cada una).
 *
 * Es el camino oficial; el import del JSON quedó como respaldo para cuando Tango no responde. El
 * server contesta el detalle por empresa: con tres Tango distintos, «salió bien» no alcanza.
 */
export const sincronizarCentrosCostoTango = async (): Promise<ResultadoSyncTango> => {
  const { data } = await axios.post("/centros-costo/sincronizar-tango", {});
  return data;
};

export const estadoSyncCentrosCosto = async (): Promise<EstadoSyncCentrosCosto> => {
  const { data } = await axios.get("/centros-costo/estado-sync");
  return data;
};

export const importarCentrosCostoJson = async (payload: PayloadImportCentrosCosto): Promise<ResultadoImportCentrosCosto> => {
  const { data } = await axios.post("/centros-costo/import-json", payload);
  return data;
};
