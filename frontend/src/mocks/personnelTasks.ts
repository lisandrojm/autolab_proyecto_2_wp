export interface PersonnelTask {
  id: string;
  title: string;
  description: string;
  type: 'reminder' | 'action' | 'deadline';
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  postponeCount: number;
  createdAt: string;
}

export const mockPersonnelTasks: PersonnelTask[] = [
  {
    id: 'task_001',
    title: 'Revisión de evaluación de desempeño',
    description: 'Completar la autoevaluación del último trimestre antes de la reunión con RRHH',
    type: 'deadline',
    dueDate: '2025-11-10',
    status: 'pending',
    postponeCount: 0,
    createdAt: '2025-11-01T09:00:00.000Z'
  },
  {
    id: 'task_002',
    title: 'Actualizar datos personales',
    description: 'Verificar y actualizar información de contacto de emergencia en el portal',
    type: 'reminder',
    dueDate: '2025-11-15',
    status: 'pending',
    postponeCount: 1,
    createdAt: '2025-10-28T10:30:00.000Z'
  },
  {
    id: 'task_003',
    title: 'Capacitación obligatoria de seguridad',
    description: 'Completar el curso online de seguridad laboral y obtener el certificado',
    type: 'deadline',
    dueDate: '2025-11-08',
    status: 'in_progress',
    postponeCount: 0,
    createdAt: '2025-10-25T14:15:00.000Z'
  },
  {
    id: 'task_004',
    title: 'Confirmar asistencia al evento de equipo',
    description: 'Responder la invitación para la cena de fin de año del equipo',
    type: 'action',
    dueDate: '2025-11-12',
    status: 'pending',
    postponeCount: 2,
    createdAt: '2025-10-30T11:20:00.000Z'
  },
  {
    id: 'task_005',
    title: 'Subir certificado médico',
    description: 'Cargar el certificado de aptitud médica en el sistema antes del vencimiento',
    type: 'deadline',
    dueDate: '2025-11-20',
    status: 'pending',
    postponeCount: 0,
    createdAt: '2025-11-02T08:45:00.000Z'
  },
  {
    id: 'task_006',
    title: 'Entregar documentación de reintegro',
    description: 'Presentar los comprobantes de gastos de viaje para solicitar el reintegro',
    type: 'action',
    dueDate: '2025-11-09',
    status: 'pending',
    postponeCount: 1,
    createdAt: '2025-11-03T16:00:00.000Z'
  },
  {
    id: 'task_007',
    title: 'Renovar credencial de acceso',
    description: 'Pasar por seguridad para renovar la tarjeta de acceso al edificio',
    type: 'reminder',
    dueDate: '2025-11-25',
    status: 'pending',
    postponeCount: 0,
    createdAt: '2025-11-05T13:30:00.000Z'
  },
  {
    id: 'task_008',
    title: 'Reunión mensual del equipo',
    description: 'Asistir a la reunión general del departamento y preparar reporte de actividades',
    type: 'action',
    dueDate: '2025-11-05',
    status: 'completed',
    postponeCount: 0,
    createdAt: '2025-10-20T10:00:00.000Z'
  }
];
