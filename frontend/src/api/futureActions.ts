import axios from "./axiosConfig";
import type { OrderFutureAction, CreateOrderFutureActionPayload, UpdateOrderFutureActionPayload, OrderFutureActionStats, OrderFutureActionQueryParams, OrderFutureActionResponse } from "../types/orderFutureAction";

export const getOrderFutureActions = async (params?: OrderFutureActionQueryParams): Promise<OrderFutureActionResponse> => {
  const response = await axios.get("/future-actions", { params });
  return response.data;
};

export const getOrderFutureActionById = async (id: string): Promise<OrderFutureAction> => {
  const response = await axios.get(`/future-actions/${id}`);
  return response.data;
};

export const getOrderFutureActionStats = async (): Promise<OrderFutureActionStats> => {
  const response = await axios.get("/future-actions/stats");
  return response.data;
};

export const createOrderFutureAction = async (data: CreateOrderFutureActionPayload): Promise<OrderFutureAction> => {
  const response = await axios.post("/future-actions", data);
  return response.data;
};

export const updateOrderFutureAction = async (id: string, data: UpdateOrderFutureActionPayload): Promise<OrderFutureAction> => {
  const response = await axios.put(`/future-actions/${id}`, data);
  return response.data;
};

export const deleteOrderFutureAction = async (id: string): Promise<void> => {
  await axios.delete(`/future-actions/${id}`);
};

export const checkExpiredOrderFutureActions = async (): Promise<{
  message: string;
  updated: number;
}> => {
  const response = await axios.post("/future-actions/check-expired");
  return response.data;
};
