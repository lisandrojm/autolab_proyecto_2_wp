import axios from "./axiosConfig";
import { OrderCategory } from "./orderCategories";

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

export interface CalendarEvent {
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

export interface EmployeeProfile {
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

export interface HRDocument {
  _id: string;
  tenantId: string;
  userId: any;
  type: "contract" | "payroll" | "certificate" | "other";
  title: string;
  description?: string;
  filePath?: string;
  fileUrl?: string;
  uploadedBy: any;
  uploadedAt: string;
  isVisibleToEmployee: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FutureAction {
  _id: string;
  tenantId: string;
  orderId: string;
  requiereAccionFutura: boolean;
  tipoAccionFutura: "documento" | "condicion" | "accion" | "presentacionDocumento" | "vencimientoSistema" | "vencimientoInterno" | "sinVencimiento";
  deadlineMode?: "plazoDias" | "fechaEspecifica" | "none";
  plazoDias?: number;
  fechaLimite?: string;
  descripcionAccion: string;
  responsableAccion: "usuario" | "area_interna";
  documentoRequerido?: string;
  documentoUrl?: string;
  quienDefineVencimiento?: "sistema" | "area_interna";
  estadoAccion: "pendiente" | "cumplida" | "vencida" | "pendiente_documento" | "documento_presentado" | "en_revision";
  fechaCreacionAccion: string;
  fechaCumplimiento?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  _id: string;
  tenantId: string;
  userId: any;
  orderNumber: string;
  description: string;
  category: string;
  categoryId?: OrderCategory | string;
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
  actionCompleted?: boolean;
  dynamicValue?: any;
  requiereAccionFutura?: boolean;
  futureActionId?: FutureAction | string;
  signatureStatus?: "not_required" | "pending" | "sent" | "signed";
  signatureSentAt?: string;
  signedAt?: string;
  signedBy?: any;
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
  status: "pending" | "approved" | "rejected" | "cancelled";
  reason: string;
  managerComment?: string;
  approvedBy?: any;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const hrManagementAPI = {
  activityLogs: {
    list: async (params?: {
      page?: number;
      limit?: number;
      userId?: string;
      action?: string;
      entityType?: string;
    }) => {
      const { data } = await axios.get<{ logs: ActivityLog[]; pagination: Pagination }>(
        "/hr-management/activitylogs",
        { params }
      );
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/activitylogs/count");
      return data.count;
    },
  },

  calendarEvents: {
    list: async (params?: {
      page?: number;
      limit?: number;
      year?: number;
      month?: number;
      userId?: string;
    }) => {
      const { data } = await axios.get<{ events: CalendarEvent[]; pagination: Pagination }>(
        "/hr-management/calendarevents",
        { params }
      );
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/calendarevents/count");
      return data.count;
    },
  },

  employeeProfiles: {
    list: async (params?: {
      page?: number;
      limit?: number;
      department?: string;
      isActive?: boolean;
      search?: string;
    }) => {
      const { data } = await axios.get<{ profiles: EmployeeProfile[]; pagination: Pagination }>(
        "/hr-management/employeeprofiles",
        { params }
      );
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/employeeprofiles/count");
      return data.count;
    },
  },

  hrDocuments: {
    list: async (params?: {
      page?: number;
      limit?: number;
      type?: string;
      userId?: string;
    }) => {
      const { data } = await axios.get<{ documents: HRDocument[]; pagination: Pagination }>(
        "/hr-management/hrdocuments",
        { params }
      );
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/hrdocuments/count");
      return data.count;
    },
  },

  orders: {
    list: async (params?: {
      page?: number;
      limit?: number;
      status?: string;
      category?: string;
      userId?: string;
    }) => {
      const { data } = await axios.get<{ orders: Order[]; pagination: Pagination }>(
        "/hr-management/orders",
        { params }
      );
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/orders/count");
      return data.count;
    },
    create: async (orderData: { title: string; description: string; category?: string; amount?: number; photo?: File | null }) => {
      const formData = new FormData();
      formData.append('title', orderData.title);
      formData.append('description', orderData.description);
      if (orderData.category) formData.append('category', orderData.category);
      if (orderData.amount !== undefined) formData.append('amount', orderData.amount.toString());
      if (orderData.photo) formData.append('photo', orderData.photo);

      const { data } = await axios.post<Order>("/hr-management/orders", formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return data;
    },
    update: async (orderId: string, updates: Partial<Order> & { photo?: File | null }) => {
      const formData = new FormData();
      if (updates.title) formData.append('title', updates.title);
      if (updates.description) formData.append('description', updates.description);
      if (updates.category) formData.append('category', updates.category);
      if (updates.amount !== undefined) formData.append('amount', updates.amount.toString());
      if (updates.status) formData.append('status', updates.status);
      if (updates.photo) formData.append('photo', updates.photo);

      const { data } = await axios.put<Order>(`/hr-management/orders/${orderId}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
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
  },

  vacationRequests: {
    list: async (params?: {
      page?: number;
      limit?: number;
      status?: string;
      userId?: string;
      year?: number;
    }) => {
      const { data } = await axios.get<{ vacations: VacationRequest[]; pagination: Pagination }>(
        "/hr-management/vacationrequests",
        { params }
      );
      return data;
    },
    count: async () => {
      const { data } = await axios.get<{ count: number }>("/hr-management/vacationrequests/count");
      return data.count;
    },
  },
};
