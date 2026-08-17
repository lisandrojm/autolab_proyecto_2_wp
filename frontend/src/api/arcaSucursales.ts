import axios from "./axiosConfig";

/**
 * Catálogo de Sucursales del padrón de ARCA (Simplificación Registral).
 *
 * No confundir con Sedes: la Sede es el lugar de trabajo con el que opera el sistema; la Sucursal es
 * una entidad del padrón de ARCA con su código, domicilio y actividades. Las empresas no cargan
 * estos datos, solo eligen cuáles les corresponden.
 */
export interface ArcaSucursalActividad {
  /** Código de actividad de 6 dígitos (pos. 79-84 del TXT de alta). */
  codigo: string;
  descripcion?: string;
}

export interface ArcaSucursal {
  _id: string;
  /** Código de sucursal de 5 dígitos (pos. 74-78 del TXT de alta). */
  codigo: string;
  /** Domicilio tal como figura en el padrón, ej. "ZAPIOLA 392". */
  domicilio: string;
  localidad?: string;
  codigoPostal?: string;
  actividades: ArcaSucursalActividad[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type ArcaSucursalInput = Omit<ArcaSucursal, "_id" | "createdAt" | "updatedAt">;

class ArcaSucursalesAPI {
  async list(): Promise<ArcaSucursal[]> {
    const { data } = await axios.get("/arca/sucursales");
    return Array.isArray(data) ? data : [];
  }

  async create(payload: Partial<ArcaSucursalInput>): Promise<ArcaSucursal> {
    const { data } = await axios.post("/arca/sucursales", payload);
    return data;
  }

  async update(id: string, payload: Partial<ArcaSucursalInput>): Promise<ArcaSucursal> {
    const { data } = await axios.put(`/arca/sucursales/${id}`, payload);
    return data;
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/arca/sucursales/${id}`);
  }

  /** Plantilla .xlsx con el formato que espera el importador. */
  async downloadTemplate(): Promise<void> {
    const { data } = await axios.get("/arca/sucursales/template", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_arca_sucursales.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Importa el archivo de "Exportar lista a archivo" de ARCA (Datos del Empleador → Domicilios de
   * Explotación) o la plantilla. Sincroniza: las actividades se reemplazan por las del archivo.
   */
  async import(file: File): Promise<ImportSucursalesResult> {
    const formData = new FormData();
    formData.append("file", file);
    // Sin headers explícitos: el interceptor pone Authorization y el browser el boundary multipart.
    const { data } = await axios.post("/arca/sucursales/import", formData);
    return data;
  }
}

export interface ImportSucursalesResult {
  creadas: number;
  actualizadas: number;
  iguales: number;
  /** Códigos que están en WeProdu pero no en el archivo (no se borran: puede haber contratos usándolos). */
  sobrantes: string[];
  /** Códigos que venían sin domicilio y se saltearon. */
  sinDomicilio: string[];
  errores: string[];
  /**
   * Cuántas actividades del padrón se agregaron al diccionario de Actividades.
   *
   * El import las da de alta solas: así el diccionario termina con exactamente las que están en uso,
   * y todas correctas, porque salen del export de ARCA y no de alguien tipeando.
   */
  actividadesNuevas?: number;
}

export const arcaSucursalesAPI = new ArcaSucursalesAPI();

/** Etiqueta corta de una sucursal para selects y badges: "00002 — TRONADOR 671". */
export const etiquetaSucursal = (s: ArcaSucursal): string => `${s.codigo} — ${s.domicilio}`;
