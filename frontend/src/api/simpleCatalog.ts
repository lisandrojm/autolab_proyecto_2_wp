import axios from "./axiosConfig";

export interface SimpleCatalogItem {
  _id: string;
  externalId: string;
  name: string;
  data?: { id?: number; nombre?: string; porDefecto?: boolean };
  createdAt?: string;
  updatedAt?: string;
  // Campos extra opcionales por catálogo (ej. Bancos → tipoEntidad).
  [key: string]: unknown;
}

export interface SimpleCatalogApi {
  list(): Promise<SimpleCatalogItem[]>;
  downloadTemplate(): Promise<Blob>;
  importExcel(file: File): Promise<{ message: string; count: number }>;
  create(data: { nombre: string; externalId?: string } & Record<string, unknown>): Promise<SimpleCatalogItem>;
  update(id: string, data: { nombre?: string; externalId?: string } & Record<string, unknown>): Promise<SimpleCatalogItem>;
  remove(id: string): Promise<{ message: string }>;
  /** Marca este registro como el que se usa cuando la persona no tiene ninguno asignado. */
  setPorDefecto(id: string, porDefecto: boolean): Promise<{ ok: boolean; porDefecto: boolean }>;
}

/**
 * Crea un cliente API para un catálogo simple ({ externalId, name }).
 * basePath ej: "/bancos", "/obras-sociales", "/centros-costo".
 */
export function createSimpleCatalogApi(basePath: string): SimpleCatalogApi {
  return {
    async list() {
      const { data } = await axios.get(basePath);
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
      return data;
    },
    async create(payload) {
      const { data } = await axios.post(basePath, payload);
      return data;
    },
    async update(id, payload) {
      const { data } = await axios.put(`${basePath}/${id}`, payload);
      return data;
    },
    async remove(id) {
      const { data } = await axios.delete(`${basePath}/${id}`);
      return data;
    },
    async setPorDefecto(id, porDefecto) {
      const { data } = await axios.patch(`${basePath}/${id}/por-defecto`, { porDefecto });
      return data;
    },
  };
}
