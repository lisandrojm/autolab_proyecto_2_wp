import axios from "./axiosConfig";

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

export interface Order {
  _id: string;
  tenantId: string;
  userId: any;
  title: string;
  description: string;
  category: string;
  status: "pending" | "approved" | "rejected" | "delivered" | "cancelled";
  requestedAt: string;
  approvedBy?: any;
  approvedAt?: string;
  deliveredAt?: string;
  amount?: number;
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
