export interface UserProfile {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  fechaIngreso: string;
  puesto: string;
  departamento: string;
  jefe: string;
  avatar?: string;
  estadisticas: {
    diasVacacionesDisponibles: number;
    diasVacacionesTomados: number;
    compensatoriosDisponibles: number;
    horasExtrasAcumuladas: number;
  };
}

export interface VacationRequest {
  id: string;
  tipo: "vacaciones" | "compensatorio" | "personal";
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  motivo: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  fechaSolicitud: string;
  aprobadoPor?: string;
  comentarios?: string;
}

export interface Document {
  id: string;
  tipo: "contrato" | "recibo" | "certificado" | "liquidacion" | "otro";
  nombre: string;
  descripcion: string;
  fechaEmision: string;
  url: string;
  tamaño: string;
}

export interface Order {
  id: string;
  tipo: "equipo" | "software" | "utiles" | "otro";
  articulo: string;
  descripcion: string;
  cantidad: number;
  urgencia: "baja" | "media" | "alta";
  estado: "pendiente" | "aprobado" | "rechazado" | "entregado";
  fechaSolicitud: string;
  fechaEntregaEstimada?: string;
}

export interface CalendarEvent {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: "reunion" | "capacitacion" | "evento" | "deadline" | "vacaciones";
  fechaInicio: string;
  fechaFin: string;
  ubicacion?: string;
  participantes?: string[];
  todoElDia: boolean;
}

export interface Notification {
  id: string;
  tipo: "info" | "success" | "warning" | "error";
  titulo: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
  accion?: {
    texto: string;
    url: string;
  };
}

export interface Employee {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  puesto: string;
  departamento: string;
  fechaIngreso: string;
  estado: "activo" | "inactivo" | "suspendido";
  avatar?: string;
}

export interface PendingApproval {
  id: string;
  tipo: "vacaciones" | "compensatorio" | "pedido" | "documento";
  solicitante: string;
  descripcion: string;
  fechaSolicitud: string;
  urgencia: "baja" | "media" | "alta";
}

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

export interface VacationRequestAPI {
  _id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: "pending" | "approved" | "rejected";
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

export interface DocumentAPI {
  _id: string;
  employeeId: string;
  type: "contract" | "payslip" | "certificate" | "other";
  title: string;
  fileName: string;
  url: string;
  createdAt: string;
}

export interface CalendarEventAPI {
  _id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  type: "holiday" | "meeting" | "deadline" | "other";
  createdBy: string;
  createdAt: string;
}

export interface NotificationAPI {
  _id: string;
  userId: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  read: boolean;
  createdAt: string;
}

export interface EmployeeDataAPI {
  _id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  status: "active" | "inactive";
  photoUrl?: string;
}

export interface OrderRequestAPI {
  _id: string;
  employeeId: string;
  type: "equipment" | "software" | "supplies" | "other";
  description: string;
  quantity: number;
  urgency: "low" | "medium" | "high";
  status: "pending" | "approved" | "rejected" | "delivered";
  createdAt: string;
  deliveredAt?: string;
  requestedBy?: string;
}
