import { Employee, PendingApproval } from './types';

export const mockEmployees: Employee[] = [
  {
    id: '1',
    nombre: 'María',
    apellido: 'González',
    email: 'maria.gonzalez@empresa.com',
    puesto: 'Desarrolladora Senior',
    departamento: 'Tecnología',
    fechaIngreso: '2022-03-15',
    estado: 'activo'
  },
  {
    id: '2',
    nombre: 'Carlos',
    apellido: 'Rodríguez',
    email: 'carlos.rodriguez@empresa.com',
    puesto: 'Líder de Equipo',
    departamento: 'Tecnología',
    fechaIngreso: '2020-01-10',
    estado: 'activo'
  },
  {
    id: '3',
    nombre: 'Ana',
    apellido: 'Martínez',
    email: 'ana.martinez@empresa.com',
    puesto: 'Diseñadora UX/UI',
    departamento: 'Diseño',
    fechaIngreso: '2021-06-20',
    estado: 'activo'
  },
  {
    id: '4',
    nombre: 'Luis',
    apellido: 'Fernández',
    email: 'luis.fernandez@empresa.com',
    puesto: 'Desarrollador Junior',
    departamento: 'Tecnología',
    fechaIngreso: '2023-09-01',
    estado: 'activo'
  },
  {
    id: '5',
    nombre: 'Laura',
    apellido: 'Pérez',
    email: 'laura.perez@empresa.com',
    puesto: 'Gerente de Recursos Humanos',
    departamento: 'RRHH',
    fechaIngreso: '2019-03-15',
    estado: 'activo'
  },
  {
    id: '6',
    nombre: 'Jorge',
    apellido: 'Sánchez',
    email: 'jorge.sanchez@empresa.com',
    puesto: 'Analista de Marketing',
    departamento: 'Marketing',
    fechaIngreso: '2022-11-01',
    estado: 'inactivo'
  }
];

export const mockPendingApprovals: PendingApproval[] = [
  {
    id: '1',
    tipo: 'vacaciones',
    solicitante: 'Ana Martínez',
    descripcion: 'Solicitud de 5 días de vacaciones',
    fechaSolicitud: '2025-01-22',
    urgencia: 'media'
  },
  {
    id: '2',
    tipo: 'compensatorio',
    solicitante: 'Luis Fernández',
    descripcion: 'Compensatorio por trabajo en fin de semana',
    fechaSolicitud: '2025-01-23',
    urgencia: 'baja'
  },
  {
    id: '3',
    tipo: 'pedido',
    solicitante: 'Ana Martínez',
    descripcion: 'Solicitud de licencia Adobe Creative Cloud',
    fechaSolicitud: '2025-01-24',
    urgencia: 'alta'
  },
  {
    id: '4',
    tipo: 'pedido',
    solicitante: 'Luis Fernández',
    descripcion: 'Solicitud de silla ergonómica',
    fechaSolicitud: '2025-01-25',
    urgencia: 'media'
  },
  {
    id: '5',
    tipo: 'vacaciones',
    solicitante: 'Jorge Sánchez',
    descripcion: 'Solicitud de 10 días de vacaciones',
    fechaSolicitud: '2025-01-21',
    urgencia: 'alta'
  }
];
