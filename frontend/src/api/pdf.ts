import axios from "./axiosConfig";

export interface Pdf {
  _id: string;
  tenantId: string;
  code: "dinero" | "fechaRango" | "fechaUnica" | "vacaciones" | "objeto" | "otros";
  name: string;
  content: string;
  variablesHint?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PdfInput {
  code: "dinero" | "fechaRango" | "fechaUnica" | "vacaciones" | "objeto" | "otros";
  name: string;
  content: string;
  variablesHint?: string;
  isActive?: boolean;
}

export const pdfsAPI = {
  getAll: async (): Promise<Pdf[]> => {
    const response = await axios.get("/pdfs");
    return response.data;
  },

  getById: async (id: string): Promise<Pdf> => {
    const response = await axios.get(`/pdfs/${id}`);
    return response.data;
  },

  create: async (data: PdfInput): Promise<Pdf> => {
    const response = await axios.post("/pdfs", data);
    return response.data;
  },

  update: async (id: string, data: PdfInput): Promise<Pdf> => {
    const response = await axios.put(`/pdfs/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/pdfs/${id}`);
  },
};

export const codeOptions = [
  { value: "dinero", label: "Pedidos | Dinero" },
  { value: "fechaRango", label: "Pedidos | Fecha - Rango" },
  { value: "fechaUnica", label: "Pedidos | Fecha - Única" },
  { value: "objeto", label: "Pedidos | Objeto" },
  { value: "otros", label: "Pedidos | Otros" },
  { value: "vacaciones", label: "Vacaciones" },
] as const;

export const variablesByCode: Record<string, string[]> = {
  dinero: ["{{categoria}}", "{{subcategoria}}", "{{monto}}", "{{nombreUsuario}}", "{{numeroOrden}}"],
  fechaRango: ["{{categoria}}", "{{subcategoria}}", "{{dias}}", "{{fechaDesde}}", "{{fechaHasta}}", "{{nombreUsuario}}", "{{numeroOrden}}"],
  fechaUnica: ["{{categoria}}", "{{subcategoria}}", "{{fechaUnica}}", "{{nombreUsuario}}", "{{numeroOrden}}"],
  objeto: ["{{categoria}}", "{{subcategoria}}", "{{objeto}}", "{{nombreUsuario}}", "{{numeroOrden}}"],
  otros: ["{{categoria}}", "{{subcategoria}}", "{{detalle}}", "{{nombreUsuario}}", "{{numeroOrden}}"],
  vacaciones: ["{{dias}}", "{{anio}}", "{{fechaInicio}}", "{{fechaFin}}", "{{fechaReintegro}}", "{{nombreUsuario}}"],
};

export const systemVariables = [
  { variable: "{{razonSocial}}", description: "Razón social de la empresa" },
  { variable: "{{cuit}}", description: "CUIT de la empresa" },
  { variable: "{{ciudad}}", description: "Ciudad sede" },
  { variable: "{{fecha}}", description: "Fecha de generación del documento" },
];
