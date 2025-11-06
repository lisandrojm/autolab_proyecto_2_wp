import axios from "./axiosConfig";
import { emitTenantsChanged } from "../utils/navbarEvents";

/* ==================== Tipos base ==================== */
type ObjectIdString = string & { readonly __objectIdBrand: unique symbol };

/* ==================== Dominio ==================== */
export interface Tenant {
  _id: ObjectIdString;
  name: string;
  slug: string;
  domain?: string;
  company: {
    legalName: string;
    taxId?: string;
    industry?: string;
    address?: {
      street: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
    website?: string;
    description?: string;
  };
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    position?: string;
    department?: string;
    password?: string;
  };
  settings: {
    timezone: string;
    currency: string;
    language: string;
    features: string[];
  };
  subscription: {
    plan: "free" | "basic" | "pro" | "enterprise";
    status: "active" | "suspended" | "cancelled";
    expiresAt?: string;
  };
  usage: {
    users: { current: number; limit: number };
    clients: { current: number; limit: number };
    campaigns: { current: number; limit: number };
    storage: { usedMB: number; limitMB: number };
    apiCalls: { current: number; limit: number; resetDate: string };
    lastUpdated: string;
  };
  billing: {
    currentPeriod: {
      startDate: string;
      endDate: string;
      amount: number;
      currency: string;
    };
    paymentMethod?: {
      type: "card" | "bank" | "paypal";
      last4?: string;
      expiryDate?: string;
    };
    invoices: {
      id: string;
      date: string;
      amount: number;
      status: "paid" | "pending" | "overdue" | "cancelled";
      downloadUrl?: string;
    }[];
    nextBillingDate?: string;
    autoRenew: boolean;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTenantDTO {
  name: string;
  slug: string;
  domain?: string;
  company: {
    legalName: string;
    taxId?: string;
    industry?: string;
    address?: {
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
    website?: string;
    description?: string;
  };
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    position?: string;
    department?: string;
    password?: string;
  };
  settings?: {
    timezone?: string;
    currency?: string;
    language?: string;
    features?: string[];
  };
  subscription?: {
    plan?: "free" | "basic" | "pro" | "enterprise";
    status?: "active" | "suspended" | "cancelled";
    expiresAt?: string;
  };
  usage?: {
    users?: { current?: number; limit?: number };
    clients?: { current?: number; limit?: number };
    campaigns?: { current?: number; limit?: number };
    storage?: { usedMB?: number; limitMB?: number };
    apiCalls?: { current?: number; limit?: number; resetDate?: string };
  };
  isActive?: boolean;
}

/* ==================== API ==================== */
export const tenantsApi = {
  getAll: async (params?: { page?: number; limit?: number; name?: string; status?: string }) => {
    const response = await axios.get("/tenants", { params });
    return response.data as { tenants?: Tenant[]; items?: Tenant[]; data?: Tenant[] } | Tenant[];
  },

  getById: async (id: string) => {
    const response = await axios.get(`/tenants/${id}`);
    return response.data as Tenant;
  },

  /** Conveniencia: obtener por slug si tu backend lo soporta */
  getBySlug: async (slug: string) => {
    const response = await axios.get(`/tenants/slug/${encodeURIComponent(slug)}`);
    return response.data as Tenant;
  },

  create: async (data: CreateTenantDTO) => {
    const response = await axios.post("/tenants", data);
    const tenant = response.data as Tenant;
    emitTenantsChanged("create", tenant._id);
    return tenant;
  },

  update: async (id: string, data: Partial<CreateTenantDTO>) => {
    const response = await axios.patch(`/tenants/${id}`, data);
    const tenant = response.data as Tenant;
    emitTenantsChanged("update", tenant._id);
    return tenant;
  },

  delete: async (id: string) => {
    const response = await axios.delete(`/tenants/${id}`);
    emitTenantsChanged("delete", id);
    return response.data as { ok: boolean } | void;
  },
};
