import axios from "./axiosConfig";

export interface InfoItem {
  _id: string;
  externalId: string;
  type: string;
  data: {
    id: number;
    nombre: string;
    [key: string]: any;
  };
  name: string;
  createdAt: string;
  updatedAt: string;
}

class InfoAPI {
  async listByType(type: string): Promise<InfoItem[]> {
    const { data } = await axios.get(`/info?type=${type}`);
    return data;
  }
}

export const infoAPI = new InfoAPI();
