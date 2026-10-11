import axios from "./axiosConfig";


import type { ContratoItem } from "@compartido/arca/tiposArca";
export type { ContratoItem } from "@compartido/arca/tiposArca";

export interface ContratoInput {
  nombre: string;
  cantidadJornadas?: string | number;
  multiplicadorDiario?: string | number;
  esTiempoIndeterminado?: boolean;
  modoFechas?: "periodo" | "dias";
  horasPorJornada?: string | number;
  diasPorSemana?: string | number;
  requiereFirma?: boolean;
  requiereFirmaRelease?: boolean;
  requiereFirmaAlta?: boolean;
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

/**
 * LOS TIPOS DE CONTRATO QUE SE OFRECEN PARA ELEGIR: sólo los activos.
 *
 * El catálogo entero se sigue usando para mostrar el nombre de un contrato que ya existe; esto es para
 * los selectores. El que ya está elegido se conserva aunque esté inactivo (`elegidoId`): sacarlo de la
 * lista haría saltar el select a otro valor al editar un contrato o una plantilla de antes.
 */
export const tiposDeContratoActivos = <T extends { _id: string; isActive?: boolean }>(lista: T[], elegidoId?: string | null): T[] =>
  lista.filter((c) => c.isActive !== false || (!!elegidoId && c._id === elegidoId));
