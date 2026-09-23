import axiosClient from "./axiosConfig";

/** La configuración global de Novedades: las dos ventanas, en días hacia atrás. */
export interface ConfiguracionGeneralNovedades {
  /** Hasta cuántos días atrás se puede CARGAR una novedad. */
  allowedPastDays: number;
  /** Hasta cuántos días atrás se puede EDITAR una ya cargada. */
  allowedEditPastDays: number;
}

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
    const response = await axiosClient.get<ConfiguracionGeneralNovedades>("/request-config/settings");
    return response.data;
  },

  /**
   * Los dos campos son opcionales y se mandan por separado: el que no viaja NO se toca.
   *
   * La pantalla tiene un botón de guardar por cada uno, y mandar los dos siempre haría que guardar la
   * ventana de carga pisara la de edición con lo que tuviera la pantalla en memoria.
   */
  updateGeneralSettings: async (data: { allowedPastDays?: number; allowedEditPastDays?: number }) => {
    const response = await axiosClient.put<ConfiguracionGeneralNovedades>("/request-config/settings", data);
    return response.data;
  },
};
