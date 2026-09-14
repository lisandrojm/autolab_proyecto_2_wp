export interface Vacation {
  id: string;
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  createdAt: string;
}

export interface Order {
  id: string;
  product: string;
  quantity: number;
  status: "pending" | "approved" | "delivered" | "rejected" | "cancelled";
  date: string;
  description: string;
}

export interface Document {
  id: string;
  name: string;
  type: "contract" | "payslip" | "certificate";
  date: string;
  url: string;
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  date: string;
  read: boolean;
  type: "info" | "success" | "warning";
}

export type ViewType = "home" | "calendar" | "documents" | "profile" | "vacations" | "orders" | "requests" | "activity_logs" | "user_history" | "my_teams" | "activity_compliance" | "registro" | "proyectos";
