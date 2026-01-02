import { useState, useEffect } from "react";
import { activityLogTypesAPI, ActivityLogType } from "../../../../api/activityLogTypes";
import { activityReportsAPI, ActivityReport } from "../../../../api/activityReports";
import { usersAPI } from "../../../../api/users";
import { projectsAPI } from "../../../../api/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPlus, faTimes, faTrash, faCalendar, faUserTie, faLayerGroup, faBriefcase, faProjectDiagram } from "@fortawesome/free-solid-svg-icons";
import { useProfile } from "../hooks/useProfile";
import { ViewType } from "../types";
import { sweetAlert } from "../utils/sweetAlert";
import { Modal } from "../components/Modal";

interface EmployeeOption {
  id: string;
  name: string;
  projectIds: string[];
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
  notes?: string;
}

interface ActivityLogsProps {
  onNavigate: (view: ViewType) => void;
}

export default function ActivityLogs({ onNavigate }: ActivityLogsProps) {
  const [showForm, setShowForm] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewingReport, setViewingReport] = useState<ActivityReport | null>(null);

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

  const [logTypes, setLogTypes] = useState<ActivityLogType[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [userProjects, setUserProjects] = useState<{ _id: string; name: string; clientId?: { _id: string; name: string } }[]>([]);
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
        // optionally filter if needed, but normally listAll returns assigned projects for non-admin
        const projs = allProjs.map((p) => ({
          _id: p._id,
          name: p.name,
          clientId: typeof p.clientId === "object" ? { _id: p.clientId._id, name: p.clientId.name || "" } : undefined,
        }));

        setUserProjects(projs);
        // Default Select first project if available
        if (projs.length > 0) {
          setSelectedProjectId(projs[0]._id);
        }
      }
    } catch (e) {
      console.error("Error loading projects", e);
    }

    // 4. Fetch Reports History
    fetchReports();
  };

  const { profile, stats } = useProfile();

  // Effect to load projects once profile is loaded if not already loaded (fallback)
  useEffect(() => {
    if (profile?.projectIds && profile.projectIds.length > 0 && userProjects.length === 0) {
      projectsAPI.listAll().then((allProjs) => {
        const projs = allProjs.map((p) => ({
          _id: p._id,
          name: p.name,
          clientId: typeof p.clientId === "object" ? { _id: p.clientId._id, name: p.clientId.name || "" } : undefined,
        }));
        setUserProjects(projs);
        if (projs.length > 0) setSelectedProjectId(projs[0]._id);
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
      notes: notes,
    };

    setEntries((prev) => [...prev, newRecord]);

    // Reset builder
    setSelectedEmployee(null);
    setSearchTerm("");
    setDraftTypeId("");
    setDraftReplacementId("");
    setDraftOvertimeHours(0);
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
            <button onClick={() => onNavigate("home")} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
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
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faBriefcase} className="w-4 h-4 text-slate-400" />
                <span className="font-semibold">Cargo:</span>
                <span>{profile?.positionName || profile?.position || "Sin Cargo"}</span>
              </div>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faLayerGroup} className="w-4 h-4 text-slate-400" />
                <span className="font-semibold">Área:</span>
                <span>{profile?.areaName || profile?.department || "Sin Área"}</span>
              </div>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faUserTie} className="w-4 h-4 text-slate-400" />
                <span className="font-semibold">Rol:</span>
                <span className="capitalize">{profile?.roleNames?.join(", ") || "Sin Rol"}</span>
              </div>
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faProjectDiagram} className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-nowrap">Cliente (Proyecto):</span>
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
                <button onClick={() => setShowForm(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
                </button>
              </div>

              <div className="overflow-y-auto p-4 space-y-6 flex-1">
                {/* Date */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha del Reporte</label>
                    <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                  </div>

                  {/* Project Selector */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cliente | Proyecto</label>
                    {userProjects.length > 0 ? (
                      <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white">
                        {userProjects.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.clientId?.name ? `${p.clientId.name} | ${p.name}` : p.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">No hay proyectos asignados.</div>
                    )}
                  </div>
                </div>

                {/* Main Toggle */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">¿Hubo novedades en el turno?</h2>
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => setHasActivity(false)}
                      className={`flex-1 py-2 rounded-lg border-2 transition-all flex flex-col items-center gap-1
                                ${hasActivity === false ? "border-slate-500 bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white" : "border-gray-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-slate-600 text-gray-500 dark:text-gray-400"}`}
                    >
                      <span className="font-bold">NO</span>
                    </button>
                    <button
                      onClick={() => setHasActivity(true)}
                      className={`flex-1 py-2 rounded-lg border-2 transition-all flex flex-col items-center gap-1
                                ${hasActivity === true ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 text-gray-500 dark:text-gray-400"}`}
                    >
                      <span className="font-bold">SÍ</span>
                    </button>
                  </div>
                </div>

                {/* New Record Builder */}
                {hasActivity && (
                  <div className="space-y-4">
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 shadow-sm transition-all">
                      {!selectedEmployee ? (
                        <>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Colaborador</label>
                          <div className="relative">
                            {/* Select Trigger */}
                            <div className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white flex justify-between items-center cursor-pointer bg-white" onClick={() => setIsEmployeeSelectOpen(!isEmployeeSelectOpen)}>
                              <span className={searchTerm ? "text-gray-900 dark:text-white" : "text-gray-500"}>Seleccionar colaborador...</span>
                              <FontAwesomeIcon icon={isEmployeeSelectOpen ? faTimes : faLayerGroup} className="text-gray-400" />
                            </div>

                            {/* Dropdown Content */}
                            {isEmployeeSelectOpen && (
                              <div className="absolute z-50 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl mt-1 max-h-60 flex flex-col">
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
                            <button onClick={() => setSelectedEmployee(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors">
                              <FontAwesomeIcon icon={faTimes} />
                            </button>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Tipo de Novedad</label>
                            <select className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white bg-white focus:ring-2 focus:ring-blue-500 transition-shadow" value={draftTypeId} onChange={handleTypeChange}>
                              <option value="">Seleccionar tipo...</option>
                              {logTypes.map((t) => (
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
                              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 space-y-3 border border-slate-100 dark:border-slate-700">
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
                                  <div>
                                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 uppercase">Cantidad de Horas</label>
                                    <input type="number" className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white" value={draftOvertimeHours} onChange={(e) => setDraftOvertimeHours(parseFloat(e.target.value))} />
                                  </div>
                                )}

                                <button onClick={handleAddRecord} disabled={!draftTypeId} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg mt-2 disabled:opacity-50 shadow-sm">
                                  Confirmar Registro
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Entries List */}
                    {entries.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <h4 className="font-semibold text-slate-700 dark:text-slate-300 text-sm">Registros Agregados ({entries.length})</h4>
                        {entries.map((entry) => (
                          <div key={entry.tempId} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex justify-between items-center shadow-sm">
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
                      <textarea rows={3} className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" placeholder="Comentarios adicionales..." value={comments} onChange={(e) => setComments(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex-shrink-0">
                {hasActivity !== null && (
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors text-sm">
                      Cancelar
                    </button>
                    <button onClick={handlePreSubmit} disabled={submitting} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors disabled:opacity-70 text-sm">
                      Revisar y Enviar
                    </button>
                  </div>
                )}
                {hasActivity === null && <div className="text-center text-sm text-gray-500 dark:text-gray-400">Selecciona una opción arriba para continuar</div>}
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
                  const cName = p.clientId?.name;
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

          {hasActivity && (
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
          )}

          {comments && (
            <div>
              <h4 className="font-medium text-sm text-gray-900 dark:text-white border-b pb-1 dark:border-gray-700 mb-1">Comentarios</h4>
              <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 p-2 rounded italic">"{comments}"</p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button onClick={() => setShowSummaryModal(false)} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 transition-colors text-sm">
              Volver
            </button>
            <button onClick={handleConfirmSubmit} disabled={submitting} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors disabled:opacity-70 text-sm">
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
              <button onClick={() => setShowDetailModal(false)} className="flex-1 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-300 transition-colors text-sm">
                Cerrar
              </button>
              <button onClick={handleEditFromDetail} className="flex-1 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-md transition-colors text-sm">
                Editar
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
