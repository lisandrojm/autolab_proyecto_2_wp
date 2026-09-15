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
    /** Límites de la jornada del tipo de contrato. `null`/ausente = sin límite. */
    horasPorJornada?: number | null;
    diasPorSemana?: number | null;
    requiereFirma: boolean;
    /** Códigos ARCA para el TXT de Alta masiva (específicos de convenio/modalidad). */
    afipModalidadContrato?: string;
    afipTipoServicio?: string;
    afipActividad?: string;
    afipModalidadLiquidacion?: string;
    /** Si genera alta temprana ante ARCA. `false` = no es relación laboral (ej. locación de servicios). */
    generaAlta?: boolean;
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
  horasPorJornada?: string | number;
  diasPorSemana?: string | number;
  requiereFirma?: boolean;
  isActive?: boolean;
  afipModalidadContrato?: string;
  afipTipoServicio?: string;
  afipActividad?: string;
  afipModalidadLiquidacion?: string;
  generaAlta?: boolean;
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
