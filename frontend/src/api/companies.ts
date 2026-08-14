import axios from "./axiosConfig";

export interface Company {
  _id: string;
  razonSocial: string;
  cuit?: string;
  domicilioCalle?: string;
  domicilioNumero?: string;
  domicilioPisoDepto?: string;
  localidad?: string;
  provincia?: string;
  codigoPostal?: string;
  firmanteNombre?: string;
  firmanteDni?: string;
  firmanteCargo?: string;
  representanteLegalNombre?: string;
  representanteLegalEmail?: string;
  // Membrete: logo y firma (imágenes). La aclaración/cargo reutilizan firmanteNombre/firmanteCargo.
  logoUrl?: string;
  signatureUrl?: string;
  /** Obra social por defecto de la empresa (data.id del catálogo). Vacío = usa la global. */
  obraSocialId?: number | null;
  /** Ids de los Convenios Colectivos asociados a la empresa. */
  convenioIds?: string[];
  /**
   * Sucursales del padrón de ARCA asignadas a esta empresa. Son referencias al catálogo de
   * Sucursales, donde vive todo el dato (código, domicilio, actividades). Acá solo se eligen.
   */
  sucursalIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}


export type CompanyInput = Omit<Company, "_id" | "createdAt" | "updatedAt">;

class CompaniesAPI {
  async list(): Promise<Company[]> {
    const { data } = await axios.get("/companies");
    return Array.isArray(data) ? data : [];
  }

  async create(payload: Partial<CompanyInput>): Promise<Company> {
    const { data } = await axios.post("/companies", payload);
    return data;
  }

  async update(id: string, payload: Partial<CompanyInput>): Promise<Company> {
    const { data } = await axios.put(`/companies/${id}`, payload);
    return data;
  }

  async remove(id: string): Promise<void> {
    await axios.delete(`/companies/${id}`);
  }
}

export const companiesAPI = new CompaniesAPI();
