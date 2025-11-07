import axios from './axiosConfig';

// Types
export interface Profile {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  emergencyContact?: string;
  position?: string;
  department?: string;
  hireDate?: string;
  photo?: string;
}

export interface ProfileStats {
  daysWorked: number;
  vacationDaysAvailable: number;
  vacationDaysUsed: number;
  pendingRequests: number;
}

export interface Vacation {
  _id: string;
  userId: string;
  userName?: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface VacationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface VacationAvailable {
  total: number;
  used: number;
  available: number;
}

export interface Order {
  _id: string;
  userId: string;
  userName?: string;
  type: string;
  description: string;
  dates?: {
    start?: string;
    end?: string;
  };
  status: 'pending' | 'approved' | 'rejected' | 'delivered';
  createdAt: string;
  updatedAt: string;
}

export interface OrderStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  delivered: number;
}

export interface Document {
  _id: string;
  userId: string;
  userName?: string;
  title: string;
  type: 'contract' | 'payroll' | 'certificate' | 'other';
  fileUrl: string;
  uploadDate: string;
  size?: number;
}

export interface CalendarEvent {
  _id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate: string;
  type?: 'meeting' | 'holiday' | 'deadline' | 'other';
  attendees?: string[];
  createdBy: string;
}

export interface Notification {
  _id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
}

export interface Activity {
  _id: string;
  userId: string;
  userName?: string;
  action: string;
  description: string;
  type: string;
  timestamp: string;
}

export interface Employee {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  position?: string;
  department?: string;
  status: 'active' | 'inactive';
  hireDate?: string;
}

// Profile API
export const profileAPI = {
  get: () => axios.get<Profile>('/profile'),
  update: (data: Partial<Profile>) => axios.put<Profile>('/profile', data),
  updatePhoto: (formData: FormData) => axios.put<Profile>('/profile/photo', formData),
  getStats: () => axios.get<ProfileStats>('/profile/stats'),
};

// Vacations API
export const vacationsAPI = {
  list: () => axios.get<Vacation[]>('/vacations'),
  get: (id: string) => axios.get<Vacation>(`/vacations/${id}`),
  create: (data: Omit<Vacation, '_id' | 'userId' | 'createdAt' | 'updatedAt'>) =>
    axios.post<Vacation>('/vacations', data),
  update: (id: string, data: Partial<Vacation>) => axios.put<Vacation>(`/vacations/${id}`, data),
  delete: (id: string) => axios.delete(`/vacations/${id}`),
  getAvailable: () => axios.get<VacationAvailable>('/vacations/available'),
  getStats: () => axios.get<VacationStats>('/vacations/stats'),
};

// Orders API
export const ordersAPI = {
  list: () => axios.get<Order[]>('/orders'),
  get: (id: string) => axios.get<Order>(`/orders/${id}`),
  create: (data: Omit<Order, '_id' | 'userId' | 'createdAt' | 'updatedAt'>) =>
    axios.post<Order>('/orders', data),
  update: (id: string, data: Partial<Order>) => axios.put<Order>(`/orders/${id}`, data),
  delete: (id: string) => axios.delete(`/orders/${id}`),
  getStats: () => axios.get<OrderStats>('/orders/stats'),
};

// Documents API
export const documentsAPI = {
  list: () => axios.get<Document[]>('/documents'),
  get: (id: string) => axios.get<Document>(`/documents/${id}`),
  download: (id: string) => axios.get(`/documents/download/${id}`, { responseType: 'blob' }),
  filter: (type?: string) => axios.get<Document[]>('/documents/filter', { params: { type } }),
  create: (formData: FormData) => axios.post<Document>('/documents', formData),
  delete: (id: string) => axios.delete(`/documents/${id}`),
};

// Calendar API
export const calendarAPI = {
  listEvents: () => axios.get<CalendarEvent[]>('/calendar/events'),
  getEvent: (id: string) => axios.get<CalendarEvent>(`/calendar/events/${id}`),
  getEventsByMonth: (year: number, month: number) =>
    axios.get<CalendarEvent[]>(`/calendar/events/month/${year}/${month}`),
  createEvent: (data: Omit<CalendarEvent, '_id' | 'createdBy'>) =>
    axios.post<CalendarEvent>('/calendar/events', data),
  updateEvent: (id: string, data: Partial<CalendarEvent>) =>
    axios.put<CalendarEvent>(`/calendar/events/${id}`, data),
  deleteEvent: (id: string) => axios.delete(`/calendar/events/${id}`),
};

// Notifications API
export const notificationsAPI = {
  list: () => axios.get<Notification[]>('/notifications'),
  getUnread: () => axios.get<Notification[]>('/notifications/unread'),
  getCount: () => axios.get<{ count: number }>('/notifications/count'),
  markAsRead: (id: string) => axios.put(`/notifications/${id}/read`),
  markAllAsRead: () => axios.put('/notifications/read-all'),
  delete: (id: string) => axios.delete(`/notifications/${id}`),
};

// Activity API
export const activityAPI = {
  getRecent: () => axios.get<Activity[]>('/activity/recent'),
  getAll: (page?: number, limit?: number) =>
    axios.get<{ activities: Activity[]; total: number; page: number; pages: number }>(
      '/activity/all',
      { params: { page, limit } }
    ),
};

// Admin API
export const adminAPI = {
  // Users/Employees
  listUsers: () => axios.get<Employee[]>('/admin/users'),
  getUser: (id: string) => axios.get<Employee>(`/admin/users/${id}`),
  updateUser: (id: string, data: Partial<Employee>) =>
    axios.put<Employee>(`/admin/users/${id}`, data),
  deleteUser: (id: string) => axios.delete(`/admin/users/${id}`),

  // Vacations
  getPendingVacations: () => axios.get<Vacation[]>('/admin/vacations/pending'),
  approveVacation: (id: string) => axios.put(`/admin/vacations/${id}/approve`),
  rejectVacation: (id: string) => axios.put(`/admin/vacations/${id}/reject`),

  // Orders
  getPendingOrders: () => axios.get<Order[]>('/admin/orders/pending'),
  approveOrder: (id: string) => axios.put(`/admin/orders/${id}/approve`),
  rejectOrder: (id: string) => axios.put(`/admin/orders/${id}/reject`),
  deliverOrder: (id: string) => axios.put(`/admin/orders/${id}/deliver`),
};

// Dashboard API
export const hrDashboardAPI = {
  getStats: () =>
    axios.get<{
      profile: Profile;
      vacations: VacationAvailable;
      vacationStats: VacationStats;
      orderStats: OrderStats;
      notificationCount: number;
      recentActivity: Activity[];
    }>('/admin'),
};
