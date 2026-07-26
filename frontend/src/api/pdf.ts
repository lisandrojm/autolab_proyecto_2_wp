import axios from "./axiosConfig";

export interface Pdf {
  _id: string;
  tenantId: string;
  code: "dinero" | "fechaRango" | "fechaUnica" | "fechasMultiples" | "vacaciones" | "objeto" | "otros" | "datosPersonales";
  name: string;
  title?: string;
  content: string;
  variablesHint?: string;
  isActive: boolean;
  usaMembrete?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PdfInput {
  code: "dinero" | "fechaRango" | "fechaUnica" | "fechasMultiples" | "vacaciones" | "objeto" | "otros" | "datosPersonales";
  name: string;
  title?: string;
  content: string;
  variablesHint?: string;
  isActive?: boolean;
  usaMembrete?: boolean;
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
  { value: "fechasMultiples", label: "Pedidos | Fecha - Múltiples" },
  { value: "objeto", label: "Pedidos | Objeto" },
  { value: "otros", label: "Pedidos | Otros" },
  { value: "datosPersonales", label: "Pedidos | Datos Personales" },
  { value: "vacaciones", label: "Vacaciones" },
] as const;

export const variablesByCode: Record<string, string[]> = {
  dinero: ["{{categoria}}", "{{subcategoria}}", "{{monto}}", "{{nombreUsuario}}", "{{numeroOrden}}", "{{textoAdicional}}"],
  fechaRango: ["{{categoria}}", "{{subcategoria}}", "{{dias}}", "{{fechaDesde}}", "{{fechaHasta}}", "{{fechas}}", "{{fechaUnica}}", "{{nombreUsuario}}", "{{numeroOrden}}", "{{textoAdicional}}"],
  fechaUnica: ["{{categoria}}", "{{subcategoria}}", "{{fechas}}", "{{fechaUnica}}", "{{nombreUsuario}}", "{{numeroOrden}}", "{{textoAdicional}}"],
  fechasMultiples: ["{{categoria}}", "{{subcategoria}}", "{{fechas}}", "{{fechasMultiples}}", "{{fechaUnica}}", "{{nombreUsuario}}", "{{numeroOrden}}", "{{textoAdicional}}"],
  objeto: ["{{categoria}}", "{{subcategoria}}", "{{objeto}}", "{{nombreUsuario}}", "{{numeroOrden}}", "{{textoAdicional}}"],
  otros: ["{{categoria}}", "{{subcategoria}}", "{{detalle}}", "{{nombreUsuario}}", "{{numeroOrden}}", "{{textoAdicional}}"],
  datosPersonales: ["{{categoria}}", "{{datosModificados}}", "{{nombreUsuario}}", "{{numeroOrden}}", "{{textoAdicional}}"],
  vacaciones: ["{{dias}}", "{{anio}}", "{{fechaInicio}}", "{{fechaFin}}", "{{fechaReintegro}}", "{{nombreUsuario}}"],
};

export const systemVariables = [
  { variable: "{{razonSocial}}", description: "Razón social de la empresa" },
  { variable: "{{cuit}}", description: "CUIT de la empresa" },
  { variable: "{{ciudad}}", description: "Ciudad sede" },
  { variable: "{{fecha}}", description: "Fecha de generación del documento" },
];
