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
  /**
   * Obras Sociales REGISTRADAS ante ARCA para este CUIT (Datos del Empleador → Obras Sociales).
   * Referencias al catálogo global. Es un conjunto: ARCA lleva ~400 registradas por empleadora sobre
   * un universo de 494, y solo acepta altas con una de ellas.
   */
  obrasSocialesIds?: string[];
  /** Cuál de las registradas se usa si la persona no tiene una propia. Vacío = la global. */
  obraSocialDefaultId?: number | null;
  /** @deprecated Nombre viejo de `obraSocialDefaultId`. El server sirve los dos; usar el nuevo. */
  obraSocialId?: number | null;
  /** Ids de los Convenios Colectivos asociados a la empresa. */
  convenioIds?: string[];
  /**
   * Sucursales del padrón de ARCA asignadas a esta empresa. Son referencias al catálogo de
   * Sucursales, donde vive todo el dato (código, domicilio, actividades). Acá solo se eligen.
   */
  sucursalIds?: string[];
  /**
   * Elección habitual de esta empleadora dentro del nomenclador de ARCA, para no repetirla en cada
   * alta. Guarda el código tal cual viaja al TXT.
   */
  defaultsArca?: {
    tipoServicio?: string;
    modalidadLiquidacion?: string;
  };
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
