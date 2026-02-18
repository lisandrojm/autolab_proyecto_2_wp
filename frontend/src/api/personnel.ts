import axios from "./axiosConfig";

export interface ProfileData {
  _id: string;
  tenantId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
  };
  position?: string;
  positionName?: string;
  levelName?: string;
  department?: string;
  areaName?: string;
  areaMembers?: number;
  roleNames?: string[];
  projectIds?: string[];
  hireDate?: string;
  extraVacationDays?: number;
  carryOverVacationDays?: number;
  seniorityYears?: number;
  birthDate?: string;
  profilePhotoUrl?: string;
  vacationPolicy: {
    annualDays: number;
    carryOverDays: number;
  };
  isActive: boolean;
  externalInfo?: {
    sedes: string[];
    rolFrames: string[];
    contracts: string[];
    schedules: string[];
    projectDates: string[];
  };
  metadata?: {
    projects?: any[];
  };
  vacationsEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileStats {
  daysWorked: number;
  vacations: {
    total: number;
    used: number;
    available: number;
    pending?: number;
  };
  project?: string;
  projectVacationConfig?: {
    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
  vacationConfigSource?: string;
  vacationRulesMeta?: {
    minDiasSource: string;
    diasCorridosSource: string;
    fractionationSource: string;
  };
}

export interface DocumentData {
  _id: string;
  tenantId: string;
  userId: string;
  type: "contract" | "payroll" | "certificate" | "other";
  title: string;
  description?: string;
  filePath?: string;
  fileUrl?: string;
  uploadedBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  uploadedAt: string;
  isVisibleToEmployee: boolean;
}

export interface Calendar {
  _id: string;
  tenantId: string;
  userId: string;
  title: string;
  description?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  visibility: "private" | "team" | "company";
  createdBy: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  _id: string;
  tenantId: string;
  userId: string;
  type: "vacation" | "order" | "calendar" | "document" | "info";
  title: string;
  message: string;
  linkUrl?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface EmployeeData {
  _id: string;
  email: string;
  roles: Array<{ _id: string; name: string; description?: string }>;
  profile?: {
    _id: string;
    firstName: string;
    lastName: string;
    position?: string;
    department?: string;
    hireDate?: string;
    profilePhotoUrl?: string;
    vacationPolicy: {
      annualDays: number;
      carryOverDays: number;
    };
    isActive: boolean;
  };
}

export interface EmbeddedDocument {
  _id: string;
  name: string;
  fileUrl: string;
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
  quienDefineVencimiento?: "cliente" | "sistema" | "area_interna";
  metadata?: Record<string, any>;
}

export interface OrderData {
  _id: string;
  tenantId: string;
  userId:
    | string
    | {
        _id: string;
        firstName: string;
        lastName: string;
        email: string;
      };
  orderNumber: string;
  description: string;
  category: string;
  categoryId?:
    | string
    | {
        _id: string;
        name: string;
        requiresSignature?: boolean;
        requiresDocument?: boolean;
      };
  subcategories: string[];
  dynamicValue?: any;
  actionCompleted?: boolean;
  amount?: number;
  photoUrl?: string;
  daysRequested?: number;
  status: "pending" | "pre_approved" | "approved" | "rejected" | "delivered" | "cancelled";
  requestedAt: string;
  preApprovedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  preApprovedAt?: string;
  approvedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  approvedAt?: string;
  deliveredAt?: string;
  documents: EmbeddedDocument[];
  futureActions: FutureAction[];
  signatureStatus?: "not_required" | "pending" | "sent" | "signed";
  signatureSentAt?: string;
  signatureNotifiedAt?: string;
  signedAt?: string;
  signedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const personnelAPI = {
  // Profile endpoints
  getProfile: async (): Promise<ProfileData> => {
    const { data } = await axios.get("/profile");
    return data;
  },

  updateProfile: async (profileData: Partial<ProfileData>): Promise<ProfileData> => {
    const { data } = await axios.put("/profile", profileData);
    return data;
  },

  updateProfilePhoto: async (profilePhotoUrl: string): Promise<{ profilePhotoUrl: string }> => {
    const { data } = await axios.put("/profile/photo", { profilePhotoUrl });
    return data;
  },

  getProfileStats: async (): Promise<ProfileStats> => {
    const { data } = await axios.get("/profile/stats");
    return data;
  },

  // Vacation endpoints

  // Document endpoints
  getDocuments: async (): Promise<DocumentData[]> => {
    const { data } = await axios.get("/documents");
    return data;
  },

  getDocument: async (id: string): Promise<DocumentData> => {
    const { data } = await axios.get(`/documents/${id}`);
    return data;
  },

  downloadDocument: async (id: string): Promise<string> => {
    return `/api/v1/documents/download/${id}`;
  },

  filterDocuments: async (type: string): Promise<DocumentData[]> => {
    const { data } = await axios.get("/documents/filter", { params: { type } });
    return data;
  },

  // Orders endpoints
  getOrders: async (): Promise<OrderData[]> => {
    const { data } = await axios.get("/orders");
    return data;
  },

  getOrder: async (id: string): Promise<OrderData> => {
    const { data } = await axios.get(`/orders/${id}`);
    return data;
  },

  createOrder: async (orderData: { description?: string; category?: string; categoryId?: string; subcategories?: string[]; dynamicValue?: any; actionCompleted?: boolean; amount?: number; photo?: File | null; document?: File | null; futureActionPlazoDias?: number; futureActionFechaLimite?: string; futureActionDocumento?: string; daysRequested?: number }): Promise<OrderData> => {
    const formData = new FormData();
    if (orderData.description) formData.append("description", orderData.description);
    if (orderData.category) formData.append("category", orderData.category);
    if (orderData.categoryId) formData.append("categoryId", orderData.categoryId);
    if (orderData.subcategories && orderData.subcategories.length > 0) formData.append("subcategories", JSON.stringify(orderData.subcategories));
    if (orderData.dynamicValue !== undefined) formData.append("dynamicValue", JSON.stringify(orderData.dynamicValue));
    if (orderData.actionCompleted !== undefined) formData.append("actionCompleted", orderData.actionCompleted.toString());
    if (orderData.amount !== undefined) formData.append("amount", orderData.amount.toString());
    if (orderData.futureActionPlazoDias !== undefined) formData.append("futureActionPlazoDias", orderData.futureActionPlazoDias.toString());
    if (orderData.futureActionFechaLimite) formData.append("futureActionFechaLimite", orderData.futureActionFechaLimite);
    if (orderData.futureActionDocumento) formData.append("futureActionDocumento", orderData.futureActionDocumento);
    if (orderData.daysRequested !== undefined) formData.append("daysRequested", orderData.daysRequested.toString());
    if (orderData.photo) formData.append("photo", orderData.photo);
    if (orderData.document) formData.append("document", orderData.document);

    const { data } = await axios.post("/orders", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return data;
  },

  uploadOrderDocument: async (orderId: string, document: File): Promise<OrderData> => {
    const formData = new FormData();
    formData.append("document", document);

    const { data } = await axios.patch(`/orders/${orderId}/upload-document`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return data;
  },

  updateOrder: async (id: string, orderData: Partial<OrderData>): Promise<OrderData> => {
    const { data } = await axios.put(`/orders/${id}`, orderData);
    return data;
  },

  deleteOrder: async (id: string): Promise<void> => {
    await axios.delete(`/orders/${id}`);
  },

  notifySignatureCompleted: async (orderId: string): Promise<{ success: boolean; message: string }> => {
    const { data } = await axios.post(`/orders/${orderId}/notify-signature-completed`);
    return data;
  },

  getOrderStats: async (): Promise<{ pending: number; approved: number; rejected: number; delivered: number; cancelled: number }> => {
    const { data } = await axios.get("/orders/stats");
    return data;
  },

  // Calendar endpoints
  getCalendarEvents: async (): Promise<Calendar[]> => {
    const { data } = await axios.get("/calendar/events");
    return data;
  },

  getCalendarEvent: async (id: string): Promise<Calendar> => {
    const { data } = await axios.get(`/calendar/events/${id}`);
    return data;
  },

  getCalendarEventsMonth: async (year: number, month: number): Promise<Calendar[]> => {
    const { data } = await axios.get(`/calendar/events/month/${year}/${month}`);
    return data;
  },

  // Notification endpoints
  getNotifications: async (): Promise<Notification[]> => {
    const { data } = await axios.get("/notifications");
    return data;
  },

  getUnreadNotifications: async (): Promise<Notification[]> => {
    const { data } = await axios.get("/notifications/unread");
    return data;
  },

  getNotificationCount: async (): Promise<{ count: number }> => {
    const { data } = await axios.get("/notifications/count");
    return data;
  },

  markNotificationRead: async (id: string): Promise<Notification> => {
    const { data } = await axios.put(`/notifications/${id}/read`);
    return data;
  },

  markAllNotificationsRead: async (): Promise<{ message: string; count: number }> => {
    const { data } = await axios.put("/notifications/read-all");
    return data;
  },

  deleteNotification: async (id: string): Promise<{ message: string }> => {
    const { data } = await axios.delete(`/notifications/${id}`);
    return data;
  },

  // Admin endpoints
  getEmployees: async (page = 1, limit = 20, department?: string, isActive?: boolean): Promise<{ users: EmployeeData[]; pagination: { page: number; limit: number; total: number; pages: number } }> => {
    const params: any = { page, limit };
    if (department) params.department = department;
    if (isActive !== undefined) params.isActive = isActive;
    const { data } = await axios.get("/hr-admin/users", { params });
    return data;
  },

  getEmployee: async (id: string): Promise<EmployeeData> => {
    const { data } = await axios.get(`/hr-admin/users/${id}`);
    return data;
  },

  updateEmployee: async (id: string, employeeData: any): Promise<ProfileData> => {
    const { data } = await axios.put(`/hr-admin/users/${id}`, employeeData);
    return data;
  },

  deactivateEmployee: async (id: string): Promise<{ message: string }> => {
    const { data } = await axios.delete(`/hr-admin/users/${id}`);
    return data;
  },

  // Admin orders endpoints
  getPendingOrders: async (): Promise<OrderData[]> => {
    const { data } = await axios.get("/hr-admin/orders/pending");
    return data;
  },

  approveOrder: async (id: string): Promise<OrderData> => {
    const { data } = await axios.put(`/hr-admin/orders/${id}/approve`);
    return data;
  },

  rejectOrder: async (id: string): Promise<OrderData> => {
    const { data } = await axios.put(`/hr-admin/orders/${id}/reject`);
    return data;
  },

  deliverOrder: async (id: string): Promise<OrderData> => {
    const { data } = await axios.put(`/hr-admin/orders/${id}/deliver`);
    return data;
  },

  // Admin calendar endpoints
  createCalendarEventForUser: async (eventData: { userId?: string; title: string; description?: string; start: string; end: string; isAllDay?: boolean; visibility?: "private" | "team" | "company" }): Promise<Calendar> => {
    const { data } = await axios.post("/hr-admin/calendar/events", eventData);
    return data;
  },

  updateCalendarEventAdmin: async (id: string, eventData: any): Promise<Calendar> => {
    const { data } = await axios.put(`/hr-admin/calendar/events/${id}`, eventData);
    return data;
  },

  deleteCalendarEventAdmin: async (id: string): Promise<{ message: string }> => {
    const { data } = await axios.delete(`/hr-admin/calendar/events/${id}`);
    return data;
  },

  // Admin document endpoints
  createDocumentForUser: async (documentData: { userId: string; type: "contract" | "payroll" | "certificate" | "other"; title: string; description?: string; filePath?: string; fileUrl?: string; isVisibleToEmployee?: boolean }): Promise<DocumentData> => {
    const { data } = await axios.post("/hr-admin/documents", documentData);
    return data;
  },

  deleteDocumentAdmin: async (id: string): Promise<{ message: string }> => {
    const { data } = await axios.delete(`/hr-admin/documents/${id}`);
    return data;
  },
};
