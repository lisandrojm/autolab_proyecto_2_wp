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
}

export const roleFrameAPI = new RoleFrameAPI();
