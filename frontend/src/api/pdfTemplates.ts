import axios from "./axiosConfig";

export interface PdfTemplate {
  _id: string;
  tenantId: string;
  code: "dinero" | "fechaRango" | "fechaUnica";
  name: string;
  content: string;
  variablesHint?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PdfTemplateInput {
  code: "dinero" | "fechaRango" | "fechaUnica";
  name: string;
  content: string;
  variablesHint?: string;
  isActive?: boolean;
}

export const pdfTemplatesAPI = {
  getAll: async (): Promise<PdfTemplate[]> => {
    const response = await axios.get("/pdf-templates");
    return response.data;
  },

  getById: async (id: string): Promise<PdfTemplate> => {
    const response = await axios.get(`/pdf-templates/${id}`);
    return response.data;
  },

  create: async (data: PdfTemplateInput): Promise<PdfTemplate> => {
    const response = await axios.post("/pdf-templates", data);
    return response.data;
  },

  update: async (id: string, data: PdfTemplateInput): Promise<PdfTemplate> => {
    const response = await axios.put(`/pdf-templates/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await axios.delete(`/pdf-templates/${id}`);
  },
};

export const codeOptions = [
  { value: "dinero", label: "Dinero" },
  { value: "fechaRango", label: "Fecha - Rango" },
  { value: "fechaUnica", label: "Fecha - Única" },
] as const;

export const variablesByCode: Record<string, string[]> = {
  dinero: ["{{categoria}}", "{{subcategoria}}", "{{monto}}", "{{nombreUsuario}}", "{{numeroOrden}}"],
  fechaRango: ["{{categoria}}", "{{subcategoria}}", "{{dias}}", "{{fechaDesde}}", "{{fechaHasta}}", "{{nombreUsuario}}", "{{numeroOrden}}"],
  fechaUnica: ["{{categoria}}", "{{subcategoria}}", "{{fechaUnica}}", "{{nombreUsuario}}", "{{numeroOrden}}"],
};

export const systemVariables = [
  { variable: "{{razonSocial}}", description: "Razón social de la empresa" },
  { variable: "{{cuit}}", description: "CUIT de la empresa" },
  { variable: "{{ciudad}}", description: "Ciudad sede" },
  { variable: "{{fecha}}", description: "Fecha de generación del documento" },
];
