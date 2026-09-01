import axiosInstance from "./axiosConfig";

export interface UserProjectUpdate {
  areaId?: string | null;
}

export const userProjectsAPI = {
  update: async (id: string, data: UserProjectUpdate) => {
    const response = await axiosInstance.patch(`/user-projects/${id}`, data);
    return response.data;
  },
};
