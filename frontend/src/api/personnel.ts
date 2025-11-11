import axios from './axiosConfig';

export interface ProfileData {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  emergencyContact?: string;
  position?: string;
  department?: string;
  photoUrl?: string;
}

export interface ProfileStats {
  daysWorked: number;
  vacationDaysAvailable: number;
  vacationDaysUsed: number;
  pendingRequests: number;
}

export interface VacationRequest {
  _id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export interface VacationStats {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
}

export interface DocumentData {
  _id: string;
  employeeId: string;
  type: 'contract' | 'payslip' | 'certificate' | 'other';
  title: string;
  fileName: string;
  url: string;
  createdAt: string;
}

export interface CalendarEvent {
  _id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  type: 'holiday' | 'meeting' | 'deadline' | 'other';
  createdBy: string;
  createdAt: string;
}

export interface Notification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  read: boolean;
  createdAt: string;
}

export interface ActivityRecord {
  _id: string;
  userId: string;
  action: string;
  description: string;
  type: string;
  createdAt: string;
}

export interface EmployeeData {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  status: 'active' | 'inactive';
  photoUrl?: string;
}

export const personnelAPI = {
  // Profile endpoints
  getProfile: async (): Promise<ProfileData> => {
    const { data } = await axios.get('/profile');
    return data;
  },

  updateProfile: async (profileData: Partial<ProfileData>): Promise<ProfileData> => {
    const { data } = await axios.put('/profile', profileData);
    return data;
  },

  updateProfilePhoto: async (file: File): Promise<{ photoUrl: string }> => {
    const formData = new FormData();
    formData.append('photo', file);
    const { data } = await axios.put('/profile/photo', formData);
    return data;
  },

  getProfileStats: async (): Promise<ProfileStats> => {
    const { data } = await axios.get('/profile/stats');
    return data;
  },

  // Vacation endpoints
  getVacations: async (): Promise<VacationRequest[]> => {
    const { data } = await axios.get('/vacations');
    return data;
  },

  getVacation: async (id: string): Promise<VacationRequest> => {
    const { data } = await axios.get(`/vacations/${id}`);
    return data;
  },

  createVacation: async (vacationData: Partial<VacationRequest>): Promise<VacationRequest> => {
    const { data } = await axios.post('/vacations', vacationData);
    return data;
  },

  updateVacation: async (id: string, vacationData: Partial<VacationRequest>): Promise<VacationRequest> => {
    const { data } = await axios.put(`/vacations/${id}`, vacationData);
    return data;
  },

  deleteVacation: async (id: string): Promise<void> => {
    await axios.delete(`/vacations/${id}`);
  },

  getVacationAvailable: async (): Promise<{ available: number; used: number; total: number }> => {
    const { data } = await axios.get('/vacations/available');
    return data;
  },

  getVacationStats: async (): Promise<VacationStats> => {
    const { data } = await axios.get('/vacations/stats');
    return data;
  },

  // Document endpoints
  getDocuments: async (): Promise<DocumentData[]> => {
    const { data } = await axios.get('/documents');
    return data;
  },

  getDocument: async (id: string): Promise<DocumentData> => {
    const { data } = await axios.get(`/documents/${id}`);
    return data;
  },

  downloadDocument: async (id: string): Promise<Blob> => {
    const { data } = await axios.get(`/documents/download/${id}`, { responseType: 'blob' });
    return data;
  },

  filterDocuments: async (type: string): Promise<DocumentData[]> => {
    const { data } = await axios.get('/documents/filter', { params: { type } });
    return data;
  },

  uploadDocument: async (file: File, type: string, title: string): Promise<DocumentData> => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('type', type);
    formData.append('title', title);
    const { data } = await axios.post('/documents', formData);
    return data;
  },

  deleteDocument: async (id: string): Promise<void> => {
    await axios.delete(`/documents/${id}`);
  },

  // Calendar endpoints
  getCalendarEvents: async (): Promise<CalendarEvent[]> => {
    const { data } = await axios.get('/calendar/events');
    return data;
  },

  getCalendarEvent: async (id: string): Promise<CalendarEvent> => {
    const { data } = await axios.get(`/calendar/events/${id}`);
    return data;
  },

  getCalendarEventsMonth: async (year: number, month: number): Promise<CalendarEvent[]> => {
    const { data } = await axios.get(`/calendar/events/month/${year}/${month}`);
    return data;
  },

  createCalendarEvent: async (eventData: Partial<CalendarEvent>): Promise<CalendarEvent> => {
    const { data } = await axios.post('/calendar/events', eventData);
    return data;
  },

  updateCalendarEvent: async (id: string, eventData: Partial<CalendarEvent>): Promise<CalendarEvent> => {
    const { data } = await axios.put(`/calendar/events/${id}`, eventData);
    return data;
  },

  deleteCalendarEvent: async (id: string): Promise<void> => {
    await axios.delete(`/calendar/events/${id}`);
  },

  // Notification endpoints
  getNotifications: async (): Promise<Notification[]> => {
    const { data } = await axios.get('/notifications');
    return data;
  },

  getUnreadNotifications: async (): Promise<Notification[]> => {
    const { data } = await axios.get('/notifications/unread');
    return data;
  },

  getNotificationCount: async (): Promise<{ count: number }> => {
    const { data } = await axios.get('/notifications/count');
    return data;
  },

  markNotificationRead: async (id: string): Promise<void> => {
    await axios.put(`/notifications/${id}/read`);
  },

  markAllNotificationsRead: async (): Promise<void> => {
    await axios.put('/notifications/read-all');
  },

  deleteNotification: async (id: string): Promise<void> => {
    await axios.delete(`/notifications/${id}`);
  },

  // Activity endpoints
  getRecentActivity: async (): Promise<ActivityRecord[]> => {
    const { data } = await axios.get('/activity/recent');
    return data;
  },

  getAllActivity: async (): Promise<ActivityRecord[]> => {
    const { data } = await axios.get('/activity/all');
    return data;
  },

  // Activity stats
  getActivityStats: async (): Promise<any> => {
    const { data } = await axios.get('/activity/stats');
    return data;
  },

  // Admin endpoints
  getEmployees: async (): Promise<EmployeeData[]> => {
    const { data } = await axios.get('/hr-admin/users');
    return data;
  },

  getEmployee: async (id: string): Promise<EmployeeData> => {
    const { data } = await axios.get(`/hr-admin/users/${id}`);
    return data;
  },

  updateEmployee: async (id: string, employeeData: Partial<EmployeeData>): Promise<EmployeeData> => {
    const { data } = await axios.put(`/hr-admin/users/${id}`, employeeData);
    return data;
  },

  deleteEmployee: async (id: string): Promise<void> => {
    await axios.delete(`/hr-admin/users/${id}`);
  },

  // Admin vacation endpoints
  getPendingVacations: async (): Promise<VacationRequest[]> => {
    const { data } = await axios.get('/hr-admin/vacations/pending');
    return data;
  },

  approveVacation: async (id: string, managerComment?: string): Promise<VacationRequest> => {
    const { data } = await axios.put(`/hr-admin/vacations/${id}/approve`, { managerComment });
    return data;
  },

  rejectVacation: async (id: string, managerComment: string): Promise<VacationRequest> => {
    const { data } = await axios.put(`/hr-admin/vacations/${id}/reject`, { managerComment });
    return data;
  },

  // Order endpoints
  getOrders: async (): Promise<any[]> => {
    const { data } = await axios.get('/orders');
    return data;
  },

  getOrder: async (id: string): Promise<any> => {
    const { data } = await axios.get(`/orders/${id}`);
    return data;
  },

  createOrder: async (orderData: { title: string; description: string; category?: string; amount?: number }): Promise<any> => {
    const { data } = await axios.post('/orders', orderData);
    return data;
  },

  updateOrder: async (id: string, orderData: Partial<any>): Promise<any> => {
    const { data } = await axios.put(`/orders/${id}`, orderData);
    return data;
  },

  deleteOrder: async (id: string): Promise<void> => {
    await axios.delete(`/orders/${id}`);
  },

  getOrderStats: async (): Promise<any> => {
    const { data } = await axios.get('/orders/stats');
    return data;
  },

  // Admin orders endpoints
  getPendingOrders: async (): Promise<any[]> => {
    const { data } = await axios.get('/hr-admin/orders/pending');
    return data;
  },

  approveOrder: async (id: string): Promise<any> => {
    const { data } = await axios.put(`/hr-admin/orders/${id}/approve`);
    return data;
  },

  rejectOrder: async (id: string): Promise<any> => {
    const { data } = await axios.put(`/hr-admin/orders/${id}/reject`);
    return data;
  },

  deliverOrder: async (id: string): Promise<any> => {
    const { data } = await axios.put(`/hr-admin/orders/${id}/deliver`);
    return data;
  },
};
