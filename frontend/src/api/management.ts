import axios from "./axiosConfig";
import { OrderConfig } from "./orderConfig";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ActivityLog {
  _id: string;
  tenantId: string;
  userId: any;
  action: string;
  description: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Calendar {
  _id: string;
  tenantId: string;
  userId: any;
  title: string;
  description?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  visibility: "private" | "team" | "company";
  createdBy: any;
  createdAt: string;
  updatedAt: string;
}

// ... (other interfaces)

export interface UserProfile {
  _id: string;
  tenantId: string;
  userId: any;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  position?: string;
  department?: string;
  hireDate?: string;
  birthDate?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
  };
  profilePhotoUrl?: string;
  vacationPolicy: {
    annualDays: number;
    carryOverDays: number;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmbeddedDocument {
  _id: string;
  type: "contract" | "payroll" | "certificate" | "other";
  title: string;
  description?: string;
  filePath?: string;
  fileUrl?: string;
  uploadedBy?: any;
  uploadedAt: string;
}

export interface FutureAction {
  _id: string;
  requiereAccionFutura: boolean;
  tipoAccionFutura: "documento" | "otra";
  deadlineMode?: "none" | "plazoDias" | "fechaEspecifica";
  descripcionAccion: string;
  responsableAccion: "usuario" | "cliente" | "area_interna";
  documentoRequerido?: string;
  plazoDias?: number;
  fechaLimite?: string;
  fechaCreacionAccion: string;
  fechaCumplimiento?: string;
  estadoAccion: "pendiente" | "cumplida" | "vencida" | "pendiente_documento" | "documento_presentado" | "en_revision";
  documentoUrl?: string;
  quienDefineVencimiento?: "cliente" | "sistema" | "area_interna";
  metadata?: Record<string, any>;
}

export interface Order {
  _id: string;
  tenantId: string;
  userId: any;
  orderNumber: string;
  description: string;
  category: string;
  categoryId?: OrderConfig | string;
  subcategories: string[];
  status: "pending" | "pre_approved" | "approved" | "rejected" | "delivered" | "cancelled";
  requestedAt: string;
  preApprovedBy?: any;
  preApprovedAt?: string;
  approvedBy?: any;
  approvedAt?: string;
  deliveredAt?: string;
  amount?: number;
  photoUrl?: string;
  documentoUrl?: string;
  actionCompleted?: boolean;
  dynamicValue?: any;
  requiresSignature?: boolean;
  signatureStatus?: "not_required" | "pending" | "sent" | "signed";
  signatureSentAt?: string;
  signatureNotifiedAt?: string;
  signedAt?: string;
  signedBy?: any;
  documents: EmbeddedDocument[];
  futureActions: FutureAction[];
  pdfPreAprobacionUrl?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface VacationRequest {
  _id: string;
  tenantId: string;
  userId: any;
  startDate: string;
  endDate: string;
  daysRequested: number;
  status: "pending" | "pre_approved" | "approved" | "rejected" | "delivered" | "cancelled";
  reason: string;
  managerComment?: string;
  approvedBy?: any;
  approvedAt?: string;
  deliveredAt?: string;
  rejectedAt?: string;
  preApprovedBy?: any;
  preApprovedAt?: string;
  requiresSignature?: boolean;
  signatureStatus?: "not_required" | "pending" | "sent" | "signed";
  signatureSentAt?: string;
  signatureNotifiedAt?: string;
  signedAt?: string;
  signedBy?: any;
  pdfPreAprobacionUrl?: string;
  ruleIds?: any[];
  createdAt: string;
  updatedAt: string;
}

export const hrManagementAPI = {
  activityLogs: {
    // ...
  },

  calendarEvents: {
    list: async (params?: { page?: number; limit?: number; year?: number; month?: number; userId?: string }) => {
      const { data } = await axios.get<{ events: Calendar[]; pagination: Pagination }>("/hr-management/calendarevents", { params });
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/calendarevents/count");
      return data.count;
    },
  },

  UserProfiles: {
    list: async (params?: { page?: number; limit?: number; department?: string; isActive?: boolean; search?: string }) => {
      const { data } = await axios.get<{ profiles: UserProfile[]; pagination: Pagination }>("/hr-management/employeeprofiles", { params });
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/employeeprofiles/count");
      return data.count;
    },
  },

  hrDocuments: {
    list: async (params?: { page?: number; limit?: number; type?: string; userId?: string }) => {
      const { data } = await axios.get<{ orders: Order[]; pagination: Pagination }>("/hr-management/orders", {
        params: { ...params, category: "documento" },
      });
      return { documents: data.orders, pagination: data.pagination };
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/orders/count", {
        params: { category: "documento" },
      });
      return data.count;
    },
  },

  orders: {
    list: async (params?: { page?: number; limit?: number; status?: string; category?: string; userId?: string }) => {
      const { data } = await axios.get<{ orders: Order[]; pagination: Pagination }>("/hr-management/orders", { params });
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/orders/count");
      return data.count;
    },
    create: async (orderData: { description: string; category?: string; amount?: number; photo?: File | null }) => {
      const formData = new FormData();
      formData.append("description", orderData.description);
      if (orderData.category) formData.append("category", orderData.category);
      if (orderData.amount !== undefined) formData.append("amount", orderData.amount.toString());
      if (orderData.photo) formData.append("photo", orderData.photo);

      const { data } = await axios.post<Order>("/hr-management/orders", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return data;
    },
    update: async (orderId: string, updates: Partial<Order> & { photo?: File | null }) => {
      const formData = new FormData();
      if (updates.description) formData.append("description", updates.description);
      if (updates.category) formData.append("category", updates.category);
      if (updates.amount !== undefined) formData.append("amount", updates.amount.toString());
      if (updates.status) formData.append("status", updates.status);
      if (updates.photo) formData.append("photo", updates.photo);
      if (updates.customTextBlock !== undefined) formData.append("customTextBlock", updates.customTextBlock);

      const { data } = await axios.put<Order>(`/hr-management/orders/${orderId}`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      return data;
    },
    delete: async (orderId: string) => {
      await axios.delete(`/hr-management/orders/${orderId}`);
    },
    preApprove: async (orderId: string) => {
      const { data } = await axios.put<Order>(`/hr-management/orders/${orderId}/pre-approve`);
      return data;
    },
    approve: async (orderId: string) => {
      const { data } = await axios.put<Order>(`/hr-management/orders/${orderId}/approve`);
      return data;
    },
    reject: async (orderId: string) => {
      const { data } = await axios.put<Order>(`/hr-management/orders/${orderId}/reject`);
      return data;
    },
    deliver: async (orderId: string) => {
      const { data } = await axios.put<Order>(`/hr-management/orders/${orderId}/deliver`);
      return data;
    },
    sendSignature: async (orderId: string) => {
      const { data } = await axios.put<Order>(`/hr-management/orders/${orderId}/send-signature`);
      return data;
    },
    markSigned: async (orderId: string) => {
      const { data } = await axios.put<Order>(`/hr-management/orders/${orderId}/mark-signed`);
      return data;
    },
    regeneratePdf: async (orderId: string) => {
      const { data } = await axios.post<{ success: boolean; message: string; pdfUrl: string }>(`/hr-admin/orders/${orderId}/regenerate-pdf`);
      return data;
    },
  },

  vacationRequests: {
    list: async (params?: { page?: number; limit?: number; status?: string; userId?: string; year?: number }) => {
      const { data } = await axios.get<{ vacations: VacationRequest[]; pagination: Pagination }>("/hr-management/vacationrequests", { params });
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/vacationrequests/count");
      return data.count;
    },
    preApprove: async (vacationId: string) => {
      const { data } = await axios.put<VacationRequest>(`/hr-admin/vacations/${vacationId}/pre-approve`);
      return data;
    },
    approve: async (vacationId: string) => {
      const { data } = await axios.put<VacationRequest>(`/hr-admin/vacations/${vacationId}/approve`);
      return data;
    },
    reject: async (vacationId: string) => {
      const { data } = await axios.put<VacationRequest>(`/hr-admin/vacations/${vacationId}/reject`);
      return data;
    },
    deliver: async (vacationId: string) => {
      const { data } = await axios.put<VacationRequest>(`/hr-admin/vacations/${vacationId}/deliver`);
      return data;
    },
    sendSignature: async (vacationId: string) => {
      const { data } = await axios.put<VacationRequest>(`/hr-admin/vacations/${vacationId}/send-signature`);
      return data;
    },
    markSigned: async (vacationId: string) => {
      const { data } = await axios.put<VacationRequest>(`/hr-admin/vacations/${vacationId}/mark-signed`);
      return data;
    },
  },
};
