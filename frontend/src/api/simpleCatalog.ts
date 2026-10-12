import axios from "./axiosConfig";
import { invalidateRefCache } from "../utils/refCache";


import type { SimpleCatalogItem } from "@compartido/arca/tiposArca";
export type { SimpleCatalogItem } from "@compartido/arca/tiposArca";

export interface SimpleCatalogApi {
  /**
   * Lista el catálogo. `filtros` viaja como querystring y el server solo atiende los que declaró en
   * su lista blanca (`filtrosPermitidos`); el resto los ignora, no falla.
   */
  list(filtros?: Record<string, string>): Promise<SimpleCatalogItem[]>;
  downloadTemplate(): Promise<Blob>;
  importExcel(file: File): Promise<{ message: string; count: number }>;
  /**
   * Carga masiva en UN request, sin Excel. Upsert por `externalId`, idempotente.
   *
   * Es lo que hay que usar para sembrar un catálogo entero: hacerlo de a un `create()` son miles de
   * requests contra un límite de 200/minuto, así que la carga se corta por 429 a mitad de camino.
   * Acepta `{ nombre, externalId }` o el vocabulario de ARCA (`{ descripcion, codigo }`).
   */
  importBulk(items: Array<Record<string, unknown>>): Promise<{ message: string; count: number; creados: number; actualizados: number; sinCambios: number }>;
  create(data: { nombre: string; externalId?: string } & Record<string, unknown>): Promise<SimpleCatalogItem>;
  update(id: string, data: { nombre?: string; externalId?: string } & Record<string, unknown>): Promise<SimpleCatalogItem>;
  remove(id: string): Promise<{ message: string }>;
}

/**
 * La clave con la que las pantallas cachean el listado de un catálogo (`cachedFetch`). Es una sola por
 * catálogo para que crear, editar, borrar o importar desde Configuración la invalide y Contratos,
 * Solicitudes y los proyectos vean el cambio al instante, en vez de esperar los 5 minutos del TTL.
 */
export const claveCacheCatalogo = (basePath: string) => `catalogo:${basePath}`;

/**
 * Crea un cliente API para un catálogo simple ({ externalId, name }).
 * basePath ej: "/bancos", "/obras-sociales", "/centros-costo".
 */
export function createSimpleCatalogApi(basePath: string): SimpleCatalogApi {
  const invalidar = () => invalidateRefCache(claveCacheCatalogo(basePath));
  return {
    async list(filtros?: Record<string, string>) {
      const { data } = await axios.get(basePath, filtros && Object.keys(filtros).length > 0 ? { params: filtros } : undefined);
      return data;
    },
    async downloadTemplate() {
      const { data } = await axios.get(`${basePath}/template`, { responseType: "blob" });
      return data;
    },
    async importExcel(file: File) {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await axios.post(`${basePath}/import`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      invalidar();
      return data;
    },
    async importBulk(items) {
      const { data } = await axios.post(`${basePath}/bulk`, { items });
      invalidar();
      return data;
    },
    async create(payload) {
      const { data } = await axios.post(basePath, payload);
      invalidar();
      return data;
    },
    async update(id, payload) {
      const { data } = await axios.put(`${basePath}/${id}`, payload);
      invalidar();
      return data;
    },
    async remove(id) {
      const { data } = await axios.delete(`${basePath}/${id}`);
      invalidar();
      return data;
    },
  };
}
