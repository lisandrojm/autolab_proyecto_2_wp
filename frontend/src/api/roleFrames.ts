import axios from "./axiosConfig";

export interface RoleFrameItem {
  _id: string;
  externalId: string;
  data: {
    rol: {
      id: number;
      nombre: string;
    };
    categoriasSat: any[];
  };
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Una función FRAME que ya no puede proponer una categoría válida.
 *
 * Lo calcula el server con la MISMA regla que el script de auditoría
 * (`utils/auditoriaFuncionesFrame.ts`): si el panel y el script contaran distinto, uno de los dos
 * estaría mintiendo y no habría forma de saber cuál.
 */
export interface FuncionRota {
  _id: string;
  nombre: string;
  rolId?: number;
  /** Cuántos contratos usan esta función. Es lo que decide si urge o si puede esperar. */
  contratos: number;
  conveniosVigentes: string[];
  /** En castellano y listos para mostrar: qué le falta y por qué. */
  motivos: string[];
}

class RoleFrameAPI {
  async list(): Promise<RoleFrameItem[]> {
    const { data } = await axios.get("/role-frames");
    return data;
  }

  /** Las funciones sin categoría válida, ordenadas por contratos afectados. */
  async rotas(): Promise<FuncionRota[]> {
    const { data } = await axios.get("/role-frames/rotas");
    return data;
  }

  async create(payload: { name: string; categoryIds: string[] }): Promise<RoleFrameItem> {
    const { data } = await axios.post("/role-frames", payload);
    return data;
  }

  async update(id: string, payload: { name?: string; categoryIds?: string[] }): Promise<RoleFrameItem> {
    const { data } = await axios.put(`/role-frames/${id}`, payload);
    return data;
  }

  async remove(id: string): Promise<any> {
    const { data } = await axios.delete(`/role-frames/${id}`);
    return data;
  }
}

export const roleFrameAPI = new RoleFrameAPI();
