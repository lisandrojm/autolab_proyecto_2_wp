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
  tipo: 'vacaciones' | 'compensatorio' | 'personal';
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  motivo: string;
  estado: 'pendiente' | 'aprobada' | 'rechazada';
  fechaSolicitud: string;
  aprobadoPor?: string;
  comentarios?: string;
}

export interface Document {
  id: string;
  tipo: 'contrato' | 'recibo' | 'certificado' | 'liquidacion' | 'otro';
  nombre: string;
  descripcion: string;
  fechaEmision: string;
  url: string;
  tamaño: string;
}

export interface Order {
  id: string;
  tipo: 'equipo' | 'software' | 'utiles' | 'otro';
  articulo: string;
  descripcion: string;
  cantidad: number;
  urgencia: 'baja' | 'media' | 'alta';
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'entregado';
  fechaSolicitud: string;
  fechaEntregaEstimada?: string;
}

export interface CalendarEvent {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: 'reunion' | 'capacitacion' | 'evento' | 'deadline' | 'vacaciones';
  fechaInicio: string;
  fechaFin: string;
  ubicacion?: string;
  participantes?: string[];
  todoElDia: boolean;
}

export interface Notification {
  id: string;
  tipo: 'info' | 'success' | 'warning' | 'error';
  titulo: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
  accion?: {
    texto: string;
    url: string;
  };
}

export interface Activity {
  id: string;
  tipo: 'solicitud' | 'aprobacion' | 'rechazo' | 'comentario' | 'documento';
  descripcion: string;
  fecha: string;
  usuario: string;
  icono: string;
}

export interface Employee {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  puesto: string;
  departamento: string;
  fechaIngreso: string;
  estado: 'activo' | 'inactivo' | 'suspendido';
  avatar?: string;
}

export interface PendingApproval {
  id: string;
  tipo: 'vacaciones' | 'compensatorio' | 'pedido' | 'documento';
  solicitante: string;
  descripcion: string;
  fechaSolicitud: string;
  urgencia: 'baja' | 'media' | 'alta';
}
