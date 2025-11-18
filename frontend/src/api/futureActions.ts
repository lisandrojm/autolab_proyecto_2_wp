import axios from "./axiosConfig";
import type {
  FutureAction,
  CreateFutureActionPayload,
  UpdateFutureActionPayload,
  FutureActionStats,
  FutureActionQueryParams,
  FutureActionResponse,
} from "../types/futureAction";

export const getFutureActions = async (
  params?: FutureActionQueryParams
): Promise<FutureActionResponse> => {
  const response = await axios.get("/future-actions", { params });
  return response.data;
};

export const getFutureActionById = async (id: string): Promise<FutureAction> => {
  const response = await axios.get(`/future-actions/${id}`);
  return response.data;
};

export const getFutureActionStats = async (): Promise<FutureActionStats> => {
  const response = await axios.get("/future-actions/stats");
  return response.data;
};

export const createFutureAction = async (
  data: CreateFutureActionPayload
): Promise<FutureAction> => {
  const response = await axios.post("/future-actions", data);
  return response.data;
};

export const updateFutureAction = async (
  id: string,
  data: UpdateFutureActionPayload
): Promise<FutureAction> => {
  const response = await axios.put(`/future-actions/${id}`, data);
  return response.data;
};

export const deleteFutureAction = async (id: string): Promise<void> => {
  await axios.delete(`/future-actions/${id}`);
};

export const checkExpiredFutureActions = async (): Promise<{
  message: string;
  updated: number;
}> => {
  const response = await axios.post("/future-actions/check-expired");
  return response.data;
};
