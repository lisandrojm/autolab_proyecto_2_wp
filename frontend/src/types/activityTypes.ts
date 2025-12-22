export type AttendanceStatus = "present" | "absent" | "late" | "vacation" | "sick" | "unpaid" | "compensatory";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string; // Colaborador
  areaId: string;
  areaName: string; // Area
  entryTime?: string; // Hora de Entrada
  exitTime?: string; // Hora de Salida
  overtimeHours: number; // Hizo Horas Extras calculation
  hasOvertime: boolean; // Sí/No
  status: AttendanceStatus;
  notes?: string;
  replacementName?: string; // Jornalero por [Reemplazo]
  absenceReason?: string; // Motivo de ausencia
}

export interface ActivityReport {
  id: string;
  date: string; // Fecha del reporte
  formName: string; // Área / Formulario (e.g. "Técnica mañana")
  areaId: string;
  status: "sent" | "pending_signature" | "draft";
  submittedBy: string;
  submittedAt: string;
  signatureUrl?: string;
  comments: string; // Comentarios generales
  attendance: AttendanceRecord[];
}

export interface AreaOption {
  id: string;
  name: string;
}
