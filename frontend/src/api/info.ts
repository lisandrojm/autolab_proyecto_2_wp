import axios from "./axiosConfig";

export interface InfoItem {
  _id: string;
  externalId: string;
  type: string;
  data: {
    id: number;
    nombre: string;
    /** Estados: color del texto del badge (el fondo es ese color con transparencia). */
    color?: string;
    /** Estados: tipos de contrato (contratos-frame) en los que se ofrece. Vacío = todos. */
    contratoFrameIds?: string[];
    /** Estados: nombre que lleva dentro del contrato (obligatorio para Activo/Inactivo). */
    nombreEnContrato?: string;
    /** Estados: marca los de índole impositiva, para darles un tratamiento distinto. */
    esImpositivo?: boolean;
    /** Estados: orden visual en el ABM y en el dropdown del wizard (guía, no bloquea transiciones). */
    orden?: number;
    [key: string]: any;
  };
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface EstadoPayload {
  name: string;
  color?: string;
  nombreEnContrato?: string;
  contratoFrameIds?: string[];
  esImpositivo?: boolean;
}

class InfoAPI {
  async listByType(type: string): Promise<InfoItem[]> {
    const { data } = await axios.get(`/info?type=${type}`);
    return data;
  }

  /* --------- ABM de Estados (infos con type "estado-empleado") --------- */

  async listEstados(): Promise<InfoItem[]> {
    return this.listByType("estado-empleado");
  }

  async createEstado(payload: EstadoPayload): Promise<InfoItem> {
    const { data } = await axios.post(`/info/estados`, payload);
    return data;
  }

  async updateEstado(id: string, payload: EstadoPayload): Promise<InfoItem> {
    const { data } = await axios.patch(`/info/estados/${id}`, payload);
    return data;
  }

  async deleteEstado(id: string): Promise<void> {
    await axios.delete(`/info/estados/${id}`);
  }

  /** Guarda el orden visual tras arrastrar en el ABM (guía, no bloquea transiciones). */
  async reorderEstados(items: { id: string; orden: number }[]): Promise<void> {
    await axios.patch(`/info/estados/reorder`, { items });
  }
}

export const infoAPI = new InfoAPI();
