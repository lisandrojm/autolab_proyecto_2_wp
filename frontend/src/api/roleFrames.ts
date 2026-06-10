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

class RoleFrameAPI {
  async list(): Promise<RoleFrameItem[]> {
    const { data } = await axios.get("/role-frames");
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
