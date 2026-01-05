import { useState, useEffect, useMemo } from "react";
import { activityLogTypesAPI, ActivityLogType } from "../../../../api/activityLogTypes";
import { activityReportsAPI, ActivityReport } from "../../../../api/activityReports";
import { usersAPI } from "../../../../api/users";
import { projectsAPI, Project } from "../../../../api/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faArrowLeft, faPlus, faTimes, faTrash, faCalendar, faUserTie, faLayerGroup, faBriefcase, faInfoCircle, faClock } from "@fortawesome/free-solid-svg-icons";
import { useProfile } from "../hooks/useProfile";
import { ViewType } from "../types";
import { sweetAlert } from "../utils/sweetAlert";
import { Modal } from "../components/Modal";

interface EmployeeOption {
  id: string;
  name: string;
  projectIds: string[];
  role?: string;
  roles?: { name: string }[];
  positionName?: string;
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
  outTime?: string;
  notes?: string;
}

interface ActivityLogsProps {
  onNavigate: (view: ViewType) => void;
}

const getProjectEndTime = (project: Project, dateStr: string): string => {
  if (!project.workSchedule) return "18:00";

  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday...
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayName = dayNames[dayIndex];

  const { mode, weekdays, weekend, days } = project.workSchedule;

  // 1. Per day mode
  if (mode === "per_day" && days) {
    const dayData = (days as any)[dayName];
    return dayData?.isWorkDay ? dayData.endTime : "";
  }

  // 2. All week mode (Monday to Sunday)
  if (mode === "all_week") {
    return weekdays?.isWorkDay ? weekdays.endTime : "";
  }

  // 3. Weekdays mode (usually M-V + optional Saturday)
  if (mode === "weekdays") {
    if (dayIndex === 0) return ""; // Sunday strictly off in this mode
    if (dayIndex === 6) {
      // Saturday uses 'weekend' config
      return weekend?.isWorkDay ? weekend.endTime : "";
    }
    // Monday to Friday
    return weekdays?.isWorkDay ? weekdays.endTime : "";
  }

  // Fallback
  return weekdays?.endTime || "18:00";
};

export default function ActivityLogs({ onNavigate }: ActivityLogsProps) {
  const [showForm, setShowForm] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewingReport, setViewingReport] = useState<ActivityReport | null>(null);
  const [showProjectInfo, setShowProjectInfo] = useState(false);
  const [activeProjectTab, setActiveProjectTab] = useState<"info" | "schedule" | "team">("info");

  // Form State
  const [reportDate, setReportDate] = useState(new Date().toISOString().split("T")[0]);
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
  const [draftOutTime, setDraftOutTime] = useState<string>("");

  const [logTypes, setLogTypes] = useState<ActivityLogType[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [reports, setReports] = useState<ActivityReport[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
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
        }))
      );
    } catch (e) {
      console.error("Error loading users", e);
    }

    // 3. Fetch Projects (if user has any)
    try {
      // We can use personnelAPI here to get the list of project IDs directly
      // However, useProfile hook already fetches this. But loadData is called once on mount.
      // Let's use the API directly to ensure fresh data for the dropdown.
      const { personnelAPI } = await import("../../../../api/personnel");
      const profile = await personnelAPI.getProfile();

      if (profile.projectIds && profile.projectIds.length > 0) {
        // Use listAll to get populated client details
        const allProjs = await projectsAPI.listAll();
        setUserProjects(allProjs);
        // Default Select first project if available
        if (allProjs.length > 0) {
          setSelectedProjectId(allProjs[0]._id);
        }
      }
    } catch (e) {
      console.error("Error loading projects", e);
    }

    // 4. Fetch Reports History
    fetchReports();
  };

  const { profile, stats } = useProfile();
  const selectedProject = useMemo(() => userProjects.find((p) => p._id === selectedProjectId), [userProjects, selectedProjectId]);
  const isWorkDay = useMemo(() => {
    if (!selectedProject) return true;
    return getProjectEndTime(selectedProject, reportDate) !== "";
  }, [selectedProject, reportDate]);

  // Effect to load projects once profile is loaded if not already loaded (fallback)
  useEffect(() => {
    if (profile?.projectIds && profile.projectIds.length > 0 && userProjects.length === 0) {
      projectsAPI.listAll().then((allProjs) => {
        setUserProjects(allProjs);
        if (allProjs.length > 0) setSelectedProjectId(allProjs[0]._id);
      });
    }
  }, [profile, userProjects.length]);

  const fetchReports = async () => {
    try {
      const data = await activityReportsAPI.getAll();
      setReports(data);
    } catch (e) {
      console.error("Error loading reports", e);
    }
  };

  useEffect(() => {
    const type = logTypes.find((t) => t._id === draftTypeId);
    if (type?.name.toLowerCase().includes("horas extra") && selectedProjectId && draftOutTime) {
      const project = userProjects.find((p) => p._id === selectedProjectId);
      if (project) {
        const endTime = getProjectEndTime(project, reportDate);
        if (endTime) {
          const [outH, outM] = draftOutTime.split(":").map(Number);
          const [endH, endM] = endTime.split(":").map(Number);

          const outTotal = outH * 60 + outM;
          const endTotal = endH * 60 + endM;

          let diff = (outTotal - endTotal) / 60;
          if (diff < 0) diff = 0;
          setDraftOvertimeHours(parseFloat(diff.toFixed(2)));
        } else {
          // If no end time (non-work day), we can't auto-calculate from "Out Time" alone
          // unless we assume a start time. For now, we'll leave it to manual if they want,
          // but the user's request focuses on "posterior to exit time".
        }
      }
    }
  }, [draftOutTime, draftTypeId, selectedProjectId, reportDate, userProjects, logTypes]);

  const addRecordInternal = (employee: EmployeeOption, type: ActivityLogType, replacementId?: string, overtimeHours?: number, notes?: string) => {
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
      outTime: type.name.toLowerCase().includes("horas extra") ? draftOutTime : undefined,
      notes: notes,
    };

    setEntries((prev) => [...prev, newRecord]);

    // Reset builder
    setSelectedEmployee(null);
    setSearchTerm("");
    setDraftTypeId("");
    setDraftReplacementId("");
    setDraftOvertimeHours(0);
    setDraftOutTime("");
    setIsEmployeeSelectOpen(false);
  };

  const handleAddRecord = () => {
    if (!selectedEmployee || !draftTypeId) return;
    const type = logTypes.find((t) => t._id === draftTypeId);
    if (!type) return;

    addRecordInternal(selectedEmployee, type, draftReplacementId, draftOvertimeHours);
  };

  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTypeId = e.target.value;
    setDraftTypeId(newTypeId);

    if (!newTypeId || !selectedEmployee) return;

    const type = logTypes.find((t) => t._id === newTypeId);
    if (!type) return;

    const isOvertime = type.name.toLowerCase().includes("horas extra");
    const needsReplacement = type.requiresReplacement;

    // Pre-fill Out Time for Overtime
    if (isOvertime) {
      const project = userProjects.find((p) => p._id === selectedProjectId);
      if (project) {
        const endTime = getProjectEndTime(project, reportDate);
        if (endTime) setDraftOutTime(endTime);
      }
    }

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

  const handlePreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProjectId && userProjects.length > 0) {
      await sweetAlert.error("Falta Proyecto", "Por favor selecciona un proyecto.");
      return;
    }

    // Auto-save pending draft if valid
    if (hasActivity && selectedEmployee && draftTypeId) {
      handleAddRecord();
    }

    // Check for empty activity report
    // If hasActivity is true, we expect at least one entry (either already in entries or just added via draft)
    // Since we just called handleAddRecord (which updates state synchronously BUT react batching might delay it for this closures check)
    // We should check entries.length combined with the draft valid check.
    // However, setEntries inside addRecordInternal is async in React terms for the next render, but immediate for state updater if we used functional.
    // Better logic: if hasActivity is true, and entries is empty AND we didn't just add one...
    // Actually, simple check:
    if (hasActivity && entries.length === 0 && !draftTypeId) {
      await sweetAlert.error("Reporte Vacío", "Si hubo novedades, debes agregar al menos un registro. Si no hubo, selecciona 'NO'.");
      return;
    }

    // Note: If we just added a draft above, entries.length is still old value in this closure.
    // But draftTypeId would be reset? No, addRecordInternal resets it.
    // So if we had a draft, we added it, reset draftTypeId.
    // So 'entries' here is still empty if it was empty.
    // Correct fix: check if we added a draft.
    const justAdded = hasActivity && selectedEmployee && draftTypeId;
    if (hasActivity && entries.length === 0 && !justAdded) {
      await sweetAlert.error("Reporte Vacío", "Si hubo novedades, debes agregar al menos un registro. Si no hubo, selecciona 'NO'.");
      return;
    }

    setShowSummaryModal(true);
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true);

    try {
      const attendance = [];
      if (hasActivity) {
        for (const entry of entries) {
          attendance.push({
            employeeId: entry.employeeId,
            status: entry.typeName.toLowerCase().includes("horas extra") ? "present" : "absent",
            absenceReason: entry.typeName.toLowerCase().includes("horas extra") ? undefined : entry.typeName,
            replacementId: entry.replacementId,
            overtimeHours: entry.overtimeHours,
            notes: entry.notes,
          });
        }
      }

      const payload = {
        date: reportDate,
        hasActivity: !!hasActivity,
        comments,
        attendance,
        projectId: selectedProjectId || undefined,
      };

      // Validation moved to pre-submit, but good to keep safe check or just proceed.
      // Already checked projectId.

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
      const mappedEntries: LocalAttendanceRecord[] = report.attendance.map((att, idx) => {
        // Reconstruct Type from absenceReason or overtime
        let typeId = "";
        let typeName = att.absenceReason || "Desconocido";

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
          notes: att.notes,
        };
      });
      setEntries(mappedEntries);
    } else {
      setHasActivity(false);
      setEntries([]);
    }

    setShowForm(true);
  };

  const handleViewReport = (report: ActivityReport) => {
    setViewingReport(report);
    setShowDetailModal(true);
  };

  const handleEditFromDetail = () => {
    if (viewingReport) {
      setShowDetailModal(false);
      handleEditReport(viewingReport);
    }
  };

  const handleCreateNew = () => {
    setSelectedReportId(null);
    setReportDate(new Date().toISOString().split("T")[0]);
    // Reset Project Selection
    if (userProjects.length > 0) {
      setSelectedProjectId(userProjects[0]._id);
    } else {
      setSelectedProjectId("");
    }
    setHasActivity(null);
    setEntries([]); // Clear entries for new report
    setSelectedEmployee(null);
    setSearchTerm("");
    setComments("");
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
          <div className="flex gap-2">
            <button onClick={handleCreateNew} className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl w-10 h-10 sm:w-auto sm:h-10 sm:px-4 font-medium transition-colors disabled:opacity-50 shadow-lg shadow-blue-500/20">
              <FontAwesomeIcon icon={faPlus} />
              <span className="hidden sm:inline">Nueva Novedad</span>
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        {/* User Info Header */}
        <div className="bg-white dark:bg-slate-900/70 rounded-xl p-4 border border-slate-200 dark:border-slate-700 mb-6 relative overflow-hidden">
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
        </div>

        {showForm && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-xl shadow-xl overflow-hidden max-h-[90vh] min-h-[600px] flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">{selectedReportId ? "Editar Reporte" : "Nuevo Reporte"}</h3>
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="overflow-y-auto p-4 space-y-6 flex-1">
                <div className="space-y-6">
                  {/* Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha del Reporte</label>
                    <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                  </div>

                  {/* Project Selector */}
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
                </div>

                {/* Sticky Project Info Bar - Moved below select as requested */}
                {selectedProject && (
                  <div className="px-4 py-3 bg-slate-900/95 dark:bg-slate-900 border-b border-slate-800 backdrop-blur-md flex items-center gap-3 sticky -mx-4 top-[-20px] z-30 flex-shrink-0">
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
                    <div className="bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 p-4 text-center">
                      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">¿Hubo novedades en el turno?</h2>
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
                              <div className="relative">
                                {/* Select Trigger */}
                                <div className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white flex justify-between items-center cursor-pointer bg-white" onClick={() => setIsEmployeeSelectOpen(!isEmployeeSelectOpen)}>
                                  <span className={searchTerm ? "text-gray-900 dark:text-white" : "text-gray-500"}>Seleccionar colaborador...</span>
                                  <FontAwesomeIcon icon={isEmployeeSelectOpen ? faTimes : faLayerGroup} className="text-gray-400" />
                                </div>

                                {/* Dropdown Content */}
                                {isEmployeeSelectOpen && (
                                  <div className="absolute z-50 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded shadow-xl mt-1 max-h-60 flex flex-col">
                                    {/* Search Input inside Dropdown */}
                                    <div className="p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 sticky top-0">
                                      <input type="text" autoFocus className="w-full p-2 border border-blue-200 dark:border-blue-900 rounded dark:bg-slate-800 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors" placeholder="Buscar nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onClick={(e) => e.stopPropagation()} />
                                    </div>

                                    {/* List */}
                                    <div className="overflow-y-auto flex-1">
                                      {(() => {
                                        const filteredByProject = selectedProjectId ? employees.filter((e) => e.projectIds && e.projectIds.includes(selectedProjectId)) : [];

                                        const filteredByName = searchTerm ? filteredByProject.filter((e) => e.name.toLowerCase().includes(searchTerm.toLowerCase())) : filteredByProject;

                                        return (
                                          <>
                                            {filteredByName.map((emp) => (
                                              <div
                                                key={emp.id}
                                                className="p-3 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer border-b border-gray-50 dark:border-gray-700 last:border-0"
                                                onClick={() => {
                                                  setSelectedEmployee(emp);
                                                  setSearchTerm("");
                                                  setIsEmployeeSelectOpen(false);
                                                }}
                                              >
                                                <div className="font-medium text-slate-800 dark:text-white">{emp.name}</div>
                                              </div>
                                            ))}
                                            {filteredByName.length === 0 && <div className="p-4 text-center text-gray-500 italic">{selectedProjectId ? "No se encontraron colaboradores." : "Selecciona un proyecto primero."}</div>}
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                )}
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

                              <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Tipo de Novedad</label>
                                <select className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-shadow" value={draftTypeId} onChange={handleTypeChange}>
                                  <option value="">Seleccionar tipo...</option>
                                  {logTypes
                                    .filter((t) => {
                                      // Show global types always
                                      if (t.visibility === "all") return true;
                                      // Show specific types only if project is in allowedProjectIds
                                      if (t.visibility === "specific" && selectedProjectId) {
                                        return t.allowedProjectIds?.includes(selectedProjectId);
                                      }
                                      return false;
                                    })
                                    .map((t) => (
                                      <option key={t._id} value={t._id}>
                                        {t.name}
                                      </option>
                                    ))}
                                </select>
                              </div>

                              {(() => {
                                const type = logTypes.find((t) => t._id === draftTypeId);
                                if (!type) return null;

                                const isOvertime = type.name.toLowerCase().includes("horas extra");
                                const needsReplacement = type.requiresReplacement;

                                // Only show extra fields if needed
                                if (!isOvertime && !needsReplacement) return null;

                                return (
                                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded p-3 space-y-3 border border-slate-100 dark:border-slate-700">
                                    {/* Replacement if needed */}
                                    {needsReplacement && (
                                      <div>
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Reemplazo (Opcional)</label>
                                        <select className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white" value={draftReplacementId} onChange={(e) => setDraftReplacementId(e.target.value)}>
                                          <option value="">Sin reemplazo</option>
                                          {employees
                                            .filter((e) => e.id !== selectedEmployee.id)
                                            .map((e) => (
                                              <option key={e.id} value={e.id}>
                                                {e.name}
                                              </option>
                                            ))}
                                        </select>
                                      </div>
                                    )}

                                    {/* Overtime Hours */}
                                    {isOvertime && (
                                      <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-700 mt-2">
                                        <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 px-1">
                                          <span>Horario Salida Proyecto:</span>
                                          <span className="font-bold text-slate-700 dark:text-slate-200">
                                            {(() => {
                                              const proj = userProjects.find((p) => p._id === selectedProjectId);
                                              return proj ? getProjectEndTime(proj, reportDate) || "No laboral" : "—";
                                            })()}
                                          </span>
                                        </div>

                                        <div>
                                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase text-blue-600 dark:text-blue-400">Horario Salida Efectivo</label>
                                          <input
                                            type="text"
                                            maxLength={5}
                                            placeholder="HH:mm"
                                            className="w-full p-2.5 rounded border border-blue-200 dark:border-blue-900 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all shadow-sm font-mono text-center tracking-wider"
                                            value={draftOutTime}
                                            onChange={(e) => {
                                              let val = e.target.value;
                                              // Simple mask for HH:mm
                                              if (val.length === 2 && draftOutTime.length === 1) val += ":";
                                              setDraftOutTime(val);
                                            }}
                                            onBlur={() => {
                                              // Basic validation/fix on blur
                                              if (draftOutTime.length === 4 && !draftOutTime.includes(":")) {
                                                setDraftOutTime(draftOutTime.slice(0, 2) + ":" + draftOutTime.slice(2));
                                              }
                                            }}
                                          />
                                        </div>

                                        <div>
                                          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas Extras</label>
                                          <div className="flex gap-2 items-center">
                                            <input type="number" step="0.5" className="w-full p-2.5 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-all font-bold text-blue-600 dark:text-blue-400" value={draftOvertimeHours} onChange={(e) => setDraftOvertimeHours(parseFloat(e.target.value))} />
                                            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">horas totales</span>
                                          </div>
                                          <p className="text-[10px] text-slate-400 mt-1 italic">Este valor se calcula automáticamente, pero puedes ajustarlo si es necesario.</p>
                                        </div>
                                      </div>
                                    )}

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
                              {entry.replacementName && <div className="text-xs text-slate-500">Reemplazo: {entry.replacementName}</div>}
                            </div>
                            <button onClick={() => handleRemoveRecord(entry.tempId)} className="text-red-500 hover:text-red-700 p-2">
                              <FontAwesomeIcon icon={faTrash} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Comentarios Generales</label>
                      <textarea rows={3} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-sm" placeholder="Comentarios adicionales..." value={comments} onChange={(e) => setComments(e.target.value)} />
                    </div>
                  </>
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
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                {isWorkDay && hasActivity !== null && (
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm">
                      Cancelar
                    </button>
                    <button onClick={handlePreSubmit} disabled={submitting} className="flex-1 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors disabled:opacity-70 text-sm">
                      Revisar y Enviar
                    </button>
                  </div>
                )}
                {isWorkDay && hasActivity === null && <div className="text-center text-sm text-gray-500 dark:text-gray-400">Selecciona una opción arriba para continuar</div>}
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
                <span className="inline-block px-2 py-0.5 text-[12px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded">#{report._id.slice(-6).toUpperCase()}</span>
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
              <div className="text-sm text-slate-500 mb-3">{new Date(report.date).toLocaleDateString()}</div>

              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{report.hasActivity ? `${report.attendance.length} registros` : "Sin novedades"}</span>
                <span>{new Date(report.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </div>
          ))}
          {reports.length === 0 && <div className="text-center text-gray-500 py-8">No has enviado novedades recientes.</div>}
        </div>
      </div>

      {/* Summary Modal */}
      <Modal isOpen={showSummaryModal} onClose={() => setShowSummaryModal(false)} title="Confirmar Reporte">
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
                      {entry.replacementName && <span className="text-xs text-gray-500">Reemplaza: {entry.replacementName}</span>}
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
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 uppercase tracking-wide border border-green-200 dark:border-green-900/50">Presente</span>
                      </div>
                    ))}
                  {employees.filter((e) => e.projectIds && e.projectIds.includes(selectedProjectId)).length === 0 && <p className="text-sm text-gray-500 italic text-center py-4">No hay colaboradores asignados a este proyecto.</p>}
                </div>
              </div>
            </div>
          )}

          {comments && (
            <div>
              <h4 className="font-medium text-sm text-gray-900 dark:text-white border-b pb-1 dark:border-gray-700 mb-1">Comentarios</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-2 rounded italic">"{comments}"</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button onClick={() => setShowSummaryModal(false)} className="flex-1 py-2 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 transition-colors text-sm">
              Volver
            </button>
            <button onClick={handleConfirmSubmit} disabled={submitting} className="flex-1 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors disabled:opacity-70 text-sm">
              {submitting ? "Enviando..." : "Confirmar y Enviar"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal isOpen={showDetailModal} onClose={() => setShowDetailModal(false)} title="Detalle del Reporte">
        {viewingReport && (
          <div className="space-y-4">
            <div className="font-medium text-sm text-gray-900 dark:text-white space-y-2 pb-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono text-gray-400">#{viewingReport._id.slice(-6).toUpperCase()}</span>
                <span className="text-xs text-gray-500">{new Date(viewingReport.submittedAt).toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-gray-500 dark:text-gray-400">Fecha:</span>
                <span className="font-semibold text-gray-900 dark:text-white">{new Date(viewingReport.date).toLocaleDateString()}</span>
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
              {viewingReport.hasActivity && (
                <div className="max-h-50 overflow-y-auto text-sm space-y-2 mt-2">
                  {viewingReport.attendance.map((entry, idx) => {
                    const empName = typeof entry.employeeId === "object" ? `${entry.employeeId.firstName} ${entry.employeeId.lastName}` : "Empleado";
                    // Fallback for type name reconstruction if needed or use absenceReason directly
                    const reason = entry.absenceReason || (entry.overtimeHours ? "Horas Extra" : "Novedad");
                    const repName = entry.replacementId ? (typeof entry.replacementId === "object" ? `${entry.replacementId.firstName} ${entry.replacementId.lastName}` : "Reemplazo") : null;

                    return (
                      <div key={idx} className="flex flex-col pb-2 border-b border-gray-100 dark:border-gray-700 last:border-0 last:pb-0">
                        <span className="font-semibold text-gray-800 dark:text-white">{empName}</span>
                        <span className="text-xs text-blue-600 dark:text-blue-400">
                          {reason} {entry.overtimeHours ? `(${entry.overtimeHours}h)` : ""}
                        </span>
                        {repName && <span className="text-xs text-gray-500">Reemplaza: {repName}</span>}
                        {entry.notes && <span className="text-xs text-gray-500 italic">"{entry.notes}"</span>}
                      </div>
                    );
                  })}
                </div>
              )}
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
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{selectedProject.startDate ? new Date(selectedProject.startDate).toLocaleDateString() : "No definida"}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/20 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-400 uppercase">Fecha Fin</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{selectedProject.endDate ? new Date(selectedProject.endDate).toLocaleDateString() : "No definida"}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/20 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-bold text-slate-400 uppercase">Creado el</span>
                      <span className="text-sm font-bold text-slate-600 dark:text-slate-400">{selectedProject.createdAt ? new Date(selectedProject.createdAt).toLocaleDateString() : "-"}</span>
                    </div>
                    {selectedProject.objectives && selectedProject.objectives.length > 0 && (
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/20 rounded-lg border border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-400 uppercase mb-2 block">Objetivos ({selectedProject.objectives.length})</span>
                        <ul className="list-disc list-inside text-sm text-slate-600 dark:text-slate-300 space-y-1">
                          {selectedProject.objectives.map((obj, i) => (
                            <li key={i}>{obj}</li>
                          ))}
                        </ul>
                      </div>
                    )}
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
    </div>
  );
}
