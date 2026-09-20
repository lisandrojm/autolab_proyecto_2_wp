import axiosClient from "./axiosConfig";

export interface RequestConfig {
  _id: string; // Mongoose ID
  tenantId: string;
  name: string;
  order: number;
  requiresReplacement: boolean;
  isActive: boolean;
  visibility: "all" | "specific";
  allowedProjectIds: string[];
}

/** Cómo se liquidan las horas extra a Memosoft. Es global: no depende del motivo de la novedad. */
export interface HorasExtraMemosoft {
  codigo50?: string | null;
  codigo100?: string | null;
  param: "par1" | "par2";
  unidad: "cantidad" | "importe";
  vigenteDesde?: string | null;
}

/**
 * QUÉ CONCEPTO COBRA UN DÍA TRABAJADO SIN NOVEDAD.
 *
 * Es la mayoría de los renglones, y un jornalero cobra por día: sin esto, la liquidación de los
 * jornaleros sale casi vacía. Arranca sin código porque cuál es lo define RRHH, no el sistema.
 */
export interface JornalBaseMemosoft {
  codigo?: string | null;
  param: "par1" | "par2";
  soloRegimen?: "mensual" | "jornalero" | null;
  vigenteDesde?: string | null;
}

export interface GeneralSettings {
  allowedPastDays: number;
  memosoftHorasExtra?: HorasExtraMemosoft | null;
  memosoftJornalBase?: JornalBaseMemosoft | null;
}

export const activityLogTypesAPI = {
  getAll: async () => {
    const response = await axiosClient.get<RequestConfig[]>("/request-config");
    return response.data;
  },

  create: async (data: Partial<RequestConfig>) => {
    const response = await axiosClient.post<RequestConfig>("/request-config", data);
    return response.data;
  },

  update: async (id: string, data: Partial<RequestConfig>) => {
    const response = await axiosClient.put<RequestConfig>(`/request-config/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await axiosClient.delete(`/request-config/${id}`);
  },

  reorder: async (items: { id: string; order: number }[]) => {
    await axiosClient.patch("/request-config/reorder", { items });
  },

  getGeneralSettings: async () => {
    const response = await axiosClient.get<GeneralSettings>("/request-config/settings");
    return response.data;
  },

  /**
   * Manda SÓLO lo que se quiere cambiar.
   *
   * El servidor toca únicamente los campos que vienen, así que guardar las horas extra no pisa los
   * días permitidos ni al revés.
   */
  updateGeneralSettings: async (data: Partial<GeneralSettings>) => {
    const response = await axiosClient.put<GeneralSettings>("/request-config/settings", data);
    return response.data;
  },
};
