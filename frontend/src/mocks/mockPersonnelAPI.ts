import { mockProfileData, mockProfileStats, mockVacationBalance, mockVacationStats, mockNotificationCount } from "./profile";
import { mockVacationRequestsAPI } from "./vacations";
import { mockDocumentsAPI } from "./documents";
import { mockNotificationsAPI } from "./notifications";

import { mockEmployeesAPI } from "./admin";
import { mockOrderRequestsAPI } from "./orders";

import type { ProfileData, ProfileStats, VacationRequestAPI, VacationStats, DocumentAPI, NotificationAPI, EmployeeDataAPI, OrderRequestAPI } from "./types";

const STORAGE_KEYS = {
  vacations: "mock_vacations",
  documents: "mock_documents",
  notifications: "mock_notifications",

  employees: "mock_employees",
  orders: "mock_orders",
  profile: "mock_profile",
};

const delay = (ms: number = 300) => new Promise((resolve) => setTimeout(resolve, ms));

const getStorageData = <T>(key: string, defaultData: T[]): T[] => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultData;
  } catch (error) {
    console.error(`Error loading ${key} from storage:`, error);
    return defaultData;
  }
};

const setStorageData = <T>(key: string, data: T[]): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error(`Error saving ${key} to storage:`, error);
  }
};

export const mockPersonnelAPI = {
  getProfile: async (): Promise<ProfileData> => {
    await delay();
    const stored = localStorage.getItem(STORAGE_KEYS.profile);
    return stored ? JSON.parse(stored) : mockProfileData;
  },

  updateProfile: async (profileData: Partial<ProfileData>): Promise<ProfileData> => {
    await delay();
    const current = await mockPersonnelAPI.getProfile();
    const updated = { ...current, ...profileData };
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(updated));
    return updated;
  },

  updateProfilePhoto: async (file: File): Promise<{ photoUrl: string }> => {
    await delay(500);
    const photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(file.name)}&background=3b82f6&color=fff`;
    const current = await mockPersonnelAPI.getProfile();
    const updated = { ...current, photoUrl };
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(updated));
    return { photoUrl };
  },

  getProfileStats: async (): Promise<ProfileStats> => {
    await delay();
    return mockProfileStats;
  },

  getVacations: async (): Promise<VacationRequestAPI[]> => {
    await delay();
    return getStorageData(STORAGE_KEYS.vacations, mockVacationRequestsAPI);
  },

  getVacation: async (id: string): Promise<VacationRequestAPI> => {
    await delay();
    const vacations = await mockPersonnelAPI.getVacations();
    const vacation = vacations.find((v) => v._id === id);
    if (!vacation) throw new Error("Vacation not found");
    return vacation;
  },

  createVacation: async (vacationData: Partial<VacationRequestAPI>): Promise<VacationRequestAPI> => {
    await delay();
    const vacations = await mockPersonnelAPI.getVacations();
    const newVacation: VacationRequestAPI = {
      _id: `vac_${Date.now()}`,
      employeeId: "user_001",
      startDate: vacationData.startDate || "",
      endDate: vacationData.endDate || "",
      days: vacationData.days || 0,
      reason: vacationData.reason,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    const updated = [newVacation, ...vacations];
    setStorageData(STORAGE_KEYS.vacations, updated);
    return newVacation;
  },

  updateVacation: async (id: string, vacationData: Partial<VacationRequestAPI>): Promise<VacationRequestAPI> => {
    await delay();
    const vacations = await mockPersonnelAPI.getVacations();
    const index = vacations.findIndex((v) => v._id === id);
    if (index === -1) throw new Error("Vacation not found");
    const updated = { ...vacations[index], ...vacationData };
    vacations[index] = updated;
    setStorageData(STORAGE_KEYS.vacations, vacations);
    return updated;
  },

  deleteVacation: async (id: string): Promise<void> => {
    await delay();
    const vacations = await mockPersonnelAPI.getVacations();
    const filtered = vacations.filter((v) => v._id !== id);
    setStorageData(STORAGE_KEYS.vacations, filtered);
  },

  getVacationAvailable: async (): Promise<{ available: number; used: number; total: number }> => {
    await delay();
    return mockVacationBalance;
  },

  getVacationStats: async (): Promise<VacationStats> => {
    await delay();
    return mockVacationStats;
  },

  getDocuments: async (): Promise<DocumentAPI[]> => {
    await delay();
    return getStorageData(STORAGE_KEYS.documents, mockDocumentsAPI);
  },

  getDocument: async (id: string): Promise<DocumentAPI> => {
    await delay();
    const documents = await mockPersonnelAPI.getDocuments();
    const document = documents.find((d) => d._id === id);
    if (!document) throw new Error("Document not found");
    return document;
  },

  downloadDocument: async (id: string): Promise<Blob> => {
    await delay(800);
    const content = `Mock document content for ${id}`;
    return new Blob([content], { type: "application/pdf" });
  },

  filterDocuments: async (type: string): Promise<DocumentAPI[]> => {
    await delay();
    const documents = await mockPersonnelAPI.getDocuments();
    return documents.filter((d) => d.type === type);
  },

  uploadDocument: async (file: File, type: string, title: string): Promise<DocumentAPI> => {
    await delay(1000);
    const documents = await mockPersonnelAPI.getDocuments();
    const newDocument: DocumentAPI = {
      _id: `doc_${Date.now()}`,
      employeeId: "user_001",
      type: type as DocumentAPI["type"],
      title,
      fileName: file.name,
      url: `/documents/${file.name}`,
      createdAt: new Date().toISOString(),
    };
    const updated = [newDocument, ...documents];
    setStorageData(STORAGE_KEYS.documents, updated);
    return newDocument;
  },

  deleteDocument: async (id: string): Promise<void> => {
    await delay();
    const documents = await mockPersonnelAPI.getDocuments();
    const filtered = documents.filter((d) => d._id !== id);
    setStorageData(STORAGE_KEYS.documents, filtered);
  },

  getCalendarEvents: async (): Promise<any[]> => {
    await delay();
    return [];
  },

  getCalendarEvent: async (id: string): Promise<any> => {
    await delay();
    throw new Error("Calendar event not found");
  },

  getCalendarEventsMonth: async (year: number, month: number): Promise<any[]> => {
    await delay();
    return [];
  },

  createCalendarEvent: async (eventData: any): Promise<any> => {
    await delay();
    return { ...eventData, _id: `event_${Date.now()}`, createdAt: new Date().toISOString() };
  },

  updateCalendarEvent: async (id: string, eventData: any): Promise<any> => {
    await delay();
    return { ...eventData, _id: id };
  },

  deleteCalendarEvent: async (id: string): Promise<void> => {
    await delay();
  },

  getNotifications: async (): Promise<NotificationAPI[]> => {
    await delay();
    return getStorageData(STORAGE_KEYS.notifications, mockNotificationsAPI);
  },

  getUnreadNotifications: async (): Promise<NotificationAPI[]> => {
    await delay();
    const notifications = await mockPersonnelAPI.getNotifications();
    return notifications.filter((n) => !n.read);
  },

  getNotificationCount: async (): Promise<{ count: number }> => {
    await delay();
    const unread = await mockPersonnelAPI.getUnreadNotifications();
    return { count: unread.length };
  },

  markNotificationRead: async (id: string): Promise<void> => {
    await delay();
    const notifications = await mockPersonnelAPI.getNotifications();
    const notification = notifications.find((n) => n._id === id);
    if (notification) {
      notification.read = true;
      setStorageData(STORAGE_KEYS.notifications, notifications);
    }
  },

  markAllNotificationsRead: async (): Promise<void> => {
    await delay();
    const notifications = await mockPersonnelAPI.getNotifications();
    notifications.forEach((n) => (n.read = true));
    setStorageData(STORAGE_KEYS.notifications, notifications);
  },

  deleteNotification: async (id: string): Promise<void> => {
    await delay();
    const notifications = await mockPersonnelAPI.getNotifications();
    const filtered = notifications.filter((n) => n._id !== id);
    setStorageData(STORAGE_KEYS.notifications, filtered);
  },

  getEmployees: async (): Promise<EmployeeDataAPI[]> => {
    await delay();
    return getStorageData(STORAGE_KEYS.employees, mockEmployeesAPI);
  },

  getEmployee: async (id: string): Promise<EmployeeDataAPI> => {
    await delay();
    const employees = await mockPersonnelAPI.getEmployees();
    const employee = employees.find((e) => e._id === id);
    if (!employee) throw new Error("Employee not found");
    return employee;
  },

  updateEmployee: async (id: string, employeeData: Partial<EmployeeDataAPI>): Promise<EmployeeDataAPI> => {
    await delay();
    const employees = await mockPersonnelAPI.getEmployees();
    const index = employees.findIndex((e) => e._id === id);
    if (index === -1) throw new Error("Employee not found");
    const updated = { ...employees[index], ...employeeData };
    employees[index] = updated;
    setStorageData(STORAGE_KEYS.employees, employees);
    return updated;
  },

  deleteEmployee: async (id: string): Promise<void> => {
    await delay();
    const employees = await mockPersonnelAPI.getEmployees();
    const filtered = employees.filter((e) => e._id !== id);
    setStorageData(STORAGE_KEYS.employees, filtered);
  },

  getPendingVacations: async (): Promise<VacationRequestAPI[]> => {
    await delay();
    const vacations = await mockPersonnelAPI.getVacations();
    return vacations.filter((v) => v.status === "pending");
  },

  approveVacation: async (id: string): Promise<VacationRequestAPI> => {
    await delay();
    const vacations = await mockPersonnelAPI.getVacations();
    const index = vacations.findIndex((v) => v._id === id);
    if (index === -1) throw new Error("Vacation not found");
    vacations[index].status = "approved";
    vacations[index].approvedBy = "Admin";
    vacations[index].approvedAt = new Date().toISOString();
    setStorageData(STORAGE_KEYS.vacations, vacations);
    return vacations[index];
  },

  rejectVacation: async (id: string): Promise<VacationRequestAPI> => {
    await delay();
    const vacations = await mockPersonnelAPI.getVacations();
    const index = vacations.findIndex((v) => v._id === id);
    if (index === -1) throw new Error("Vacation not found");
    vacations[index].status = "rejected";
    vacations[index].approvedBy = "Admin";
    setStorageData(STORAGE_KEYS.vacations, vacations);
    return vacations[index];
  },

  getPendingOrders: async (): Promise<OrderRequestAPI[]> => {
    await delay();
    const orders = getStorageData(STORAGE_KEYS.orders, mockOrderRequestsAPI);
    return orders.filter((o) => o.status === "pending" || o.status === "approved");
  },

  approveOrder: async (id: string): Promise<OrderRequestAPI> => {
    await delay();
    const orders = getStorageData(STORAGE_KEYS.orders, mockOrderRequestsAPI);
    const index = orders.findIndex((o) => o._id === id);
    if (index === -1) throw new Error("Order not found");
    orders[index].status = "approved";
    setStorageData(STORAGE_KEYS.orders, orders);
    return orders[index];
  },

  rejectOrder: async (id: string): Promise<OrderRequestAPI> => {
    await delay();
    const orders = getStorageData(STORAGE_KEYS.orders, mockOrderRequestsAPI);
    const index = orders.findIndex((o) => o._id === id);
    if (index === -1) throw new Error("Order not found");
    orders[index].status = "rejected";
    setStorageData(STORAGE_KEYS.orders, orders);
    return orders[index];
  },

  deliverOrder: async (id: string): Promise<OrderRequestAPI> => {
    await delay();
    const orders = getStorageData(STORAGE_KEYS.orders, mockOrderRequestsAPI);
    const index = orders.findIndex((o) => o._id === id);
    if (index === -1) throw new Error("Order not found");
    orders[index].status = "delivered";
    orders[index].deliveredAt = new Date().toISOString();
    setStorageData(STORAGE_KEYS.orders, orders);
    return orders[index];
  },
};
