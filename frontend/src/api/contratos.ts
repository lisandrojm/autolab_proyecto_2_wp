import axios from "./axiosConfig";

/**
 * Contrato: el tipo de contrato real (Jornada, Plazo fijo 5x7, Tiempo Indeterminado, ...). Es lo
 * que se elige en el wizard de Agregar/Configurar miembro. Cada Contrato puede tener una o varias
 * Plantillas (ver `api/contratosFrame.ts`) que son el documento PDF en sí.
 */
export interface ContratoItem {
  _id: string;
  name: string;
  data: {
    cantidadJornadas: number;
    multiplicadorDiario: number;
    esTiempoIndeterminado: boolean;
    requiereFirma: boolean;
  };
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContratoInput {
  nombre: string;
  cantidadJornadas?: string | number;
  multiplicadorDiario?: string | number;
  esTiempoIndeterminado?: boolean;
  requiereFirma?: boolean;
  isActive?: boolean;
}

class ContratosAPI {
  async list(): Promise<ContratoItem[]> {
    const { data } = await axios.get("/contratos");
    return data;
  }

  async create(payload: ContratoInput): Promise<ContratoItem> {
    const { data } = await axios.post("/contratos", payload);
    return data;
  }

  async update(id: string, payload: ContratoInput): Promise<ContratoItem> {
    const { data } = await axios.put(`/contratos/${id}`, payload);
    return data;
  }

  async remove(id: string): Promise<{ message: string }> {
    const { data } = await axios.delete(`/contratos/${id}`);
    return data;
  }
}

export const contratosAPI = new ContratosAPI();
