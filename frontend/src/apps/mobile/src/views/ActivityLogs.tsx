import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, parseISO, isFuture, isToday, isBefore, isAfter, getDate, startOfDay, subDays } from "date-fns";
import { es } from "date-fns/locale";
import { activityLogTypesAPI, RequestConfig } from "../../../../api/requestConfig";

import { activityReportsAPI, ActivityReport } from "../../../../api/request";
import { usersAPI } from "../../../../api/users";
import { projectsAPI, Project } from "../../../../api/projects";
import { areasAPI, Area } from "../../../../api/areas";
import { shiftsAPI, Shift } from "../../../../api/shifts";
import { vacationsAPI } from "../../../../api/vacations";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faPlus, faTimes, faTrash, faCalendar, faUserTie, faLayerGroup, faBriefcase, faInfoCircle, faClock, faCheck, faChevronRight, faChevronLeft, faFileText, faUserPlus, faUserSlash, faSearch, faFilter, faExclamationTriangle, faUmbrellaBeach, faPen } from "@fortawesome/free-solid-svg-icons";
import { useProfile } from "../hooks/useProfile";
import { ViewType } from "../types";
import SectionHeader from "../components/SectionHeader";
import { sweetAlert } from "../utils/sweetAlert";
import { Modal } from "../components/Modal";
import AdditionalStaffFiltersModal, { AdditionalStaffFilterValues } from "../components/AdditionalStaffFiltersModal";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { InfoModal } from "../../../../components/ui/InfoModal";
import { overtimeUtils, splitOvertime } from "../../../../utils/overtimeUtils";

import { esContratoVigente, getContratoActivo } from "../../../../utils/contratoVigencia";
import { coordinaAreas, MOBILE_ACTIVITY_COMPLIANCE } from "../../../../utils/permisosMobile";
import { useAuthStore } from "../../../../stores/authStore";
import { usePermisoInactivo } from "../../../../stores/permisosInactivosStore";

/** De quién son las novedades del historial: las que cargó la persona, o las de su equipo. */
type AlcanceHistorial = "mias" | "supervisadas";

interface EmployeeOption {
  id: string;
  name: string;
  email?: string;
  projectIds: string[];
  role?: string;
  // Con los permisos: quién puede cargar novedades se pregunta por permiso, no por el nombre del rol.
  roles?: { name: string; permissions?: string[] }[];
  positionName?: string;
  isActive?: boolean;
  hasActiveContract?: boolean;
  metadataProjects?: Array<{
    projectId: string;
    roleFrame: string;
    /** Tiene ALGÚN contrato del proyecto sin baja o con baja futura. */
    hasActiveContract: boolean;
    /** El ÚLTIMO contrato del proyecto está vigente: mismo criterio que la columna Alta/Baja del panel web. */
    lastContractVigente: boolean;
    contractStartTime?: string;
    contractEndTime?: string;
    areaId?: string;
    shiftId?: string;
    /** Áreas/turnos del contrato vigente (mismo campo que usa el panel web como fallback cuando no
     *  hay fila en project.teamConfig). Preferido sobre `areaId`/`shiftId`, que son legacy y ya casi
     *  nadie los tiene cargados. */
    areaShiftAssignments?: { areaId: string; shiftIds: string[] }[];
  }>;
}

/** Normaliza `contract.areaShiftAssignments` (poblado o no) a `{areaId, shiftIds}[]` de strings. */
const normalizeAreaShiftAssignments = (raw: any): { areaId: string; shiftIds: string[] }[] =>
  (raw || []).map((asa: any) => ({
    areaId: String(asa.areaId?._id || asa.areaId || ""),
    shiftIds: (asa.shiftIds || []).map((s: any) => String(s?._id || s || "")),
  }));

/**
 * Un contrato está vigente si no tiene fecha de baja, o si la baja es de hoy en adelante.
 * Acepta ISO ("YYYY-MM-DD...") y el formato con día primero ("DD/MM/YYYY" o "DD-MM-YYYY").
 */
const isContractVigente = (fechaBaja?: string | null): boolean => {
  if (!fechaBaja) return true;
  let endDate = new Date(fechaBaja);
  if (isNaN(endDate.getTime()) && typeof fechaBaja === "string") {
    const parts = fechaBaja.split(/[-/]/);
    if (parts.length === 3 && parts[2].length === 4) {
      endDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
  }
  if (isNaN(endDate.getTime())) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  return endDate >= today;
};

/**
 * Vigencia del contrato que rige hoy para el miembro en el proyecto: el vigente más reciente.
 * OJO: no alcanza con "el último cargado" (un tiempo indeterminado abierto puede tener detrás un
 * contrato viejo ya vencido) ni con "algún contrato vigente" (los contratos viejos sin fecha de
 * baja darían vigente para siempre). Si no llegaron los contratos, NO se asume vigente: para el
 * reporte de asistencia es preferible dejar afuera a alguien dudoso que sumarlo sin poder
 * confirmarlo (antes esto devolvía `true` "para no vaciar la lista", pero tapaba en silencio los
 * casos en que el backend no traía `metadata.projects` poblado — ver populate de assignedUsers en
 * GET /projects/:projectId).
 */
const lastContractIsVigente = (contracts?: any[]): boolean => {
  if (!Array.isArray(contracts) || contracts.length === 0) return false;
  return esContratoVigente(getContratoActivo(contracts));
};

interface LocalAttendanceRecord {
  tempId: string;
  employeeId: string;
  employeeName: string;
  typeId: string;
  typeName: string;
  replacementId?: string;
  replacementName?: string;
  overtimeHours?: number;
  overtimeHours50?: number;
  overtimeHours100?: number;
  replacementOvertimeHours?: number;
  replacementOvertimeHours50?: number;
  replacementOvertimeHours100?: number;
  replacementInTime?: string;
  replacementOutTime?: string;
  outTime?: string;
  inTime?: string; // Added inTime
  notes?: string;
}

interface WizardEntry {
  status?: "present" | "absent";
  typeId?: string; // If absent or overtime
  replacementId?: string;
  overtimeHours?: number;
  overtimeHours50?: number;
  overtimeHours100?: number;
  replacementOvertimeHours?: number;
  replacementOvertimeHours50?: number;
  replacementOvertimeHours100?: number;
  replacementInTime?: string;
  replacementOutTime?: string;
  outTime?: string;
  inTime?: string; // Added inTime
  notes?: string;
}

interface ActivityLogsProps {
  onNavigate: (view: ViewType) => void;
  /**
   * Se está dibujando como la pestaña «Historial» de Novedades (ver `views/Novedades.tsx`).
   *
   * El encabezado —título, volver, ⓘ— lo pone el contenedor: es una sola pantalla con dos
   * pestañas, y repetirlo adentro dibujaría dos títulos.
   */
  embebido?: boolean;
}

const getProjectEndTime = (project: Project, dateStr: string): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday...

  if (!project.workSchedule) {
    if (dayIndex === 0 || dayIndex === 6) return "";
    return "18:00";
  }

  const { mode, weekdays, weekend, days } = project.workSchedule;
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayName = dayNames[dayIndex];

  // Helper to check if it's a work day (defaults to true if endTime is present)
  const isWorkDay = (dayConfig: any) => {
    if (!dayConfig) return false;
    if (dayConfig.isWorkDay === false) return false;
    return !!dayConfig.endTime;
  };

  // 1. Per day mode
  if (mode === "per_day" && days) {
    const dayData = (days as any)[dayName];
    return isWorkDay(dayData) ? dayData.endTime : "";
  }

  // 2. All week mode (Monday to Sunday)
  if (mode === "all_week") {
    return isWorkDay(weekdays) ? weekdays?.endTime || "" : "";
  }

  // 3. Weekdays mode (usually M-V + optional Saturday)
  if (mode === "weekdays") {
    if (dayIndex === 0) return ""; // Sunday strictly off in this mode
    if (dayIndex === 6) {
      // Saturday uses 'weekend' config
      return isWorkDay(weekend) ? weekend?.endTime || "" : "";
    }
    // Monday to Friday
    return isWorkDay(weekdays) ? weekdays?.endTime || "" : "";
  }

  // Fallback
  return "";
};

const getEmployeeEndTime = (project: Project, employeeId: string, dateStr: string, employee?: EmployeeOption): string => {
  if (employee && employee.metadataProjects) {
    const projMeta = employee.metadataProjects.find((m) => String(m.projectId) === String(project._id));
    if (projMeta && projMeta.contractEndTime) {
      return projMeta.contractEndTime;
    }
    const activeMeta = employee.metadataProjects.find((m) => m.hasActiveContract && m.contractEndTime);
    if (activeMeta && activeMeta.contractEndTime) {
      return activeMeta.contractEndTime;
    }
    const anyMeta = employee.metadataProjects.find((m) => m.contractEndTime);
    if (anyMeta && anyMeta.contractEndTime) {
      return anyMeta.contractEndTime;
    }
  }

  if (!project.teamConfig) return getProjectEndTime(project, dateStr);

  // 1. Check if user has a specific schedule in teamConfig
  const userConfig = project.teamConfig.find((c) => {
    const configUserId = typeof c.userId === "object" ? (c.userId as any)._id : c.userId;
    return String(configUserId) === String(employeeId);
  });

  if (userConfig && userConfig.useProjectSchedule === false && userConfig.endTime) {
    return userConfig.endTime;
  }

  // 2. Otherwise use project general schedule
  return getProjectEndTime(project, dateStr);
};

const getProjectStartTime = (project: Project, dateStr: string): string => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday...

  if (!project.workSchedule) {
    if (dayIndex === 0 || dayIndex === 6) return "";
    return "09:00";
  }

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayName = dayNames[dayIndex];

  const { mode, weekdays, weekend, days } = project.workSchedule;

  // Helper to check if it's a work day (defaults to true if startTime is present)
  const isWorkDay = (dayConfig: any) => {
    if (!dayConfig) return false;
    if (dayConfig.isWorkDay === false) return false;
    return !!dayConfig.startTime;
  };

  // 1. Per day mode
  if (mode === "per_day" && days) {
    const dayData = (days as any)[dayName];
    return isWorkDay(dayData) ? dayData.startTime : "";
  }

  // 2. All week mode (Monday to Sunday)
  if (mode === "all_week") {
    return isWorkDay(weekdays) ? weekdays?.startTime || "" : "";
  }

  // 3. Weekdays mode (usually M-V + optional Saturday)
  if (mode === "weekdays") {
    if (dayIndex === 0) return ""; // Sunday strictly off in this mode
    if (dayIndex === 6) {
      // Saturday uses 'weekend' config
      return isWorkDay(weekend) ? weekend?.startTime || "" : "";
    }
    // Monday to Friday
    return isWorkDay(weekdays) ? weekdays?.startTime || "" : "";
  }

  // Fallback
  return "";
};

const getEmployeeStartTime = (project: Project, employeeId: string, dateStr: string, employee?: EmployeeOption): string => {
  if (employee && employee.metadataProjects) {
    const projMeta = employee.metadataProjects.find((m) => String(m.projectId) === String(project._id));
    if (projMeta && projMeta.contractStartTime) {
      return projMeta.contractStartTime;
    }
    const activeMeta = employee.metadataProjects.find((m) => m.hasActiveContract && m.contractStartTime);
    if (activeMeta && activeMeta.contractStartTime) {
      return activeMeta.contractStartTime;
    }
    const anyMeta = employee.metadataProjects.find((m) => m.contractStartTime);
    if (anyMeta && anyMeta.contractStartTime) {
      return anyMeta.contractStartTime;
    }
  }

  if (!project.teamConfig) return getProjectStartTime(project, dateStr);

  // 1. Check if user has a specific schedule in teamConfig
  const userConfig = project.teamConfig.find((c) => {
    const configUserId = typeof c.userId === "object" ? (c.userId as any)._id : c.userId;
    return String(configUserId) === String(employeeId);
  });

  if (userConfig && userConfig.useProjectSchedule === false && userConfig.startTime) {
    return userConfig.startTime;
  }

  // 2. Otherwise use project general schedule
  return getProjectStartTime(project, dateStr);
};

const isDayInFrequency = (project: Project, day: Date): boolean => {
  // Frequency schedule check
  const schedule = project.activityLogConfig?.schedule;
  if (schedule && schedule.days) {
    const dayIndex = day.getDay();
    return schedule.days.includes(dayIndex);
  }

  // Fallback: check project general workSchedule via getProjectEndTime
  const dateStr = format(day, "yyyy-MM-dd");
  return getProjectEndTime(project, dateStr) !== "";
};

const isDayAllowedForReporting = (project: Project, day: Date): boolean => {
  // A day is allowed only if it is in the frequency schedule
  if (!isDayInFrequency(project, day)) return false;

  // Cannot be in the future (excluding today)
  const today = startOfDay(new Date());
  if (isAfter(day, today)) return false;

  const allowedPastDays = project.activityLogConfig?.allowedPastDays ?? 3;

  // Compute the last allowedPastDays active reporting days from today going backward
  const allowedDates: string[] = [];
  let current = startOfDay(new Date());
  const maxSearchDays = Math.max(30, allowedPastDays * 10);
  for (let i = 0; i < maxSearchDays; i++) {
    if (isDayInFrequency(project, current)) {
      allowedDates.push(format(current, "yyyy-MM-dd"));
      if (allowedDates.length === allowedPastDays) break;
    }
    current = subDays(current, 1);
  }

  const dayStr = format(day, "yyyy-MM-dd");
  return allowedDates.includes(dayStr);
};

const formatToAMPM = (timeStr: string | null | undefined) => {
  if (!timeStr || timeStr === "—") return "—";
  const parts = timeStr.split(":");
  if (parts.length !== 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes} ${ampm}`;
};

const getDurationText = (start: string | null | undefined, end: string | null | undefined) => {
  if (!start || !end || start === "—" || end === "—") return null;
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  let totalMins = eH * 60 + eM - (sH * 60 + sM);
  if (totalMins < 0) totalMins += 24 * 60;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0 && m === 0) return "0h";
  return `${h > 0 ? h + "h" : ""} ${m > 0 ? m + "m" : ""}`.trim();
};
const TIME_OPTIONS = (() => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = h.toString().padStart(2, "0");
      const mm = m.toString().padStart(2, "0");
      const val = `${hh}:${mm}`;
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      options.push({ value: val, label: `${h12}:${mm} ${ampm}` });
    }
  }
  return options;
})();

const isTodayLocal = (d: Date): boolean => {
  const today = new Date();
  return d.getDate() === today.getDate() &&
         d.getMonth() === today.getMonth() &&
         d.getFullYear() === today.getFullYear();
};

const isYesterdayLocal = (d: Date): boolean => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return d.getDate() === yesterday.getDate() &&
         d.getMonth() === yesterday.getMonth() &&
         d.getFullYear() === yesterday.getFullYear();
};

const isTwoDaysAgoLocal = (d: Date): boolean => {
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
  return d.getDate() === twoDaysAgo.getDate() &&
         d.getMonth() === twoDaysAgo.getMonth() &&
         d.getFullYear() === twoDaysAgo.getFullYear();
};

export default function ActivityLogs({ onNavigate, embebido }: ActivityLogsProps) {
  const [showForm, setShowForm] = useState(false);

  const resolveEmployeeAreaAndShift = (emp: EmployeeOption) => {
    let areaId = selectedAreaId || "";
    let shiftId = selectedShiftId || "";

    let areaName = "";
    let shiftName = "";

    // 0. If employee is a coordinator, prioritize their own personal assignment in metadataProjects (since they coordinate multiple shifts/areas)
    const isCoord =
      coordinaAreas(emp.roles) ||
      emp.role?.toLowerCase()?.includes("coordinador") ||
      (selectedProject?.coordinatorAssignments?.some((asm: any) => {
        const uid = typeof asm.userId === "object" ? asm.userId?._id || asm.userId?.id : asm.userId;
        return uid && String(uid) === String(emp.id);
      }));

    if (isCoord) {
      const projMeta = emp.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId));
      if (projMeta) {
        const pAreaId = String((projMeta.areaId as any)?._id || projMeta.areaId || "");
        const pShiftId = String((projMeta.shiftId as any)?._id || projMeta.shiftId || "");
        if (pAreaId) {
          areaId = pAreaId;
          areaName = (projMeta.areaId as any)?.name || allAreas.find((a) => String(a._id || a.id) === pAreaId)?.name || "";
        }
        if (pShiftId) {
          shiftId = pShiftId;
          shiftName = (projMeta.shiftId as any)?.name || allShifts.find((s) => String(s._id || s.id) === pShiftId)?.name || "";
        }
      }
    }

    // 1. Check project teamConfig
    const teamConfigMember = selectedProject?.teamConfig?.find((c: any) => {
      const cUserId = typeof c.userId === "object" ? c.userId?._id || c.userId?.id : c.userId;
      if (cUserId && String(cUserId) === String(emp.id)) return true;
      
      // Fallback 1: Match by email if userId is an object
      if (typeof c.userId === "object" && c.userId?.email && emp.email) {
        if (String(c.userId.email).toLowerCase() === String(emp.email).toLowerCase()) return true;
      }
      
      // Fallback 2: Match by name if userId is an object
      if (typeof c.userId === "object" && emp.name) {
        const cName = `${c.userId.firstName || ""} ${c.userId.lastName || ""}`.trim() || c.userId.name || c.userId.nombre;
        if (cName && String(cName).toLowerCase() === String(emp.name).toLowerCase()) return true;
      }
      
      return false;
    });

    if (teamConfigMember) {
      if (!areaId && teamConfigMember.areaId) {
        areaId = String(teamConfigMember.areaId?._id || teamConfigMember.areaId);
        if (!areaName && teamConfigMember.areaId?.name) areaName = teamConfigMember.areaId.name;
      }
      if (!shiftId && teamConfigMember.shiftId) {
        shiftId = String(teamConfigMember.shiftId?._id || teamConfigMember.shiftId);
        if (!shiftName && teamConfigMember.shiftId?.name) shiftName = teamConfigMember.shiftId.name;
      }
      if (teamConfigMember.areaShiftAssignments && teamConfigMember.areaShiftAssignments.length > 0) {
        // Try to match existing selected areaId or default to first
        let asa = teamConfigMember.areaShiftAssignments.find((a: any) => {
          const aId = String(a.areaId?._id || a.areaId || "");
          return areaId ? aId === String(areaId) : true;
        });
        if (!asa && !areaId) asa = teamConfigMember.areaShiftAssignments[0];
        
        if (asa) {
          if (!areaId) {
            areaId = String(asa.areaId?._id || asa.areaId || "");
          }
          if (!areaName && asa.areaId?.name) {
            areaName = asa.areaId.name;
          }
          
          let matchingShift = asa.shiftIds?.find((s: any) => {
            const sId = String(s?._id || s || "");
            return shiftId ? sId === String(shiftId) : true;
          });
          if (!matchingShift && !shiftId && asa.shiftIds && asa.shiftIds.length > 0) {
            matchingShift = asa.shiftIds[0];
          }

          if (matchingShift) {
            if (!shiftId) {
              shiftId = String(matchingShift?._id || matchingShift || "");
            }
            if (!shiftName && matchingShift?.name) {
              shiftName = matchingShift.name;
            }
          }
        }
      }
    }

    // 2. Check coordinatorAssignments (crucial for coordinators like Agustin Barbona)
    if (!areaId || !shiftId || !areaName || !shiftName) {
      if (selectedProject?.coordinatorAssignments) {
        const myAsm = selectedProject.coordinatorAssignments.find((asm: any) => {
          const uid = typeof asm.userId === "object" ? asm.userId?._id || asm.userId?.id || asm.userId?.userId || asm.userId?.metadata?.id : asm.userId;
          const empIds = [emp.id, (emp as any).userId, (emp as any).metadata?.id].filter(Boolean).map((id) => String(id));

          let isMatch = uid && empIds.includes(String(uid));
          if (!isMatch) {
            const asmEmail = typeof asm.userId === "object" ? asm.userId?.email || asm.userId?.correo : null;
            const empEmail = emp.email;
            if (asmEmail && empEmail && String(asmEmail).toLowerCase() === String(empEmail).toLowerCase()) isMatch = true;
          }
          if (!isMatch) {
            const asmName = typeof asm.userId === "object" ? (asm.userId?.firstName && asm.userId?.lastName ? `${asm.userId.firstName} ${asm.userId.lastName}` : asm.userId?.name || asm.userId?.nombre) : null;
            const empName = emp.name;
            if (asmName && empName && asmName.toLowerCase().includes(empName.toLowerCase())) isMatch = true;
          }
          // Only use this assignment if it matches our selectedAreaId (if any)
          if (isMatch && areaId) {
            const asmAreaId = String(asm.areaId?._id || asm.areaId || "");
            if (asmAreaId !== String(areaId)) isMatch = false;
          }
          // Only use this assignment if it matches our selectedShiftId (if any)
          if (isMatch && shiftId) {
            const asmShiftId = String(asm.shiftId?._id || asm.shiftId || "");
            if (asmShiftId !== String(shiftId)) isMatch = false;
          }
          return isMatch;
        });

        if (myAsm) {
          if (!areaId) {
            areaId = String(myAsm.areaId?._id || myAsm.areaId || "");
          }
          if (!areaName && myAsm.areaId?.name) areaName = myAsm.areaId.name;
          
          if (!shiftId) {
            shiftId = String(myAsm.shiftId?._id || myAsm.shiftId || "");
          }
          if (!shiftName && myAsm.shiftId?.name) shiftName = myAsm.shiftId.name;
        }
      }
    }

    // 3. Fallback to employee metadataProjects
    if (!areaId || !shiftId || !areaName || !shiftName) {
      const projMeta = emp.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId));
      if (projMeta) {
        const pAreaId = String((projMeta.areaId as any)?._id || projMeta.areaId || "");
        if (!areaId || pAreaId === String(areaId)) {
          if (!areaId) areaId = pAreaId;
          if (!areaName && (projMeta.areaId as any)?.name) areaName = (projMeta.areaId as any).name;
          
          if (!shiftId) {
            shiftId = String((projMeta.shiftId as any)?._id || projMeta.shiftId || "");
          }
          if (!shiftName && (projMeta.shiftId as any)?.name) shiftName = (projMeta.shiftId as any).name;
          
          if (!shiftName && shiftId && projMeta.contractStartTime && projMeta.contractEndTime) {
            const matchingShift = allShifts.find((s) => String(s._id || s.id) === shiftId || (s.startTime === projMeta.contractStartTime && s.endTime === projMeta.contractEndTime));
            if (matchingShift) {
              shiftId = String(matchingShift._id || matchingShift.id);
              if (!shiftName) shiftName = matchingShift.name || "";
            }
          }
        }
      }
    }

    // 4. Final Fallback: Infer from project config if still missing
    if (!areaId || !shiftId) {
      let inferredAreaId = areaId;
      let inferredAreaName = areaName;
      let inferredShiftId = shiftId;
      let inferredShiftName = shiftName;

      // Try extraction from areasConfig
      if (selectedProject?.areasConfig && selectedProject.areasConfig.length > 0) {
        if (!inferredAreaId) {
          const firstArea = selectedProject.areasConfig[0];
          inferredAreaId = String(firstArea.areaId?._id || firstArea.areaId || "");
          if (firstArea.areaId?.name) inferredAreaName = firstArea.areaId.name;
        }
        if (!inferredShiftId && inferredAreaId) {
          const areaConfig = selectedProject.areasConfig.find((ac: any) => String(ac.areaId?._id || ac.areaId) === inferredAreaId);
          if (areaConfig && areaConfig.shiftIds && areaConfig.shiftIds.length > 0) {
            inferredShiftId = String(areaConfig.shiftIds[0]?._id || areaConfig.shiftIds[0] || "");
            if (!inferredShiftName && areaConfig.shiftIds[0]?.name) inferredShiftName = areaConfig.shiftIds[0].name;
          }
        }
      }

      // Try extraction from coordinatorAssignments (crucial for legacy projects without areasConfig)
      if ((!inferredAreaId || !inferredShiftId) && selectedProject?.coordinatorAssignments?.length > 0) {
        if (!inferredAreaId) {
          const firstAsm = selectedProject.coordinatorAssignments.find((a: any) => a.areaId?._id || a.areaId);
          if (firstAsm) {
            inferredAreaId = String(firstAsm.areaId?._id || firstAsm.areaId || "");
            if (firstAsm.areaId?.name) inferredAreaName = firstAsm.areaId.name;
          }
        }
        if (!inferredShiftId && inferredAreaId) {
          const asm = selectedProject.coordinatorAssignments.find((a: any) => String(a.areaId?._id || a.areaId) === inferredAreaId && (a.shiftId?._id || a.shiftId));
          if (asm) {
            inferredShiftId = String(asm.shiftId?._id || asm.shiftId || "");
            if (!inferredShiftName && asm.shiftId?.name) inferredShiftName = asm.shiftId.name;
          }
        }
      }

      // Try extraction from teamConfig
      if ((!inferredAreaId || !inferredShiftId) && selectedProject?.teamConfig?.length > 0) {
        if (!inferredAreaId) {
          const firstTeam = selectedProject.teamConfig.find((t: any) => t.areaId?._id || t.areaId);
          if (firstTeam) {
            inferredAreaId = String(firstTeam.areaId?._id || firstTeam.areaId || "");
            if (firstTeam.areaId?.name) inferredAreaName = firstTeam.areaId.name;
          }
        }
        if (!inferredShiftId && inferredAreaId) {
          const team = selectedProject.teamConfig.find((t: any) => String(t.areaId?._id || t.areaId) === inferredAreaId && t.areaShiftAssignments?.length > 0);
          if (team?.areaShiftAssignments?.length) {
            const asa = team.areaShiftAssignments[0];
            if (asa.shiftIds && asa.shiftIds.length > 0) {
              inferredShiftId = String(asa.shiftIds[0]?._id || asa.shiftIds[0] || "");
              if (!inferredShiftName && asa.shiftIds[0]?.name) inferredShiftName = asa.shiftIds[0].name;
            }
          }
        }
      }

      areaId = inferredAreaId;
      areaName = inferredAreaName;
      shiftId = inferredShiftId;
      shiftName = inferredShiftName;
    }

    // --- ROBUST NAME LOOKUP ---
    // If we have the IDs but still lack the formatted names, search everywhere in the project configs!
    if (!areaName && areaId) {
      let found = selectedProject?.areasConfig?.find((ac: any) => String(ac.areaId?._id || ac.areaId) === areaId);
      if (found && found.areaId?.name) areaName = found.areaId.name;
      
      if (!areaName) {
        found = selectedProject?.coordinatorAssignments?.find((a: any) => String(a.areaId?._id || a.areaId) === areaId);
        if (found && found.areaId?.name) areaName = found.areaId.name;
      }
      
      if (!areaName) {
        found = selectedProject?.teamConfig?.find((t: any) => String(t.areaId?._id || t.areaId) === areaId);
        if (found && found.areaId?.name) areaName = found.areaId.name;
        if (!areaName) {
          selectedProject?.teamConfig?.forEach((t: any) => {
            const asa = t.areaShiftAssignments?.find((a: any) => String(a.areaId?._id || a.areaId) === areaId);
            if (asa && asa.areaId?.name) areaName = asa.areaId.name;
          });
        }
      }
    }

    if (!shiftName && shiftId) {
      let foundArea = selectedProject?.areasConfig?.find((ac: any) => ac.shiftIds?.some((s: any) => String(s?._id || s) === shiftId));
      if (foundArea) {
        const s = foundArea.shiftIds.find((s: any) => String(s?._id || s) === shiftId);
        if (s && s.name) shiftName = s.name;
      }

      if (!shiftName) {
        const foundAsm = selectedProject?.coordinatorAssignments?.find((a: any) => String(a.shiftId?._id || a.shiftId) === shiftId);
        if (foundAsm && foundAsm.shiftId?.name) shiftName = foundAsm.shiftId.name;
      }

      if (!shiftName) {
        selectedProject?.teamConfig?.forEach((t: any) => {
          t.areaShiftAssignments?.forEach((asa: any) => {
            const s = asa.shiftIds?.find((s: any) => String(s?._id || s) === shiftId);
            if (s && s.name) shiftName = s.name;
          });
        });
      }
    }

    areaName = areaName || allAreas.find((a) => String(a._id) === areaId)?.name || "";
    shiftName = shiftName || allShifts.find((s) => String(s._id || s.id) === shiftId)?.name || "";

    return { areaId, shiftId, areaName, shiftName };
  };

  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showOtherPresentInfo, setShowOtherPresentInfo] = useState(false);
  const [viewingReport, setViewingReport] = useState<ActivityReport | null>(null);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [activeProjectTab, setActiveProjectTab] = useState<"info" | "schedule" | "team">("info");
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  /** Evita disparar loadData() dos veces en simultáneo (ej. doble-montaje en desarrollo): duplicar
   *  las 5 llamadas —una de ellas pesada— aumenta el riesgo de timeouts sin necesidad. */
  const loadDataInFlightRef = useRef(false);

  // vacation info modal
  const [vacationModalOpen, setVacationModalOpen] = useState(false);
  const [selectedVacationUser, setSelectedVacationUser] = useState<{ id: string; name: string } | null>(null);

  // Form State
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedAreaId, setSelectedAreaId] = useState<string>("");
  const [selectedShiftId, setSelectedShiftId] = useState<string>("");
  const [hasActivity, setHasActivity] = useState<boolean | null>(null);
  const [comments, setComments] = useState("");

  const [entries, setEntries] = useState<LocalAttendanceRecord[]>([]);
  // Search & Builder State
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);

  const [isEmployeeSelectOpen, setIsEmployeeSelectOpen] = useState(false);

  // Draft Record State
  const [draftTypeId, setDraftTypeId] = useState<string>("");
  const [draftReplacementId, setDraftReplacementId] = useState<string>("");
  const [draftOvertimeHours, setDraftOvertimeHours] = useState<number>(0);
  const [draftOvertimeHours50, setDraftOvertimeHours50] = useState<number>(0);
  const [draftOvertimeHours100, setDraftOvertimeHours100] = useState<number>(0);
  const [draftReplacementOvertimeHours, setDraftReplacementOvertimeHours] = useState<number>(0);
  const [draftReplacementOvertimeHours50, setDraftReplacementOvertimeHours50] = useState<number>(0);
  const [draftReplacementOvertimeHours100, setDraftReplacementOvertimeHours100] = useState<number>(0);
  const [hasDraftReplacementOvertime, setHasDraftReplacementOvertime] = useState<boolean>(false);
  const [draftReplacementInTime, setDraftReplacementInTime] = useState<string>("");
  const [draftReplacementOutTime, setDraftReplacementOutTime] = useState<string>("");
  const [draftOutTime, setDraftOutTime] = useState<string>("");
  const [draftInTime, setDraftInTime] = useState<string>("");
  const glossary = useMemo(() => overtimeUtils.getGlossary(), []);
  const [attendanceStatus, setAttendanceStatus] = useState<"present" | "absent" | null>(null);
  const [showOvertimeForm, setShowOvertimeForm] = useState<boolean>(false);
  const [noveltyCategory, setNoveltyCategory] = useState<"absence" | "overtime" | null>(null);

  // Config & Wizard State
  const [activeOvertimeModal, setActiveOvertimeModal] = useState<"wizard" | "fast-entry" | null>(null);
  const [activeReplacementOvertimeModal, setActiveReplacementOvertimeModal] = useState<"wizard" | "fast-entry" | null>(null);
  const [activeAbsenceModal, setActiveAbsenceModal] = useState<"wizard" | "fast-entry" | null>(null);
  const [showProcessedHistory, setShowProcessedHistory] = useState(false);

  const [wizardIndex, setWizardIndex] = useState<number>(-1); // -1: Not started, 0+: Employee Index
  const [wizardData, setWizardData] = useState<Record<string, WizardEntry>>({});

  // Additional Staff State
  const [showAdditionalStaffModal, setShowAdditionalStaffModal] = useState(false);
  const [selectedAdditionalStaff, setSelectedAdditionalStaff] = useState<string[]>([]);
  const [additionalStaffSearchTerm, setAdditionalStaffSearchTerm] = useState("");
  const [debouncedAdditionalSearchTerm, setDebouncedAdditionalSearchTerm] = useState("");
  const [additionalStaffVisibleCount, setAdditionalStaffVisibleCount] = useState(20);
  const [editingEntryTempId, setEditingEntryTempId] = useState<string | null>(null);

  const updateEntryOvertime = (tempId: string, updates: Partial<LocalAttendanceRecord>) => {
    setEntries((prev) =>
      prev.map((e) => (e.tempId === tempId ? { ...e, ...updates } : e))
    );
  };

  const updateEntryOvertimeTimes = (entry: LocalAttendanceRecord, inTime: string, outTime: string) => {
    let totalOvertime = 0;
    let contractedMinutes = 0;
    const project = userProjects.find((p) => p._id === selectedProjectId);

    if (project) {
      const empOption = employees.find((e) => e.id === entry.employeeId);
      const endTime = getEmployeeEndTime(project, entry.employeeId, reportDate, empOption);
      const startTime = getEmployeeStartTime(project, entry.employeeId, reportDate, empOption);

      if (startTime && endTime) {
        const [sH, sM] = startTime.split(":").map(Number);
        let startTotal = sH * 60 + sM;
        const [eH, eM] = endTime.split(":").map(Number);
        let endTotal = eH * 60 + eM;
        if (endTotal < startTotal) {
          endTotal += 24 * 60;
        }
        contractedMinutes = endTotal - startTotal;
      }

      if (inTime && outTime) {
        const [inH, inM] = inTime.split(":").map(Number);
        let inTotal = inH * 60 + inM;
        const [outH, outM] = outTime.split(":").map(Number);
        let outTotal = outH * 60 + outM;

        if (outTotal < inTotal) {
          outTotal += 24 * 60;
        }

        let workedMinutes = outTotal - inTotal;
        if (workedMinutes > contractedMinutes) {
          totalOvertime = (workedMinutes - contractedMinutes) / 60;
        }
      }

      const calculatedTotal = parseFloat(totalOvertime.toFixed(2));
      const { h50, h100 } = splitOvertime(
        reportDate,
        inTime,
        outTime,
        calculatedTotal,
        glossary,
        startTime || undefined,
        endTime || undefined
      );

      updateEntryOvertime(entry.tempId, {
        inTime,
        outTime,
        overtimeHours: calculatedTotal,
        overtimeHours50: h50,
        overtimeHours100: h100,
      });
    }
  };

  // Replacement Modal State
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [replacementSearchTerm, setReplacementSearchTerm] = useState("");

  const [replacementTargetEmpId, setReplacementTargetEmpId] = useState<string | null>(null); // For wizard mode, null for fast entry mode

  const [logTypes, setLogTypes] = useState<RequestConfig[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [allProjectsCache, setAllProjectsCache] = useState<Project[]>([]);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [reports, setReports] = useState<ActivityReport[]>([]);

  /* De quién son las novedades que se listan. Ver `fetchReports`. */
  const { user: usuarioActual } = useAuthStore();
  const permisoInactivo = usePermisoInactivo();
  // Mismo criterio que `Novedades.tsx`: el permiso tiene que estar Y no estar marcado «en desarrollo».
  const puedeVerSupervisadas = (usuarioActual?.permissions || []).includes(MOBILE_ACTIVITY_COMPLIANCE) && !permisoInactivo(MOBILE_ACTIVITY_COMPLIANCE);
  const [alcanceHistorial, setAlcanceHistorial] = useState<AlcanceHistorial>("mias");
  /* El salto automático a «las que superviso» ocurre una sola vez por montaje. */
  const autoSaltoHechoRef = useRef(false);
  const [fullProjectData, setFullProjectData] = useState<Project | null>(null);
  const [allVacations, setAllVacations] = useState<any[]>([]);

  const getUserActiveVacation = (userId: string) => {
    if (!allVacations || allVacations.length === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allVacations.find((v) => {
      const vUserId = typeof v.userId === "object" && v.userId ? (v.userId as any)._id : v.userId;
      if (vUserId !== userId) return false;

      const statusUpper = v.status?.toUpperCase();
      if (statusUpper !== "APPROVED" && statusUpper !== "DELIVERED") return false;

      const start = new Date(v.startDate);
      const end = new Date(v.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);

      return today >= start && today <= end;
    });
  };

  const formatDateString = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      if (dateStr.includes("-") && dateStr.length >= 10) {
        const parts = dateStr.substring(0, 10).split("-");
        if (parts.length === 3) {
          return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
      }
      const d = new Date(dateStr);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  };

  const showVacationInfo = (empId: string, empName: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const activeVac = getUserActiveVacation(empId);
    if (!activeVac) return;
    setSelectedVacationUser({ id: empId, name: empName });
    setVacationModalOpen(true);
  };

  const renderVacationBadge = (empId: string, empName: string) => {
    const activeVac = getUserActiveVacation(empId);
    if (!activeVac) return null;
    const dateRangeStr = `Vac: desde ${formatDateString(activeVac.startDate)} hasta ${formatDateString(activeVac.endDate)}`;
    return (
      <button 
        type="button"
        onClick={(e) => showVacationInfo(empId, empName, e)}
        className="inline-flex items-center gap-1 px-1.5 py-0 rounded text-[9px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:border-amber-500/30 transition-all shadow-sm whitespace-nowrap ml-1.5 cursor-pointer focus:outline-none"
        title={dateRangeStr}
      >
        <FontAwesomeIcon icon={faUmbrellaBeach} className="text-[8px] mr-1" />
        <span>VACACIONES</span>
        <FontAwesomeIcon icon={faInfoCircle} className="text-[8px] ml-1 opacity-75 hover:opacity-100" />
      </button>
    );
  };

  // Calendar State
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  // Role Filtering State
  const [selectedRoleFilters, setSelectedRoleFilters] = useState<string[]>([]);
  const [isRoleFilterModalOpen, setIsRoleFilterModalOpen] = useState(false);

  const [selectedReplacementRoleFilters, setSelectedReplacementRoleFilters] = useState<string[]>([]);
  const [isReplacementRoleFilterModalOpen, setIsReplacementRoleFilterModalOpen] = useState(false);
  const [replacementStatusFilter, setReplacementStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [replacementFilterContractActive, setReplacementFilterContractActive] = useState(false);

  const [selectedAdditionalRoleFilters, setSelectedAdditionalRoleFilters] = useState<string[]>([]);
  const [isAdditionalRoleFilterModalOpen, setIsAdditionalRoleFilterModalOpen] = useState(false);
  const [additionalStaffStatusFilter, setAdditionalStaffStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [additionalStaffFilterContractActive, setAdditionalStaffFilterContractActive] = useState(false);

  const formScrollRef = useRef<HTMLDivElement>(null);

  // Debounce search input for additional staff to prevent re-filtering on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAdditionalSearchTerm(additionalStaffSearchTerm);
      setAdditionalStaffVisibleCount(20); // Reset pagination on search change
    }, 250);
    return () => clearTimeout(timer);
  }, [additionalStaffSearchTerm]);

  useEffect(() => {
    loadData();
    // "Historial de Novedades" (Mis Novedades) no depende de nada de loadData(): se dispara aparte
    // para que cargue rápido y solo, sin quedar atrás en la cola de las otras 5 llamadas (algunas
    // pesadas, como Employees). Antes esperaba a que TODO lo demás terminara para recién arrancar.
    fetchReports();
  }, []);

  const loadData = async () => {
    if (loadDataInFlightRef.current) return;
    loadDataInFlightRef.current = true;
    setIsLoadingData(true);
    try {
      // Las 5 llamadas son independientes entre sí (nada acá depende de otra), así que se disparan
      // todas juntas en vez de una atrás de la otra — antes tardaba la SUMA de las 5, ahora tarda lo
      // que tarde la más lenta (típicamente "Employees", que trae usuarios con todos sus contratos).
      // Cada una mantiene su propio try/catch para que si una falla no tire abajo a las demás.
      await Promise.all([loadTypes(), loadEmployees(), loadProjects(), loadAreasAndShifts(), loadVacations()]);
    } finally {
      setIsLoadingData(false);
      loadDataInFlightRef.current = false;
    }
  };

  const loadTypes = async () => {
    try {
      const types = await activityLogTypesAPI.getAll();
      setLogTypes(types.filter((t) => t.isActive));
    } catch (e) {
      console.error("Error loading activity log types", e);
    }
  };

  const loadEmployees = async () => {
    try {
      // Siempre el directorio, sea admin o no: trae exactamente lo que mobile usa (nombre, email,
      // roles, proyectos y los contratos acotados a vigencia + área/turno) y está cacheado en el
      // server. El listado admin `/users?limit=2000` traía TODO el historial de contratos de los
      // ~1500 usuarios del tenant y se iba a timeout (60s) antes de caer igual acá.
      const users = await usersAPI.getDirectory({ status: "all" });
      setEmployees(
          users.map((u) => ({
            id: u._id,
            name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
            email: u.email,
            projectIds: u.projectIds?.map((p: any) => typeof p === "string" ? p : p?._id || p?.id).filter(Boolean) || [],
            role: u.role,
            roles: u.roles,
            isActive: (u.metadata as any)?.activo !== false,
            hasActiveContract: !!u.metadata?.projects?.some((p) =>
              p.contracts?.some((c) => {
                if (!c.fecha_baja_contrato) return true;
                let endDate = new Date(c.fecha_baja_contrato);
                if (isNaN(endDate.getTime()) && typeof c.fecha_baja_contrato === "string") {
                  const parts = c.fecha_baja_contrato.split(/[-/]/);
                  if (parts.length === 3 && parts[2].length === 4) {
                    endDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
                  }
                }
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return endDate >= today;
              }),
            ),
            metadataProjects:
              u.metadata?.projects?.map((p: any) => {
                const pId = typeof p.projectId === "string" ? p.projectId : p.projectId?._id;

                // Contrato que rige hoy (el vigente más reciente); si no hay ninguno, el último cargado.
                const activeContract: any = getContratoActivo(p.contracts);
                const hasActive = (p.contracts || []).some((c: any) => esContratoVigente(c));

                return {
                  projectId: pId,
                  roleFrame: p.nombre_rol_frame,
                  hasActiveContract: hasActive,
                  lastContractVigente: lastContractIsVigente(p.contracts),
                  contractStartTime: activeContract?.hora_inicio || undefined,
                  contractEndTime: activeContract?.hora_fin || undefined,
                  areaId: p.areaId || activeContract?.areaId || undefined,
                  shiftId: p.shiftId || activeContract?.shiftId || undefined,
                  areaShiftAssignments: normalizeAreaShiftAssignments(activeContract?.areaShiftAssignments),
                };
              }) || [],
          })),
        );
    } catch (e) {
      console.error("Error loading users", e);
    }
  };

  const loadProjects = async () => {
    try {
      const allProjects = await projectsAPI.listAll();
      setAllProjectsCache(allProjects);
    } catch (e) {
      console.error("Error loading projects", e);
    }
  };

  const loadAreasAndShifts = async () => {
    try {
      const [areas, shifts] = await Promise.all([areasAPI.listAll(), shiftsAPI.getAll()]);
      setAllAreas(areas);
      setAllShifts(shifts);
    } catch (e) {
      console.error("Error loading areas/shifts", e);
    }
  };

  const loadVacations = async () => {
    try {
      const vacationsList = await vacationsAPI.getAll();
      setAllVacations(vacationsList);
    } catch (e) {
      console.error("Error loading vacations in mobile ActivityLogs", e);
    }
  };

  /*
    DE QUIÉN SON LAS NOVEDADES QUE SE LISTAN.

    «mias» pide `?mine=1` — las propias, aunque quien mire sea Admin. «supervisadas» pide las de los
    proyectos que tiene a cargo, sin importar quién las cargó, y necesita el mismo permiso que
    Cumplimiento (el server contesta 403 si no lo tiene).

    Existe porque un coordinador que revisa a diez supervisores no carga novedades él: esta pantalla
    le daba siempre vacío y el historial de su equipo no estaba en ningún lado — el tab Cumplimiento
    dice si se enviaron, no QUÉ se envió.
  */
  const fetchReports = async (alcance: AlcanceHistorial = alcanceHistorial) => {
    setIsLoadingReports(true);
    try {
      const data = await activityReportsAPI.getAll(alcance === "supervisadas" ? { alcance: "supervisadas" } : { mine: true });
      setReports(data);

      /*
        Sin novedades propias y con equipo a cargo, se pasa solo a las supervisadas.

        Es el caso de todo coordinador: abrir siempre en una lista vacía que además es correcta —él
        no cargó ninguna— deja la pantalla sin nada que mostrar y sin pista de dónde está lo que vino
        a ver. El salto ocurre UNA vez (`autoSaltoHechoRef`): si después elige «Mías» a mano, se
        respeta.
      */
      if (alcance === "mias" && data.length === 0 && puedeVerSupervisadas && !autoSaltoHechoRef.current) {
        autoSaltoHechoRef.current = true;
        setAlcanceHistorial("supervisadas");
        void fetchReports("supervisadas");
      }
    } catch (e) {
      console.error("Error loading reports", e);
    } finally {
      setIsLoadingReports(false);
    }
  };

  // Helper to check for existing report
  const existingReport = useMemo(() => {
    if (!selectedProjectId || !reportDate) return null;
    return reports.find((r) => {
      const rProjId = typeof r.projectId === "object" && r.projectId ? (r.projectId as any)._id : r.projectId;
      return rProjId === selectedProjectId && r.date === reportDate;
    });
  }, [reports, selectedProjectId, reportDate]);

  // View Report Handler
  /**
   * ABRIR EL DETALLE PIDE EL PARTE COMPLETO.
   *
   * El del listado viene SIN `attendance` —el server lo saca con un `$project` porque eran 4,5 MB—,
   * y el detalle es justamente la lista de personas: `viewingReport.attendance.map(...)` reventaba
   * con «Cannot read properties of undefined (reading 'map')» y se llevaba puesta la pantalla
   * entera. No se notaba mientras el historial estaba vacío y no había en qué hacer click.
   *
   * Se abre con lo que ya se tiene —así el modal aparece al instante, con proyecto y fecha— y se
   * completa cuando llega el detalle. Si la llamada falla, el modal se cierra y se avisa: mejor eso
   * que un modal a medias que parece decir que el parte no tiene a nadie.
   */
  const handleViewReport = async (report: ActivityReport) => {
    setViewingReport({ ...report, attendance: report.attendance || [] });
    setShowDetailModal(true);
    if (report.attendance) return;
    try {
      const completo = await activityReportsAPI.getById(report._id);
      setViewingReport({ ...completo, attendance: completo.attendance || [] });
    } catch (e) {
      console.error("No se pudo traer el detalle del parte", e);
      setShowDetailModal(false);
      sweetAlert.error("No se pudo abrir la novedad", "No llegó el detalle del parte. Probá de nuevo en un momento.");
    }
  };

  const { profile, stats } = useProfile();

  /*
    EL RECORTE LO HACE EL SERVER, NO ESTA PANTALLA.

    Acá había un segundo filtro que volvía a quedarse sólo con las novedades cuyo `userId` coincidía
    con el perfil, comparando contra `profile.userId`, `profile._id` y el email. Era redundante —el
    endpoint ya recorta con `?mine=1`— y tenía dos problemas serios:

     1. ARRANCABA DEVOLVIENDO VACÍO. `if (!profile) return []`: mientras `/profile` no contestara, la
        lista mostraba «No has enviado novedades recientes.», que es una AFIRMACIÓN sobre los datos,
        no un «cargando». Si el perfil fallaba o tardaba, el historial quedaba vacío para siempre
        aunque las novedades ya estuvieran en memoria. Verificado contra la base: Sebastián Omar
        Soria tiene 111 novedades y el endpoint se las devuelve bien.
     2. ROMPÍA «Las que superviso». Por definición esas novedades las cargó otro, así que este filtro
        las descartaba todas: la opción habría quedado siempre vacía.

    Se muestra lo que el server contestó. Quién puede ver qué se decide en un solo lugar —el
    endpoint, que es donde se puede hacer cumplir— y no acá, donde sólo se puede esconder.
  */
  const filteredReports = reports;

  const isMyAssignment = useCallback(
    (asm: any) => {
      if (!profile) return false;
      const uid = typeof asm.userId === "object" ? asm.userId?._id || asm.userId?.id || asm.userId?.userId || asm.userId?.metadata?.id : asm.userId;
      const myIdsMatch = [profile?.userId, profile?._id, profile?.metadata?.id].filter(Boolean).map((id) => String(id));

      let isMatch = uid && myIdsMatch.includes(String(uid));
      if (!isMatch) {
        const asmEmail = typeof asm.userId === "object" ? asm.userId?.email || asm.userId?.correo : null;
        const myEmail = profile?.email;
        if (asmEmail && myEmail && String(asmEmail).toLowerCase() === String(myEmail).toLowerCase()) isMatch = true;
      }
      if (!isMatch) {
        const asmName = typeof asm.userId === "object" ? (asm.userId?.firstName && asm.userId?.lastName ? `${asm.userId.firstName} ${asm.userId.lastName}` : asm.userId?.name || asm.userId?.nombre) : null;
        const myName = `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim();
        if (asmName && myName && asmName.toLowerCase().includes(myName.toLowerCase())) isMatch = true;
      }
      return isMatch;
    },
    [profile],
  );

  const userProjects = useMemo(() => {
    if (!profile || allProjectsCache.length === 0) return [];

    // Admin / Coordinador o usuario normal con projectos asignados
    const myProjects = profile.projectIds && profile.projectIds.length > 0 ? allProjectsCache.filter((p) => profile.projectIds?.includes(p._id)) : [];

    // Si no tiene proyectos asignados, pero es admin, en mobile mostramos todos por si acaso (o respetamos la regla original)
    // Para respetar estrictamente la regla original, dejamos la línea anterior.
    // Aunque, para que el componente no falle nunca si el endpoint no trajo projectIds:
    return myProjects;
  }, [profile, allProjectsCache]);

  const selectedProject = useMemo(() => {
    const summaryProj = userProjects.find((p) => p._id === selectedProjectId);
    return fullProjectData || summaryProj || null;
  }, [userProjects, selectedProjectId, fullProjectData]);

  useEffect(() => {
    if (!selectedProjectId) {
      setFullProjectData(null);
      return;
    }
    let isMounted = true;
    /*
      `team: "ids"`: el equipo NO viene poblado.

      Poblado, el server manda cada miembro con su vínculo y TODOS sus contratos: en un proyecto de
      254 personas eran 5,5 MB y ~60 s, así que la llamada se cortaba por timeout. Sin este proyecto
      completo la pantalla caía al resumen del listado, que no trae `teamConfig`, y el reporte decía
      «0 colaboradores» a un coordinador con cinco personas activas.

      Los datos de cada persona (nombre, roles, contratos, área/turno) ya salen del directorio
      (`employees`); de acá sólo se necesita `teamConfig`, `coordinatorAssignments` y los ids de
      `assignedUsers`, que es exactamente lo que devuelve este modo (~80 KB).
    */
    projectsAPI
      .getProject(selectedProjectId, { team: "ids" })
      .then((proj) => {
        if (isMounted) {
          setFullProjectData(proj);
        }
      })
      .catch((err) => {
        console.error("Error fetching full project details:", err);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedProjectId]);

  const myCoordinatedCombinations = useMemo(() => {
    if (!selectedProject || !profile) return [];
    return (selectedProject.coordinatorAssignments || []).filter(isMyAssignment).map((asm: any) => ({
      areaId: String(asm.areaId?._id || asm.areaId || ""),
      shiftId: String(asm.shiftId?._id || asm.shiftId || ""),
    }));
  }, [selectedProject, profile, isMyAssignment]);

  const coordinatedAreaIds = useMemo(() => {
    const ids = new Set(myCoordinatedCombinations.map((c) => c.areaId));
    return Array.from(ids);
  }, [myCoordinatedCombinations]);

  const coordinatedShiftIds = useMemo(() => {
    if (!selectedAreaId) return [];
    return myCoordinatedCombinations.filter((c) => c.areaId === selectedAreaId).map((c) => c.shiftId);
  }, [myCoordinatedCombinations, selectedAreaId]);

  // Check if the coordinator has any assigned shifts in the selected project
  const hasCoordinatorAssignments = useMemo(() => {
    if (!selectedProject || !profile) return true;

    const userRoles = (profile?.roleNames || []).map((r) => r.toLowerCase());
    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");

    const allAssignments = selectedProject.coordinatorAssignments || [];
    // If coordinator assignments are configured on the project, all users (including admins) must have at least one assignment to coordinate
    if (allAssignments.length > 0) {
      return coordinatedAreaIds.length > 0;
    }

    // If no coordinator assignments are set up at all on the project, admins can see it, but regular users must have assignments
    if (isAdmin) return true;
    return false;
  }, [selectedProject, profile, coordinatedAreaIds]);
  const projectEmployees = useMemo(() => {
    if (!selectedProjectId || !selectedProject) return [];

    // Fallback for Coordinators who get 403 on /users API: use populated assignedUsers
    const sourceEmployees: EmployeeOption[] =
      employees.length > 0
        ? employees
        : (selectedProject?.assignedUsers || [])
            .filter((au: any) => typeof au === "object" && au !== null)
            .map(
              (au: any): EmployeeOption => ({
                id: au._id,
                name: `${au.firstName || ""} ${au.lastName || ""}`.trim() || au.email,
                email: au.email,
                isActive: au.metadata?.activo !== false,
                projectIds: [selectedProjectId],
                hasActiveContract: true, // Optimistic assumption
                roles: au.roles || [],
                metadataProjects:
                  au.metadata?.projects?.map((p: any) => {
                    const pId = typeof p.projectId === "string" ? p.projectId : p.projectId?._id;

                    // Contrato que rige hoy (el vigente más reciente); si no hay ninguno, el último cargado.
                    const activeContract: any = getContratoActivo(p.contracts);
                    const hasActive = (p.contracts || []).some((c: any) => esContratoVigente(c));

                    return {
                      projectId: pId,
                      roleFrame: p.nombre_rol_frame,
                      hasActiveContract: hasActive,
                      lastContractVigente: lastContractIsVigente(p.contracts),
                      contractStartTime: activeContract?.hora_inicio || undefined,
                      contractEndTime: activeContract?.hora_fin || undefined,
                      areaId: p.areaId || activeContract?.areaId || undefined,
                      shiftId: p.shiftId || activeContract?.shiftId || undefined,
                      areaShiftAssignments: normalizeAreaShiftAssignments(activeContract?.areaShiftAssignments),
                    };
                  }) || [],
              }),
            );

    const filtered = sourceEmployees.filter((e) => {
      if (!e.isActive) {
        return false;
      }

      const projMeta = e.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId));

      // Solo se pasan novedades de gente ACTIVA con contrato VIGENTE en este proyecto (mismo
      // criterio que la columna Alta/Baja del panel web: alta <= hoy <= baja, o sin baja). Si no
      // se pudo resolver el contrato de este proyecto para la persona, se la excluye en vez de
      // dejarla pasar sin confirmar — antes, sin `projMeta`, el chequeo se salteaba entero.
      if (!projMeta || !projMeta.lastContractVigente) {
        return false;
      }

      // Determine ALL of employee's area and shift combinations
      const employeeCombinations: { areaId: string; shiftId: string }[] = [];

      const teamConfigMember = selectedProject?.teamConfig?.find((c: any) => {
        const cUserId = typeof c.userId === "object" ? c.userId?._id : c.userId;
        return String(cUserId) === String(e.id);
      });

      const isCoordGlobal = coordinaAreas(e.roles);
      const hasPersonalContractShift = projMeta && (projMeta.areaId || projMeta.shiftId || projMeta.areaShiftAssignments?.length || (projMeta.contractStartTime && projMeta.contractEndTime));

      if (teamConfigMember?.areaShiftAssignments && teamConfigMember.areaShiftAssignments.length > 0) {
        teamConfigMember.areaShiftAssignments.forEach((asa: any) => {
          const aId = String(asa.areaId?._id || asa.areaId || "");
          if (asa.shiftIds && asa.shiftIds.length > 0) {
            asa.shiftIds.forEach((sId: any) => {
              employeeCombinations.push({ areaId: aId, shiftId: String(sId?._id || sId || "") });
            });
          } else {
            employeeCombinations.push({ areaId: aId, shiftId: "" });
          }
        });
      } else if (isCoordGlobal && !hasPersonalContractShift && selectedProject?.coordinatorAssignments) {
        selectedProject.coordinatorAssignments.forEach((asm: any) => {
          const uid = typeof asm.userId === "object" ? asm.userId?._id || asm.userId?.id || asm.userId?.userId || asm.userId?.metadata?.id : asm.userId;
          const empIds = [e.id, (e as any).userId, (e as any).metadata?.id].filter(Boolean).map((id) => String(id));

          let isMatch = uid && empIds.includes(String(uid));
          if (!isMatch) {
            const asmEmail = typeof asm.userId === "object" ? asm.userId?.email || asm.userId?.correo : null;
            const empEmail = e.email;
            if (asmEmail && empEmail && String(asmEmail).toLowerCase() === String(empEmail).toLowerCase()) isMatch = true;
          }
          if (!isMatch) {
            const asmName = typeof asm.userId === "object" ? (asm.userId?.firstName && asm.userId?.lastName ? `${asm.userId.firstName} ${asm.userId.lastName}` : asm.userId?.name || asm.userId?.nombre) : null;
            const empName = e.name;
            if (asmName && empName && asmName.toLowerCase().includes(empName.toLowerCase())) isMatch = true;
          }

          if (isMatch) {
            const aId = String(asm.areaId?._id || asm.areaId || "");
            const sId = String(asm.shiftId?._id || asm.shiftId || "");
            employeeCombinations.push({ areaId: aId, shiftId: sId });
          }
        });
      } else if (projMeta?.areaShiftAssignments?.length) {
        // Mismo fallback que usa el panel web (área/turno del CONTRATO vigente) cuando el miembro
        // todavía no tiene fila en project.teamConfig — antes esto se perdía y la persona quedaba
        // afuera del reporte de mobile aunque sí figurara en "Gestionar Equipo".
        projMeta.areaShiftAssignments.forEach((asa) => {
          if (asa.shiftIds.length > 0) {
            asa.shiftIds.forEach((sId) => employeeCombinations.push({ areaId: asa.areaId, shiftId: sId }));
          } else {
            employeeCombinations.push({ areaId: asa.areaId, shiftId: "" });
          }
        });
      } else {
        const pAreaId = String(projMeta?.areaId?._id || projMeta?.areaId || "");
        let pShiftId = String(projMeta?.shiftId?._id || projMeta?.shiftId || "");

        // Infer shiftId from contract hours if missing (workaround for /users API not selecting shiftId)
        if (!pShiftId && projMeta?.contractStartTime && projMeta?.contractEndTime) {
          const matchingShift = allShifts.find((s) => s.startTime === projMeta.contractStartTime && s.endTime === projMeta.contractEndTime);
          if (matchingShift) {
            pShiftId = String(matchingShift._id || matchingShift.id);
          }
        }

        employeeCombinations.push({ areaId: pAreaId, shiftId: pShiftId });
      }

      const isExplicitlyAssigned =
        !!teamConfigMember ||
        selectedProject?.assignedUsers?.some((au: any) => {
          const auId = typeof au === "object" ? au._id : au;
          return String(auId) === String(e.id);
        });

      if (!isExplicitlyAssigned) {
        return false;
      }

      // Filter by Area if selected
      if (selectedAreaId) {
        const hasMatch = employeeCombinations.some((combo) => {
          if (combo.areaId !== String(selectedAreaId)) return false;
          if (selectedShiftId && combo.shiftId !== String(selectedShiftId)) return false;
          return true;
        });

        if (!hasMatch) {
          return false;
        }
      } else {
        // "Todas las Áreas | Turnos" NO significa "todo el proyecto": significa todas las áreas/
        // turnos QUE YO COORDINO. Solo se ve el proyecto entero cuando no hay a quién coordinar.
        const userRoles = (profile?.roleNames || []).map((r) => r.toLowerCase());
        const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");
        const allAssignments = selectedProject?.coordinatorAssignments || [];
        const noRestrictions = allAssignments.length === 0;
        // Si YO tengo asignaciones de coordinador en este proyecto, mandan sobre el rol: un Admin
        // que además coordina un área carga las novedades de SU área, no las de todo el proyecto
        // (antes el `isAdmin` salteaba el filtro entero y devolvía el proyecto completo).
        const coordinoAlgoAca = myCoordinatedCombinations.length > 0;

        if (!noRestrictions && (coordinoAlgoAca || !isAdmin)) {
          const isMine = employeeCombinations.some((combo) => myCoordinatedCombinations.some((myCombo) => myCombo.areaId === combo.areaId && (myCombo.shiftId === combo.shiftId || !myCombo.shiftId || !combo.shiftId)));
          if (!isMine) {
            return false;
          }
        }
      }

      return true;
    });

    // --- SORTING BY SHIFT ORDER ---
    // Strategy: use resolveEmployeeAreaAndShift (same function that renders badges correctly)
    // to get each employee's shift name, then sort by shift order.

    // Helper: extract a sort priority from a shift name using keywords
    const getShiftPriorityByName = (shiftName: string): number => {
      const n = (shiftName || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // remove accents
      if (n.includes("manana") || n.includes("mañana") || n.startsWith("ma")) return 0;
      if (n.includes("tarde")) return 1;
      if (n.includes("noche")) return 2;
      if (n.includes("oficina")) return 3;
      return 50; // unknown shift names go last
    };

    // Pre-compute sort keys for all filtered employees (avoids calling resolveEmployeeAreaAndShift in comparator)
    const empSortKeys = new Map<string, { shiftOrder: number; shiftName: string }>();
    
    for (const emp of filtered) {
      const resolved = resolveEmployeeAreaAndShift(emp);
      let shiftOrder = 99999;
      let shiftName = resolved.shiftName || "";

      // Strategy 1: Find shift in allShifts by ID and use its order field
      if (resolved.shiftId) {
        const shiftById = allShifts.find((s) => String(s._id) === String(resolved.shiftId));
        if (shiftById) {
          shiftName = shiftName || shiftById.name;
          if (shiftById.order !== undefined && shiftById.order !== null) {
            shiftOrder = shiftById.order;
          } else {
            shiftOrder = allShifts.indexOf(shiftById);
          }
        }
      }

      // Strategy 2: Find shift in allShifts by name match
      if (shiftOrder === 99999 && shiftName) {
        const norm = (s: string) => (s || "").toLowerCase().trim();
        const shiftByName = allShifts.find((s) => {
          const sn = norm(s.name);
          const rn = norm(shiftName);
          return sn === rn || sn.includes(rn) || rn.includes(sn);
        });
        if (shiftByName) {
          if (shiftByName.order !== undefined && shiftByName.order !== null) {
            shiftOrder = shiftByName.order;
          } else {
            shiftOrder = allShifts.indexOf(shiftByName);
          }
        }
      }

      // Strategy 3: Use shift start time to determine order (earlier start = lower order)
      if (shiftOrder === 99999 && resolved.shiftId) {
        const shiftObj = allShifts.find((s) => String(s._id) === String(resolved.shiftId));
        if (shiftObj && shiftObj.startTime) {
          const [h, m] = shiftObj.startTime.split(":").map(Number);
          shiftOrder = h * 60 + m; // Minutes from midnight
        }
      }

      // Strategy 4: Parse keywords from the shift name (mañana/tarde/noche/oficina)
      if (shiftOrder === 99999 && shiftName) {
        shiftOrder = getShiftPriorityByName(shiftName) * 1000; // multiply to separate from DB orders
      }

      empSortKeys.set(emp.id, { shiftOrder, shiftName });
    }

    const sorted = [...filtered].sort((a, b) => {
      const keyA = empSortKeys.get(a.id) || { shiftOrder: 99999, shiftName: "" };
      const keyB = empSortKeys.get(b.id) || { shiftOrder: 99999, shiftName: "" };

      if (keyA.shiftOrder !== keyB.shiftOrder) {
        return keyA.shiftOrder - keyB.shiftOrder;
      }

      // Tiebreaker: sort by name within the same shift
      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [employees, selectedProjectId, selectedAreaId, selectedShiftId, myCoordinatedCombinations, profile, selectedProject, allShifts]);

  const isWorkDay = useMemo(() => {
    if (!selectedProject) return true;
    if (!reportDate) return true;

    const [year, month, day] = reportDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return isDayAllowedForReporting(selectedProject, date);
  }, [selectedProject, reportDate]);

  // Effect to auto-select a project once userProjects are loaded to prevent empty selects
  useEffect(() => {
    if (userProjects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(userProjects[0]._id);
    }
  }, [userProjects, selectedProjectId]);

  useEffect(() => {
    const type = logTypes.find((t) => t._id === draftTypeId);
    if (type?.name.toLowerCase().includes("horas extra") && selectedProjectId) {
      const project = userProjects.find((p) => p._id === selectedProjectId);
      if (project) {
        const endTime = selectedEmployee ? getEmployeeEndTime(project, selectedEmployee.id, reportDate, selectedEmployee) : getProjectEndTime(project, reportDate);
        const startTime = selectedEmployee ? getEmployeeStartTime(project, selectedEmployee.id, reportDate, selectedEmployee) : getProjectStartTime(project, reportDate);

        let totalOvertime = 0;
        let contractedMinutes = 0;

        if (startTime && endTime) {
          const [sH, sM] = startTime.split(":").map(Number);
          let startTotal = sH * 60 + sM;
          const [eH, eM] = endTime.split(":").map(Number);
          let endTotal = eH * 60 + eM;
          if (endTotal < startTotal) {
            endTotal += 24 * 60;
          }
          contractedMinutes = endTotal - startTotal;
        }

        if (draftInTime && draftOutTime) {
          const [inH, inM] = draftInTime.split(":").map(Number);
          let inTotal = inH * 60 + inM;
          const [outH, outM] = draftOutTime.split(":").map(Number);
          let outTotal = outH * 60 + outM;

          if (outTotal < inTotal) {
            outTotal += 24 * 60;
          }

          let workedMinutes = outTotal - inTotal;
          if (workedMinutes > contractedMinutes) {
            totalOvertime = (workedMinutes - contractedMinutes) / 60;
          }
        }

        let calculatedTotal = parseFloat(totalOvertime.toFixed(2));
        const { h50, h100 } = splitOvertime(
          reportDate,
          draftInTime,
          draftOutTime,
          calculatedTotal,
          glossary,
          startTime || undefined,
          endTime || undefined
        );
        setDraftOvertimeHours50(h50);
        setDraftOvertimeHours100(h100);
        setDraftOvertimeHours(calculatedTotal);
      }
    }
  }, [draftOutTime, draftInTime, draftTypeId, selectedProjectId, reportDate, userProjects, logTypes, selectedEmployee, glossary]);

  // Fast-entry REPLACEMENT OT calculation
  useEffect(() => {
    if (draftReplacementId && draftTypeId && selectedProjectId) {
      const project = userProjects.find((p) => p._id === selectedProjectId);
      if (project) {
        const rep = employees.find((e) => e.id === draftReplacementId);
        const endTime = getEmployeeEndTime(project, draftReplacementId, reportDate, rep);
        const startTime = getEmployeeStartTime(project, draftReplacementId, reportDate, rep);

        let totalOvertime = 0;
        let contractedMinutes = 0;

        if (startTime && endTime) {
          const [sH, sM] = startTime.split(":").map(Number);
          let startTotal = sH * 60 + sM;
          const [eH, eM] = endTime.split(":").map(Number);
          let endTotal = eH * 60 + eM;
          if (endTotal < startTotal) {
            endTotal += 24 * 60;
          }
          contractedMinutes = endTotal - startTotal;
        }

        if (draftReplacementInTime && draftReplacementOutTime) {
          const [inH, inM] = draftReplacementInTime.split(":").map(Number);
          let inTotal = inH * 60 + inM;
          const [outH, outM] = draftReplacementOutTime.split(":").map(Number);
          let outTotal = outH * 60 + outM;

          if (outTotal < inTotal) {
            outTotal += 24 * 60;
          }

          let workedMinutes = outTotal - inTotal;
          if (workedMinutes > contractedMinutes) {
            totalOvertime = (workedMinutes - contractedMinutes) / 60;
          }
        }
        
        let calculatedTotal = parseFloat(totalOvertime.toFixed(2));
        const { h50, h100 } = splitOvertime(
          reportDate,
          draftReplacementInTime,
          draftReplacementOutTime,
          calculatedTotal,
          glossary,
          startTime || undefined,
          endTime || undefined
        );
        setDraftReplacementOvertimeHours50(h50);
        setDraftReplacementOvertimeHours100(h100);
        setDraftReplacementOvertimeHours(calculatedTotal);
      }
    }
  }, [draftReplacementOutTime, draftReplacementInTime, draftReplacementId, draftTypeId, selectedProjectId, reportDate, userProjects, glossary]);

  // Pre-fill Out/In Time for Overtime when employee or type changes
  useEffect(() => {
    if (selectedEmployee && draftTypeId && selectedProjectId) {
      const type = logTypes.find((t) => t._id === draftTypeId);
      if (type?.name.toLowerCase().includes("horas extra")) {
        const project = userProjects.find((p) => p._id === selectedProjectId);
        if (project) {
          const endTime = getEmployeeEndTime(project, selectedEmployee.id, reportDate, selectedEmployee);
          if (endTime) setDraftOutTime(endTime);

          const startTime = getEmployeeStartTime(project, selectedEmployee.id, reportDate, selectedEmployee);
          if (startTime) setDraftInTime(startTime);
        }
      }
    }
  }, [selectedEmployee?.id, draftTypeId, selectedProjectId, reportDate]);

  // Wizard OT calculation
  useEffect(() => {
    if (wizardIndex < 0 || !selectedProject) return;
    const currentEmp = projectEmployees[wizardIndex];
    if (!currentEmp) return;

    const data = wizardData[currentEmp.id];
    if (data?.status === "present" && (data.outTime || data.inTime)) {
      const endTime = getEmployeeEndTime(selectedProject, currentEmp.id, reportDate, currentEmp);
      const startTime = getEmployeeStartTime(selectedProject, currentEmp.id, reportDate, currentEmp);

      let totalOvertime = 0;
      let contractedMinutes = 0;

      if (startTime && endTime) {
        const [sH, sM] = startTime.split(":").map(Number);
        let startTotal = sH * 60 + sM;
        const [eH, eM] = endTime.split(":").map(Number);
        let endTotal = eH * 60 + eM;
        if (endTotal < startTotal) {
          endTotal += 24 * 60;
        }
        contractedMinutes = endTotal - startTotal;
      }

      if (data.inTime && data.outTime) {
        const [inH, inM] = data.inTime.split(":").map(Number);
        let inTotal = inH * 60 + inM;
        const [outH, outM] = data.outTime.split(":").map(Number);
        let outTotal = outH * 60 + outM;

        if (outTotal < inTotal) {
          outTotal += 24 * 60;
        }

        let workedMinutes = outTotal - inTotal;
        if (workedMinutes > contractedMinutes) {
          totalOvertime = (workedMinutes - contractedMinutes) / 60;
        }
      }

      const finalVal = parseFloat(totalOvertime.toFixed(2));
      const { h50, h100 } = splitOvertime(
        reportDate,
        data.inTime || "",
        data.outTime || "",
        finalVal,
        glossary,
        startTime || undefined,
        endTime || undefined
      );

      // Only update if it's different to avoid infinite loops
      if (
        finalVal !== data.overtimeHours ||
        h50 !== data.overtimeHours50 ||
        h100 !== data.overtimeHours100
      ) {
        updateWizardEntry(currentEmp.id, {
          overtimeHours: finalVal,
          overtimeHours50: h50,
          overtimeHours100: h100,
        });
      }
    }

    if (data?.replacementId && (data.replacementInTime || data.replacementOutTime)) {
      const replacement = employees.find((e) => e.id === data.replacementId);
      const endTime = getEmployeeEndTime(selectedProject, data.replacementId, reportDate, replacement);
      const startTime = getEmployeeStartTime(selectedProject, data.replacementId, reportDate, replacement);

      let totalOvertime = 0;
      let contractedMinutes = 0;

      if (startTime && endTime) {
        const [sH, sM] = startTime.split(":").map(Number);
        let startTotal = sH * 60 + sM;
        const [eH, eM] = endTime.split(":").map(Number);
        let endTotal = eH * 60 + eM;
        if (endTotal < startTotal) {
          endTotal += 24 * 60;
        }
        contractedMinutes = endTotal - startTotal;
      }

      if (data.replacementInTime && data.replacementOutTime) {
        const [inH, inM] = data.replacementInTime.split(":").map(Number);
        let inTotal = inH * 60 + inM;
        const [outH, outM] = data.replacementOutTime.split(":").map(Number);
        let outTotal = outH * 60 + outM;

        if (outTotal < inTotal) {
          outTotal += 24 * 60;
        }

        let workedMinutes = outTotal - inTotal;
        if (workedMinutes > contractedMinutes) {
          totalOvertime = (workedMinutes - contractedMinutes) / 60;
        }
      }

      const finalVal = parseFloat(totalOvertime.toFixed(2));
      const { h50, h100 } = splitOvertime(
        reportDate,
        data.replacementInTime || "",
        data.replacementOutTime || "",
        finalVal,
        glossary,
        startTime || undefined,
        endTime || undefined
      );

      if (
        finalVal !== data.replacementOvertimeHours ||
        h50 !== data.replacementOvertimeHours50 ||
        h100 !== data.replacementOvertimeHours100
      ) {
        updateWizardEntry(currentEmp.id, {
          replacementOvertimeHours: finalVal,
          replacementOvertimeHours50: h50,
          replacementOvertimeHours100: h100,
        });
      }
    }
  }, [wizardIndex, wizardData, selectedProject, reportDate, glossary]);

  // Derived state to check if Fast Entry is enabled for the current project
  // Derived state to check if Fast Entry is enabled for the current project
  const isFastEntryEnabled = useMemo(() => {
    // 1. Check Project Specific Config
    if (selectedProject?.activityLogConfig) {
      const { enableFastEntry } = selectedProject.activityLogConfig;

      // If we have a specific setting (useGlobalConfig is false, or just purely relying on enableFastEntry if present)
      // Since we deprecated global config, we treat enableFastEntry as the source of truth if defined.
      if (typeof enableFastEntry === "boolean") {
        return enableFastEntry;
      }
    }

    // 2. Default Fallback
    // If no config is present, or legacy project, we default to TRUE (Fast Entry)
    // to maintain backward compatibility with standard behavior.
    return true;
  }, [selectedProject]);

  // Check if project allows additional staff
  const allowsAdditionalStaff = useMemo(() => {
    return selectedProject?.activityLogConfig?.allowsAdditionalStaff ?? false;
  }, [selectedProject]);

  // Get employees for additional staff selection (shows all active users)
  const nonProjectEmployees = useMemo(() => {
    if (!selectedProjectId) return [];
    return employees.filter((e) => {
      // Exclude if already in the checklist (projectEmployees)
      const isAlreadyChecklist = projectEmployees.some((pe) => pe.id === e.id);
      if (isAlreadyChecklist) return false;
      return true;
    });
  }, [employees, selectedProjectId, projectEmployees]);

  const filteredNonProjectEmployees = useMemo(() => {
    const filtered = nonProjectEmployees.filter((emp) => {
      const matchesSearch = debouncedAdditionalSearchTerm ? emp.name.toLowerCase().includes(debouncedAdditionalSearchTerm.toLowerCase()) : true;

      // Role filtering with normalization (case-insensitive and trimmed)
      const matchesRoles =
        selectedAdditionalRoleFilters.length > 0
          ? emp.metadataProjects?.some((m) => {
              if (!m.roleFrame) return false;
              const normalizedRole = m.roleFrame.trim().toLowerCase();
              return selectedAdditionalRoleFilters.some((f) => f.trim().toLowerCase() === normalizedRole);
            })
          : true;

      let matchesStatus = true;
      if (additionalStaffStatusFilter === "active") {
        matchesStatus = emp.isActive !== false;
      } else if (additionalStaffStatusFilter === "inactive") {
        matchesStatus = emp.isActive === false;
      } else if (additionalStaffStatusFilter === "all") {
        matchesStatus = true;
      }

      let matchesContract = true;
      if (additionalStaffFilterContractActive) {
        matchesContract = emp.hasActiveContract;
      }

      return matchesSearch && matchesRoles && matchesStatus && matchesContract;
    });

    return filtered;
  }, [nonProjectEmployees, debouncedAdditionalSearchTerm, selectedAdditionalRoleFilters, additionalStaffStatusFilter, additionalStaffFilterContractActive]);

  const additionalStaffAvailableRoles = useMemo(() => {
    const roles = new Set<string>();
    nonProjectEmployees.forEach((e) => {
      e.metadataProjects?.forEach((m) => {
        if (m.roleFrame) roles.add(m.roleFrame.trim());
      });
    });
    return Array.from(roles).sort();
  }, [nonProjectEmployees]);

  const replacementAvailableRoles = useMemo(() => {
    const roles = new Set<string>();
    employees.forEach((e) => {
      e.metadataProjects?.forEach((m) => {
        if (m.roleFrame) roles.add(m.roleFrame.trim());
      });
    });
    return Array.from(roles).sort();
  }, [employees]);

  const addRecordInternal = (employee: EmployeeOption, type: RequestConfig, replacementId?: string, overtimeHours?: number, notes?: string) => {
    const replacement = employees.find((e) => e.id === replacementId);

    const newRecord: LocalAttendanceRecord = {
      tempId: Date.now().toString(),
      employeeId: employee.id,
      employeeName: employee.name,
      typeId: type._id,
      typeName: type.name,
      replacementId: replacementId || undefined,
      replacementName: replacement?.name,
      overtimeHours: type.name.toLowerCase().includes("horas extra") ? overtimeHours : undefined,
      overtimeHours50: type.name.toLowerCase().includes("horas extra") ? draftOvertimeHours50 : undefined,
      overtimeHours100: type.name.toLowerCase().includes("horas extra") ? draftOvertimeHours100 : undefined,
      replacementOvertimeHours: hasDraftReplacementOvertime ? draftReplacementOvertimeHours : undefined,
      replacementOvertimeHours50: hasDraftReplacementOvertime ? draftReplacementOvertimeHours50 : undefined,
      replacementOvertimeHours100: hasDraftReplacementOvertime ? draftReplacementOvertimeHours100 : undefined,
      outTime: type.name.toLowerCase().includes("horas extra") ? draftOutTime : undefined,
      inTime: type.name.toLowerCase().includes("horas extra") ? draftInTime : undefined,
      replacementInTime: hasDraftReplacementOvertime ? draftReplacementInTime : undefined,
      replacementOutTime: hasDraftReplacementOvertime ? draftReplacementOutTime : undefined,
      notes: notes,
    };

    setEntries((prev) => [...prev, newRecord]);

    // Reset builder
    setSelectedEmployee(null);
    setSearchTerm("");
    setNoveltyCategory(null);
    setAttendanceStatus(null);
    setShowOvertimeForm(false);
    setDraftTypeId("");
    setDraftReplacementId("");
    setDraftOvertimeHours(0);
    setDraftOvertimeHours50(0);
    setDraftOvertimeHours100(0);
    setDraftReplacementOvertimeHours(0);
    setDraftReplacementOvertimeHours50(0);
    setDraftReplacementOvertimeHours100(0);
    setHasDraftReplacementOvertime(false);
    setDraftReplacementInTime("");
    setDraftReplacementOutTime("");
    setDraftOutTime("");
    setDraftInTime("");
    setIsEmployeeSelectOpen(false);
  };

  const handleAddRecord = (): boolean => {
    if (!selectedEmployee || !draftTypeId) return false;
    const type = logTypes.find((t) => t._id === draftTypeId);
    if (!type) return false;

    if (type.name.toLowerCase().includes("horas extra")) {
      if (!draftOvertimeHours || draftOvertimeHours <= 0) {
        sweetAlert.warning("Atención", "La cantidad de horas extras debe ser mayor a 0.");
        return false;
      }
    }

    addRecordInternal(selectedEmployee, type, draftReplacementId, draftOvertimeHours);
    return true;
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTypeId = e.target.value;
    setDraftTypeId(newTypeId);

    if (!newTypeId || !selectedEmployee) return;

    const type = logTypes.find((t) => t._id === newTypeId);
    if (!type) return;

    const isOvertime = type.name.toLowerCase().includes("horas extra");
    const needsReplacement = type.requiresReplacement;

    // If it's a simple type (no extra fields needed), add immediately
    if (!isOvertime && !needsReplacement) {
      // Use setTimeout to allow UI to update briefly or just fire
      // Direct call is fine
      addRecordInternal(selectedEmployee, type);
    }
  };

  const handleRemoveRecord = (tempId: string) => {
    setEntries((prev) => prev.filter((r) => r.tempId !== tempId));
  };

  // ===================== WIZARD LOGIC =====================
  const startWizard = () => {
    if (!projectEmployees.length) {
      sweetAlert.info("Sin Personal", "Este proyecto no tiene personal asignado.");
      return;
    }
    setWizardIndex(0);

    setTimeout(() => {
      if (formScrollRef.current) {
        formScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 50);

    // Initialize data
    // If we have entries (Editing mode or previous draft), use them to populate
    const initData: Record<string, WizardEntry> = {};

    projectEmployees.forEach((emp) => {
      // Find existing entry
      const entry = entries.find((e) => e.employeeId === emp.id);

      if (entry) {
        if (entry.typeName.toLowerCase().includes("horas extra")) {
          initData[emp.id] = {
            status: "present",
            overtimeHours: entry.overtimeHours,
            overtimeHours50: entry.overtimeHours50,
            overtimeHours100: entry.overtimeHours100,
            replacementOvertimeHours: entry.replacementOvertimeHours,
            replacementOvertimeHours50: entry.replacementOvertimeHours50,
            replacementOvertimeHours100: entry.replacementOvertimeHours100,
            inTime: entry.inTime,
            outTime: entry.outTime,
            notes: entry.notes,
          };
        } else {
          // Absent
          initData[emp.id] = {
            status: "absent",
            typeId: entry.typeId,
            replacementId: entry.replacementId,
            notes: entry.notes,
          };
        }
      } else {
        // If hasActivity is true, implies others are Default Present
        // If hasActivity is false, implies EVERYONE Present (if we are in editing mode of a 'No News' report? No, hasActivity=false means no entries)
        // If we are editing a report that had entries, users NOT in entries are Present.
        initData[emp.id] = {};
      }
    });

    setWizardData(initData);
  };

  // Calendar Helpers
  const generateCalendarDays = () => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({
      start: startDate,
      end: endDate,
    });
  };

  /** Día en el que TODAVÍA se puede cargar (esperado + dentro de la ventana allowedPastDays). */
  const isProjectWorkDay = (day: Date) => {
    if (!selectedProject) return false;
    return isDayAllowedForReporting(selectedProject, day);
  };

  /** Día ESPERADO por el schedule del proyecto (sin importar la ventana de carga). */
  const isProjectExpectedDay = (day: Date) => {
    if (!selectedProject) return false;
    return isDayInFrequency(selectedProject, day);
  };

  const hasReport = (day: Date) => {
    const dateStr = format(day, "yyyy-MM-dd");
    return reports.some((r) => {
      const reportDateStr = typeof r.date === "string" ? r.date.split("T")[0] : "";
      const rProjectId = typeof r.projectId === "object" ? (r.projectId as any)._id : r.projectId;
      return reportDateStr === dateStr && rProjectId === selectedProjectId;
    });
  };

  const handleDateSelect = async (day: Date) => {
    if (!selectedProjectId) return;

    if (isFuture(day) && !isToday(day)) return;
    if (hasReport(day)) return;
    if (!isProjectWorkDay(day)) return; // Strict project day check

    const formattedDate = format(day, "yyyy-MM-dd");
    setReportDate(formattedDate);
    setCalendarOpen(false);
  };

  // ===================== WIZARD LOGIC REPAIRED =====================
  const updateWizardEntry = (employeeId: string, updates: Partial<WizardEntry>) => {
    setWizardData((prev) => ({
      ...prev,
      [employeeId]: { ...prev[employeeId], ...updates },
    }));
  };

  const handleWizardNext = () => {
    if (wizardIndex >= projectEmployees.length - 1) {
      finalizeWizard();
    } else {
      setWizardIndex(wizardIndex + 1);
      setTimeout(() => {
        if (formScrollRef.current) {
          formScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 50);
    }
  };

  const handleWizardPrev = () => {
    if (wizardIndex > 0) {
      setWizardIndex(wizardIndex - 1);
      setTimeout(() => {
        if (formScrollRef.current) {
          formScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }
      }, 50);
    }
  };

  const finalizeWizard = () => {
    const newEntries: LocalAttendanceRecord[] = [];
    let hasAnomalies = false;

    projectEmployees.forEach((emp) => {
      const data = wizardData[emp.id];
      if (!data) return;

      if (data.status === "absent" && data.typeId) {
        hasAnomalies = true;
        const type = logTypes.find((t) => t._id === data.typeId);
        newEntries.push({
          tempId: `wiz-${emp.id}-${Date.now()}`,
          employeeId: emp.id,
          employeeName: emp.name,
          typeId: data.typeId,
          typeName: type?.name || "Ausente",
          replacementId: data.replacementId,
          replacementName: employees.find((e) => e.id === data.replacementId)?.name,
          replacementOvertimeHours: data.replacementOvertimeHours,
          replacementInTime: data.replacementInTime,
          replacementOutTime: data.replacementOutTime,
          notes: data.notes,
        });
      }
      // If Present but Overtime
      else if (data.status === "present" && (data.overtimeHours || 0) > 0) {
        hasAnomalies = true;
        const otType = logTypes.find((t) => t.name.toLowerCase().includes("horas extra"));
        if (otType) {
          newEntries.push({
            tempId: `wiz-${emp.id}-${Date.now()}`,
            employeeId: emp.id,
            employeeName: emp.name,
            typeId: otType._id,
            typeName: otType.name,
            overtimeHours: data.overtimeHours,
            outTime: data.outTime,
            inTime: data.inTime,
            notes: data.notes,
          });
        }
      }
    });

    setEntries(newEntries);
    setHasActivity(hasAnomalies);

    // If project allows additional staff, show additional staff modal first
    if (allowsAdditionalStaff && nonProjectEmployees.length > 0) {
      setShowAdditionalStaffModal(true);
    } else {
      setShowSummaryModal(true);
    }
  };
  // ========================================================

  const handlePreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProjectId && userProjects.length > 0) {
      await sweetAlert.error("Falta Proyecto", "Por favor selecciona un proyecto.");
      return;
    }

    // Auto-save pending draft if valid
    if (hasActivity && selectedEmployee && draftTypeId) {
      const added = handleAddRecord();
      if (!added) return;
    }

    // Check for empty activity report
    const justAdded = hasActivity && selectedEmployee && draftTypeId;
    if (hasActivity && entries.length === 0 && !justAdded) {
      await sweetAlert.error("Reporte Vacío", "Si hubo novedades, debes agregar al menos un registro. Si no hubo, selecciona 'NO'.");
      return;
    }

    // If project allows additional staff, show additional staff modal first
    if (allowsAdditionalStaff && nonProjectEmployees.length > 0) {
      setShowAdditionalStaffModal(true);
    } else {
      setShowSummaryModal(true);
    }
  };

  const handleConfirmSubmit = async () => {
    const confirmRes = await sweetAlert.confirm(
      "Importante",
      "Recordá que tenés hasta 48hs de realizado el reporte para editarlo.",
      "Confirmar",
      "Volver"
    );
    if (!confirmRes.isConfirmed) return;

    setSubmitting(true);

    try {
      const attendance = [];

      const proj = userProjects.find((p) => p._id === selectedProjectId);

      // Iterate over projectEmployees (already filtered by area/shift) to ensure we save their schedule snapshot
      for (const emp of projectEmployees) {
        // Try to find if we have a specific entry (anomaly/overtime)
        const entry = entries.find((e) => e.employeeId === emp.id);

        // Calculate schedule times for THIS day
        const schedIn = proj ? getEmployeeStartTime(proj, emp.id, reportDate, emp) : undefined;
        const schedOut = proj ? getEmployeeEndTime(proj, emp.id, reportDate, emp) : undefined;

        if (entry) {
          // It's an anomaly or overtime
          attendance.push({
            employeeId: entry.employeeId,
            status: entry.typeName.toLowerCase().includes("horas extra") ? "present" : "absent",
            absenceReason: entry.typeName.toLowerCase().includes("horas extra") ? undefined : entry.typeName,
            replacementId: entry.replacementId,
            overtimeHours: entry.overtimeHours,
            overtimeHours50: entry.overtimeHours50,
            overtimeHours100: entry.overtimeHours100,
            replacementOvertimeHours: entry.replacementOvertimeHours,
            replacementOvertimeHours50: entry.replacementOvertimeHours50,
            replacementOvertimeHours100: entry.replacementOvertimeHours100,
            notes: entry.notes,
            inTime: entry.inTime, // Real Entry
            outTime: entry.outTime, // Real Exit
            replacementInTime: entry.replacementInTime, // Real Replacement Entry
            replacementOutTime: entry.replacementOutTime, // Real Replacement Exit
            scheduleInTime: schedIn,
            scheduleOutTime: schedOut,
          });
        } else {
          // It's a standard present day (Virtual became Real/Persisted)
          if (hasActivity === false || (hasActivity === true && !entries.find((e) => e.employeeId === emp.id))) {
            attendance.push({
              employeeId: emp.id,
              status: "present",
              overtimeHours: 0,
              overtimeHours50: 0,
              overtimeHours100: 0,
              scheduleInTime: schedIn,
              scheduleOutTime: schedOut,
            });
          }
        }
      }

      // Process additional staff (non-project employees who were added)
      const additionalEntries = entries.filter((e) => !projectEmployees.some((pe) => pe.id === e.employeeId));
      for (const entry of additionalEntries) {
        const emp = employees.find((e) => e.id === entry.employeeId);
        const schedIn = proj && emp ? getEmployeeStartTime(proj, entry.employeeId, reportDate, emp) : undefined;
        const schedOut = proj && emp ? getEmployeeEndTime(proj, entry.employeeId, reportDate, emp) : undefined;

        attendance.push({
          employeeId: entry.employeeId,
          status: "present",
          absenceReason: entry.typeName || "Presente (Adicional)",
          replacementId: entry.replacementId,
          overtimeHours: entry.overtimeHours || 0,
          overtimeHours50: entry.overtimeHours50 || 0,
          overtimeHours100: entry.overtimeHours100 || 0,
          replacementOvertimeHours: entry.replacementOvertimeHours,
          replacementOvertimeHours50: entry.replacementOvertimeHours50,
          replacementOvertimeHours100: entry.replacementOvertimeHours100,
          notes: entry.notes || "Personal adicional agregado al reporte",
          inTime: entry.inTime, // Real Entry
          outTime: entry.outTime, // Real Exit
          replacementInTime: entry.replacementInTime, // Real Replacement Entry
          replacementOutTime: entry.replacementOutTime, // Real Replacement Exit
          scheduleInTime: schedIn,
          scheduleOutTime: schedOut,
        });
      }

      const payload = {
        date: reportDate,
        hasActivity: !!hasActivity, // Keeps the flag true if there were anomalies, false if "No News"
        comments,
        attendance,
        projectId: selectedProjectId || undefined,
        areaId: selectedAreaId || undefined,
        shiftId: selectedShiftId || undefined,
      };

      if (selectedReportId) {
        await activityReportsAPI.update(selectedReportId, payload);
        await sweetAlert.success("¡Reporte actualizado!", "El reporte diario ha sido actualizado.");
        setShowForm(false);
        setShowSummaryModal(false);
        setHasActivity(null);
        fetchReports(); // Refresh list
      } else {
        await activityReportsAPI.create(payload);
        await sweetAlert.success("¡Reporte enviado!", "El reporte diario ha sido registrado.");
        setShowForm(false);
        setShowSummaryModal(false);
        setHasActivity(null);
        fetchReports(); // Refresh list
      }
    } catch (error: any) {
      console.error("Save error", error);
      await sweetAlert.error("Error al guardar", error.response?.data?.error || error.message);
      setShowSummaryModal(false); // Close modal on error to allow fix
    } finally {
      setSubmitting(false);
    }
  };

  // When opening form
  const handleEditReport = (report: ActivityReport) => {
    setSelectedReportId(report._id);
    setReportDate(report.date);

    // Set Project ID safely
    if (report.projectId) {
      const pId = typeof report.projectId === "object" ? report.projectId._id : report.projectId;
      setSelectedProjectId(pId);
    } else {
      setSelectedProjectId("");
    }

    if (report.areaId) {
      const aId = typeof report.areaId === "object" ? report.areaId._id : report.areaId;
      setSelectedAreaId(aId);
    } else {
      setSelectedAreaId("");
    }

    if (report.shiftId) {
      const sId = typeof report.shiftId === "object" ? report.shiftId._id : report.shiftId;
      setSelectedShiftId(sId);
    } else {
      setSelectedShiftId("");
    }

    setComments(report.comments || "");

    // Simplified logic for edit mapping
    if (report.attendance && report.attendance.length > 0) {
      setHasActivity(true);
      const mappedEntries: LocalAttendanceRecord[] = report.attendance
        .map((att, idx) => {
          // Reconstruct Type from absenceReason or overtime
          let typeId = "";
          let typeName = att.absenceReason || "Presente";

          if ((att.overtimeHours || 0) > 0) {
            // Try to find an overtime type
            const otType = logTypes.find((t) => t.name.toLowerCase().includes("horas extra"));
            if (otType) {
              typeId = otType._id;
              typeName = otType.name;
            }
          } else {
            const rType = logTypes.find((t) => t.name === att.absenceReason);
            if (rType) {
              typeId = rType._id;
              typeName = rType.name;
            }
          }

          const empId = typeof att.employeeId === "object" ? att.employeeId._id : att.employeeId;
          const emp = employees.find((e) => e.id === empId);
          const repId = typeof att.replacementId === "object" ? att.replacementId._id : att.replacementId;
          const rep = employees.find((e) => e.id === repId);

          return {
            tempId: idx.toString(),
            employeeId: empId,
            employeeName: emp ? emp.name : "Desconocido",
            typeId,
            typeName,
            replacementId: repId,
            replacementName: rep ? rep.name : undefined,
            overtimeHours: att.overtimeHours,
            overtimeHours50: att.overtimeHours50,
            overtimeHours100: att.overtimeHours100,
            replacementOvertimeHours: att.replacementOvertimeHours,
            replacementOvertimeHours50: att.replacementOvertimeHours50,
            replacementOvertimeHours100: att.replacementOvertimeHours100,
            inTime: att.inTime,
            outTime: att.outTime,
            replacementInTime: att.replacementInTime,
            replacementOutTime: att.replacementOutTime,
            notes: att.notes,
          };
        })
        .filter((entry) => entry.typeName !== "Presente" || (entry.overtimeHours || 0) > 0);
      setEntries(mappedEntries);
    } else {
      setHasActivity(false);
      setEntries([]);
    }

    setShowForm(true);
  };

  const handleEditFromDetail = () => {
    if (viewingReport) {
      const projId = typeof viewingReport.projectId === "object" && viewingReport.projectId ? (viewingReport.projectId as any)._id : viewingReport.projectId;
      const project = userProjects.find((p) => p._id === projId);
      const allowedPastDays = project?.activityLogConfig?.allowedPastDays ?? 3;
      const reportDate = startOfDay(parseISO(viewingReport.date));
      const today = startOfDay(new Date());
      const diffDays = Math.round((today.getTime() - reportDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > (allowedPastDays - 1)) {
        sweetAlert.error("Atención", `El máximo para editar son ${(allowedPastDays - 1) * 24} horas de realizado el reporte.`);
        return;
      }
      setShowDetailModal(false);
      handleEditReport(viewingReport);
    }
  };

  const handleCreateNew = async () => {
    setSelectedReportId(null);
    const d = new Date();
    setReportDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);

    if (userProjects.length > 0) {
      setSelectedProjectId(userProjects[0]._id);
    } else {
      setSelectedProjectId("");
    }

    setHasActivity(null);
    setEntries([]); // Clear entries for new report
    setSelectedEmployee(null);
    setNoveltyCategory(null);
    setAttendanceStatus(null);
    setShowOvertimeForm(false);
    setSearchTerm("");
    setComments("");
    // Wizard Reset
    setWizardIndex(-1);
    setWizardData({});
    // Additional Staff Reset
    setSelectedAdditionalStaff([]);
    setAdditionalStaffSearchTerm("");
    setShowForm(true);
  };

  const isOvertimeTimeIncomplete = (() => {
    if (activeOvertimeModal === "wizard") {
      if (wizardIndex >= 0 && projectEmployees[wizardIndex]) {
        const currentEmp = projectEmployees[wizardIndex];
        const data = wizardData[currentEmp.id];
        return !data?.inTime || !data?.outTime;
      }
      return true;
    }
    if (activeOvertimeModal === "fast-entry") {
      return !draftInTime || !draftOutTime;
    }
    if (activeOvertimeModal === "entry-edit" && editingEntryTempId) {
      const entry = entries.find((e) => e.tempId === editingEntryTempId);
      return !entry?.inTime || !entry?.outTime;
    }
    return false;
  })();

  const isReplacementOvertimeTimeIncomplete = (() => {
    if (activeReplacementOvertimeModal === "wizard") {
      if (wizardIndex >= 0 && projectEmployees[wizardIndex]) {
        const currentEmp = projectEmployees[wizardIndex];
        const data = wizardData[currentEmp.id];
        return !data?.replacementInTime || !data?.replacementOutTime;
      }
      return true;
    }
    if (activeReplacementOvertimeModal === "fast-entry") {
      return !draftReplacementInTime || !draftReplacementOutTime;
    }
    return false;
  })();

  const handleCloseOvertimeModal = () => {
    if (activeOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]) {
      const currentEmp = projectEmployees[wizardIndex];
      const data = wizardData[currentEmp.id];
      if (data) {
        const inTime = data.inTime;
        const outTime = data.outTime;
        if (!inTime || !outTime) {
          updateWizardEntry(currentEmp.id, { overtimeHours: undefined, inTime: undefined, outTime: undefined });
        }
      }
    } else if (activeOvertimeModal === "fast-entry") {
      if (!draftInTime || !draftOutTime) {
        setShowOvertimeForm(false);
        setDraftTypeId("");
        setDraftOvertimeHours(0);
        setDraftInTime("");
        setDraftOutTime("");
      }
    } else if (activeOvertimeModal === "entry-edit" && editingEntryTempId) {
      const entry = entries.find((e) => e.tempId === editingEntryTempId);
      if (entry && (!entry.inTime || !entry.outTime)) {
        updateEntryOvertime(editingEntryTempId, { overtimeHours: undefined, inTime: undefined, outTime: undefined });
      }
      setEditingEntryTempId(null);
    }
    setActiveOvertimeModal(null);
  };

  const handleCloseReplacementOvertimeModal = () => {
    if (activeReplacementOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]) {
      const currentEmp = projectEmployees[wizardIndex];
      const data = wizardData[currentEmp.id];
      if (data) {
        const inTime = data.replacementInTime;
        const outTime = data.replacementOutTime;
        if (!inTime || !outTime) {
          updateWizardEntry(currentEmp.id, { replacementOvertimeHours: undefined, replacementInTime: undefined, replacementOutTime: undefined });
        }
      }
    } else if (activeReplacementOvertimeModal === "fast-entry") {
      if (!draftReplacementInTime || !draftReplacementOutTime) {
        setDraftReplacementOvertimeHours(0);
        setDraftReplacementInTime("");
        setDraftReplacementOutTime("");
      }
    }
    setActiveReplacementOvertimeModal(null);
  };

  const handleCancelOvertime = () => {
    if (activeOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]) {
      const currentEmp = projectEmployees[wizardIndex];
      updateWizardEntry(currentEmp.id, { overtimeHours: undefined, inTime: undefined, outTime: undefined });
    } else if (activeOvertimeModal === "fast-entry") {
      setShowOvertimeForm(false);
      setDraftTypeId("");
      setDraftOvertimeHours(0);
      setDraftInTime("");
      setDraftOutTime("");
    } else if (activeOvertimeModal === "entry-edit" && editingEntryTempId) {
      updateEntryOvertime(editingEntryTempId, { overtimeHours: undefined, inTime: undefined, outTime: undefined });
      setEditingEntryTempId(null);
    }
    setActiveOvertimeModal(null);
  };

  const handleCancelReplacementOvertime = () => {
    if (activeReplacementOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]) {
      const currentEmp = projectEmployees[wizardIndex];
      updateWizardEntry(currentEmp.id, { replacementOvertimeHours: undefined, replacementInTime: undefined, replacementOutTime: undefined });
    } else if (activeReplacementOvertimeModal === "fast-entry") {
      setDraftReplacementOvertimeHours(0);
      setHasDraftReplacementOvertime(false);
      setDraftReplacementInTime("");
      setDraftReplacementOutTime("");
    }
    setActiveReplacementOvertimeModal(null);
  };

  return (
    <div className={embebido ? "" : "flex-1 pb-24"}>
      {/* Sólo cuando se abre sola: dentro de Novedades el encabezado ya está puesto. */}
      {!embebido && (
        <SectionHeader
          icon={faCalendar}
          titulo="Novedades"
          onBack={() => onNavigate("home")}
          info={"Cargá las novedades de la gente de tus áreas y turnos: quién vino, ausencias, reemplazos, horas extra y bajas.\n\nElegí el día, completá lo que pasó y envialo. Cada día tiene que quedar enviado: si no, tu coordinador lo ve como pendiente."}
        />
      )}

      <div className="px-4 pt-4">
        {/* User Info Header */}
        {/*         <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 border border-slate-200 dark:border-slate-700 mb-6 relative overflow-hidden">
          <div className="flex flex-col gap-2">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FontAwesomeIcon icon={faUserTie} className="text-blue-500" />
              Mi Perfil
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="flex items-start gap-2">
                <FontAwesomeIcon icon={faBriefcase} className="w-4 h-4 text-slate-400" />
                <span className="font-semibold">Cargo:</span>
                <span>{profile?.positionName || profile?.position || "Sin Cargo"}</span>
              </div>
              <div className="flex items-start gap-2">
                <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4 text-slate-400" />
                <span className="font-semibold">Área:</span>
                <span>{profile?.areaName || profile?.department || "Sin Área"}</span>
              </div>
              <div className="flex items-start gap-2">
                <FontAwesomeIcon icon={faUserTie} className="w-4 h-4 text-slate-400" />
                <span className="font-semibold">Rol:</span>
                <span className="capitalize">{profile?.roleNames?.join(", ") || "Sin Rol"}</span>
              </div>
              <div className="flex items-start gap-2">
                <FontAwesomeIcon icon={faUsers} className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-nowrap">Cliente | Proyecto:</span>
                <span>{stats?.project || "Sin Proyecto"}</span>
              </div>
            </div>
          </div>
        </div> */}

        {showForm && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-xl shadow-xl overflow-hidden max-h-[96dvh] h-[96dvh] flex flex-col space-y-2">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{selectedReportId ? "Editar Reporte" : "Nuevo Reporte"}</h3>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="overflow-y-auto p-4 flex-1" ref={formScrollRef}>
                {isLoadingData ? (
                  <div className="flex flex-col items-center justify-center h-full min-h-[40vh] space-y-4">
                    <LoadingSpinner size="lg" message="Cargando..." />
                  </div>
                ) : (
                  <>
                    <div className="space-y-6">
                      {wizardIndex >= 0 ? (
                        <div className="flex flex-col gap-1.5 px-1 py-1">
                          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            <FontAwesomeIcon icon={faBriefcase} className="w-3 h-3 text-blue-500" />
                            <span className="truncate uppercase">
                              {(() => {
                                const p = userProjects.find((up) => up._id === selectedProjectId);
                                if (!p) return "Proyecto";
                                const cName = typeof p.clientId === "object" ? p.clientId?.name : "";
                                return cName ? `${cName} | ${p.name}` : p.name;
                              })()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                            <FontAwesomeIcon icon={faCalendar} className="w-3 h-3 text-blue-500" />
                            <span className="capitalize">{reportDate ? new Date(reportDate + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : ""}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Project Selector - Moved to Top */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cliente | Proyecto</label>
                            {userProjects.length > 0 ? (
                              <select
                                value={selectedProjectId}
                                onChange={(e) => {
                                  setSelectedProjectId(e.target.value);
                                  setSelectedAreaId("");
                                  setSelectedShiftId("");
                                  setDraftTypeId("");
                                }}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                              >
                                {userProjects.map((p) => (
                                  <option key={p._id} value={p._id}>
                                    {typeof p.clientId === "object" && p.clientId.name ? `${p.clientId.name} | ${p.name}` : p.name}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded text-sm">No hay proyectos asignados.</div>
                            )}
                          </div>

                          {/* Area Selector */}
                          {selectedProjectId && selectedProject?.areasConfig && selectedProject.areasConfig.length > 0 && (
                            <div className="animate-in fade-in slide-in-from-top-2">
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Área | Turno</label>
                              <select
                                value={selectedAreaId}
                                onChange={(e) => {
                                  setSelectedAreaId(e.target.value);
                                  setSelectedShiftId("");
                                }}
                                disabled={!hasCoordinatorAssignments}
                                className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${!hasCoordinatorAssignments ? "opacity-50 cursor-not-allowed" : ""}`}
                              >
                                <option value="">Todas las Áreas | Turnos</option>
                                {selectedProject.areasConfig
                                  .filter((ac) => {
                                    const userRoles = (profile?.roleNames || []).map((r) => r.toLowerCase());
                                    const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");
                                    if (isAdmin) return true;

                                    const areaId = String(ac.areaId?._id || ac.areaId || "");
                                    return coordinatedAreaIds.includes(areaId);
                                  })
                                  .map((ac) => {
                                    const areaId = String(ac.areaId?._id || ac.areaId || "");
                                    const areaName = ac.areaId?.name || allAreas.find((a) => String(a._id) === areaId)?.name;
                                    return (
                                      <option key={areaId} value={areaId}>
                                        {areaName || (isLoadingData ? "Cargando..." : "Área Desconocida")}
                                      </option>
                                    );
                                  })}
                              </select>
                            </div>
                          )}

                          {/* Shift Selector */}
                          {selectedAreaId &&
                            (() => {
                              const areaConfig = selectedProject?.areasConfig?.find((ac) => (typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId) === selectedAreaId);
                              return areaConfig && areaConfig.shiftIds && areaConfig.shiftIds.length > 0;
                            })() && (
                              <div className="animate-in fade-in slide-in-from-top-2">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Turno</label>
                                <select value={selectedShiftId} onChange={(e) => setSelectedShiftId(e.target.value)} disabled={!hasCoordinatorAssignments} className={`w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white ${!hasCoordinatorAssignments ? "opacity-50 cursor-not-allowed" : ""}`}>
                                  <option value="">Todos los Turnos</option>
                                  {(() => {
                                    const areaConfig = selectedProject?.areasConfig?.find((ac) => (typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId) === selectedAreaId);
                                    if (!areaConfig || !areaConfig.shiftIds) return null;

                                    return areaConfig.shiftIds
                                      .map((sId: any) => {
                                        const shiftId = String(sId?._id || sId || "");
                                        const shift = sId?.name ? sId : allShifts.find((s) => String(s._id) === shiftId);
                                        return shift;
                                      })
                                      .filter((s): s is Shift => {
                                        if (!s) return false;
                                        const userRoles = (profile?.roleNames || []).map((r) => r.toLowerCase());
                                        const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");
                                        if (isAdmin) return true;

                                        return coordinatedShiftIds.includes(String(s._id));
                                      })
                                      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
                                      .map((shift) => (
                                        <option key={shift._id} value={shift._id}>
                                          {shift.name}
                                        </option>
                                      ));
                                  })()}
                                </select>
                              </div>
                            )}

                          {/* Date - Moved Below Project */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha del Reporte</label>
                            <div onClick={() => selectedProjectId && hasCoordinatorAssignments && setCalendarOpen(true)} className={`relative w-full px-4 py-2 border rounded flex items-center justify-between transition-colors ${!selectedProjectId || !hasCoordinatorAssignments ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 cursor-not-allowed opacity-60" : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 hover:border-gray-400 dark:hover:border-gray-500"}`}>
                              <span className={`text-sm ${!reportDate ? "text-gray-400" : "text-gray-900 dark:text-white"}`}>{reportDate ? new Date(reportDate + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Seleccionar fecha"}</span>
                              <FontAwesomeIcon icon={faCalendar} className="text-gray-400" />
                            </div>
                            {!selectedProjectId && <p className="text-xs text-orange-500 mt-1">Selecciona un proyecto primero</p>}
                          </div>

                          {/* No coordinator assignments alert */}
                          {selectedProjectId && !hasCoordinatorAssignments && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-4 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 mt-0.5">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 dark:text-amber-400 text-sm" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Usted no tiene asignado ningún Área/Turno.</p>
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Por favor comuníquese con la administración.</p>
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Calendar Modal */}
                      {calendarOpen && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                              <div className="flex flex-col">
                                {selectedProjectId && (
                                  <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 tracking-wider mb-0.5">
                                    <FontAwesomeIcon icon={faBriefcase} className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                                    <span className="text-slate-500 dark:text-slate-400 uppercase">PROYECTO</span>
                                    <span className="text truncate max-w-[150px]">{userProjects.find((p) => p._id === selectedProjectId)?.name || "Proyecto"}</span>
                                  </div>
                                )}
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white capitalize">{format(viewDate, "MMMM yyyy", { locale: es })}</h3>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-1">
                                  <button onClick={() => setViewDate(subMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                                    <FontAwesomeIcon icon={faChevronLeft} className="text-slate-600 dark:text-slate-400 w-4 h-4" />
                                  </button>
                                  <button onClick={() => setViewDate(addMonths(viewDate, 1))} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors">
                                    <FontAwesomeIcon icon={faChevronRight} className="text-slate-600 dark:text-slate-400 w-4 h-4" />
                                  </button>
                                </div>
                                <button onClick={() => setCalendarOpen(false)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ml-1">
                                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                                </button>
                              </div>
                            </div>

                            <div className="p-4">
                              <div className="grid grid-cols-7 mb-2 text-center">
                                {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => (
                                  <div key={index} className="text-xs font-bold text-slate-400">
                                    {day}
                                  </div>
                                ))}
                              </div>
                              <div className="grid grid-cols-7 gap-y-1">
                                {generateCalendarDays().map((day, idx) => {
                                  const isCurrentMonth = isSameMonth(day, viewDate);
                                  const formattedDay = format(day, "yyyy-MM-dd");
                                  const isReported = hasReport(day);
                                  const isFutureDate = isFuture(day) && !isToday(day);
                                  const isSelected = reportDate === formattedDay;
                                  const isProjectDay = isProjectWorkDay(day); // todavía se puede cargar
                                  // Esperado por el schedule pero ya fuera de la ventana de carga y sin reporte → vencido.
                                  const isMissed = !isReported && !isFutureDate && isProjectExpectedDay(day) && !isProjectDay;

                                  // Style Classes
                                  let bgClass = "transparent";
                                  let textClass = "text-slate-700 dark:text-slate-300";
                                  let cursorClass = "cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-700";
                                  let borderClass = "border border-transparent";

                                  if (!isCurrentMonth) {
                                    textClass = "text-slate-300 dark:text-slate-600";
                                    cursorClass = "cursor-default";
                                  } else if (!isProjectDay) {
                                    // Non-working day or outside project duration
                                    textClass = "text-gray-300 dark:text-gray-600";
                                    cursorClass = "cursor-not-allowed opacity-60";
                                  } else {
                                    // Día disponible para cargar → azul
                                    textClass = "text-blue-600 dark:text-blue-400 font-semibold";
                                  }

                                  // Vencido: se esperaba y ya no se puede cargar → rojo
                                  if (isMissed) {
                                    bgClass = "bg-red-50 dark:bg-red-900/20";
                                    textClass = "text-red-500 dark:text-red-400 font-semibold";
                                    cursorClass = "cursor-not-allowed";
                                    borderClass = "border border-red-100 dark:border-red-900/30";
                                  }

                                  // Ya reportado → verde
                                  if (isReported) {
                                    bgClass = "bg-green-50 dark:bg-green-900/20";
                                    textClass = "text-green-600 dark:text-green-400 font-semibold";
                                    cursorClass = "cursor-not-allowed";
                                    borderClass = "border border-green-200 dark:border-green-900/40";
                                  }

                                  if (isFutureDate) {
                                    // Only override text color if it's NOT a project day. If it IS, keep it blue (from above) but show opacity.
                                    if (!isProjectDay) {
                                      textClass = "text-slate-300 dark:text-slate-600";
                                    }
                                    cursorClass = "cursor-not-allowed opacity-40";
                                  }

                                  if (isSelected) {
                                    bgClass = "bg-blue-500 text-white shadow-md shadow-blue-500/30";
                                    textClass = "text-white";
                                    cursorClass = "cursor-default";
                                  }

                                  // Disable interaction for invalid days
                                  const isDisabled = isFutureDate || isReported || isMissed || !isProjectDay || (!isCurrentMonth && !isSelected);

                                  return (
                                    <div key={idx} className="flex justify-center py-0.5">
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          if (!isDisabled) handleDateSelect(day);
                                        }}
                                        disabled={isDisabled}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all relative ${bgClass} ${textClass} ${cursorClass} ${borderClass}`}
                                      >
                                        {getDate(day)}
                                        {isReported && <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-green-500"></div>}
                                        {isMissed && <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-red-500"></div>}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                                <span>Reportado</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                <span>No enviado</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                                <span>Disponible</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sticky Project Info Bar - Moved below select as requested */}
                    {selectedProject && (
                      <div id="sticky-project-header" className="px-4 py-3 bg-slate-900/95 dark:bg-slate-900 border-b border-slate-800 backdrop-blur-md sticky -mx-4 top-[-20px] z-30 flex-shrink-0 space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded bg-blue-500/10 text-blue-500 shrink-0">
                            <FontAwesomeIcon icon={faBriefcase} className="text-lg" />
                          </div>
                          <h3 className="text-lg sm:text-xl font-bold text-white truncate flex items-center gap-2 mb-0 leading-tight flex-1">
                            <span className="shrink-0">{typeof selectedProject.clientId === "object" && selectedProject.clientId.name ? selectedProject.clientId.name : "Cliente"}</span>
                            <span className="font-extrabold mx-1">|</span>
                            <span className="truncate">{selectedProject.name}</span>
                            <button type="button" onClick={() => setShowProjectInfo(true)} className="ml-auto text-slate-400 hover:text-white transition-colors p-1" title="Más información">
                              <FontAwesomeIcon icon={faInfoCircle} className="text-sm" />
                            </button>
                          </h3>
                        </div>

                        {/* Detail: Coordinator's assigned Area | Turno */}
                        <div className="pl-11 space-y-1.5">
                          {selectedAreaId ? (
                            /* User manually selected a specific area */
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1 font-bold uppercase tracking-wider">
                                <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                                {(() => {
                                  const ac = selectedProject.areasConfig?.find((x) => String(x.areaId?._id || x.areaId || "") === String(selectedAreaId));
                                  return ac?.areaId?.name || allAreas.find((a) => String(a._id) === String(selectedAreaId))?.name || "Área";
                                })()}
                              </span>
                              {selectedShiftId ? (
                                <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 flex items-center gap-1 font-bold uppercase tracking-wider">
                                  <FontAwesomeIcon icon={faClock} className="text-[8px]" />
                                  {(() => {
                                    const areaConfig = selectedProject.areasConfig?.find((ac) => String(ac.areaId?._id || ac.areaId || "") === String(selectedAreaId));
                                    const s = areaConfig?.shiftIds?.find((s: any) => String(s?._id || s || "") === String(selectedShiftId));
                                    const sName = typeof s === "object" ? s.name : undefined;
                                    return sName || allShifts.find((s) => String(s._id) === String(selectedShiftId))?.name || "Turno";
                                  })()}
                                </span>
                              ) : (
                                /* Area selected but all shifts — show all shifts for this area */
                                (() => {
                                  const areaConfig = selectedProject.areasConfig?.find((ac) => String(ac.areaId?._id || ac.areaId || "") === String(selectedAreaId));
                                  if (!areaConfig || !areaConfig.shiftIds) return null;

                                  const visibleShifts = areaConfig.shiftIds
                                    .map((sId: any) => {
                                      const shiftId = String(sId?._id || sId || "");
                                      return sId?.name ? sId : allShifts.find((s) => String(s._id) === shiftId);
                                    })
                                    .filter((s: any): s is Shift => {
                                      if (!s) return false;
                                      const userRoles = (profile?.roleNames || []).map((r) => r.toLowerCase());
                                      const isAdmin = userRoles.includes("admin") || userRoles.includes("superadmin");
                                      if (isAdmin) return true;
                                      return coordinatedShiftIds.includes(String(s._id));
                                    })
                                    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

                                  return visibleShifts.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {visibleShifts.map((s) => (
                                        <span key={s._id} className="text-[10px] bg-purple-500/15 text-purple-300/80 px-1.5 py-0.5 rounded border border-purple-500/20 flex items-center gap-1 font-medium">
                                          <FontAwesomeIcon icon={faClock} className="text-[8px]" />
                                          {s.name}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null;
                                })()
                              )}
                            </div>
                          ) : (
                            (() => {
                              /* No area selected — show the coordinator's own assigned area/shift combos */
                              const myAssignments = (selectedProject.coordinatorAssignments || []).filter(isMyAssignment);
                              if (myAssignments.length === 0) return null;

                              /* Group by area */
                              const groupedByArea = new Map<string, { areaName: string; shifts: { _id: string; name: string; order?: number }[] }>();
                              myAssignments.forEach((asm: any) => {
                                const aId = String(asm.areaId?._id || asm.areaId || "");
                                const sId = String(asm.shiftId?._id || asm.shiftId || "");
                                if (!groupedByArea.has(aId)) {
                                  const projectArea = selectedProject.areasConfig?.find((ac) => String(ac.areaId?._id || ac.areaId || "") === aId)?.areaId;
                                  const areaName = asm.areaId?.name || (typeof projectArea === "object" ? projectArea.name : undefined) || allAreas.find((a) => String(a._id) === aId)?.name || "Área";
                                  groupedByArea.set(aId, { areaName, shifts: [] });
                                }
                                const areaConfig = selectedProject.areasConfig?.find((ac) => String(ac.areaId?._id || ac.areaId || "") === aId);
                                const projectShift = areaConfig?.shiftIds?.find((s: any) => String(s?._id || s || "") === sId);
                                const shift = asm.shiftId?.name ? asm.shiftId : (typeof projectShift === "object" ? projectShift : undefined) || allShifts.find((s) => String(s._id) === sId);

                                if (shift && !groupedByArea.get(aId)!.shifts.some((s) => String(s._id) === String(shift._id || shift))) {
                                  groupedByArea.get(aId)!.shifts.push({ _id: String(shift._id || shift), name: shift.name, order: shift.order });
                                }
                              });

                              return (
                                <div className="space-y-1">
                                  {Array.from(groupedByArea.entries()).map(([aId, { areaName, shifts }]) => (
                                    <div key={aId} className="flex flex-wrap items-center gap-1">
                                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1 font-bold uppercase tracking-wider">
                                        <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                                        {areaName}
                                      </span>
                                      {shifts
                                        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                                        .map((s) => (
                                          <span key={s._id} className="text-[10px] bg-purple-500/10 text-purple-300/70 px-1.5 py-0.5 rounded border border-purple-500/15 flex items-center gap-1 font-medium">
                                            <FontAwesomeIcon icon={faClock} className="text-[8px]" />
                                            {s.name}
                                          </span>
                                        ))}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()
                          )}
                        </div>
                      </div>
                    )}

                    {/* Main Toggle & Form Content */}
                    {isWorkDay ? (
                      <>
                        {/* ===================== LOGIC BRANCH: WIZARD VS FAST ENTRY ===================== */}
                        {!isFastEntryEnabled ? (
                          <div className="space-y-4">
                            {wizardIndex === -1 ? (
                              <div className="text-center p-4 bg-gray-50 dark:bg-blue-600/10 rounded border border-blue-600 dark:border-blue-600 mt-4">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Reporte Detallado de Asistencia</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                                  Deberás confirmar la asistencia de cada uno de los <strong>{projectEmployees.length}</strong> colaboradores asignados al proyecto.
                                </p>
                              </div>
                            ) : (
                              <>
                                {/* WIZARD CARD */}
                                {(() => {
                                  // Check if it is the Comments Step (Last Step)

                                  // Normal Employee Step
                                  const currentEmp = projectEmployees[wizardIndex];
                                  const data = wizardData[currentEmp.id] || {};
                                  const isPresent = data.status === "present";
                                  const isAbsent = data.status === "absent";

                                  return (
                                    <>
                                      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                                        {/* Header: Progress & Name */}
                                        <div className="bg-slate-50 dark:bg-slate-900/50 p-4 border-b border-slate-100 dark:border-slate-700">
                                          <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                                Colaborador {wizardIndex + 1} de {projectEmployees.length}
                                              </span>
                                            </div>
                                            <div className="flex gap-1">
                                              {Array.from({ length: Math.min(projectEmployees.length + 1, 6) }).map((_, i) => (
                                                <div key={i} className={`h-1.5 w-6 rounded-full ${i <= (wizardIndex * 5) / projectEmployees.length ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700"}`} />
                                              ))}
                                            </div>
                                          </div>
                                          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                                            <div className="flex flex-col flex-1 w-full min-w-0">
                                              <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate pb-2 flex flex-col items-start gap-1">
                                                <div className="flex items-center gap-2">
                                                  <div className="w-8 h-8 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm">{currentEmp.name.charAt(0)}</div>
                                                  <span>{currentEmp.name}</span>
                                                  {renderVacationBadge(currentEmp.id, currentEmp.name)}
                                                </div>
                                              </h3>
                                            </div>
                                          </h3>
                                          {(() => {
                                            const { areaName, shiftName } = resolveEmployeeAreaAndShift(currentEmp);
                                            if (!areaName && !shiftName) return null;
                                            return (
                                              <div className="flex flex-wrap items-center gap-2 mt-1.5 ml-10">
                                                {areaName && (
                                                  <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider whitespace-nowrap">
                                                    <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                                                    {areaName}
                                                  </span>
                                                )}
                                                {shiftName && (
                                                  <span className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider whitespace-nowrap">
                                                    <FontAwesomeIcon icon={faClock} className="text-[8px]" />
                                                    {shiftName}
                                                  </span>
                                                )}
                                              </div>
                                            );
                                          })()}
                                          <div className="flex flex-wrap items-center gap-2 mt-1.5 ml-10">
                                            <span className="text-xs text-slate-500 dark:text-gray-400">{currentEmp.positionName || "Colaborador"}</span>
                                            {(() => {
                                              const projMeta = currentEmp.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId));
                                              const roleFrame = projMeta?.roleFrame;

                                              return (
                                                <>
                                                  {roleFrame && <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-indigo-900/30 dark:text-indigo-400 tracking-wider">{roleFrame}</span>}
                                                </>
                                              );
                                            })()}
                                          </div>
                                        </div>

                                        <div className="p-5 space-y-6">
                                          {/* 1. Presence Toggle */}
                                          <div>
                                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 text-center">¿Asistió al turno?</label>
                                            <div className="flex gap-3">
                                              <button
                                                onClick={() => {
                                                  updateWizardEntry(currentEmp.id, { status: "present", typeId: undefined });
                                                }}
                                                className={`flex-1 py-1 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${isPresent ? "bg-blue-600 border-blue-600 text-white shadow-md dark:shadow-blue-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                                              >
                                                SÍ
                                              </button>
                                              <button
                                                onClick={(e) => {
                                                  updateWizardEntry(currentEmp.id, { status: "absent", overtimeHours: 0 });
                                                  setActiveAbsenceModal("wizard");
                                                }}
                                                className={`flex-1 py-1 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${isAbsent ? "bg-red-500 border-red-500 text-white shadow-md dark:shadow-red-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                                              >
                                                NO
                                              </button>
                                            </div>
                                          </div>

                                          {/* 2. Logic based on Presence */}
                                          {isPresent && (
                                            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                              {/* Overtime Toggle */}
                                              <div className="ot-container-row flex flex-col gap-3 p-3 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 scroll-mt-[70px]">
                                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">¿Realizó Horas Extras?</span>
                                                <div className="flex gap-3">
                                                  <button
                                                    onClick={(e) => {
                                                      if (data.overtimeHours === undefined) {
                                                        updateWizardEntry(currentEmp.id, { overtimeHours: 0 }); // Default 0
                                                      }
                                                      setActiveOvertimeModal("wizard");
                                                    }}
                                                    className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${data.overtimeHours !== undefined ? "bg-blue-600 border-blue-600 text-white shadow-md dark:shadow-blue-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                                                  >
                                                    SÍ
                                                  </button>
                                                  <button
                                                    onClick={() => {
                                                      updateWizardEntry(currentEmp.id, { overtimeHours: undefined, outTime: undefined, inTime: undefined });
                                                    }}
                                                    className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${data.overtimeHours === undefined ? "bg-slate-500 border-slate-500 text-white shadow-md dark:shadow-slate-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                                                  >
                                                    NO
                                                  </button>
                                                </div>
                                              </div>

                                              {/* Overtime Details */}
                                              {data.overtimeHours !== undefined && (
                                                <div className="pt-2 pb-1 text-center ot-details-row scroll-mt-[70px]">
                                                  <button onClick={() => setActiveOvertimeModal("wizard")} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center w-full gap-2 p-2 border border-blue-200 dark:border-blue-900 rounded bg-blue-50 dark:bg-blue-900/10">
                                                    <FontAwesomeIcon icon={faClock} />
                                                    {data.overtimeHours > 0 ? `${data.overtimeHours} Horas Extras (Regulares)` : "Configurar Horas Extras (Regulares)"}
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          )}

                                          {isAbsent && (
                                            /* Absent Logic */
                                            <div className="pt-2 pb-1 text-center animate-in fade-in slide-in-from-top-2">
                                              <button onClick={() => setActiveAbsenceModal("wizard")} className="text-sm font-bold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:underline flex items-center justify-center w-full gap-2 p-2 border border-red-200 dark:border-red-900/50 rounded bg-red-50 dark:bg-red-900/10">
                                                <FontAwesomeIcon icon={faInfoCircle} />
                                                {data.typeId ? `Motivo: ${logTypes.find((t) => t._id === data.typeId)?.name || "Configurado"}` : "Configurar Ausencia"}
                                              </button>
                                            </div>
                                          )}

                                          {/* Processed History Summary (Moved Inside Content) */}
                                        </div>
                                      </div>

                                      {/* Processed History List (Moved to Bottom) */}
                                      {wizardIndex > 0 && (
                                        <div className="space-y-2 mt-4 animate-in fade-in slide-in-from-bottom-2">
                                          <h4 className="font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider pl-1">Colaboradores Procesados ({wizardIndex})</h4>
                                          <div className="space-y-2">
                                            {projectEmployees.slice(0, wizardIndex).map((histEmp) => {
                                              const histData = wizardData[histEmp.id];
                                              const histIsPresent = histData?.status === "present";
                                              const histType = histData?.typeId ? logTypes.find((t) => t._id === histData.typeId) : null;
                                              const histReplacement = histData?.replacementId ? employees.find((e) => e.id === histData.replacementId) : null;
                                              const repString = histReplacement ? ` (Reemplazo: ${histReplacement.name}${histData?.replacementOvertimeHours ? ` + ${histData.replacementOvertimeHours}h Extra` : ""})` : "";

                                              return (
                                                <div key={histEmp.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-3 flex justify-between items-center opacity-75 grayscale-[0.3]">
                                                  <div>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <div className="font-bold text-slate-900 dark:text-white text-sm">{histEmp.name}</div>
                                                      {renderVacationBadge(histEmp.id, histEmp.name)}
                                                      {(() => {
                                                        const { areaName: resolvedArea, shiftName: resolvedShift } = resolveEmployeeAreaAndShift(histEmp);
                                                        return (
                                                          <>
                                                            {resolvedArea && (
                                                              <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                                                                <FontAwesomeIcon icon={faLayerGroup} className="text-[7px]" />
                                                                {resolvedArea}
                                                              </span>
                                                            )}
                                                            {resolvedShift && (
                                                              <span className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                                                                <FontAwesomeIcon icon={faClock} className="text-[7px]" />
                                                                {resolvedShift}
                                                              </span>
                                                            )}
                                                          </>
                                                        );
                                                      })()}
                                                    </div>
                                                    <div className={`text-xs font-medium ${histIsPresent ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"} mt-0.5`}>{histIsPresent ? (histData?.overtimeHours ? `Presente + ${histData.overtimeHours}h Extra` : "Presente") : `${histType?.name || "Ausente"}${repString}`}</div>
                                                  </div>
                                                  <button onClick={() => setWizardIndex(projectEmployees.findIndex((e) => e.id === histEmp.id))} className="text-xs text-blue-500 hover:underline">
                                                    Editar
                                                  </button>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                                {/* History List was here, moved inside local Wizard block */}
                              </>
                            )}
                          </div>
                        ) : (
                          /* --------------------- FAST ENTRY MODE (Original) --------------------- */
                          <>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-4 text-center mt-4">
                              <h2 className="text-base font-semibold text-gray-900 dark:text-white m-4">¿Hubo novedades en el turno?</h2>
                              <div className="flex justify-center gap-4">
                                <button
                                  onClick={() => setHasActivity(false)}
                                  className={`flex-1 py-2 rounded border-2 transition-all flex flex-col items-center gap-1
                                      ${hasActivity === false ? "border-slate-500 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white" : "border-gray-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-slate-600 text-gray-500 dark:text-gray-400"}`}
                                >
                                  <span className="font-bold">NO</span>
                                </button>
                                <button
                                  onClick={() => setHasActivity(true)}
                                  className={`flex-1 py-2 rounded border-2 transition-all flex flex-col items-center gap-1
                                      ${hasActivity === true ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 text-gray-500 dark:text-gray-400"}`}
                                >
                                  <span className="font-bold">SÍ</span>
                                </button>
                              </div>
                            </div>

                            {/* New Record Builder */}
                            {hasActivity && (
                              <div className="space-y-4">
                                <div className="bg-white dark:bg-slate-800 rounded p-4 border border-slate-200 dark:border-slate-700 shadow-sm transition-all">
                                  {!selectedEmployee ? (
                                    <>
                                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Colaborador</label>
                                      <div>
                                        {/* Select Trigger */}
                                        <div className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white flex justify-between items-center cursor-pointer bg-white" onClick={() => setIsEmployeeSelectOpen(true)}>
                                          <span className="text-gray-500">Seleccionar colaborador...</span>
                                          <FontAwesomeIcon icon={faLayerGroup} className="text-gray-400" />
                                        </div>

                                        {/* Employee Select Modal */}
                                        <Modal
                                          isOpen={isEmployeeSelectOpen}
                                          onClose={() => setIsEmployeeSelectOpen(false)}
                                          title={`Seleccionar Colaborador (${(() => {
                                            const filteredByProject = selectedProjectId
                                              ? employees.filter((e) => {
                                                  if (!e.projectIds?.includes(selectedProjectId)) return false;
                                                  const projMeta = e.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId));
                                                  if (!projMeta || !projMeta.hasActiveContract) return false;

                                                  // Area/Shift filter
                                                  if (selectedAreaId && projMeta.areaId !== selectedAreaId) return false;
                                                  if (selectedShiftId && projMeta.shiftId !== selectedShiftId) return false;

                                                  return true;
                                                })
                                              : [];
                                            const availableEmployees = filteredByProject.filter((e) => !entries.find((entry) => entry.employeeId === e.id));

                                            let results = availableEmployees;

                                            // Handle Role Filter
                                            if (selectedRoleFilters.length > 0) {
                                              results = results.filter((e) => {
                                                const roleFrame = e.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId))?.roleFrame;
                                                return roleFrame && selectedRoleFilters.includes(roleFrame);
                                              });
                                            }

                                            // Handle Search Term
                                            if (searchTerm) {
                                              results = results.filter((e) => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
                                            }

                                            return results.length;
                                          })()})`}
                                          size="md"
                                        >
                                          <div className="flex flex-col h-[60vh]">
                                            {/* Search Input and Filter Button inside Modal */}
                                            <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 sticky top-0 z-10 flex flex-col gap-2">
                                              {/* Active Filter Badges */}
                                              {selectedRoleFilters.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-1">
                                                  {selectedRoleFilters.map((role) => (
                                                    <span key={role} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                                                      {role}
                                                      <button onClick={() => setSelectedRoleFilters((prev) => prev.filter((r) => r !== role))} className="hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                                                        <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                                                      </button>
                                                    </span>
                                                  ))}
                                                  <button onClick={() => setSelectedRoleFilters([])} className="text-[10px] text-gray-500 hover:underline px-1">
                                                    Limpiar
                                                  </button>
                                                </div>
                                              )}

                                              <div className="flex gap-2">
                                                <div className="relative flex-1">
                                                  <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                                                  <input type="text" autoFocus className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-slate-800 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" placeholder="Buscar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                                                </div>
                                                <button
                                                  onClick={() => setIsRoleFilterModalOpen(true)}
                                                  className={`px-3 border rounded transition-colors flex items-center gap-2 whitespace-nowrap text-sm font-medium
                                                    ${selectedRoleFilters.length > 0 ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400" : "bg-white border-gray-300 text-gray-700 dark:bg-slate-800 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"}`}
                                                >
                                                  <FontAwesomeIcon icon={faFilter} />
                                                  Rol
                                                </button>
                                              </div>
                                            </div>

                                            {/* List */}
                                            <div className="overflow-y-auto flex-1 p-2">
                                              {(() => {
                                                const filteredByProject = selectedProjectId
                                                  ? employees.filter((e) => {
                                                      if (!e.projectIds?.includes(selectedProjectId)) return false;
                                                      const projMeta = e.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId));
                                                      return projMeta ? projMeta.hasActiveContract : false;
                                                    })
                                                  : [];
                                                // Exclude already added employees
                                                const availableEmployees = filteredByProject.filter((e) => !entries.find((entry) => entry.employeeId === e.id));

                                                let results = availableEmployees;

                                                // Role Filtering
                                                if (selectedRoleFilters.length > 0) {
                                                  results = results.filter((e) => {
                                                    const roleFrame = e.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId))?.roleFrame;
                                                    return roleFrame && selectedRoleFilters.includes(roleFrame);
                                                  });
                                                }

                                                // Name Search
                                                if (searchTerm) {
                                                  results = results.filter((e) => e.name.toLowerCase().includes(searchTerm.toLowerCase()));
                                                }

                                                const filteredResults = results;

                                                return (
                                                  <>
                                                    {filteredResults.map((emp) => (
                                                      <div
                                                        key={emp.id}
                                                        className="p-3 mb-1 rounded hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer border border-transparent dark:border-gray-800 hover:border-blue-100 dark:hover:border-slate-600 transition-colors"
                                                        onClick={() => {
                                                          setSelectedEmployee(emp);
                                                          setSearchTerm("");
                                                          setSelectedRoleFilters([]);
                                                          setIsEmployeeSelectOpen(false);
                                                          setTimeout(() => {
                                                            const header = document.getElementById("sticky-project-header");
                                                            if (header) {
                                                              header.scrollIntoView({ behavior: "smooth", block: "start" });
                                                            }
                                                          }, 100);
                                                        }}
                                                      >
                                                        <div className="flex flex-col gap-1 items-start">
                                                          <div className="flex items-center gap-1.5 flex-wrap">
                                                            <div className="font-medium text-slate-800 dark:text-white truncate">{emp.name}</div>
                                                            {renderVacationBadge(emp.id, emp.name)}
                                                          </div>
                                                          <div className="flex flex-wrap items-center gap-1.5">
                                                            <span className="text-[10px] text-slate-400">{emp.positionName || "Colaborador"}</span>
                                                            {(() => {
                                                              const projMeta = emp.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId));
                                                              const roleFrame = projMeta?.roleFrame;
                                                              const { areaName: resolvedArea, shiftName: resolvedShift } = resolveEmployeeAreaAndShift(emp);
                                                              const empArea = resolvedArea || projMeta?.areaId?.name || allAreas.find((a) => String(a._id) === String(projMeta?.areaId?._id || projMeta?.areaId || ""))?.name;
                                                              const empShift = resolvedShift || projMeta?.shiftId?.name || allShifts.find((s) => String(s._id) === String(projMeta?.shiftId?._id || projMeta?.shiftId || ""))?.name;

                                                              return (
                                                                <>
                                                                  {roleFrame && <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-indigo-900/30 dark:text-indigo-400 tracking-wider whitespace-nowrap">{roleFrame}</span>}
                                                                  {empArea && (
                                                                    <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider">
                                                                      <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                                                                      {empArea}
                                                                    </span>
                                                                  )}
                                                                  {empShift && (
                                                                    <span className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 text-[10px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider">
                                                                      <FontAwesomeIcon icon={faClock} className="text-[8px]" />
                                                                      {empShift}
                                                                    </span>
                                                                  )}
                                                                </>
                                                              );
                                                            })()}
                                                          </div>
                                                        </div>
                                                      </div>
                                                    ))}
                                                    {filteredResults.length === 0 && <div className="p-8 text-center text-gray-500 italic bg-gray-50 dark:bg-slate-800/50 rounded mt-2">{selectedProjectId ? (selectedRoleFilters.length > 0 || searchTerm ? "No se encontraron colaboradores con estos filtros." : "No se encontraron colaboradores.") : "Selecciona un proyecto primero."}</div>}
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          </div>
                                        </Modal>

                                        {/* Role Filter Modal */}
                                        <Modal isOpen={isRoleFilterModalOpen} onClose={() => setIsRoleFilterModalOpen(false)} title="Filtrar por Rol" size="md">
                                          <div className="flex flex-col max-h-[70vh]">
                                            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                                              <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona uno o más roles para filtrar la lista de colaboradores.</p>
                                            </div>

                                            <div className="overflow-y-auto flex-1 p-2">
                                              {(() => {
                                                if (!selectedProjectId) return null;

                                                // Get all unique roles for this project
                                                const projectRoles = employees
                                                  .filter((e) => e.projectIds?.includes(selectedProjectId))
                                                  .flatMap((e) => {
                                                    const role = e.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId))?.roleFrame;
                                                    return role ? [role] : [];
                                                  })
                                                  .filter((role, index, self) => self.indexOf(role) === index) // Unique
                                                  .sort();

                                                if (projectRoles.length === 0) {
                                                  return <div className="p-8 text-center text-gray-500 italic">No hay roles definidos para este proyecto.</div>;
                                                }

                                                return (
                                                  <div className="space-y-1">
                                                    {projectRoles.map((role) => {
                                                      const isSelected = selectedRoleFilters.includes(role);
                                                      return (
                                                        <label key={role} className="flex items-center justify-between p-3 rounded hover:bg-gray-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                                                          <span className="text-sm font-medium text-slate-800 dark:text-gray-200">{role}</span>
                                                          <div className="relative inline-flex items-center cursor-pointer">
                                                            <input
                                                              type="checkbox"
                                                              className="sr-only peer"
                                                              checked={isSelected}
                                                              onChange={() => {
                                                                if (isSelected) {
                                                                  setSelectedRoleFilters((prev) => prev.filter((r) => r !== role));
                                                                } else {
                                                                  setSelectedRoleFilters((prev) => [...prev, role]);
                                                                }
                                                              }}
                                                            />
                                                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                                                          </div>
                                                        </label>
                                                      );
                                                    })}
                                                  </div>
                                                );
                                              })()}
                                            </div>

                                            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 flex justify-between items-center">
                                              <button onClick={() => setSelectedRoleFilters([])} className="text-sm text-red-500 hover:underline font-medium">
                                                Limpiar Filtros
                                              </button>
                                              <button onClick={() => setIsRoleFilterModalOpen(false)} className="px-6 py-2 bg-blue-600 text-white rounded font-bold text-sm shadow-sm hover:bg-blue-700 transition-colors">
                                                Listo
                                              </button>
                                            </div>
                                          </div>
                                        </Modal>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="space-y-4 animate-fade-in">
                                      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-2">
                                        <div>
                                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-0.5 uppercase">Colaborador</label>
                                          <h3 className="font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2 flex-wrap">
                                            {selectedEmployee.name}
                                            {renderVacationBadge(selectedEmployee.id, selectedEmployee.name)}
                                          </h3>
                                          <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <span className="text-xs text-slate-500 dark:text-gray-400">{selectedEmployee.positionName || "Colaborador"}</span>
                                            {(() => {
                                              const projMeta = selectedEmployee.metadataProjects?.find((m) => String(m.projectId) === String(selectedProjectId));
                                              const roleFrame = projMeta?.roleFrame;
                                              const { areaName: resolvedArea, shiftName: resolvedShift } = resolveEmployeeAreaAndShift(selectedEmployee);
                                              const empArea = resolvedArea || projMeta?.areaId?.name || allAreas.find((a) => String(a._id) === String(projMeta?.areaId?._id || projMeta?.areaId || ""))?.name;
                                              const empShift = resolvedShift || projMeta?.shiftId?.name || allShifts.find((s) => String(s._id) === String(projMeta?.shiftId?._id || projMeta?.shiftId || ""))?.name;

                                              return (
                                                <>
                                                  {roleFrame && <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-indigo-900/30 dark:text-indigo-400 tracking-wider">{roleFrame}</span>}
                                                  {empArea && (
                                                    <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider">
                                                      <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                                                      {empArea}
                                                    </span>
                                                  )}
                                                  {empShift && (
                                                    <span className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 uppercase tracking-wider">
                                                      <FontAwesomeIcon icon={faClock} className="text-[8px]" />
                                                      {empShift}
                                                    </span>
                                                  )}
                                                </>
                                              );
                                            })()}
                                          </div>
                                        </div>
                                        <button onClick={() => setSelectedEmployee(null)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
                                          <FontAwesomeIcon icon={faTimes} />
                                        </button>
                                      </div>

                                      {/* ATTENDANCE STATUS SELECTOR */}
                                      <div className="mb-4 animate-fade-in">
                                        <label className="block text-center text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">¿Asistió al turno?</label>
                                        <div className="flex gap-3">
                                          <button
                                            onClick={() => {
                                              setAttendanceStatus("present");
                                              setDraftTypeId("");
                                              setNoveltyCategory(null); // Clear old category state if any
                                            }}
                                            className={`flex-1 py-2 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${attendanceStatus === "present" ? "bg-blue-600 border-blue-600 text-white shadow-md dark:shadow-blue-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                                          >
                                            SÍ
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              setAttendanceStatus("absent");
                                              setDraftTypeId("");
                                              setShowOvertimeForm(false);
                                              setActiveAbsenceModal("fast-entry");
                                            }}
                                            className={`flex-1 py-2 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${attendanceStatus === "absent" ? "bg-red-500 border-red-500 text-white shadow-md dark:shadow-red-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                                          >
                                            NO
                                          </button>
                                        </div>
                                      </div>

                                      {/* LOGIC BASED ON STATUS */}
                                      {attendanceStatus === "present" && (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                                          {/* Overtime Toggle */}
                                          <div className="ot-container-row flex flex-col gap-3 p-3 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 scroll-mt-[70px]">
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center">¿Realizó Horas Extras?</span>
                                            <div className="flex gap-3">
                                              <button
                                                onClick={(e) => {
                                                  setShowOvertimeForm(true);
                                                  // Auto-select overtime type
                                                  const overtimeType = logTypes.find((t) => t.name.toLowerCase().includes("horas extra"));
                                                  if (overtimeType) setDraftTypeId(overtimeType._id);
                                                  if (!draftOvertimeHours) setDraftOvertimeHours(0);
                                                  setActiveOvertimeModal("fast-entry");
                                                }}
                                                className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${showOvertimeForm ? "bg-blue-600 border-blue-600 text-white shadow-md dark:shadow-blue-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                                              >
                                                SÍ
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setShowOvertimeForm(false);
                                                  setDraftTypeId("");
                                                  setDraftOvertimeHours(0);
                                                }}
                                                className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${!showOvertimeForm ? "bg-slate-500 border-slate-500 text-white shadow-md dark:shadow-slate-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                                              >
                                                NO
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {attendanceStatus === "absent" && (
                                        <div className="pt-2 pb-1 text-center animate-in fade-in slide-in-from-top-2">
                                          <button onClick={() => setActiveAbsenceModal("fast-entry")} className="text-sm font-bold text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 hover:underline flex items-center justify-center w-full gap-2 p-2 border border-red-200 dark:border-red-900/50 rounded bg-red-50 dark:bg-red-900/10">
                                            <FontAwesomeIcon icon={faInfoCircle} />
                                            {draftTypeId ? `Motivo: ${logTypes.find((t) => t._id === draftTypeId)?.name || "Configurado"}` : "Configurar Ausencia"}
                                          </button>
                                        </div>
                                      )}

                                      {(() => {
                                        // 1. If Overtime Mode is ON (via toggle)
                                        if (showOvertimeForm) {
                                          return (
                                            <div className="bg-slate-50 dark:bg-slate-900/50 rounded p-3 space-y-3 border border-slate-100 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 ot-details-row-fast scroll-mt-[70px]">
                                              <div className="pt-2 pb-1 text-center">
                                                <button onClick={() => setActiveOvertimeModal("fast-entry")} className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center w-full gap-2 p-2 border border-blue-200 dark:border-blue-900 rounded bg-blue-50 dark:bg-blue-900/10">
                                                  <FontAwesomeIcon icon={faClock} />
                                                  {draftOvertimeHours > 0 ? `${draftOvertimeHours} Horas Extras (Regulares)` : "Configurar Horas Extras (Regulares)"}
                                                </button>
                                              </div>
                                              <button onClick={handleAddRecord} disabled={!draftTypeId} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded mt-2 disabled:opacity-50 shadow-sm">
                                                Confirmar Registro
                                              </button>
                                            </div>
                                          );
                                        }

                                        // 2. Normal Logic (Absence or others selected via dropdown)
                                        const type = logTypes.find((t) => t._id === draftTypeId);
                                        if (!type) return null;

                                        return (
                                          <div className="bg-slate-50 dark:bg-slate-900/50 rounded p-3 space-y-3 border border-slate-100 dark:border-slate-700 animate-in fade-in">
                                            <button onClick={handleAddRecord} disabled={!draftTypeId} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded mt-2 disabled:opacity-50 shadow-sm">
                                              Confirmar Registro
                                            </button>
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Entries List */}
                            {entries.length > 0 && (
                              <div className="space-y-2 mt-4">
                                <h4 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Registros Agregados ({entries.length})</h4>
                                {entries.map((entry) => (
                                  <div key={entry.tempId} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded p-3 flex justify-between items-center shadow-sm">
                                    <div className="flex-1">
                                      <div className="font-bold text-slate-900 dark:text-white text-sm">{entry.employeeName}</div>
                                      <div className="text-xs text-blue-600 dark:text-blue-400 font-medium flex flex-wrap gap-2 items-center">
                                        <span>{entry.typeName}</span>
                                        {entry.overtimeHours ? (
                                          <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] dark:bg-blue-900/30 dark:text-blue-400 font-bold">
                                            {entry.overtimeHours} h Extra {((entry.overtimeHours50 || 0) > 0 || (entry.overtimeHours100 || 0) > 0) ? `(${entry.overtimeHours50 || 0}h al 50% / ${entry.overtimeHours100 || 0}h al 100%)` : ""}
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setEditingEntryTempId(entry.tempId);
                                              setActiveOvertimeModal("entry-edit");
                                            }}
                                            className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1"
                                          >
                                            <FontAwesomeIcon icon={faClock} />
                                            + Horas Extras
                                          </button>
                                        )}
                                      </div>
                                      {entry.overtimeHours && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setEditingEntryTempId(entry.tempId);
                                            setActiveOvertimeModal("entry-edit");
                                          }}
                                          className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold hover:underline block mt-1"
                                        >
                                          Editar Horas Extras
                                        </button>
                                      )}
                                      {entry.replacementName && (
                                        <div className="text-xs text-slate-500 mt-0.5">
                                          Reemplazo: {entry.replacementName} {entry.replacementOvertimeHours ? `(+${entry.replacementOvertimeHours}h)` : ""}
                                        </div>
                                      )}
                                    </div>
                                    <button onClick={() => handleRemoveRecord(entry.tempId)} className="text-red-500 hover:text-red-700 p-2 ml-2">
                                      <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    ) : existingReport ? (
                      <div className="bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800 p-6 text-center animate-fade-in my-4">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600 dark:text-green-400">
                          <FontAwesomeIcon icon={faCheck} className="text-xl" />
                        </div>
                        <h2 className="text-lg font-bold text-green-900 dark:text-green-100 mb-1">Reporte Completado</h2>
                        <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed">Ya existe un reporte enviado para este día ({new Date(reportDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" })}).</p>
                        <button onClick={() => handleViewReport(existingReport)} className="mt-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded shadow-sm transition-colors">
                          Ver Reporte Detallado
                        </button>
                      </div>
                    ) : (
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800 p-6 text-center animate-fade-in my-4">
                        <div className="w-12 h-12 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center mx-auto mb-3 text-amber-600 dark:text-amber-400">
                          <FontAwesomeIcon icon={faClock} className="text-xl" />
                        </div>
                        <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-1">Día No Laborable</h2>
                        <p className="text-sm text-amber-700 dark:text-amber-300 leading-relaxed tabular-nums">Este proyecto no tiene jornada laboral configurada para este día ({new Date(reportDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "long" })}).</p>
                        <p className="text-xs text-amber-500 dark:text-amber-500 mt-4 font-medium italic">No se pueden registrar novedades en días no laborables.</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                {/* Wizard Navigation Footer */}
                {!isFastEntryEnabled && wizardIndex >= -1 ? (
                  <div className="flex gap-3 items-center w-full">
                    {wizardIndex === -1 ? (
                      <button onClick={startWizard} disabled={!hasCoordinatorAssignments} className={`w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold shadow-md transition-all active:scale-95 text-sm md:text-base ${!hasCoordinatorAssignments ? "opacity-50 cursor-not-allowed !bg-gray-500 hover:!bg-gray-500 shadow-none" : ""}`}>
                        Comenzar Reporte
                      </button>
                    ) : (
                      <>
                        {wizardIndex > 0 && (
                          <button onClick={handleWizardPrev} className="flex-1 py-3 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2 text-sm">
                            <FontAwesomeIcon icon={faChevronLeft} />
                            Anterior
                          </button>
                        )}
                        <button
                          onClick={handleWizardNext}
                          disabled={(() => {
                            const currentEmp = projectEmployees[wizardIndex];
                            if (!currentEmp) return true;
                            const data = wizardData[currentEmp.id];
                            if (!data || data.status === undefined) return true;
                            // If OT is enabled (defined), value MUST be > 0.
                            if (data.status === "present" && data.overtimeHours !== undefined) {
                              return data.overtimeHours <= 0;
                            }
                            if (data.status === "absent" && !data.typeId) {
                              return true;
                            }
                            return false;
                          })()}
                          className="flex-1 py-3 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/30 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400 disabled:shadow-none"
                        >
                          Siguiente
                          <FontAwesomeIcon icon={faChevronRight} />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  // Fast Entry / Default Footer
                  isWorkDay &&
                  hasActivity !== null && (
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm">
                        Cancelar
                      </button>
                      <button onClick={handlePreSubmit} disabled={submitting} className="flex-1 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors disabled:opacity-70 text-sm">
                        Revisar y Enviar
                      </button>
                    </div>
                  )
                )}
                {!isWorkDay && (
                  <button type="button" onClick={() => setShowForm(false)} className="w-full py-2 rounded bg-slate-900 dark:bg-slate-700 text-white font-bold hover:bg-slate-800 transition-all active:scale-95 text-sm">
                    Cerrar Formulario
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Historial de Novedades</h3>
          {/* Sólo para quien tiene equipo a cargo: para el resto sería un conmutador de una opción. */}
          {puedeVerSupervisadas && (
            <div className="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800/60">
              {(
                [
                  { id: "mias", label: "Mías" },
                  { id: "supervisadas", label: "Las que superviso" },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    // A mano manda: se corta el salto automático para que no lo vuelva a mover.
                    autoSaltoHechoRef.current = true;
                    setAlcanceHistorial(o.id);
                    void fetchReports(o.id);
                  }}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${alcanceHistorial === o.id ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* List of Reports */}
        <div className="space-y-3">
          {isLoadingReports ? (
            <LoadingSpinner size="md" message="Cargando novedades..." />
          ) : (
            <>
              {filteredReports.map((report) => {
                const isEdited = report.createdAt && report.updatedAt && (new Date(report.updatedAt).getTime() - new Date(report.createdAt).getTime() > 1000);
                return (
                  <div key={report._id} onClick={() => handleViewReport(report)} className="bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm cursor-pointer opacity-80 hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-center mb-2">
                      <span className="inline-block px-2 py-0.5 text-[12px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">{report.reportNumber || `#${report._id.slice(-6).toUpperCase()}`}</span>
                      {isEdited && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded shadow-sm">
                          <FontAwesomeIcon icon={faPen} className="text-[9px]" />
                          EDITADO ({(() => {
                            try {
                              const d = new Date(report.updatedAt!);
                              const day = String(d.getDate()).padStart(2, "0");
                              const month = String(d.getMonth() + 1).padStart(2, "0");
                              const year = d.getFullYear();
                              return `${day}/${month}/${year}`;
                            } catch {
                              return "";
                            }
                          })()})
                        </span>
                      )}
                    </div>
                  <h4 className="font-semibold text-slate-800 dark:text-white mb-1">
                    {(() => {
                      const p = report.projectId;
                      if (!p) return "Sin Proyecto";
                      if (typeof p === "string") return "Proyecto";
                      // If it's an object, it might have clientId populated
                      const pName = p.name || "Proyecto";
                      const cName = typeof p.clientId === "object" ? p.clientId.name : undefined;
                      return cName ? `${cName} | ${pName}` : pName;
                    })()}
                    {report.areaId ? (typeof report.areaId === "string" ? "" : ` - ${report.areaId.name}`) : ""}
                  </h4>
                  <div className="text-sm text-slate-500 mb-3">
                    {new Date(report.date + "T00:00:00").toLocaleDateString()}
                    {/* Quién la cargó: sólo mirando las del equipo, donde es lo que distingue una
                        fila de otra. En «Mías» sobra, son todas de la misma persona. */}
                    {alcanceHistorial === "supervisadas" &&
                      (() => {
                        const autor = typeof report.userId === "object" && report.userId ? `${report.userId.firstName || ""} ${report.userId.lastName || ""}`.trim() : "";
                        return autor ? <span className="ml-2 text-slate-400">· {autor}</span> : null;
                      })()}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {(() => {
                        if (!report.hasActivity) return "Sin novedades";

                        /*
                          EL LISTADO NO TRAE `attendance`: el server lo saca con un `$project` (eran
                          4,5 MB) y manda los contadores ya calculados. Recorrerlo sin más reventaba
                          en cuanto un parte tuviera novedades —`undefined.forEach`—; no se notaba
                          sólo porque quien miraba esta pantalla no tenía ninguno.

                          Con el detalle se arma el desglose por motivo; sin él, los números del
                          server, que son los mismos que cuenta el panel.
                        */
                        if (!report.attendance) {
                          const partes: string[] = [];
                          if (report.ausentes) partes.push(`${report.ausentes} ausente${report.ausentes === 1 ? "" : "s"}`);
                          if (report.conHorasExtra) partes.push(`${report.conHorasExtra} con horas extra`);
                          return partes.length > 0 ? partes.join(", ") : "Sin novedades";
                        }

                        const counts: Record<string, number> = {};
                        let hasAnomalies = false;

                        report.attendance.forEach((att) => {
                          if (att.overtimeHours && att.overtimeHours > 0) {
                            counts["Horas Extra"] = (counts["Horas Extra"] || 0) + 1;
                            hasAnomalies = true;
                          } else if (att.absenceReason && att.absenceReason !== "Presente") {
                            // Simplify pluralization or just use the raw reason
                            counts[att.absenceReason] = (counts[att.absenceReason] || 0) + 1;
                            hasAnomalies = true;
                          }
                        });

                        if (!hasAnomalies) return "Sin novedades";

                        return Object.entries(counts)
                          .map(([type, count]) => `${count} ${type}`)
                          .join(", ");
                      })()}
                    </span>
                    <span>{new Date(report.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  </div>
                );
              })}
              {filteredReports.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  {alcanceHistorial === "supervisadas" ? "Nadie de tus proyectos envió novedades recientes." : "No has enviado novedades recientes."}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Overtime Configuration Modal */}
      <Modal
        isOpen={activeOvertimeModal !== null}
        onClose={handleCloseOvertimeModal}
        zIndex={80}
        title={`${activeOvertimeModal === "entry-edit" ? "Configurar Horas Extras (Otros Presentes)" : "Configurar Horas Extras (Regulares)"} - ${(() => {
          if (activeOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]) {
            return projectEmployees[wizardIndex].name;
          }
          if (activeOvertimeModal === "fast-entry" && selectedEmployee) {
            return selectedEmployee.name;
          }
          if (activeOvertimeModal === "entry-edit" && editingEntryTempId) {
            return entries.find((e) => e.tempId === editingEntryTempId)?.employeeName || "";
          }
          return "";
        })()}`}
      >
        {activeOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]
          ? (() => {
              const currentEmp = projectEmployees[wizardIndex];
              const data = wizardData[currentEmp.id];
              return (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col gap-1 items-center pb-3 border-b border-slate-100 dark:border-slate-700">
                    <div className="text-center mb-2">
                      <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Colaborador</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{currentEmp.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 w-full">
                      <div className="text-center">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entrada Contrato</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {(() => {
                            const proj = userProjects.find((p) => p._id === selectedProjectId);
                            return proj ? formatToAMPM(getEmployeeStartTime(proj, currentEmp.id, reportDate, currentEmp)) : "—";
                          })()}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Salida Contrato</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {(() => {
                            const proj = userProjects.find((p) => p._id === selectedProjectId);
                            return proj ? formatToAMPM(getEmployeeEndTime(proj, currentEmp.id, reportDate, currentEmp)) : "—";
                          })()}
                        </span>
                      </div>
                    </div>
                    {(() => {
                      const proj = userProjects.find((p) => p._id === selectedProjectId);
                      if (!proj) return null;
                      const sT = getEmployeeStartTime(proj, currentEmp.id, reportDate, currentEmp);
                      const eT = getEmployeeEndTime(proj, currentEmp.id, reportDate, currentEmp);
                      const dur = getDurationText(sT, eT);
                      if (!dur) return null;
                      return (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Duración Contrato: {dur}
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Entrada Real</label>
                    <div className="relative">
                      <select className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow appearance-none cursor-pointer" value={data?.inTime || ""} onChange={(e) => updateWizardEntry(currentEmp.id, { inTime: e.target.value })}>
                        <option value="">--:--</option>
                        {TIME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <FontAwesomeIcon icon={faClock} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Salida Real</label>
                    <div className="relative">
                      <select className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow appearance-none cursor-pointer" value={data?.outTime || ""} onChange={(e) => updateWizardEntry(currentEmp.id, { outTime: e.target.value })}>
                        <option value="">--:--</option>
                        {TIME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <FontAwesomeIcon icon={faClock} />
                      </div>
                    </div>
                    {data?.inTime && data?.outTime && (
                      <div className="mt-2 text-right">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                          <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Tiempo Registrado: {getDurationText(data.inTime, data.outTime)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 50%</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400" value={data?.overtimeHours50 || 0} onChange={(e) => {
                        const val50 = parseFloat(e.target.value) || 0;
                        const val100 = data?.overtimeHours100 || 0;
                        updateWizardEntry(currentEmp.id, { overtimeHours50: val50, overtimeHours: val50 + val100 });
                      }} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 100%</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400" value={data?.overtimeHours100 || 0} onChange={(e) => {
                        const val100 = parseFloat(e.target.value) || 0;
                        const val50 = data?.overtimeHours50 || 0;
                        updateWizardEntry(currentEmp.id, { overtimeHours100: val100, overtimeHours: val50 + val100 });
                      }} />
                    </div>
                    <p className="text-[10px] text-slate-400 italic mt-1">Estos valores se calculan automáticamente, pero puedes ajustarlos si es necesario.</p>
                  </div>
                </div>
              );
            })()
          : activeOvertimeModal === "fast-entry" && selectedEmployee
            ? (() => {
                return (
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col gap-1 items-center pb-3 border-b border-slate-100 dark:border-slate-700">
                      <div className="text-center mb-2">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Colaborador</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-white">{selectedEmployee.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 w-full">
                        <div className="text-center">
                          <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entrada Contrato</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {(() => {
                              const proj = userProjects.find((p) => p._id === selectedProjectId);
                              return proj ? formatToAMPM(getEmployeeStartTime(proj, selectedEmployee.id, reportDate, selectedEmployee)) : "—";
                            })()}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Salida Contrato</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {(() => {
                              const proj = userProjects.find((p) => p._id === selectedProjectId);
                              return proj ? formatToAMPM(getEmployeeEndTime(proj, selectedEmployee.id, reportDate, selectedEmployee)) : "—";
                            })()}
                          </span>
                        </div>
                      </div>
                      {(() => {
                        const proj = userProjects.find((p) => p._id === selectedProjectId);
                        if (!proj) return null;
                        const sT = getEmployeeStartTime(proj, selectedEmployee.id, reportDate, selectedEmployee);
                        const eT = getEmployeeEndTime(proj, selectedEmployee.id, reportDate, selectedEmployee);
                        const dur = getDurationText(sT, eT);
                        if (!dur) return null;
                        return (
                          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Duración Contrato: {dur}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Entrada Real</label>
                      <div className="relative">
                        <select className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-sm font-mono text-center tracking-wider appearance-none cursor-pointer" value={draftInTime} onChange={(e) => setDraftInTime(e.target.value)}>
                          <option value="">--:--</option>
                          {TIME_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                          <FontAwesomeIcon icon={faClock} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Salida Efectivo</label>
                      <div className="relative">
                        <select className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-sm font-mono text-center tracking-wider appearance-none cursor-pointer" value={draftOutTime} onChange={(e) => setDraftOutTime(e.target.value)}>
                          <option value="">--:--</option>
                          {TIME_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                          <FontAwesomeIcon icon={faClock} />
                        </div>
                      </div>
                      {draftInTime && draftOutTime && (
                        <div className="mt-2 text-right">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                            <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Tiempo Registrado: {getDurationText(draftInTime, draftOutTime)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 50%</label>
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all font-bold text-blue-600 dark:text-blue-400" value={draftOvertimeHours50} onChange={(e) => {
                          const val50 = parseFloat(e.target.value) || 0;
                          setDraftOvertimeHours50(val50);
                          setDraftOvertimeHours(val50 + draftOvertimeHours100);
                        }} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 100%</label>
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all font-bold text-blue-600 dark:text-blue-400" value={draftOvertimeHours100} onChange={(e) => {
                          const val100 = parseFloat(e.target.value) || 0;
                          setDraftOvertimeHours100(val100);
                          setDraftOvertimeHours(draftOvertimeHours50 + val100);
                        }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 italic">Estos valores se calculan automáticamente, pero puedes ajustarlos si es necesario.</p>
                    </div>
                  </div>
                );
              })()
          : activeOvertimeModal === "entry-edit" && editingEntryTempId
            ? (() => {
                const entry = entries.find((e) => e.tempId === editingEntryTempId);
                if (!entry) return null;
                const empOption = employees.find((e) => e.id === entry.employeeId);
                return (
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col gap-1 items-center pb-3 border-b border-slate-100 dark:border-slate-700">
                      <div className="text-center mb-2">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Otros Presentes</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-white">{entry.employeeName}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 w-full">
                        <div className="text-center">
                          <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entrada Contrato</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {(() => {
                              const proj = userProjects.find((p) => p._id === selectedProjectId);
                              return proj ? formatToAMPM(getEmployeeStartTime(proj, entry.employeeId, reportDate, empOption)) : "—";
                            })()}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Salida Contrato</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {(() => {
                              const proj = userProjects.find((p) => p._id === selectedProjectId);
                              return proj ? formatToAMPM(getEmployeeEndTime(proj, entry.employeeId, reportDate, empOption)) : "—";
                            })()}
                          </span>
                        </div>
                      </div>
                      {(() => {
                        const proj = userProjects.find((p) => p._id === selectedProjectId);
                        if (!proj) return null;
                        const sT = getEmployeeStartTime(proj, entry.employeeId, reportDate, empOption);
                        const eT = getEmployeeEndTime(proj, entry.employeeId, reportDate, empOption);
                        const dur = getDurationText(sT, eT);
                        if (!dur) return null;
                        return (
                          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Duración Contrato: {dur}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Entrada Real</label>
                      <div className="relative">
                        <select
                          className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-sm font-mono text-center tracking-wider appearance-none cursor-pointer"
                          value={entry.inTime || ""}
                          onChange={(e) => updateEntryOvertimeTimes(entry, e.target.value, entry.outTime || "")}
                        >
                          <option value="">--:--</option>
                          {TIME_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                          <FontAwesomeIcon icon={faClock} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Salida Real</label>
                      <div className="relative">
                        <select
                          className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-sm font-mono text-center tracking-wider appearance-none cursor-pointer"
                          value={entry.outTime || ""}
                          onChange={(e) => updateEntryOvertimeTimes(entry, entry.inTime || "", e.target.value)}
                        >
                          <option value="">--:--</option>
                          {TIME_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                          <FontAwesomeIcon icon={faClock} />
                        </div>
                      </div>
                      {entry.inTime && entry.outTime && (
                        <div className="mt-2 text-right">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                            <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Tiempo Registrado: {getDurationText(entry.inTime, entry.outTime)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 50%</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          step="0.5"
                          className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all font-bold text-blue-600 dark:text-blue-400"
                          value={entry.overtimeHours50 || 0}
                          onChange={(e) => {
                            const val50 = parseFloat(e.target.value) || 0;
                            const val100 = entry.overtimeHours100 || 0;
                            updateEntryOvertime(entry.tempId, { overtimeHours50: val50, overtimeHours: val50 + val100 });
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 100%</label>
                      <div className="flex gap-2 items-center">
                        <input
                          type="number"
                          step="0.5"
                          className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all font-bold text-blue-600 dark:text-blue-400"
                          value={entry.overtimeHours100 || 0}
                          onChange={(e) => {
                            const val100 = parseFloat(e.target.value) || 0;
                            const val50 = entry.overtimeHours50 || 0;
                            updateEntryOvertime(entry.tempId, { overtimeHours100: val100, overtimeHours: val50 + val100 });
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 italic">Estos valores se calculan automáticamente, pero puedes ajustarlos si es necesario.</p>
                    </div>
                  </div>
                );
              })()
            : null}
        {isOvertimeTimeIncomplete && <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded text-xs text-amber-600 dark:text-amber-400 font-medium animate-in fade-in slide-in-from-top-2">⚠️ El Horario Entrada Real y el Horario Salida Real son obligatorios para guardar las horas extras. Si no deseas registrar horas extras, puedes cerrar la ventana (X) o presionar NO en la pantalla principal.</div>}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
          <button type="button" onClick={handleCancelOvertime} className="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">
            Cancelar
          </button>
          <button type="button" onClick={() => setActiveOvertimeModal(null)} disabled={isOvertimeTimeIncomplete} className={`px-6 py-2 rounded font-bold transition-all shadow-sm ${isOvertimeTimeIncomplete ? "bg-slate-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
            Listo
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={activeReplacementOvertimeModal !== null}
        onClose={handleCloseReplacementOvertimeModal}
        zIndex={80}
        title={`${activeReplacementOvertimeModal === "fast-entry" ? "Configurar Horas Extras (Otros Presentes)" : "Configurar Horas Extras (Reemplazos)"} - ${(() => {
          if (activeReplacementOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]) {
            const currentEmp = projectEmployees[wizardIndex];
            const data = wizardData[currentEmp.id];
            if (data?.replacementId) {
              return employees.find((e) => e.id === data.replacementId)?.name || "";
            }
          }
          if (activeReplacementOvertimeModal === "fast-entry" && draftReplacementId) {
            return employees.find((e) => e.id === draftReplacementId)?.name || "";
          }
          return "";
        })()}`}
      >
        {activeReplacementOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]
          ? (() => {
              const currentEmp = projectEmployees[wizardIndex];
              const data = wizardData[currentEmp.id];
              if (!data?.replacementId) return null;
              const repEmp = employees.find((e) => e.id === data.replacementId);
              return (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col gap-1 items-center pb-3 border-b border-slate-100 dark:border-slate-700">
                    <div className="text-center mb-2">
                      <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Reemplazo</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{repEmp?.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 w-full">
                      <div className="text-center">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entrada Contrato</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {(() => {
                            const proj = userProjects.find((p) => p._id === selectedProjectId);
                            return proj ? formatToAMPM(getEmployeeStartTime(proj, data.replacementId, reportDate, repEmp)) : "—";
                          })()}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Salida Contrato</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {(() => {
                            const proj = userProjects.find((p) => p._id === selectedProjectId);
                            return proj ? formatToAMPM(getEmployeeEndTime(proj, data.replacementId, reportDate, repEmp)) : "—";
                          })()}
                        </span>
                      </div>
                    </div>
                    {(() => {
                      const proj = userProjects.find((p) => p._id === selectedProjectId);
                      if (!proj) return null;
                      const sT = getEmployeeStartTime(proj, data.replacementId, reportDate, repEmp);
                      const eT = getEmployeeEndTime(proj, data.replacementId, reportDate, repEmp);
                      const dur = getDurationText(sT, eT);
                      if (!dur) return null;
                      return (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Duración Contrato: {dur}
                        </div>
                      );
                    })()}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Entrada Real</label>
                    <div className="relative">
                      <select className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow appearance-none cursor-pointer" value={data?.replacementInTime || ""} onChange={(e) => updateWizardEntry(currentEmp.id, { replacementInTime: e.target.value })}>
                        <option value="">--:--</option>
                        {TIME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <FontAwesomeIcon icon={faClock} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Salida Real</label>
                    <div className="relative">
                      <select className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 bg-white dark:bg-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500 transition-shadow appearance-none cursor-pointer" value={data?.replacementOutTime || ""} onChange={(e) => updateWizardEntry(currentEmp.id, { replacementOutTime: e.target.value })}>
                        <option value="">--:--</option>
                        {TIME_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                        <FontAwesomeIcon icon={faClock} />
                      </div>
                    </div>
                    {data?.replacementInTime && data?.replacementOutTime && (
                      <div className="mt-2 text-right">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                          <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Tiempo Registrado: {getDurationText(data.replacementInTime, data.replacementOutTime)}
                        </span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 50%</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400" value={data?.replacementOvertimeHours50 || 0} onChange={(e) => {
                        const val50 = parseFloat(e.target.value) || 0;
                        const val100 = data?.replacementOvertimeHours100 || 0;
                        updateWizardEntry(currentEmp.id, { replacementOvertimeHours50: val50, replacementOvertimeHours: val50 + val100 });
                      }} />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 100%</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400" value={data?.replacementOvertimeHours100 || 0} onChange={(e) => {
                        const val100 = parseFloat(e.target.value) || 0;
                        const val50 = data?.replacementOvertimeHours50 || 0;
                        updateWizardEntry(currentEmp.id, { replacementOvertimeHours100: val100, replacementOvertimeHours: val50 + val100 });
                      }} />
                    </div>
                    <p className="text-[10px] text-slate-400 italic mt-1">Estos valores se calculan automáticamente, pero puedes ajustarlos si es necesario.</p>
                  </div>
                </div>
              );
            })()
          : activeReplacementOvertimeModal === "fast-entry" && draftReplacementId
            ? (() => {
                const repEmp = employees.find((e) => e.id === draftReplacementId);
                return (
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col gap-1 items-center pb-3 border-b border-slate-100 dark:border-slate-700">
                      <div className="text-center mb-2">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-0.5">Personal Adicional</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-white">{repEmp?.name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 w-full">
                        <div className="text-center">
                          <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entrada Contrato</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {(() => {
                              const proj = userProjects.find((p) => p._id === selectedProjectId);
                              return proj ? formatToAMPM(getEmployeeStartTime(proj, draftReplacementId, reportDate, repEmp)) : "—";
                            })()}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Salida Contrato</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {(() => {
                              const proj = userProjects.find((p) => p._id === selectedProjectId);
                              return proj ? formatToAMPM(getEmployeeEndTime(proj, draftReplacementId, reportDate, repEmp)) : "—";
                            })()}
                          </span>
                        </div>
                      </div>
                      {(() => {
                        const proj = userProjects.find((p) => p._id === selectedProjectId);
                        if (!proj) return null;
                        const sT = getEmployeeStartTime(proj, draftReplacementId, reportDate, repEmp);
                        const eT = getEmployeeEndTime(proj, draftReplacementId, reportDate, repEmp);
                        const dur = getDurationText(sT, eT);
                        if (!dur) return null;
                        return (
                          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                            <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Duración Contrato: {dur}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Entrada Real</label>
                      <div className="relative">
                        <select className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-sm font-mono text-center tracking-wider appearance-none cursor-pointer" value={draftReplacementInTime} onChange={(e) => setDraftReplacementInTime(e.target.value)}>
                          <option value="">--:--</option>
                          {TIME_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                          <FontAwesomeIcon icon={faClock} />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Salida Efectivo</label>
                      <div className="relative">
                        <select className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-sm font-mono text-center tracking-wider appearance-none cursor-pointer" value={draftReplacementOutTime} onChange={(e) => setDraftReplacementOutTime(e.target.value)}>
                          <option value="">--:--</option>
                          {TIME_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                          <FontAwesomeIcon icon={faClock} />
                        </div>
                      </div>
                      {draftReplacementInTime && draftReplacementOutTime && (
                        <div className="mt-2 text-right">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                            <FontAwesomeIcon icon={faClock} className="text-[10px]" /> Tiempo Registrado: {getDurationText(draftReplacementInTime, draftReplacementOutTime)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 50%</label>
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all font-bold text-blue-600 dark:text-blue-400" value={draftReplacementOvertimeHours50} onChange={(e) => {
                          const val50 = parseFloat(e.target.value) || 0;
                          setDraftReplacementOvertimeHours50(val50);
                          setDraftReplacementOvertimeHours(val50 + draftReplacementOvertimeHours100);
                        }} />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras al 100%</label>
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all font-bold text-blue-600 dark:text-blue-400" value={draftReplacementOvertimeHours100} onChange={(e) => {
                          const val100 = parseFloat(e.target.value) || 0;
                          setDraftReplacementOvertimeHours100(val100);
                          setDraftReplacementOvertimeHours(draftReplacementOvertimeHours50 + val100);
                        }} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 italic">Estos valores se calculan automáticamente, pero puedes ajustarlos si es necesario.</p>
                    </div>
                  </div>
                );
              })()
            : null}
        {isReplacementOvertimeTimeIncomplete && <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded text-xs text-amber-600 dark:text-amber-400 font-medium animate-in fade-in slide-in-from-top-2">⚠️ El Horario Entrada Real y el Horario Salida Real son obligatorios para guardar las horas extras. Si no deseas registrar horas extras, puedes cerrar la ventana (X) o presionar NO en la pantalla principal.</div>}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
          <button type="button" onClick={handleCancelReplacementOvertime} className="px-6 py-2 border border-slate-300 dark:border-slate-600 rounded font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">
            Cancelar
          </button>
          <button type="button" onClick={() => setActiveReplacementOvertimeModal(null)} disabled={isReplacementOvertimeTimeIncomplete} className={`px-6 py-2 rounded font-bold transition-all shadow-sm ${isReplacementOvertimeTimeIncomplete ? "bg-slate-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}>
            Listo
          </button>
        </div>
      </Modal>

      {/* Absence Configuration Modal */}
      <Modal isOpen={activeAbsenceModal !== null} onClose={() => setActiveAbsenceModal(null)} title="Configurar Ausencia" zIndex={60}>
        {activeAbsenceModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]
          ? (() => {
              const currentEmp = projectEmployees[wizardIndex];
              const data = wizardData[currentEmp.id];
              const selectedType = logTypes.find((t) => t._id === data?.typeId);
              return (
                <div className="space-y-4 pt-2 pb-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Motivo de Ausencia</label>
                    <select
                      className="w-full p-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                      value={data?.typeId || ""}
                      onChange={(e) => {
                        const newId = e.target.value;
                        const type = logTypes.find((t) => t._id === newId);
                        updateWizardEntry(currentEmp.id, {
                          typeId: newId,
                          replacementId: type?.requiresReplacement ? data.replacementId : undefined,
                        });
                      }}
                    >
                      <option value="">Seleccionar motivo...</option>
                      {logTypes
                        .filter((t) => !t.name.toLowerCase().includes("horas extra") && t.isActive)
                        .map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {selectedType?.requiresReplacement && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Reemplazo (Opcional)</label>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReplacementTargetEmpId(currentEmp.id);
                            setShowReplacementModal(true);
                          }}
                          className="w-full p-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-left flex justify-between items-center transition-colors hover:bg-slate-50 dark:hover:bg-slate-600 focus:ring-2 focus:ring-blue-500"
                        >
                          <span className={data.replacementId ? "text-slate-900 dark:text-white font-medium" : "text-slate-400 dark:text-slate-500"}>{data.replacementId ? employees.find((e) => e.id === data.replacementId)?.name || "Empleado desconocido" : "Seleccionar reemplazo..."}</span>
                          <div className="flex items-center gap-2">
                            {data.replacementId && (
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateWizardEntry(currentEmp.id, { replacementId: undefined });
                                }}
                                className="text-slate-400 hover:text-red-500 p-1 rounded-full bg-slate-100 dark:bg-slate-800 transition-colors flex items-center justify-center w-6 h-6"
                              >
                                <FontAwesomeIcon icon={faTimes} className="text-xs" />
                              </div>
                            )}
                            <FontAwesomeIcon icon={faChevronRight} className="text-slate-400 text-xs" />
                          </div>
                        </button>
                      </div>
                      {data.replacementId && (
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center block">¿Realizó Horas Extras?</span>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const updates: Partial<WizardEntry> = {};
                                if (data.replacementOvertimeHours === undefined || data.replacementOvertimeHours === null) {
                                  updates.replacementOvertimeHours = 0;
                                }
                                if (Object.keys(updates).length > 0) {
                                  updateWizardEntry(currentEmp.id, updates);
                                }
                                setActiveReplacementOvertimeModal("wizard");
                              }}
                              className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${data.replacementOvertimeHours !== undefined && data.replacementOvertimeHours !== null ? "bg-blue-600 border-blue-600 text-white shadow-md dark:shadow-blue-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                            >
                              SÍ
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                updateWizardEntry(currentEmp.id, { replacementOvertimeHours: undefined, replacementInTime: undefined, replacementOutTime: undefined });
                              }}
                              className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${!data.replacementOvertimeHours && data.replacementOvertimeHours !== 0 ? "bg-slate-500 border-slate-500 text-white shadow-md dark:shadow-slate-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                            >
                              NO
                            </button>
                          </div>
                          {data.replacementOvertimeHours !== undefined && data.replacementOvertimeHours !== null && (
                            <div className="pt-1 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveReplacementOvertimeModal("wizard");
                                }}
                                className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center w-full gap-2 p-2 border border-blue-200 dark:border-blue-900 rounded bg-blue-50 dark:bg-blue-900/10"
                              >
                                <FontAwesomeIcon icon={faClock} />
                                {data.replacementOvertimeHours > 0 ? `${data.replacementOvertimeHours} Horas Extras (Reemplazos)` : "Configurar Horas Extras (Reemplazos)"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
          : activeAbsenceModal === "fast-entry" && selectedEmployee
            ? (() => {
                const selectedType = logTypes.find((t) => t._id === draftTypeId);
                return (
                  <div className="space-y-4 pt-2 pb-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Motivo de Ausencia</label>
                      <select
                        className="w-full p-3 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-shadow"
                        value={draftTypeId}
                        onChange={(e) => {
                          handleTypeChange(e as any);
                        }}
                      >
                        <option value="">Seleccionar motivo...</option>
                        {logTypes
                          .filter((t) => {
                            const canShow = t.visibility === "all" || (t.visibility === "specific" && selectedProjectId && t.allowedProjectIds?.includes(selectedProjectId));
                            if (!canShow) return false;
                            return !t.name.toLowerCase().includes("horas extra");
                          })
                          .map((t) => (
                            <option key={t._id} value={t._id}>
                              {t.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    {selectedType?.requiresReplacement && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Reemplazo (Opcional)</label>
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setReplacementTargetEmpId(null);
                              setShowReplacementModal(true);
                            }}
                            className="w-full p-3 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-left flex justify-between items-center transition-colors hover:bg-slate-50 dark:hover:bg-slate-600 focus:ring-2 focus:ring-blue-500"
                          >
                            <span className={draftReplacementId ? "text-slate-900 dark:text-white font-medium" : "text-slate-400 dark:text-slate-500"}>{draftReplacementId ? employees.find((e) => e.id === draftReplacementId)?.name || "Empleado desconocido" : "Seleccionar reemplazo..."}</span>
                            <div className="flex items-center gap-2">
                              {draftReplacementId && (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDraftReplacementId("");
                                  }}
                                  className="text-slate-400 hover:text-red-500 p-1 rounded-full bg-slate-100 dark:bg-slate-800 transition-colors flex items-center justify-center w-6 h-6"
                                >
                                  <FontAwesomeIcon icon={faTimes} className="text-xs" />
                                </div>
                              )}
                              <FontAwesomeIcon icon={faChevronRight} className="text-slate-400 text-xs" />
                            </div>
                          </button>
                        </div>
                        {draftReplacementId && (
                          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 space-y-3">
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 text-center block">¿Realizó Horas Extras?</span>
                            <div className="flex gap-3">
                              <button
                                type="button"
                                onClick={() => {
                                  setHasDraftReplacementOvertime(true);
                                  setActiveReplacementOvertimeModal("fast-entry");
                                }}
                                className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${hasDraftReplacementOvertime ? "bg-blue-600 border-blue-600 text-white shadow-md dark:shadow-blue-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                              >
                                SÍ
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setHasDraftReplacementOvertime(false);
                                  setDraftReplacementOvertimeHours(0);
                                  setDraftReplacementInTime("");
                                  setDraftReplacementOutTime("");
                                }}
                                className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${!hasDraftReplacementOvertime ? "bg-slate-500 border-slate-500 text-white shadow-md dark:shadow-slate-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                              >
                                NO
                              </button>
                            </div>
                            {hasDraftReplacementOvertime && (
                              <div className="pt-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveReplacementOvertimeModal("fast-entry");
                                  }}
                                  className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center w-full gap-2 p-2 border border-blue-200 dark:border-blue-900 rounded bg-blue-50 dark:bg-blue-900/10"
                                >
                                  <FontAwesomeIcon icon={faClock} />
                                  {draftReplacementOvertimeHours > 0 ? `${draftReplacementOvertimeHours} Horas Extras (Otros Presentes)` : "Configurar Horas Extras (Otros Presentes)"}
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()
            : null}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          <button onClick={() => setActiveAbsenceModal(null)} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition-colors shadow-sm">
            Listo
          </button>
        </div>
      </Modal>

      {/* Summary Modal */}
      <Modal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        title="Confirmar Reporte"
        footer={
          <div className="flex gap-3 w-full">
            <button onClick={() => setShowSummaryModal(false)} className="flex-1 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 transition-colors text-sm">
              Volver
            </button>
            <button onClick={handleConfirmSubmit} disabled={submitting} className="flex-1 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors disabled:opacity-70 text-sm">
              {submitting ? "Enviando..." : "Confirmar y Enviar"}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="font-medium text-sm text-gray-900 dark:text-white space-y-2 pb-4">
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400">Fecha:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{reportDate}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-gray-500 dark:text-gray-400">Proyecto:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{userProjects.find((p) => p._id === selectedProjectId)?.name || "Sin Proyecto"}</span>
            </div>
            {selectedAreaId && (
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400">Área:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {(() => {
                    const ac = selectedProject?.areasConfig?.find((x: any) => String(x.areaId?._id || x.areaId || "") === String(selectedAreaId));
                    return ac?.areaId?.name || allAreas.find((a) => String(a._id) === String(selectedAreaId))?.name || "Área";
                  })()}
                </span>
              </div>
            )}
            {selectedShiftId && (
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400">Turno:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {(() => {
                    const areaConfig = selectedProject?.areasConfig?.find((ac: any) => String(ac.areaId?._id || ac.areaId || "") === String(selectedAreaId));
                    const s = areaConfig?.shiftIds?.find((s: any) => String(s?._id || s || "") === String(selectedShiftId));
                    const sName = typeof s === "object" ? s.name : undefined;
                    return sName || allShifts.find((s) => String(s._id) === String(selectedShiftId))?.name || "Turno";
                  })()}
                </span>
              </div>
            )}
          </div>

          {hasActivity ? (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-900 dark:text-white border-b pb-1 dark:border-gray-700">Resumen de Asistencia</h4>
              <div className="max-h-50 overflow-y-auto text-sm space-y-2">
                {entries.length > 0 ? (
                  entries.map((entry) => (
                    <div key={entry.tempId} className="flex flex-col pb-2 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-gray-800 dark:text-white">{entry.employeeName}</span>
                            {renderVacationBadge(entry.employeeId, entry.employeeName)}
                          </div>
                          <div className="text-xs text-blue-600 dark:text-blue-400 font-medium flex flex-wrap gap-2 items-center mt-0.5">
                            <span>{entry.typeName}</span>
                            {entry.overtimeHours ? (
                              <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] dark:bg-blue-900/30 dark:text-blue-400 font-bold">
                                {entry.overtimeHours} h Extra
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingEntryTempId(entry.tempId);
                                  setActiveOvertimeModal("entry-edit");
                                }}
                                className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline flex items-center gap-1"
                              >
                                <FontAwesomeIcon icon={faClock} />
                                + Horas Extras
                              </button>
                            )}
                          </div>
                        </div>
                        {entry.overtimeHours && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEntryTempId(entry.tempId);
                              setActiveOvertimeModal("entry-edit");
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 font-semibold hover:underline"
                          >
                            Editar OT
                          </button>
                        )}
                      </div>
                      {entry.replacementName && (
                        <span className="text-xs text-gray-500 mt-1">
                          Reemplaza: {entry.replacementName} {entry.replacementOvertimeHours ? `(+${entry.replacementOvertimeHours}h)` : ""}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 italic">Sin colaboradores seleccionados.</p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50 text-sm text-blue-800 dark:text-blue-200">
                <p className="font-bold flex items-center gap-2 mb-1">
                  <FontAwesomeIcon icon={faInfoCircle} />
                  Sin Novedades
                </p>
                <p className="leading-snug opacity-90">
                  Al confirmar, se registrará <strong>asistencia completa (Presente)</strong> para todo el equipo asignado al proyecto. Verifique la lista a continuación.
                </p>
              </div>

              <div>
                <h4 className="font-medium text-xs uppercase text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700 pb-2 mb-2 flex justify-between items-center">
                  Equipo Asignado
                  <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-[10px]">{projectEmployees.length}</span>
                </h4>
                <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
                  {projectEmployees.map((emp) => (
                    <div key={emp.id} className="flex justify-between items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded transition-colors group">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-gray-700 dark:text-slate-200 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{emp.name}</span>
                        {renderVacationBadge(emp.id, emp.name)}
                        {(() => {
                          const { areaName: resolvedArea, shiftName: resolvedShift } = resolveEmployeeAreaAndShift(emp);
                          return (
                            <>
                              {resolvedArea && (
                                <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                                  <FontAwesomeIcon icon={faLayerGroup} className="text-[7px]" />
                                  {resolvedArea}
                                </span>
                              )}
                              {resolvedShift && (
                                <span className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                                  <FontAwesomeIcon icon={faClock} className="text-[7px]" />
                                  {resolvedShift}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 uppercase tracking-wide border border-blue-200 dark:border-blue-900/50">Presente</span>
                    </div>
                  ))}
                  {projectEmployees.length === 0 && <p className="text-sm text-gray-500 italic text-center py-4">No hay colaboradores asignados a este proyecto.</p>}
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Comentarios Generales</label>
            <textarea rows={3} className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-slate-700 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 transition-shadow resize-none" placeholder="Ingrese comentarios finales para el reporte..." value={comments} onChange={(e) => setComments(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Detalle del Reporte"
        footer={
          <div className="flex gap-3 w-full">
            <button onClick={() => setShowDetailModal(false)} className="flex-1 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 transition-colors text-sm">
              Cerrar
            </button>
            {(() => {
              const isEditable = viewingReport
                ? Math.round((startOfDay(new Date()).getTime() - startOfDay(parseISO(viewingReport.date)).getTime()) / (1000 * 60 * 60 * 24)) <= 2
                : false;
              return (
                <button
                  onClick={handleEditFromDetail}
                  className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                    isEditable
                      ? "bg-blue-600 hover:bg-blue-700 text-white shadow-md"
                      : "bg-slate-300 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60"
                  }`}
                >
                  Editar
                </button>
              );
            })()}
          </div>
        }
      >
        {viewingReport && (
          <div className="space-y-4">
            <div className="font-medium text-sm text-gray-900 dark:text-white space-y-2 pb-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-gray-400">{viewingReport.reportNumber || `#${viewingReport._id.slice(-6).toUpperCase()}`}</span>
                <span className="text-xs text-gray-500">{new Date(viewingReport.submittedAt).toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400">Fecha:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{new Date(`${viewingReport.date}T00:00:00`).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400">Proyecto:</span>
                <span className="font-semibold text-gray-900 dark:text-white">
                  {(() => {
                    const p = viewingReport.projectId;
                    if (!p) return "Sin Proyecto";
                    if (typeof p === "string") return "Proyecto";
                    const pName = p.name || "Proyecto";
                    const cName = p.clientId?.name;
                    return cName ? `${cName} | ${pName}` : pName;
                  })()}
                </span>
              </div>
            </div>

            {(() => {
              const isReportEdited = viewingReport.createdAt && viewingReport.updatedAt && (new Date(viewingReport.updatedAt).getTime() - new Date(viewingReport.createdAt).getTime() > 1000);
              if (!isReportEdited) return null;
              return (
                <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-100 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5 shadow-sm">
                  <FontAwesomeIcon icon={faPen} className="mt-0.5 text-amber-500 flex-shrink-0" />
                  <div>
                    <span className="font-bold block mb-0.5">Novedad Editada</span>
                    <span>Última edición: {new Date(viewingReport.updatedAt!).toLocaleString()}</span>
                  </div>
                </div>
              );
            })()}

             {(() => {
               const submittedDate = new Date(viewingReport.submittedAt);
               const limitDate = new Date(submittedDate.getTime() + 48 * 60 * 60 * 1000);
               return (
                 <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-200 flex items-start gap-2.5">
                   <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-blue-500 flex-shrink-0" />
                   <div>
                     EDITAR: Solo se puede editar hasta 48hs después de la fecha de la novedad (hasta el {limitDate.toLocaleString()}).
                   </div>
                 </div>
               );
             })()}

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-900 dark:text-white border-b pb-1 dark:border-gray-700">Novedades: {viewingReport.hasActivity ? "SÍ" : "NO"}</h4>
              <div className="max-h-50 overflow-y-auto text-sm space-y-2 mt-2">
                {viewingReport.attendance.map((entry, idx) => {
                  const empName = typeof entry.employeeId === "object" && entry.employeeId ? `${entry.employeeId.firstName} ${entry.employeeId.lastName}` : employees.find((e) => e.id === entry.employeeId)?.name || "Empleado";
                  // Fallback for type name reconstruction if needed or use absenceReason directly
                  const reason = entry.absenceReason || (entry.overtimeHours ? "Horas Extra" : "Presente");
                  const repName = entry.replacementId ? (typeof entry.replacementId === "object" && entry.replacementId ? `${entry.replacementId.firstName} ${entry.replacementId.lastName}` : employees.find((e) => e.id === entry.replacementId)?.name || "Reemplazo") : null;

                  return (
                    <div key={idx} className="flex flex-col pb-2 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0">
                      <span className="font-semibold text-gray-800 dark:text-white">{empName}</span>
                      <span className={`text-xs ${reason === "Presente" || reason === "Horas Extra" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                        {reason} {entry.overtimeHours ? `(${entry.overtimeHours}h)` : ""}
                      </span>
                      {repName && (
                        <span className="text-xs text-gray-500">
                          Reemplaza: {repName} {entry.replacementOvertimeHours ? `(+${entry.replacementOvertimeHours}h)` : ""}
                        </span>
                      )}
                      {entry.notes && <span className="text-xs text-gray-500 italic">"{entry.notes}"</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {viewingReport.comments && (
              <div>
                <h4 className="font-medium text-sm text-gray-900 dark:text-white border-b pb-1 dark:border-gray-700 mb-1">Comentarios</h4>
                <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-2 rounded italic">"{viewingReport.comments}"</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Project Info Modal */}
      <Modal
        isOpen={showProjectInfo}
        onClose={() => {
          setShowProjectInfo(false);
          setActiveProjectTab("info");
        }}
        title={`${selectedProject?.name || ""}`}
        size="md"
        footer={
          <div className="flex justify-end w-full">
            <button
              onClick={() => {
                setShowProjectInfo(false);
                setActiveProjectTab("info");
              }}
              className="px-8 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-bold text-xs hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200 dark:shadow-none"
            >
              Cerrar
            </button>
          </div>
        }
      >
        {selectedProject && (
          <div className="min-h-[450px] flex flex-col">
            {/* Tabs Header */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 -mx-6 px-6 mb-6 sticky top-0 bg-white dark:bg-slate-900 z-10">
              <button onClick={() => setActiveProjectTab("info")} className={`flex-1 py-3 text-[10px] font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${activeProjectTab === "info" ? "border-blue-500 text-blue-600 dark:text-blue-400 shadow-[0_4px_12px_-4px_rgba(59,130,246,0.2)]" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}>
                <FontAwesomeIcon icon={faInfoCircle} />
                INFORMACIÓN
              </button>
              <button onClick={() => setActiveProjectTab("schedule")} className={`flex-1 py-3 text-[10px] font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${activeProjectTab === "schedule" ? "border-blue-500 text-blue-600 dark:text-blue-400 shadow-[0_4px_12px_-4px_rgba(59,130,246,0.2)]" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}>
                <FontAwesomeIcon icon={faClock} />
                HORARIOS
              </button>
              <button onClick={() => setActiveProjectTab("team")} className={`flex-1 py-3 text-[10px] font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${activeProjectTab === "team" ? "border-blue-500 text-blue-600 dark:text-blue-400 shadow-[0_4px_12px_-4px_rgba(59,130,246,0.2)]" : "border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"}`}>
                <FontAwesomeIcon icon={faUsers} />
                EQUIPO ({selectedProject.assignedUsers?.length || 0})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {activeProjectTab === "info" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300 px-1 pb-4">
                  {/* Description */}
                  {selectedProject.description && (
                    <section className="space-y-2 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                        Descripción
                      </h4>
                      <p className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed font-medium">{selectedProject.description}</p>
                    </section>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/20 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-400 uppercase">Fecha de Inicio</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{selectedProject.startDate ? new Date(selectedProject.startDate.split("T")[0] + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "No definida"}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/20 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-400 uppercase">Fecha Fin</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{selectedProject.endDate ? new Date(selectedProject.endDate.split("T")[0] + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" }) : "No definida"}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/20 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-400 uppercase">Creado el</span>
                      <span className="text-sm font-bold text-slate-600 dark:text-slate-400">{selectedProject.createdAt ? new Date(selectedProject.createdAt).toLocaleDateString() : "-"}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeProjectTab === "schedule" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 px-1 pb-4">
                  <section>
                    <div className="space-y-3">
                      {(() => {
                        const formatTimeRange = (config: any) => {
                          if (!config || !config.isWorkDay) return "No laborable";
                          const start = config.startTime || config.start;
                          const end = config.endTime || config.end;
                          if (!start || !end || String(start).includes("undefined") || String(end).includes("undefined")) {
                            return "Horario no definido";
                          }
                          return `${start} - ${end}`;
                        };

                        if (!selectedProject.workSchedule) {
                          return <p className="text-sm text-slate-500 italic text-center py-4">No hay horario configurado para este proyecto.</p>;
                        }

                        const { mode, weekdays, weekend, days } = selectedProject.workSchedule;

                        if (mode === "weekdays") {
                          return (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-3">
                                <span className="text-slate-500 dark:text-slate-400 font-medium">Lunes a Viernes</span>
                                <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-xs">{formatTimeRange(weekdays)}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-3">
                                <span className="text-slate-500 dark:text-slate-400 font-medium">Sábado</span>
                                <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-xs">{formatTimeRange(weekend)}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 dark:text-slate-400 font-medium">Domingo</span>
                                <span className="font-bold text-slate-400 dark:text-slate-500 italic px-3 py-1 text-xs">No laborable</span>
                              </div>
                            </div>
                          );
                        }

                        if (mode === "all_week") {
                          return (
                            <div className="space-y-3">
                              <div className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-3">
                                <span className="text-slate-500 dark:text-slate-400 font-medium">Lunes a Domingo</span>
                                <span className="font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full text-xs">{formatTimeRange(weekdays)}</span>
                              </div>
                            </div>
                          );
                        }

                        if (mode === "per_day" && days) {
                          return (
                            <div className="space-y-2">
                              {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((dayKey) => {
                                const config = (days as any)?.[dayKey];
                                const dayNames: any = { monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles", thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo" };
                                return (
                                  <div key={dayKey} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
                                    <span className="text-slate-500 dark:text-slate-400 font-medium">{dayNames[dayKey]}:</span>
                                    <span className={`font-bold px-3 py-1 rounded-full text-xs ${config?.isWorkDay ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800" : "text-slate-400 dark:text-slate-600 italic"}`}>{formatTimeRange(config)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }

                        return <p className="text-sm text-slate-500 italic text-center py-4">No hay horario configurado.</p>;
                      })()}
                    </div>
                  </section>
                </div>
              )}

              {activeProjectTab === "team" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-300">
                  {(() => {
                    const assignedUsers = selectedProject.assignedUsers || [];

                    const enrichedUsers = assignedUsers.map((user: any) => {
                      const uId = typeof user === "string" ? user : user._id;
                      const emp = employees.find((e) => e.id === uId);
                      return {
                        id: uId,
                        name: emp ? emp.name : typeof user === "object" ? `${user.firstName || ""} ${user.lastName || ""}` : "Colaborador",
                        positionName: emp ? emp.positionName : undefined,
                        roles: emp ? emp.roles : typeof user === "object" ? user.roles : [],
                        firstName: emp ? emp.name.split(" ")[0] : typeof user === "object" ? user.firstName : "",
                        lastName: emp ? emp.name.split(" ").slice(1).join(" ") : typeof user === "object" ? user.lastName : "",
                        originalEmp: emp,
                      };
                    });

                    // Coordinador = puede cargar novedades. Antes se buscaba la palabra en el nombre del rol,
                    // que dejó de ser un dato: se conserva el fallback por puesto y por nombre de la persona,
                    // que cubre a quien figura en el roster sin usuario detrás.
                    const checkIsCoordinator = (u: any) => coordinaAreas(u.roles) || u.positionName?.toLowerCase().includes("coordinador") || u.firstName?.toLowerCase().includes("coordinador") || u.lastName?.toLowerCase().includes("coordinador");

                    const coordinators = enrichedUsers.filter(checkIsCoordinator);
                    const collaborators = enrichedUsers.filter((u) => !checkIsCoordinator(u));

                    const renderUserList = (users: any[], title: string, icon: any) => (
                      <div className="space-y-3">
                        <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2">
                          <FontAwesomeIcon icon={icon} className="text-blue-500/50" />
                          {title} ({users.length})
                        </h5>
                        <div className="bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                          {users.length === 0 ? (
                            <div className="p-6 text-center text-xs text-slate-400 italic">No hay registros</div>
                          ) : (
                            users.map((u) => (
                              <div key={u.id} className="p-3 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xs shadow-sm shrink-0">{u.name.charAt(0).toUpperCase()}</div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{u.name}</p>
                                    {u.originalEmp && (() => {
                                      const { areaName: resolvedArea, shiftName: resolvedShift } = resolveEmployeeAreaAndShift(u.originalEmp);
                                      return (
                                        <>
                                          {resolvedArea && (
                                            <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                                              <FontAwesomeIcon icon={faLayerGroup} className="text-[7px]" />
                                              {resolvedArea}
                                            </span>
                                          )}
                                          {resolvedShift && (
                                            <span className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                                              <FontAwesomeIcon icon={faClock} className="text-[7px]" />
                                              {resolvedShift}
                                            </span>
                                          )}
                                        </>
                                      );
                                    })()}
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-tighter">{u.positionName || (title === "SUPERVISORES" ? "SUPERVISOR" : "COLABORADOR")}</p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );

                    if (enrichedUsers.length === 0) {
                      return (
                        <div className="p-12 text-center space-y-3">
                          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-300">
                            <FontAwesomeIcon icon={faUsers} className="text-xl" />
                          </div>
                          <p className="text-sm text-slate-400 italic">No hay miembros asignados al equipo.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-6">
                        {renderUserList(coordinators, "SUPERVISORES", faUserTie)}
                        {renderUserList(collaborators, "COLABORADORES", faUsers)}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Processed History Modal */}
      <Modal isOpen={showProcessedHistory} onClose={() => setShowProcessedHistory(false)} title="Registros Cargados" size="md">
        <div className="space-y-6">
          <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg text-center">
            <span className="text-3xl font-bold text-blue-500">{wizardIndex}</span>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Registros procesados hasta ahora</p>
          </div>

          <div className="space-y-3 max-h-[60vh] overflow-y-auto custom-scrollbar">
            {projectEmployees
              .slice(0, wizardIndex)
              .reverse()
              .map((emp) => {
                const data = wizardData[emp.id];
                if (!data) return null;
                const isPresent = data.status === "present";
                const isOvertime = (data.overtimeHours || 0) > 0;

                const repObj = data.replacementId ? employees.find((e) => e.id === data.replacementId) : null;
                const repStr = repObj ? ` (Reemplazo: ${repObj.name}${data.replacementOvertimeHours ? ` + ${data.replacementOvertimeHours}h Extra` : ""})` : "";

                const typeName = isPresent ? (isOvertime ? `Horas Extra (${data.overtimeHours}h)` : "Presente") : `${logTypes.find((t) => t._id === data.typeId)?.name || "Ausente"}${repStr}`;

                return (
                  <div key={emp.id} className="bg-white dark:bg-slate-800/50 rounded-xl p-3 flex justify-between items-center border border-slate-100 dark:border-slate-700 shadow-sm">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="font-bold text-slate-700 dark:text-slate-200 text-sm">{emp.name}</div>
                        {(() => {
                          const { areaName: resolvedArea, shiftName: resolvedShift } = resolveEmployeeAreaAndShift(emp);
                          return (
                            <>
                              {resolvedArea && (
                                <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                                  <FontAwesomeIcon icon={faLayerGroup} className="text-[7px]" />
                                  {resolvedArea}
                                </span>
                              )}
                              {resolvedShift && (
                                <span className="bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase tracking-wider">
                                  <FontAwesomeIcon icon={faClock} className="text-[7px]" />
                                  {resolvedShift}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div className={`text-xs font-medium ${isPresent ? (isOvertime ? "text-blue-600" : "text-blue-600") : "text-red-500"} mt-0.5`}>{typeName}</div>
                    </div>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shadow-inner ${isPresent ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"}`}>
                      <FontAwesomeIcon icon={isPresent ? faCheck : faTimes} className="text-sm" />
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <button onClick={() => setShowProcessedHistory(false)} className="w-full py-3 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white rounded-lg font-bold">
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

      {/* Replacement Modal */}
      <Modal
        isOpen={showReplacementModal}
        onClose={() => {
          setShowReplacementModal(false);
          setReplacementSearchTerm("");
          setReplacementTargetEmpId(null);
        }}
        zIndex={100}
        title={`Seleccionar Reemplazo (${(() => {
          const filteredByProject = selectedProjectId
            ? employees.filter((e) => {
                // 1. Status Filter
                let matchesStatus = true;
                if (replacementStatusFilter === "active") {
                  matchesStatus = e.isActive !== false;
                } else if (replacementStatusFilter === "inactive") {
                  matchesStatus = e.isActive === false;
                }

                // 2. Contract Active Filter
                let matchesContract = true;
                if (replacementFilterContractActive) {
                  matchesContract = e.hasActiveContract;
                }

                return matchesStatus && matchesContract;
              })
            : [];
          const availableEmployees = filteredByProject.filter((e) => (replacementTargetEmpId !== null ? e.id !== replacementTargetEmpId : selectedEmployee ? e.id !== selectedEmployee.id : true));

          let results = availableEmployees;

          // Role Filtering
          if (selectedReplacementRoleFilters.length > 0) {
            results = results.filter((emp) => {
              return emp.metadataProjects?.some((m) => {
                if (!m.roleFrame) return false;
                const normalizedRole = m.roleFrame.trim().toLowerCase();
                return selectedReplacementRoleFilters.some((f) => f.trim().toLowerCase() === normalizedRole);
              });
            });
          }

          // Search filtering
          if (replacementSearchTerm) {
            results = results.filter((e) => e.name.toLowerCase().includes(replacementSearchTerm.toLowerCase()));
          }

          return results.length;
        })()})${selectedProject ? ` - ${selectedProject.name}` : ""}`}
        size="md"
      >
        <div className="flex flex-col h-[60vh]">
          {/* Search Input and Filter Button inside Modal */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 sticky top-0 z-10 flex flex-col gap-2">
            {/* Active Filter Badges */}
            {(selectedReplacementRoleFilters.length > 0 || replacementStatusFilter !== "active" || replacementFilterContractActive) && (
              <div className="flex flex-wrap gap-2 mb-1">
                {/* Role Badges */}
                {selectedReplacementRoleFilters.map((role) => (
                  <span key={role} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                    {role}
                    <button onClick={() => setSelectedReplacementRoleFilters((prev) => prev.filter((r) => r !== role))} className="hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                    </button>
                  </span>
                ))}

                {/* Status Badges */}
                {replacementStatusFilter === "inactive" && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px] font-bold border border-red-200 dark:border-red-800">
                    Solo Inactivos
                    <button onClick={() => setReplacementStatusFilter("active")} className="hover:text-red-900 dark:hover:text-red-100 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                    </button>
                  </span>
                )}
                {replacementStatusFilter === "all" && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] font-bold border border-gray-200 dark:border-gray-700">
                    Todos los Usuarios
                    <button onClick={() => setReplacementStatusFilter("active")} className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                    </button>
                  </span>
                )}

                {/* Contract Badge */}
                {replacementFilterContractActive && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                    Contrato Activo
                    <button onClick={() => setReplacementFilterContractActive(false)} className="hover:text-amber-900 dark:hover:text-amber-100 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                    </button>
                  </span>
                )}

                <button
                  onClick={() => {
                    setSelectedReplacementRoleFilters([]);
                    setReplacementStatusFilter("active");
                    setReplacementFilterContractActive(false);
                  }}
                  className="text-[10px] text-gray-500 hover:underline px-1"
                >
                  Limpiar Todo
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input type="text" autoFocus className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-slate-800 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors" placeholder="Buscar por nombre..." value={replacementSearchTerm} onChange={(e) => setReplacementSearchTerm(e.target.value)} />
              </div>
              <button
                onClick={() => setIsReplacementRoleFilterModalOpen(true)}
                className={`px-3 border rounded transition-colors flex items-center gap-2 whitespace-nowrap text-sm font-medium
                  ${selectedReplacementRoleFilters.length > 0 || replacementStatusFilter !== "active" || replacementFilterContractActive ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400" : "bg-white border-gray-300 text-gray-700 dark:bg-slate-800 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"}`}
              >
                <FontAwesomeIcon icon={faFilter} />
                Filtros
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto flex-1 p-2">
            {(() => {
              const filteredByProject = selectedProjectId
                ? employees.filter((e) => {
                    // 1. Status Filter
                    let matchesStatus = true;
                    if (replacementStatusFilter === "active") {
                      matchesStatus = e.isActive !== false;
                    } else if (replacementStatusFilter === "inactive") {
                      matchesStatus = e.isActive === false;
                    }

                    // 2. Contract Active Filter
                    let matchesContract = true;
                    if (replacementFilterContractActive) {
                      matchesContract = e.hasActiveContract;
                    }

                    return matchesStatus && matchesContract;
                  })
                : [];
              const availableEmployees = filteredByProject.filter((e) => (replacementTargetEmpId !== null ? e.id !== replacementTargetEmpId : selectedEmployee ? e.id !== selectedEmployee.id : true));

              let results = availableEmployees;

              // Role Filtering
              if (selectedReplacementRoleFilters.length > 0) {
                results = results.filter((emp) => {
                  return emp.metadataProjects?.some((m) => {
                    if (!m.roleFrame) return false;
                    const normalizedRole = m.roleFrame.trim().toLowerCase();
                    return selectedReplacementRoleFilters.some((f) => f.trim().toLowerCase() === normalizedRole);
                  });
                });
              }

              // Search Filter
              if (replacementSearchTerm) {
                results = results.filter((e) => e.name.toLowerCase().includes(replacementSearchTerm.toLowerCase()));
              }

              const filteredResults = results;

              return (
                <>
                  {filteredResults.map((emp) => {
                    const isSelected = replacementTargetEmpId ? wizardData[replacementTargetEmpId]?.replacementId === emp.id : draftReplacementId === emp.id;
                    return (
                      <div
                        key={emp.id}
                        className={`p-3 mb-1 rounded cursor-pointer border transition-colors ${isSelected ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 dark:border-blue-500/50" : "border-transparent dark:border-gray-800 hover:bg-blue-50 dark:hover:bg-slate-700 hover:border-blue-100 dark:hover:border-slate-600"}`}
                        onClick={() => {
                          if (replacementTargetEmpId) {
                            updateWizardEntry(replacementTargetEmpId, { replacementId: emp.id });
                          } else {
                            setDraftReplacementId(emp.id);
                          }
                          setShowReplacementModal(false);
                          setReplacementSearchTerm("");
                          setSelectedReplacementRoleFilters([]);
                          setReplacementStatusFilter("active");
                          setReplacementFilterContractActive(false);
                          setReplacementTargetEmpId(null);
                        }}
                      >
                        <div className="flex flex-col gap-1 items-start">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <div className={`font-medium text-slate-800 dark:text-white truncate ${isSelected ? "text-blue-900 dark:text-blue-100 font-semibold" : ""}`}>{emp.name}</div>
                            {renderVacationBadge(emp.id, emp.name)}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {(() => {
                              const roleFrame = emp.metadataProjects?.find((m) => m.roleFrame)?.roleFrame;
                              return roleFrame ? <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-indigo-900/30 dark:text-indigo-400 tracking-wider whitespace-nowrap">{roleFrame}</span> : null;
                            })()}
                            {emp.isActive === false ? <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-red-900/30 dark:text-red-400 tracking-wider uppercase whitespace-nowrap">Inactivo</span> : <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-green-900/30 dark:text-green-400 tracking-wider uppercase whitespace-nowrap">Activo</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredResults.length === 0 && <div className="p-8 text-center text-gray-500 italic bg-gray-50 dark:bg-slate-800/50 rounded mt-2">{selectedProjectId ? (selectedReplacementRoleFilters.length > 0 || replacementSearchTerm ? "No se encontraron colaboradores con estos filtros." : "No se encontraron colaboradores.") : "Selecciona un proyecto primero."}</div>}
                </>
              );
            })()}
          </div>
        </div>
      </Modal>

      {/* Advanced Filter Modal for Replacement */}
      <AdditionalStaffFiltersModal
        isOpen={isReplacementRoleFilterModalOpen}
        onClose={() => setIsReplacementRoleFilterModalOpen(false)}
        onApply={(filters: AdditionalStaffFilterValues) => {
          setSelectedReplacementRoleFilters(filters.roleFilters);
          setReplacementStatusFilter(filters.statusFilter);
          setReplacementFilterContractActive(filters.contractActive);
          setIsReplacementRoleFilterModalOpen(false);
        }}
        availableRoles={replacementAvailableRoles}
        currentFilters={{
          roleFilters: selectedReplacementRoleFilters,
          statusFilter: replacementStatusFilter,
          contractActive: replacementFilterContractActive,
        }}
      />

      {/* Role Filter Modal for Additional Staff — self-contained component to prevent parent re-renders */}
      <AdditionalStaffFiltersModal
        isOpen={isAdditionalRoleFilterModalOpen}
        onClose={() => setIsAdditionalRoleFilterModalOpen(false)}
        onApply={(filters: AdditionalStaffFilterValues) => {
          setSelectedAdditionalRoleFilters(filters.roleFilters);
          setAdditionalStaffStatusFilter(filters.statusFilter);
          setAdditionalStaffFilterContractActive(filters.contractActive);
          setAdditionalStaffVisibleCount(20);
          setIsAdditionalRoleFilterModalOpen(false);
        }}
        availableRoles={additionalStaffAvailableRoles}
        currentFilters={{
          roleFilters: selectedAdditionalRoleFilters,
          statusFilter: additionalStaffStatusFilter,
          contractActive: additionalStaffFilterContractActive,
        }}
      />

      {/* Additional Staff Modal */}
      <Modal
        isOpen={showAdditionalStaffModal}
        onClose={() => {
          setShowAdditionalStaffModal(false);
          setSelectedAdditionalStaff([]);
          setAdditionalStaffSearchTerm("");
          setSelectedAdditionalRoleFilters([]);
          setAdditionalStaffStatusFilter("active");
          setAdditionalStaffFilterContractActive(false);
        }}
        title={`Otros Presentes (${filteredNonProjectEmployees.length})`}
        size="md"
      >
        <div className="space-y-4">
          {/* Info Box */}
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <FontAwesomeIcon icon={faUserPlus} className="text-blue-500" />
              ¿Agregar Otros Presentes?
              <span className="text-slate-400 font-medium">({filteredNonProjectEmployees.length})</span>
            </h3>
            <button onClick={() => setShowOtherPresentInfo(true)} className="text-blue-600 dark:text-blue-400 hover:scale-110 transition-transform p-1">
              <FontAwesomeIcon icon={faInfoCircle} />
            </button>
          </div>

          {/* Search and Filter */}
          <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 space-y-2">
            {/* Active Filter Badges */}
            {(selectedAdditionalRoleFilters.length > 0 || additionalStaffStatusFilter !== "active" || additionalStaffFilterContractActive) && (
              <div className="flex flex-wrap gap-2 pb-1">
                {/* Role Badges */}
                {selectedAdditionalRoleFilters.map((role) => (
                  <span key={role} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                    {role}
                    <button onClick={() => setSelectedAdditionalRoleFilters((prev) => prev.filter((r) => r !== role))} className="hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                    </button>
                  </span>
                ))}

                {/* Status Badges */}
                {additionalStaffStatusFilter === "inactive" && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px] font-bold border border-red-200 dark:border-red-800">
                    Solo Inactivos
                    <button onClick={() => setAdditionalStaffStatusFilter("active")} className="hover:text-red-900 dark:hover:text-red-100 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                    </button>
                  </span>
                )}
                {additionalStaffStatusFilter === "all" && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 text-[10px] font-bold border border-gray-200 dark:border-gray-700">
                    Todos los Usuarios
                    <button onClick={() => setAdditionalStaffStatusFilter("active")} className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                    </button>
                  </span>
                )}

                {/* Contract Badge */}
                {additionalStaffFilterContractActive && (
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-bold border border-amber-200 dark:border-amber-800">
                    Contrato Activo
                    <button onClick={() => setAdditionalStaffFilterContractActive(false)} className="hover:text-amber-900 dark:hover:text-amber-100 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                    </button>
                  </span>
                )}

                <button
                  onClick={() => {
                    setSelectedAdditionalRoleFilters([]);
                    setAdditionalStaffStatusFilter("active");
                    setAdditionalStaffFilterContractActive(false);
                  }}
                  className="text-[10px] text-gray-500 hover:underline px-1"
                >
                  Limpiar
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Buscar personal..." className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-slate-700 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 transition-shadow" value={additionalStaffSearchTerm} onChange={(e) => setAdditionalStaffSearchTerm(e.target.value)} />
              </div>
              <button
                onClick={() => setIsAdditionalRoleFilterModalOpen(true)}
                className={`px-4 border rounded-lg transition-colors flex items-center justify-center
                  ${selectedAdditionalRoleFilters.length > 0 || additionalStaffStatusFilter !== "active" || additionalStaffFilterContractActive ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400" : "bg-white border-gray-300 text-gray-700 dark:bg-slate-800 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"}`}
              >
                <FontAwesomeIcon icon={faFilter} />
              </button>
            </div>
          </div>

          {/* Staff List */}
          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
            {filteredNonProjectEmployees.slice(0, additionalStaffVisibleCount).map((emp) => {
              const isSelected = selectedAdditionalStaff.includes(emp.id);
              return (
                <div
                  key={emp.id}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedAdditionalStaff((prev) => prev.filter((id) => id !== emp.id));
                    } else {
                      setSelectedAdditionalStaff((prev) => [...prev, emp.id]);
                    }
                  }}
                  className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-800" : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50"}`}
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{emp.name}</p>
                        {renderVacationBadge(emp.id, emp.name)}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {(() => {
                          const roleFrame = emp.metadataProjects?.find((m) => m.roleFrame)?.roleFrame;
                          return roleFrame ? <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-indigo-900/30 dark:text-indigo-400 tracking-wider uppercase">{roleFrame}</span> : null;
                        })()}
                        {emp.isActive === false ? <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-red-900/30 dark:text-red-400 tracking-wider uppercase">Inactivo</span> : <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-green-900/30 dark:text-green-400 tracking-wider uppercase">Activo</span>}
                      </div>
                      {emp.positionName && <p className="text-[10px] text-gray-500 dark:text-gray-400">{emp.positionName}</p>}
                    </div>
                  </div>
                  <div className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isSelected ? "bg-blue-500 text-white" : "border-2 border-gray-300 dark:border-gray-600"}`}>{isSelected && <FontAwesomeIcon icon={faCheck} className="text-xs" />}</div>
                </div>
              );
            })}
            {/* Load More Button */}
            {filteredNonProjectEmployees.length > additionalStaffVisibleCount && (
              <button onClick={() => setAdditionalStaffVisibleCount((prev) => prev + 20)} className="w-full py-2.5 text-sm font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors">
                Mostrar más ({filteredNonProjectEmployees.length - additionalStaffVisibleCount} restantes)
              </button>
            )}
            {filteredNonProjectEmployees.length === 0 && <div className="text-center py-8 text-gray-500 dark:text-gray-400">No hay personal adicional disponible</div>}
          </div>

          {/* Selected Count */}
          {selectedAdditionalStaff.length > 0 && (
            <div className="text-sm text-gray-600 dark:text-gray-400 text-center bg-gray-50 dark:bg-gray-800 py-2 rounded-lg">
              <span className="font-bold text-blue-600 dark:text-blue-400">{selectedAdditionalStaff.length}</span> colaborador(es) seleccionado(s)
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                // Skip adding additional staff, go directly to summary
                setShowAdditionalStaffModal(false);
                setSelectedAdditionalStaff([]);
                setAdditionalStaffSearchTerm("");
                setShowSummaryModal(true);
              }}
              className="flex-1 py-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 transition-colors text-sm"
            >
              Omitir
            </button>
            <button
              onClick={() => {
                // Add selected staff as "Present" entries
                if (selectedAdditionalStaff.length > 0) {
                  const newEntries: LocalAttendanceRecord[] = selectedAdditionalStaff.map((empId) => {
                    const emp = nonProjectEmployees.find((e) => e.id === empId);
                    return {
                      tempId: `additional-${empId}-${Date.now()}`,
                      employeeId: empId,
                      employeeName: emp?.name || "Colaborador Adicional",
                      typeId: "",
                      typeName: "Presente (Adicional)",
                      notes: "Personal adicional agregado al reporte",
                    };
                  });
                  setEntries((prev) => [...prev, ...newEntries]);
                  setHasActivity(true); // Force hasActivity since we added people
                }
                setShowAdditionalStaffModal(false);
                setSelectedAdditionalStaff([]);
                setAdditionalStaffSearchTerm("");
                setShowSummaryModal(true);
              }}
              disabled={selectedAdditionalStaff.length === 0}
              className="flex-1 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <FontAwesomeIcon icon={faUserPlus} />
              Agregar y Continuar
            </button>
          </div>
        </div>
      </Modal>

      {/* Info Modal for Others Present */}
      <Modal isOpen={showOtherPresentInfo} onClose={() => setShowOtherPresentInfo(false)} title="Información" size="sm">
        <div className="space-y-4 p-1 text-center">
          <div className="flex flex-col items-center gap-3 text-blue-600 dark:text-blue-400 mb-2">
            <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <FontAwesomeIcon icon={faInfoCircle} className="text-2xl" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Otros Presentes</h3>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">Puedes incluir colaboradores que no están asignados a este proyecto en el reporte de novedades.</p>
          <div className="pt-4">
            <button onClick={() => setShowOtherPresentInfo(false)} className="w-full py-3 bg-slate-900 dark:bg-slate-700 text-white rounded-xl font-bold shadow-lg transition-all active:scale-95">
              Entendido
            </button>
          </div>
        </div>
      </Modal>

      {/* Floating Action Button for New Report */}
      {/* Floating Action Button for New Report */}
      <div className="fixed bottom-24 z-10 w-full xl:w-1/2 left-1/2 -translate-x-1/2 flex justify-end px-6 pointer-events-none">
        <button onClick={handleCreateNew} className="pointer-events-auto flex items-center justify-center w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100" title="Nueva Novedad">
          <FontAwesomeIcon icon={faPlus} className="w-6 h-6" />
        </button>
      </div>
      {vacationModalOpen && selectedVacationUser && (
        <InfoModal
          isOpen={vacationModalOpen}
          onClose={() => {
            setVacationModalOpen(false);
            setSelectedVacationUser(null);
          }}
          title={`Vacaciones de ${selectedVacationUser.name}`}
          size="sm"
        >
          <div className="space-y-4 p-2 text-center">
            <div className="w-16 h-16 bg-amber-500/10 dark:bg-amber-500/20 rounded-full flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400 border border-amber-500/20 dark:border-amber-500/30 shadow-sm">
              <FontAwesomeIcon icon={faUmbrellaBeach} className="text-3xl animate-pulse text-amber-500" />
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-850 dark:text-slate-200">
                Período de Vacaciones Activo
              </p>
              {(() => {
                const activeVac = getUserActiveVacation(selectedVacationUser.id);
                if (!activeVac) return <p className="text-sm text-slate-500">No se encontraron vacaciones activas para este colaborador.</p>;
                return (
                  <div className="inline-block bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800 shadow-sm mt-1">
                    <span className="text-lg font-black text-amber-600 dark:text-amber-400">
                      Desde {formatDateString(activeVac.startDate)} Hasta {formatDateString(activeVac.endDate)}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </InfoModal>
      )}
    </div>
  );
}
