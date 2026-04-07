import { useState, useEffect, useMemo, useRef } from "react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addMonths, subMonths, isSameMonth, isSameDay, parseISO, isFuture, isToday, isBefore, isAfter, getDate, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { activityLogTypesAPI, RequestConfig } from "../../../../api/requestConfig";

import { activityReportsAPI, ActivityReport } from "../../../../api/request";
import { usersAPI } from "../../../../api/users";
import { projectsAPI, Project } from "../../../../api/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faArrowLeft, faPlus, faTimes, faTrash, faCalendar, faUserTie, faLayerGroup, faBriefcase, faInfoCircle, faClock, faCheck, faChevronRight, faChevronLeft, faFileText, faUserPlus, faUserSlash, faSearch, faFilter } from "@fortawesome/free-solid-svg-icons";
import { useProfile } from "../hooks/useProfile";
import { ViewType } from "../types";
import { sweetAlert } from "../utils/sweetAlert";
import { Modal } from "../components/Modal";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";

interface EmployeeOption {
  id: string;
  name: string;
  projectIds: string[];
  role?: string;
  roles?: { name: string }[];
  positionName?: string;
  isActive?: boolean;
  hasActiveContract?: boolean;
  metadataProjects?: Array<{ projectId: string; roleFrame: string; hasActiveContract: boolean; contractStartTime?: string; contractEndTime?: string }>;
}

interface LocalAttendanceRecord {
  tempId: string;
  employeeId: string;
  employeeName: string;
  typeId: string;
  typeName: string;
  replacementId?: string;
  replacementName?: string;
  overtimeHours?: number;
  replacementOvertimeHours?: number;
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
  replacementOvertimeHours?: number;
  replacementInTime?: string;
  replacementOutTime?: string;
  outTime?: string;
  inTime?: string; // Added inTime
  notes?: string;
}

interface ActivityLogsProps {
  onNavigate: (view: ViewType) => void;
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
    const projMeta = employee.metadataProjects.find((m) => m.projectId === project._id);
    if (projMeta && projMeta.contractEndTime) {
      return projMeta.contractEndTime;
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
    const projMeta = employee.metadataProjects.find((m) => m.projectId === project._id);
    if (projMeta && projMeta.contractStartTime) {
      return projMeta.contractStartTime;
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
  let totalMins = (eH * 60 + eM) - (sH * 60 + sM);
  if (totalMins < 0) totalMins += 24 * 60;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  if (h === 0 && m === 0) return "0h";
  return `${h > 0 ? h + 'h' : ''} ${m > 0 ? m + 'm' : ''}`.trim();
};
const TIME_OPTIONS = (() => {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
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

export default function ActivityLogs({ onNavigate }: ActivityLogsProps) {
  const [showForm, setShowForm] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewingReport, setViewingReport] = useState<ActivityReport | null>(null);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [activeProjectTab, setActiveProjectTab] = useState<"info" | "schedule" | "team">("info");
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Form State
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
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
  const [draftReplacementOvertimeHours, setDraftReplacementOvertimeHours] = useState<number>(0);
  const [draftReplacementInTime, setDraftReplacementInTime] = useState<string>("");
  const [draftReplacementOutTime, setDraftReplacementOutTime] = useState<string>("");
  const [draftOutTime, setDraftOutTime] = useState<string>("");
  const [draftInTime, setDraftInTime] = useState<string>("");
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

  // Replacement Modal State
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [replacementSearchTerm, setReplacementSearchTerm] = useState("");

  const [replacementTargetEmpId, setReplacementTargetEmpId] = useState<string | null>(null); // For wizard mode, null for fast entry mode

  const [logTypes, setLogTypes] = useState<RequestConfig[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [allProjectsCache, setAllProjectsCache] = useState<Project[]>([]);
  const [reports, setReports] = useState<ActivityReport[]>([]);

  // Calendar State
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());

  // Role Filtering State
  const [selectedRoleFilters, setSelectedRoleFilters] = useState<string[]>([]);
  const [isRoleFilterModalOpen, setIsRoleFilterModalOpen] = useState(false);

  const [selectedReplacementRoleFilters, setSelectedReplacementRoleFilters] = useState<string[]>([]);
  const [isReplacementRoleFilterModalOpen, setIsReplacementRoleFilterModalOpen] = useState(false);

  const formScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoadingData(true);
    try {
      // 1. Fetch Types
      const types = await activityLogTypesAPI.getAll();
      const activeTypes = types.filter((t) => t.isActive);
      setLogTypes(activeTypes);

      // 2. Fetch Employees
      try {
        const users = await usersAPI.getDirectory();
        setEmployees(
          users.map((u) => ({
            id: u._id,
            name: `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
            projectIds: u.projectIds?.map((p) => p._id) || [],
            role: u.role,
            roles: u.roles,
            positionName: typeof u.positionId === "object" ? u.positionId.name : undefined,
            isActive: u.isActive,
            hasActiveContract: !!u.metadata?.projects?.some((p) =>
              p.contracts?.some((c) => {
                if (!c.fecha_baja_contrato) return true;
                const endDate = new Date(c.fecha_baja_contrato);
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return endDate >= today;
              }),
            ),
            metadataProjects:
              u.metadata?.projects?.map((p: any) => {
                const pId = typeof p.projectId === "string" ? p.projectId : p.projectId?._id;

                let activeContract = undefined;
                const hasActive =
                  p.contracts?.some((c: any) => {
                    if (!c.fecha_baja_contrato) {
                      if (!activeContract) activeContract = c;
                      return true;
                    }
                    const endDate = new Date(c.fecha_baja_contrato);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const isActive = endDate >= today;
                    if (isActive && !activeContract) activeContract = c;
                    return isActive;
                  }) ?? false;

                return {
                  projectId: pId,
                  roleFrame: p.nombre_rol_frame,
                  hasActiveContract: hasActive,
                  contractStartTime: activeContract?.hora_inicio || undefined,
                  contractEndTime: activeContract?.hora_fin || undefined,
                };
              }) || [],
          })),
        );
      } catch (e) {
        console.error("Error loading users", e);
      }

      // 3. Fetch Projects
      try {
        const allProjects = await projectsAPI.listAll();
        setAllProjectsCache(allProjects);
      } catch (e) {
        console.error("Error loading projects", e);
      }

      fetchReports();
    } finally {
      setIsLoadingData(false);
    }
  };

  const fetchReports = async () => {
    try {
      const data = await activityReportsAPI.getAll();
      // Filter for mobile view? Or show all allowed?
      // Default API shows own reports for non-admin.
      setReports(data);
    } catch (e) {
      console.error("Error loading reports", e);
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
  const handleViewReport = (report: ActivityReport) => {
    setViewingReport(report);
    setShowDetailModal(true);
  };

  const { profile, stats } = useProfile();

  const userProjects = useMemo(() => {
    if (!profile || allProjectsCache.length === 0) return [];

    // Admin / Coordinador o usuario normal con projectos asignados
    const myProjects = profile.projectIds && profile.projectIds.length > 0 ? allProjectsCache.filter((p) => profile.projectIds?.includes(p._id)) : [];

    // Si no tiene proyectos asignados, pero es admin, en mobile mostramos todos por si acaso (o respetamos la regla original)
    // Para respetar estrictamente la regla original, dejamos la línea anterior.
    // Aunque, para que el componente no falle nunca si el endpoint no trajo projectIds:
    return myProjects;
  }, [profile, allProjectsCache]);

  const selectedProject = useMemo(() => userProjects.find((p) => p._id === selectedProjectId), [userProjects, selectedProjectId]);
  const projectEmployees = useMemo(() => {
    if (!selectedProjectId) return [];
    return employees.filter((e) => {
      if (!e.projectIds || !e.projectIds.includes(selectedProjectId)) return false;
      const projMeta = e.metadataProjects?.find((m) => m.projectId === selectedProjectId);
      return projMeta ? projMeta.hasActiveContract : false; // Only show personnel with active contracts for this project
    });
  }, [employees, selectedProjectId]);

  const isWorkDay = useMemo(() => {
    if (!selectedProject) return true;

    // Check reporting frequency config first
    const schedule = selectedProject.activityLogConfig?.schedule;
    if (schedule && schedule.days) {
      const [year, month, day] = reportDate.split("-").map(Number);
      const date = new Date(year, month - 1, day);
      const dayIndex = date.getDay(); // 0 is Sunday, 6 is Saturday
      return schedule.days.includes(dayIndex);
    }

    // If no explicit frequency schedule is set for activity logs, fallback to allowing it
    // because the default configuration UI assumes "Todos los días (Lunes a Domingo)".
    return true;
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

        setDraftOvertimeHours(parseFloat(totalOvertime.toFixed(2)));
      }
    }
  }, [draftOutTime, draftInTime, draftTypeId, selectedProjectId, reportDate, userProjects, logTypes, selectedEmployee]);

  // Fast-entry REPLACEMENT OT calculation
  useEffect(() => {
    if (draftReplacementId && draftTypeId && selectedProjectId) {
      const project = userProjects.find((p) => p._id === selectedProjectId);
      if (project) {
        const endTime = getEmployeeEndTime(project, draftReplacementId, reportDate);
        const startTime = getEmployeeStartTime(project, draftReplacementId, reportDate);

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
        setDraftReplacementOvertimeHours(parseFloat(totalOvertime.toFixed(2)));
      }
    }
  }, [draftReplacementOutTime, draftReplacementInTime, draftReplacementId, draftTypeId, selectedProjectId, reportDate, userProjects]);

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
      // Only update if it's different to avoid infinite loops
      if (finalVal !== data.overtimeHours) {
        updateWizardEntry(currentEmp.id, { overtimeHours: finalVal });
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
      if (finalVal !== data.replacementOvertimeHours) {
        updateWizardEntry(currentEmp.id, { replacementOvertimeHours: finalVal });
      }
    }
  }, [wizardIndex, wizardData, selectedProject, reportDate]);

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

  // Get employees NOT assigned to the current project (for additional staff selection)
  const nonProjectEmployees = useMemo(() => {
    if (!selectedProjectId) return [];
    return employees.filter((e) => !e.projectIds || !e.projectIds.includes(selectedProjectId));
  }, [employees, selectedProjectId]);

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
      replacementOvertimeHours: draftReplacementOvertimeHours || undefined,
      outTime: type.name.toLowerCase().includes("horas extra") ? draftOutTime : undefined,
      inTime: type.name.toLowerCase().includes("horas extra") ? draftInTime : undefined,
      replacementInTime: draftReplacementInTime || undefined,
      replacementOutTime: draftReplacementOutTime || undefined,
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
    setDraftReplacementOvertimeHours(0);
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

  const isProjectWorkDay = (day: Date) => {
    const project = userProjects.find((p) => p._id === selectedProjectId);
    if (!project) return false;

    const dateStr = format(day, "yyyy-MM-dd");

    // Project Duration Check
    if (project.startDate) {
      // Parse explicitly as local date YYYY-MM-DD
      const [y, m, d] = project.startDate.split("T")[0].split("-").map(Number);
      const pStart = startOfDay(new Date(y, m - 1, d));
      if (isBefore(day, pStart)) return false;
    }
    if (project.endDate) {
      const [y, m, d] = project.endDate.split("T")[0].split("-").map(Number);
      const pEnd = startOfDay(new Date(y, m - 1, d));
      // Use endOfDay logic or just compare?
      // If today is 2026-01-31 and end is 2026-01-31, isAfter should handle it if we compare timestamps.
      // Actually, if project ends at 2026-01-31, "day" (which represents 00:00 of that day) is NOT after.
      // If day is 31st (00:00) and pEnd is 31st (00:00), isAfter is false. OK.
      // If day is Feb 1st (00:00) and pEnd is 31st (00:00), isAfter is true. OK.
      if (isAfter(day, pEnd)) return false;
    }

    // Work Schedule Check based on reporting frequency config
    const schedule = project.activityLogConfig?.schedule;
    if (schedule && schedule.days) {
      const dayIndex = day.getDay();
      return schedule.days.includes(dayIndex);
    }

    // Fallback logic
    return getProjectEndTime(project, dateStr) !== "";
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

    // Debug: log values to verify additional staff logic
    console.log("[DEBUG] Additional Staff Check:", {
      allowsAdditionalStaff,
      nonProjectEmployeesCount: nonProjectEmployees.length,
      selectedProjectConfig: selectedProject?.activityLogConfig,
      shouldShowModal: allowsAdditionalStaff && nonProjectEmployees.length > 0,
    });

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

    // Debug: log values to verify additional staff logic (Fast Entry mode)
    console.log("[DEBUG] Additional Staff Check (Fast Entry):", {
      allowsAdditionalStaff,
      nonProjectEmployeesCount: nonProjectEmployees.length,
      selectedProjectConfig: selectedProject?.activityLogConfig,
      shouldShowModal: allowsAdditionalStaff && nonProjectEmployees.length > 0,
    });

    // If project allows additional staff, show additional staff modal first
    if (allowsAdditionalStaff && nonProjectEmployees.length > 0) {
      setShowAdditionalStaffModal(true);
    } else {
      setShowSummaryModal(true);
    }
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);

    try {
      const attendance = [];

      const proj = userProjects.find((p) => p._id === selectedProjectId);

      // Iterate over ALL employees to ensure we save their schedule snapshot
      for (const emp of employees) {
        if (!emp.projectIds || !emp.projectIds.includes(selectedProjectId)) continue;

        // Try to find if we have a specific entry (anomaly/overtime)
        const entry = entries.find((e) => e.employeeId === emp.id);

        // Calculate schedule times for THIS day
        const schedIn = proj ? getEmployeeStartTime(proj, emp.id, reportDate) : undefined;
        const schedOut = proj ? getEmployeeEndTime(proj, emp.id, reportDate) : undefined;

        if (entry) {
          // It's an anomaly or overtime
          attendance.push({
            employeeId: entry.employeeId,
            status: entry.typeName.toLowerCase().includes("horas extra") ? "present" : "absent",
            absenceReason: entry.typeName.toLowerCase().includes("horas extra") ? undefined : entry.typeName,
            replacementId: entry.replacementId,
            overtimeHours: entry.overtimeHours,
            replacementOvertimeHours: entry.replacementOvertimeHours,
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
              scheduleInTime: schedIn,
              scheduleOutTime: schedOut,
              // No inTime/outTime for standard present unless we want to copy schedule?
              // User asked for "Entrada y Salida" to store "horario del proyecto".
              // So saving it in scheduleInTime is correct.
            });
          }
        }
      }

      const payload = {
        date: reportDate,
        hasActivity: !!hasActivity, // Keeps the flag true if there were anomalies, false if "No News"
        comments,
        attendance,
        projectId: selectedProjectId || undefined,
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
            replacementOvertimeHours: att.replacementOvertimeHours,
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

  return (
    <div className="flex-1 pb-24">
      <div className="sticky top-0 border-b border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 py-4 z-30">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            </button>
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <FontAwesomeIcon icon={faCalendar} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Mis Novedades</h1>
              </div>
            </div>
          </div>
        </div>
      </div>

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

                          {/* Date - Moved Below Project */}
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha del Reporte</label>
                            <div onClick={() => selectedProjectId && setCalendarOpen(true)} className={`relative w-full px-4 py-2 border rounded flex items-center justify-between transition-colors ${!selectedProjectId ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 cursor-not-allowed opacity-60" : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 hover:border-gray-400 dark:hover:border-gray-500"}`}>
                              <span className={`text-sm ${!reportDate ? "text-gray-400" : "text-gray-900 dark:text-white"}`}>{reportDate ? new Date(reportDate + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "Seleccionar fecha"}</span>
                              <FontAwesomeIcon icon={faCalendar} className="text-gray-400" />
                            </div>
                            {!selectedProjectId && <p className="text-xs text-orange-500 mt-1">Selecciona un proyecto primero</p>}
                          </div>
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
                                  const isProjectDay = isProjectWorkDay(day);

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
                                    // Valid Project Day
                                    textClass = "text-blue-600 dark:text-blue-400 font-semibold";
                                  }

                                  if (isReported) {
                                    bgClass = "bg-red-50 dark:bg-red-900/20";
                                    textClass = "text-red-400 dark:text-red-400 line-through decoration-red-400/50";
                                    cursorClass = "cursor-not-allowed opacity-70";
                                    borderClass = "border border-red-100 dark:border-red-900/30";
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
                                  const isDisabled = isFutureDate || isReported || !isProjectDay || (!isCurrentMonth && !isSelected);

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
                                        {isReported && <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-red-500"></div>}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400">
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-red-500/50"></span>
                                <span>Reporte existente</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                                <span>Días Proyecto</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sticky Project Info Bar - Moved below select as requested */}
                    {selectedProject && (
                      <div id="sticky-project-header" className="px-4 py-3 bg-slate-900/95 dark:bg-slate-900 border-b border-slate-800 backdrop-blur-md flex items-center gap-3 sticky -mx-4 top-[-20px] z-30 flex-shrink-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded bg-blue-500/10 text-blue-500">
                          <FontAwesomeIcon icon={faBriefcase} className="text-lg" />
                        </div>
                        <div className="flex items-center gap-2 flex-1 overflow-hidden">
                          <h3 className="text-lg sm:text-xl font-bold text-white truncate flex items-center gap-2 mb-0 leading-tight">
                            <span className="shrink-0">{typeof selectedProject.clientId === "object" && selectedProject.clientId.name ? selectedProject.clientId.name : "Cliente"}</span>
                            <span className="font-extrabold mx-1">|</span>
                            <span className="truncate">{selectedProject.name}</span>
                            <button type="button" onClick={() => setShowProjectInfo(true)} className="ml-auto text-slate-400 hover:text-white transition-colors p-1" title="Más información">
                              <FontAwesomeIcon icon={faInfoCircle} className="text-sm" />
                            </button>
                          </h3>
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
                              <div className="text-center p-4 bg-gray-50 dark:bg-blue-600/10 rounded border border-blue-600 dark:border-blue-600">
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
                                          <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <div className="w-8 h-8 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm">{currentEmp.name.charAt(0)}</div>
                                            {currentEmp.name}
                                          </h3>
                                          <div className="flex items-center gap-2 mt-1 ml-10">
                                            <span className="text-xs text-slate-500 dark:text-gray-400">{currentEmp.positionName || "Colaborador"}</span>
                                            {(() => {
                                              const roleFrame = currentEmp.metadataProjects?.find((m) => m.projectId === selectedProjectId)?.roleFrame;
                                              return roleFrame ? <span className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-indigo-900/30 dark:text-indigo-400 tracking-wider">{roleFrame}</span> : null;
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
                                                  setTimeout(() => {
                                                    const otContainer = document.querySelector(".ot-container-row");
                                                    if (otContainer) {
                                                      otContainer.scrollIntoView({ behavior: "smooth", block: "start" });
                                                    }
                                                  }, 100);
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
                                                      setTimeout(() => {
                                                        const otDetails = document.querySelector(".ot-details-row");
                                                        if (otDetails) {
                                                          otDetails.scrollIntoView({ behavior: "smooth", block: "start" });
                                                        }
                                                      }, 100);
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
                                                    {data.overtimeHours > 0 ? `${data.overtimeHours} Horas Extras` : "Configurar Horas Extras"}
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
                                                    <div className="font-bold text-slate-900 dark:text-white text-sm">{histEmp.name}</div>
                                                    <div className={`text-xs font-medium ${histIsPresent ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>{histIsPresent ? (histData?.overtimeHours ? `Presente + ${histData.overtimeHours}h Extra` : "Presente") : `${histType?.name || "Ausente"}${repString}`}</div>
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
                                                  const projMeta = e.metadataProjects?.find((m) => m.projectId === selectedProjectId);
                                                  return projMeta ? projMeta.hasActiveContract : false;
                                                })
                                              : [];
                                            const availableEmployees = filteredByProject.filter((e) => !entries.find((entry) => entry.employeeId === e.id));

                                            let results = availableEmployees;

                                            // Handle Role Filter
                                            if (selectedRoleFilters.length > 0) {
                                              results = results.filter((e) => {
                                                const roleFrame = e.metadataProjects?.find((m) => m.projectId === selectedProjectId)?.roleFrame;
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
                                                      const projMeta = e.metadataProjects?.find((m) => m.projectId === selectedProjectId);
                                                      return projMeta ? projMeta.hasActiveContract : false;
                                                    })
                                                  : [];
                                                // Exclude already added employees
                                                const availableEmployees = filteredByProject.filter((e) => !entries.find((entry) => entry.employeeId === e.id));

                                                let results = availableEmployees;

                                                // Role Filtering
                                                if (selectedRoleFilters.length > 0) {
                                                  results = results.filter((e) => {
                                                    const roleFrame = e.metadataProjects?.find((m) => m.projectId === selectedProjectId)?.roleFrame;
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
                                                        <div className="flex items-center gap-2">
                                                          <div className="font-medium text-slate-800 dark:text-white truncate">{emp.name}</div>
                                                          {(() => {
                                                            const roleFrame = emp.metadataProjects?.find((m) => m.projectId === selectedProjectId)?.roleFrame;
                                                            return roleFrame ? <span className="shrink-0 bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-indigo-900/30 dark:text-indigo-400 tracking-wider whitespace-nowrap">{roleFrame}</span> : null;
                                                          })()}
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
                                                    const role = e.metadataProjects?.find((m) => m.projectId === selectedProjectId)?.roleFrame;
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
                                          <h3 className="font-bold text-slate-800 dark:text-white text-lg">{selectedEmployee.name}</h3>
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
                                              setTimeout(() => {
                                                const otContainer = document.querySelector(".ot-container-row");
                                                if (otContainer) {
                                                  otContainer.scrollIntoView({ behavior: "smooth", block: "start" });
                                                }
                                              }, 100);
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
                                                  setTimeout(() => {
                                                    const otDetails = document.querySelector(".ot-details-row-fast");
                                                    if (otDetails) {
                                                      otDetails.scrollIntoView({ behavior: "smooth", block: "start" });
                                                    }
                                                  }, 100);
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
                                                  {draftOvertimeHours > 0 ? `${draftOvertimeHours} Horas Extras` : "Configurar Horas Extras"}
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
                                    <div>
                                      <div className="font-bold text-slate-900 dark:text-white text-sm">{entry.employeeName}</div>
                                      <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                        {entry.typeName} {entry.overtimeHours ? `(${entry.overtimeHours} h)` : ""}
                                      </div>
                                      {entry.replacementName && (
                                        <div className="text-xs text-slate-500">
                                          Reemplazo: {entry.replacementName} {entry.replacementOvertimeHours ? `(+${entry.replacementOvertimeHours}h)` : ""}
                                        </div>
                                      )}
                                    </div>
                                    <button onClick={() => handleRemoveRecord(entry.tempId)} className="text-red-500 hover:text-red-700 p-2">
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
                      <button onClick={startWizard} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold shadow-md transition-all active:scale-95 text-sm md:text-base">
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

        <h3 className="text-lg font-bold mb-4">Historial de Novedades</h3>

        {/* List of Reports */}
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report._id} onClick={() => handleViewReport(report)} className="bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm cursor-pointer opacity-80 hover:opacity-100 transition-opacity">
              <div className="flex justify-between items-start mb-2">
                <span className="inline-block px-2 py-0.5 text-[12px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">{report.reportNumber || `#${report._id.slice(-6).toUpperCase()}`}</span>
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
              <div className="text-sm text-slate-500 mb-3">{new Date(report.date + "T00:00:00").toLocaleDateString()}</div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {(() => {
                    if (!report.hasActivity) return "Sin novedades";

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
          ))}
          {reports.length === 0 && <div className="text-center text-gray-500 py-8">No has enviado novedades recientes.</div>}
        </div>
      </div>

      {/* Overtime Configuration Modal */}
      <Modal isOpen={activeOvertimeModal !== null} onClose={() => setActiveOvertimeModal(null)} title="Configurar Horas Extras">
        {activeOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]
          ? (() => {
              const currentEmp = projectEmployees[wizardIndex];
              const data = wizardData[currentEmp.id];
              return (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col gap-1 items-center pb-3 border-b border-slate-100 dark:border-slate-700">
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
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400" value={data?.overtimeHours || 0} onChange={(e) => updateWizardEntry(currentEmp.id, { overtimeHours: parseFloat(e.target.value) })} />
                    </div>
                    <p className="text-[10px] text-slate-400 italic mt-1">Este valor se puede ajustar manualmente.</p>
                  </div>
                </div>
              );
            })()
          : activeOvertimeModal === "fast-entry" && selectedEmployee
            ? (() => {
                return (
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col gap-1 items-center pb-3 border-b border-slate-100 dark:border-slate-700">
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
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras</label>
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all font-bold text-blue-600 dark:text-blue-400" value={draftOvertimeHours} onChange={(e) => setDraftOvertimeHours(parseFloat(e.target.value))} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 italic">Este valor se calcula automáticamente, pero puedes ajustarlo si es necesario.</p>
                    </div>
                  </div>
                );
              })()
            : null}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          <button onClick={() => setActiveOvertimeModal(null)} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition-colors shadow-sm">
            Listo
          </button>
        </div>
      </Modal>

      {/* Replacement Overtime Configuration Modal */}
      <Modal isOpen={activeReplacementOvertimeModal !== null} onClose={() => setActiveReplacementOvertimeModal(null)} title="Configurar Horas Extras" zIndex={60}>
        {activeReplacementOvertimeModal === "wizard" && wizardIndex >= 0 && projectEmployees[wizardIndex]
          ? (() => {
              const currentEmp = projectEmployees[wizardIndex];
              const data = wizardData[currentEmp.id];
              if (!data?.replacementId) return null;
              return (
                <div className="space-y-4 pt-2">
                  <div className="flex flex-col gap-1 items-center pb-3 border-b border-slate-100 dark:border-slate-700">
                    <div className="grid grid-cols-2 gap-4 w-full">
                      <div className="text-center">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entrada Contrato</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {(() => {
                            const proj = userProjects.find((p) => p._id === selectedProjectId);
                            return proj ? formatToAMPM(getEmployeeStartTime(proj, data.replacementId, reportDate)) : "—";
                          })()}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Salida Contrato</span>
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                          {(() => {
                            const proj = userProjects.find((p) => p._id === selectedProjectId);
                            return proj ? formatToAMPM(getEmployeeEndTime(proj, data.replacementId, reportDate)) : "—";
                          })()}
                        </span>
                      </div>
                    </div>
                    {(() => {
                      const proj = userProjects.find((p) => p._id === selectedProjectId);
                      if (!proj) return null;
                      const sT = getEmployeeStartTime(proj, data.replacementId, reportDate);
                      const eT = getEmployeeEndTime(proj, data.replacementId, reportDate);
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
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 font-bold text-blue-600 dark:text-blue-400" value={data?.replacementOvertimeHours || 0} onChange={(e) => updateWizardEntry(currentEmp.id, { replacementOvertimeHours: parseFloat(e.target.value) })} />
                    </div>
                    <p className="text-[10px] text-slate-400 italic mt-1">Este valor se puede ajustar manualmente.</p>
                  </div>
                </div>
              );
            })()
          : activeReplacementOvertimeModal === "fast-entry" && draftReplacementId
            ? (() => {
                return (
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col gap-1 items-center pb-3 border-b border-slate-100 dark:border-slate-700">
                      <div className="grid grid-cols-2 gap-4 w-full">
                        <div className="text-center">
                          <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Entrada Contrato</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {(() => {
                              const proj = userProjects.find((p) => p._id === selectedProjectId);
                              return proj ? formatToAMPM(getEmployeeStartTime(proj, draftReplacementId, reportDate)) : "—";
                            })()}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="block text-[10px] text-slate-400 uppercase tracking-widest mb-1">Salida Contrato</span>
                          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {(() => {
                              const proj = userProjects.find((p) => p._id === selectedProjectId);
                              return proj ? formatToAMPM(getEmployeeEndTime(proj, draftReplacementId, reportDate)) : "—";
                            })()}
                          </span>
                        </div>
                      </div>
                      {(() => {
                        const proj = userProjects.find((p) => p._id === selectedProjectId);
                        if (!proj) return null;
                        const sT = getEmployeeStartTime(proj, draftReplacementId, reportDate);
                        const eT = getEmployeeEndTime(proj, draftReplacementId, reportDate);
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
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras</label>
                      <div className="flex gap-2 items-center">
                        <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all font-bold text-blue-600 dark:text-blue-400" value={draftReplacementOvertimeHours} onChange={(e) => setDraftReplacementOvertimeHours(parseFloat(e.target.value))} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 italic">Este valor se calcula automáticamente, pero puedes ajustarlo si es necesario.</p>
                    </div>
                  </div>
                );
              })()
            : null}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          <button onClick={() => setActiveReplacementOvertimeModal(null)} className="px-6 py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 transition-colors shadow-sm">
            Listo
          </button>
        </div>
      </Modal>

      {/* Absence Configuration Modal */}
      <Modal isOpen={activeAbsenceModal !== null} onClose={() => setActiveAbsenceModal(null)} title="Configurar Ausencia">
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
                                if (!data.replacementOvertimeHours) {
                                  updates.replacementOvertimeHours = 0;
                                }
                                if (!data.replacementInTime || !data.replacementOutTime) {
                                  const proj = userProjects.find((p) => p._id === selectedProjectId);
                                  if (proj && data.replacementId) {
                                    if (!data.replacementInTime) {
                                      const st = getEmployeeStartTime(proj, data.replacementId, reportDate);
                                      if (st) updates.replacementInTime = st;
                                    }
                                    if (!data.replacementOutTime) {
                                      const et = getEmployeeEndTime(proj, data.replacementId, reportDate);
                                      if (et) updates.replacementOutTime = et;
                                    }
                                  }
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
                                  const updates: Partial<WizardEntry> = {};
                                  if (!data.replacementOvertimeHours) {
                                    updates.replacementOvertimeHours = 0;
                                  }
                                  if (!data.replacementInTime || !data.replacementOutTime) {
                                    const proj = userProjects.find((p) => p._id === selectedProjectId);
                                    if (proj && data.replacementId) {
                                      if (!data.replacementInTime) {
                                        const st = getEmployeeStartTime(proj, data.replacementId, reportDate);
                                        if (st) updates.replacementInTime = st;
                                      }
                                      if (!data.replacementOutTime) {
                                        const et = getEmployeeEndTime(proj, data.replacementId, reportDate);
                                        if (et) updates.replacementOutTime = et;
                                      }
                                    }
                                  }
                                  if (Object.keys(updates).length > 0) {
                                    updateWizardEntry(currentEmp.id, updates);
                                  }
                                  setActiveReplacementOvertimeModal("wizard");
                                }}
                                className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center w-full gap-2 p-2 border border-blue-200 dark:border-blue-900 rounded bg-blue-50 dark:bg-blue-900/10"
                              >
                                <FontAwesomeIcon icon={faClock} />
                                {data.replacementOvertimeHours > 0 ? `${data.replacementOvertimeHours} Horas Extras` : "Configurar Horas Extras"}
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
                                  if (!draftReplacementOvertimeHours) {
                                    setDraftReplacementOvertimeHours(0);
                                  }
                                  if (!draftReplacementInTime || !draftReplacementOutTime) {
                                    const proj = userProjects.find((p) => p._id === selectedProjectId);
                                    if (proj && draftReplacementId) {
                                      if (!draftReplacementInTime) {
                                        const st = getEmployeeStartTime(proj, draftReplacementId, reportDate);
                                        if (st) setDraftReplacementInTime(st);
                                      }
                                      if (!draftReplacementOutTime) {
                                        const et = getEmployeeEndTime(proj, draftReplacementId, reportDate);
                                        if (et) setDraftReplacementOutTime(et);
                                      }
                                    }
                                  }
                                  setActiveReplacementOvertimeModal("fast-entry");
                                }}
                                className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${draftReplacementOvertimeHours !== undefined && draftReplacementOvertimeHours !== null && draftReplacementOvertimeHours !== 0 ? "bg-blue-600 border-blue-600 text-white shadow-md dark:shadow-blue-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                              >
                                SÍ
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDraftReplacementOvertimeHours(0);
                                  setDraftReplacementInTime("");
                                  setDraftReplacementOutTime("");
                                }}
                                className={`flex-1 py-1.5 rounded font-bold text-base md:text-lg transition-all shadow-sm border ${!draftReplacementOvertimeHours ? "bg-slate-500 border-slate-500 text-white shadow-md dark:shadow-slate-900/20" : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                              >
                                NO
                              </button>
                            </div>
                            {draftReplacementOvertimeHours > 0 && (
                              <div className="pt-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!draftReplacementInTime || !draftReplacementOutTime) {
                                      const proj = userProjects.find((p) => p._id === selectedProjectId);
                                      if (proj && draftReplacementId) {
                                        if (!draftReplacementInTime) {
                                          const st = getEmployeeStartTime(proj, draftReplacementId, reportDate);
                                          if (st) setDraftReplacementInTime(st);
                                        }
                                        if (!draftReplacementOutTime) {
                                          const et = getEmployeeEndTime(proj, draftReplacementId, reportDate);
                                          if (et) setDraftReplacementOutTime(et);
                                        }
                                      }
                                    }
                                    setActiveReplacementOvertimeModal("fast-entry");
                                  }}
                                  className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center justify-center w-full gap-2 p-2 border border-blue-200 dark:border-blue-900 rounded bg-blue-50 dark:bg-blue-900/10"
                                >
                                  <FontAwesomeIcon icon={faClock} />
                                  {draftReplacementOvertimeHours > 0 ? `${draftReplacementOvertimeHours} Horas Extras` : "Configurar Horas Extras"}
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
          </div>

          {hasActivity ? (
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-900 dark:text-white border-b pb-1 dark:border-gray-700">Resumen de Asistencia</h4>
              <div className="max-h-50 overflow-y-auto text-sm space-y-2">
                {entries.length > 0 ? (
                  entries.map((entry) => (
                    <div key={entry.tempId} className="flex flex-col pb-2 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0">
                      <span className="font-semibold text-gray-800 dark:text-white">{entry.employeeName}</span>
                      <span className="text-xs text-blue-600 dark:text-blue-400">
                        {entry.typeName} {entry.overtimeHours ? `(${entry.overtimeHours}h)` : ""}
                      </span>
                      {entry.replacementName && (
                        <span className="text-xs text-gray-500">
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
                  <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full text-[10px]">{employees.filter((e) => e.projectIds && e.projectIds.includes(selectedProjectId)).length}</span>
                </h4>
                <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
                  {employees
                    .filter((e) => e.projectIds && e.projectIds.includes(selectedProjectId))
                    .map((emp) => (
                      <div key={emp.id} className="flex justify-between items-center p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded transition-colors group">
                        <span className="font-medium text-gray-700 dark:text-slate-200 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{emp.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 uppercase tracking-wide border border-blue-200 dark:border-blue-900/50">Presente</span>
                      </div>
                    ))}
                  {employees.filter((e) => e.projectIds && e.projectIds.includes(selectedProjectId)).length === 0 && <p className="text-sm text-gray-500 italic text-center py-4">No hay colaboradores asignados a este proyecto.</p>}
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
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title="Detalle del Reporte">
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

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-900 dark:text-white border-b pb-1 dark:border-gray-700">Novedades: {viewingReport.hasActivity ? "SÍ" : "NO"}</h4>
              <div className="max-h-50 overflow-y-auto text-sm space-y-2 mt-2">
                {viewingReport.attendance.map((entry, idx) => {
                  const empName = typeof entry.employeeId === "object" ? `${entry.employeeId.firstName} ${entry.employeeId.lastName}` : "Empleado";
                  // Fallback for type name reconstruction if needed or use absenceReason directly
                  const reason = entry.absenceReason || (entry.overtimeHours ? "Horas Extra" : "Presente");
                  const repName = entry.replacementId ? (typeof entry.replacementId === "object" ? `${entry.replacementId.firstName} ${entry.replacementId.lastName}` : "Reemplazo") : null;

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

            <div className="flex gap-3 pt-4">
              <button onClick={() => setShowDetailModal(false)} className="flex-1 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 transition-colors text-sm">
                Cerrar
              </button>
              <button onClick={handleEditFromDetail} className="flex-1 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors text-sm">
                Editar
              </button>
            </div>
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
                        positionName: emp ? emp.positionName : typeof user === "object" ? (typeof user.positionId === "object" ? user.positionId.name : undefined) : undefined,
                        roles: emp ? emp.roles : typeof user === "object" ? user.roles : [],
                        firstName: emp ? emp.name.split(" ")[0] : typeof user === "object" ? user.firstName : "",
                        lastName: emp ? emp.name.split(" ").slice(1).join(" ") : typeof user === "object" ? user.lastName : "",
                      };
                    });

                    const checkIsCoordinator = (u: any) => u.positionName?.toLowerCase().includes("coordinador") || u.roles?.some((r: any) => r.name.toLowerCase().includes("coordinador")) || u.firstName?.toLowerCase().includes("coordinador") || u.lastName?.toLowerCase().includes("coordinador");

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
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{u.name}</p>
                                  <p className="text-[10px] text-slate-400 font-medium truncate uppercase tracking-tighter">{u.positionName || (title === "COORDINADORES" ? "COORDINADOR" : "COLABORADOR")}</p>
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
                        {renderUserList(coordinators, "COORDINADORES", faUserTie)}
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
                      <div className="font-bold text-slate-700 dark:text-slate-200 text-sm">{emp.name}</div>
                      <div className={`text-xs font-medium ${isPresent ? (isOvertime ? "text-blue-600" : "text-blue-600") : "text-red-500"}`}>{typeName}</div>
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
        title={`Seleccionar Reemplazo (${(() => {
          const filteredByProject = selectedProjectId
            ? employees.filter((e) => {
                if (!e.projectIds?.includes(selectedProjectId)) return false;
                const projMeta = e.metadataProjects?.find((m) => m.projectId === selectedProjectId);
                return projMeta ? projMeta.hasActiveContract : false;
              })
            : [];
          const availableEmployees = filteredByProject.filter((e) => (replacementTargetEmpId !== null ? e.id !== replacementTargetEmpId : selectedEmployee ? e.id !== selectedEmployee.id : true));

          let results = availableEmployees;

          // Role Filtering
          if (selectedReplacementRoleFilters.length > 0) {
            results = results.filter((e) => {
              const roleFrame = e.metadataProjects?.find((m) => m.projectId === selectedProjectId)?.roleFrame;
              return roleFrame && selectedReplacementRoleFilters.includes(roleFrame);
            });
          }

          // Search filtering
          if (replacementSearchTerm) {
            results = results.filter((e) => e.name.toLowerCase().includes(replacementSearchTerm.toLowerCase()));
          }

          return results.length;
        })()})`}
        size="md"
      >
        <div className="flex flex-col h-[60vh]">
          {/* Search Input and Filter Button inside Modal */}
          <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-slate-900 sticky top-0 z-10 flex flex-col gap-2">
            {/* Active Filter Badges */}
            {selectedReplacementRoleFilters.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-1">
                {selectedReplacementRoleFilters.map((role) => (
                  <span key={role} className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-[10px] font-bold border border-blue-200 dark:border-blue-800">
                    {role}
                    <button onClick={() => setSelectedReplacementRoleFilters((prev) => prev.filter((r) => r !== role))} className="hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                    </button>
                  </span>
                ))}
                <button onClick={() => setSelectedReplacementRoleFilters([])} className="text-[10px] text-gray-500 hover:underline px-1">
                  Limpiar
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
                  ${selectedReplacementRoleFilters.length > 0 ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400" : "bg-white border-gray-300 text-gray-700 dark:bg-slate-800 dark:border-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700"}`}
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
                    const projMeta = e.metadataProjects?.find((m) => m.projectId === selectedProjectId);
                    return projMeta ? projMeta.hasActiveContract : false;
                  })
                : [];
              const availableEmployees = filteredByProject.filter((e) => (replacementTargetEmpId !== null ? e.id !== replacementTargetEmpId : selectedEmployee ? e.id !== selectedEmployee.id : true));

              let results = availableEmployees;

              // Role Filtering
              if (selectedReplacementRoleFilters.length > 0) {
                results = results.filter((e) => {
                  const roleFrame = e.metadataProjects?.find((m) => m.projectId === selectedProjectId)?.roleFrame;
                  return roleFrame && selectedReplacementRoleFilters.includes(roleFrame);
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
                          setReplacementTargetEmpId(null);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`font-medium text-slate-800 dark:text-white truncate ${isSelected ? "text-blue-900 dark:text-blue-100 font-semibold" : ""}`}>{emp.name}</div>
                          {(() => {
                            const roleFrame = emp.metadataProjects?.find((m) => m.projectId === selectedProjectId)?.roleFrame;
                            return roleFrame ? <span className="shrink-0 bg-indigo-100 text-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded dark:bg-indigo-900/30 dark:text-indigo-400 tracking-wider whitespace-nowrap">{roleFrame}</span> : null;
                          })()}
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

      {/* Role Filter Modal for Replacement */}
      <Modal isOpen={isReplacementRoleFilterModalOpen} onClose={() => setIsReplacementRoleFilterModalOpen(false)} title="Filtrar por Rol (Reemplazo)" size="md">
        <div className="flex flex-col max-h-[70vh]">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Selecciona uno o más roles para filtrar la lista de reemplazos.</p>
          </div>

          <div className="overflow-y-auto flex-1 p-2">
            {(() => {
              if (!selectedProjectId) return null;

              // Get all unique roles for this project
              const projectRoles = employees
                .filter((e) => e.projectIds?.includes(selectedProjectId))
                .flatMap((e) => {
                  const role = e.metadataProjects?.find((m) => m.projectId === selectedProjectId)?.roleFrame;
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
                    const isSelected = selectedReplacementRoleFilters.includes(role);
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
                                setSelectedReplacementRoleFilters((prev) => prev.filter((r) => r !== role));
                              } else {
                                setSelectedReplacementRoleFilters((prev) => [...prev, role]);
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
            <button onClick={() => setSelectedReplacementRoleFilters([])} className="text-sm text-red-500 hover:underline font-medium">
              Limpiar Filtros
            </button>
            <button onClick={() => setIsReplacementRoleFilterModalOpen(false)} className="px-6 py-2 bg-blue-600 text-white rounded font-bold text-sm shadow-sm hover:bg-blue-700 transition-colors">
              Listo
            </button>
          </div>
        </div>
      </Modal>

      {/* Additional Staff Modal */}
      <Modal
        isOpen={showAdditionalStaffModal}
        onClose={() => {
          setShowAdditionalStaffModal(false);
          setSelectedAdditionalStaff([]);
          setAdditionalStaffSearchTerm("");
        }}
        title="Personal Adicional"
        size="md"
      >
        <div className="space-y-4">
          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-900/50 text-sm text-blue-800 dark:text-blue-200">
            <p className="font-bold flex items-center gap-2 mb-1">
              <FontAwesomeIcon icon={faUserPlus} />
              ¿Agregar Personal Adicional?
            </p>
            <p className="leading-snug opacity-90">Puedes incluir colaboradores que no están asignados a este proyecto en el reporte de novedades.</p>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <input type="text" placeholder="Buscar personal..." className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-slate-700 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 transition-shadow" value={additionalStaffSearchTerm} onChange={(e) => setAdditionalStaffSearchTerm(e.target.value)} />
          </div>

          {/* Staff List */}
          <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
            {nonProjectEmployees
              .filter((emp) => (additionalStaffSearchTerm ? emp.name.toLowerCase().includes(additionalStaffSearchTerm.toLowerCase()) : true))
              .map((emp) => {
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
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isSelected ? "bg-blue-500 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"}`}>{emp.name.charAt(0)}</div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white text-sm">{emp.name}</p>
                        {emp.positionName && <p className="text-[10px] text-gray-500 dark:text-gray-400">{emp.positionName}</p>}
                      </div>
                    </div>
                    <div className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${isSelected ? "bg-blue-500 text-white" : "border-2 border-gray-300 dark:border-gray-600"}`}>{isSelected && <FontAwesomeIcon icon={faCheck} className="text-xs" />}</div>
                  </div>
                );
              })}
            {nonProjectEmployees.filter((emp) => (additionalStaffSearchTerm ? emp.name.toLowerCase().includes(additionalStaffSearchTerm.toLowerCase()) : true)).length === 0 && <div className="text-center py-8 text-gray-500 dark:text-gray-400">No hay personal adicional disponible</div>}
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

      {/* Floating Action Button for New Report */}
      {/* Floating Action Button for New Report */}
      <div className="fixed bottom-24 z-10 w-full xl:w-1/2 left-1/2 -translate-x-1/2 flex justify-end px-6 pointer-events-none">
        <button onClick={handleCreateNew} className="pointer-events-auto flex items-center justify-center w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100" title="Nueva Novedad">
          <FontAwesomeIcon icon={faPlus} className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}
