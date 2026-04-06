import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { projectsAPI, Project } from "../api/projects";
import { usersAPI, User } from "../api/users";
import { useAuthStore } from "../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";

import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Modal } from "../components/ui/Modal";
import { Card } from "../components/ui/Card";

import { getHelp } from "../data/help/helpContent";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faSearch, faFilter, faTrash, faBriefcase, faClock, faGrip, faTable, faPlus, faEdit, faIdCard, faUser, faUmbrellaBeach, faClipboardList } from "@fortawesome/free-solid-svg-icons";
import { vacationsAPI, VacationRequest } from "../api/vacations";
import { TeamSolicitudesTab } from "../components/team/TeamSolicitudesTab";

const HELP_KEY = "projectTeam" as const;

export const ProjectTeamPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { token } = useAuthStore();

  // Help
  const [openInfo, setOpenInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  // Data
  const [project, setProject] = useState<Project | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamConfig, setTeamConfig] = useState<any[]>([]);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState(""); // For Disponibles (Modal)
  const [searchTermTeam, setSearchTermTeam] = useState(""); // For Equipo Actual
  const [editingScheduleUser, setEditingScheduleUser] = useState<User | null>(null);
  const [userScheduleData, setUserScheduleData] = useState({
    useProjectSchedule: true,
    startTime: "09:00",
    endTime: "18:00",
    shiftId: "",
  });

  // UI States
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLg, setIsLg] = useState(window.innerWidth >= 1024);
  const [activeTab, setActiveTab] = useState<"equipo" | "solicitudes">("equipo");
  const [solicitudesCount, setSolicitudesCount] = useState(0);

  // Persistence for view mode
  useEffect(() => {
    const saved = localStorage.getItem("projectTeamViewMode");
    if (saved === "table" || saved === "cards") {
      setViewMode(saved as "table" | "cards");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("projectTeamViewMode", viewMode);
  }, [viewMode]);

  useEffect(() => {
    const handleResize = () => setIsLg(window.innerWidth >= 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const effectiveViewMode = isLg ? viewMode : "cards";

  /* ------------------------------ Fetchers ------------------------------- */

  useEffect(() => {
    if (!projectId || !token) return;

    const init = async () => {
      try {
        setLoading(true);
        const [projectData, usersData, vacationsData] = await Promise.all([
          projectsAPI.getProject(projectId),
          usersAPI.list({ limit: 10000 }), // Get all users (no limit)
          vacationsAPI.getAll(),
        ]);

        // Auto-cleanup orphaned user IDs from assignedUsers
        try {
          const cleanupResult = await projectsAPI.cleanupTeam(projectId);
          if (cleanupResult.removedCount > 0) {
            // Silent cleanup - no notification shown
            // Re-fetch project to get updated assignedUsers
            const updatedProject = await projectsAPI.getProject(projectId);
            setProject(updatedProject);
            setTeamConfig(updatedProject.teamConfig || []);
          } else {
            setProject(projectData);
            setTeamConfig(projectData.teamConfig || []);
          }
        } catch (cleanupError) {
          console.warn("Could not cleanup team:", cleanupError);
          setProject(projectData);
          setTeamConfig(projectData.teamConfig || []);
        }

        setAllUsers(usersData.users);
        setVacations(vacationsData);
      } catch (error) {
        console.error("Error loading data:", error);
        sweetAlert.error("Error", "No se pudieron cargar los datos del equipo.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [projectId, token]);

  // Fetch solicitudes count for this project
  useEffect(() => {
    if (!projectId) return;
    const fetchCount = async () => {
      try {
        const solis = await usersAPI.listSolicitudes();
        const count = solis.filter(u => u.metadata?.projectIds?.includes(projectId)).length;
        setSolicitudesCount(count);
      } catch (e) {
        console.error("Error fetching solicitudes count:", e);
      }
    };
    fetchCount();
  }, [projectId]);

  /* ------------------------------- Logic --------------------------------- */

  // Derived state
  const clientName = useMemo(() => {
    if (!project) return "";
    if (typeof project.clientId === "object" && project.clientId?.name) {
      return project.clientId.name;
    }
    return "";
  }, [project]);

  const sedeName = useMemo(() => {
    if (!project) return null;
    return (project as any).metadataResolutions?.sede?.name || (project as any).metadataResolutions?.sede?.data?.nombre || null;
  }, [project]);

  const [client, setClient] = useState<any>(null);

  useEffect(() => {
    if (project && typeof project.clientId === "string" && !clientName) {
      // fetch client
      projectsAPI.getClient(project.clientId).then(setClient).catch(console.error);
    }
  }, [project, clientName]);

  const displayedClientName = client?.name || clientName || "Cliente";

  // Unificamos los IDs de usuarios asignados (cruce entre la lista del proyecto y los metadatos de los usuarios)
  const assignedUserIds = useMemo(() => {
    if (!project || !projectId) return [];

    // 1. Usuarios explícitamente asignados en el objeto Proyecto
    const fromProject = ((project.assignedUsers as any[]) || []).map((u) => (typeof u === "string" ? u : u._id));

    // 2. Usuarios que tienen este proyecto en sus metadatos (projectIds o metadata.projects)
    const fromUsers = allUsers.filter((u) => u.projectIds?.some((p) => p._id === projectId) || u.metadata?.projects?.some((p) => p._id === projectId)).map((u) => u._id);

    // Retornamos un set único de IDs
    return Array.from(new Set([...fromProject, ...fromUsers]));
  }, [project, projectId, allUsers]);

  // Filtered Users (candidates to add) - only search by name or email
  const filteredCandidates = useMemo(() => {
    return allUsers.filter((user) => {
      // 1. Exclude already assigned
      if (assignedUserIds.includes(user._id)) return false;

      // 2. Search Term (name or email only)
      if (searchTerm) {
        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
        const email = user.email.toLowerCase();
        const search = searchTerm.toLowerCase();
        if (!fullName.includes(search) && !email.includes(search)) return false;
      }

      return true;
    });
  }, [allUsers, assignedUserIds, searchTerm]);

  // Current Team Members
  const teamMembers = useMemo(() => {
    const members = assignedUserIds.map((id) => allUsers.find((u) => u._id === id)).filter((u): u is User => !!u);

    // Apply search filter if searchTermTeam is set
    if (searchTermTeam) {
      const search = searchTermTeam.toLowerCase();
      return members.filter((user) => {
        const fullName = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
        const email = user.email.toLowerCase();
        return fullName.includes(search) || email.includes(search);
      });
    }

    return members;
  }, [assignedUserIds, allUsers, searchTermTeam]);

  const formatShiftDays = (days: number[]) => {
    const dayNames = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
    if (!days || days.length === 0) return "";
    return days
      .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)) 
      .map((d) => dayNames[d] || "")
      .filter((n) => n !== "")
      .join(", ");
  };

  // Check Is Coordinator Helper
  const checkIsCoordinator = (user: User) => (typeof user.positionId === "object" && user.positionId?.name?.toLowerCase().includes("coordinador")) || (user.roles && user.roles.some((r) => r.name.toLowerCase().includes("coordinador"))) || user.firstName?.toLowerCase().includes("coordinador") || user.lastName?.toLowerCase().includes("coordinador");

  const getUserVacationStatus = (userId: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return vacations.find((v) => {
      if (v.userId !== userId) return false;
      const isFinal = v.status === "delivered" || v.signatureStatus === "signed" || (v.status === "approved" && v.signatureStatus === "not_required");
      if (!isFinal) return false;

      const start = new Date(v.startDate);
      const end = new Date(v.endDate);
      start.setHours(0, 0, 0, 0);
      end.setHours(0, 0, 0, 0);

      return today >= start && today <= end;
    });
  };

  /* --------------------------- Notifications Logic ------------------------- */

  const updateTeamConfig = async (newConfig: any[]) => {
    if (!project) return;
    try {
      const updatedProject = await projectsAPI.updateTeamConfig(project._id, newConfig);
      setTeamConfig(updatedProject.teamConfig || []);
    } catch (err) {
      console.error("Error updating team config", err);
      sweetAlert.error("Error", "No se pudo guardar la configuración del equipo.");
    }
  };
  const handleOpenScheduleModal = (user: User) => {
    const existing = teamConfig.find((c) => c.userId === user._id);
    setEditingScheduleUser(user);
    setUserScheduleData({
      useProjectSchedule: existing ? (existing.useProjectSchedule !== undefined ? existing.useProjectSchedule : true) : true,
      startTime: existing?.startTime || (project?.turnos && project.turnos.length > 0 && typeof project.turnos[0] === "object" ? project.turnos[0].startTime : "09:00"),
      endTime: existing?.endTime || (project?.turnos && project.turnos.length > 0 && typeof project.turnos[0] === "object" ? project.turnos[0].endTime : "18:00"),
      shiftId: (user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? user.turnos[0]._id : user.turnos[0]) : existing?.shiftId) || "",
    });
  };

  const handleSaveUserSchedule = async () => {
    if (!editingScheduleUser) return;

    try {
      // 1. Update Project Team Config
      const newConfig = teamMembers.map((member) => {
        const existing = teamConfig.find((c) => c.userId === member._id);
        if (member._id === editingScheduleUser._id) {
          return {
            userId: member._id,
            canRegister: existing ? existing.canRegister : true,
            ...userScheduleData,
          };
        }
        return {
          userId: member._id,
          canRegister: existing ? existing.canRegister : true,
          useProjectSchedule: existing?.useProjectSchedule ?? true,
          startTime: existing?.startTime || "09:00",
          endTime: existing?.endTime || "18:00",
          shiftId: existing?.shiftId,
        };
      });

      await updateTeamConfig(newConfig);

      // 2. Update User Collection (Persist shift in users/turnos)
      const shiftIds = userScheduleData.shiftId ? [userScheduleData.shiftId] : [];
      await usersAPI.update(editingScheduleUser._id, { turnos: shiftIds });

      setEditingScheduleUser(null);
      sweetAlert.success("Horario Actualizado", `El horario y turno de ${editingScheduleUser.firstName} han sido actualizados.`);

      // Refresh users to show updated turnos in the table
      const usersData = await usersAPI.list({ limit: 10000 });
      setAllUsers(usersData.users);
    } catch (err) {
      console.error("Error saving user schedule/shift:", err);
      sweetAlert.error("Error", "No se pudo guardar la configuración.");
    }
  };

  /* ------------------------------- Actions -------------------------------- */

  const handleAddUser = async (userId: string) => {
    if (!project) return;

    const result = await sweetAlert.confirm("¿Agregar al equipo?", "El usuario será agregado al proyecto.", "Sí, agregar");
    if (!result.isConfirmed) return;

    try {
      const newAssigned = [...assignedUserIds, userId];
      await projectsAPI.updateProject(project._id, { assignedUsers: newAssigned });

      const updatedProject = await projectsAPI.getProject(project._id);
      setProject(updatedProject);

      sweetAlert.success("Usuario Agregado", "El usuario ha sido añadido al equipo.");
    } catch (error) {
      console.error("Error adding user:", error);
      sweetAlert.error("Error", "No se pudo agregar al usuario.");
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!project) return;
    const result = await sweetAlert.confirm("¿Retirar del equipo?", "El usuario será retirado del proyecto.");
    if (!result.isConfirmed) return;

    try {
      const newAssigned = assignedUserIds.filter((id) => id !== userId);
      await projectsAPI.updateProject(project._id, { assignedUsers: newAssigned });

      const updatedProject = await projectsAPI.getProject(project._id);
      setProject(updatedProject);

      const newConfig = teamConfig.filter((c) => c.userId !== userId);
      updateTeamConfig(newConfig);

      sweetAlert.success("Usuario Retirado", "El usuario ha sido retirado del equipo.");
    } catch (error) {
      console.error("Error removing user:", error);
      sweetAlert.error("Error", "No se pudo retirar al usuario.");
    }
  };

  /* --------------------------------View ---------------------------------- */

  if (!project && !loading) {
    return <EmptyState icon={faBriefcase} title="Proyecto no encontrado" description="El proyecto no existe o no tienes acceso." action={{ label: "volver", onClick: () => navigate(-1) }} />;
  }

  return (
    <PageLayout
      title="Gestionar Equipo"
      itemCount={teamMembers.length}
      subtitle="Agrega o quita miembros del equipo"
      onBack={() => navigate(-1)}
      faIcon={{ icon: faUsers }}
      clientMiniAvatar={
        project
          ? {
              label: displayedClientName,
              fallback: displayedClientName.charAt(0).toUpperCase(),
              src: client?.logo,
            }
          : undefined
      }
      badge={project ? { text: project.name, variant: "default" } : undefined}
      badgeSecondary={sedeName ? { text: sedeName, variant: "default" } : undefined}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Información",
        content: helpEntry?.content,
      }}
      headerActions={
        <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
          <span className="hidden sm:inline">Agregar Miembro</span>
        </button>
      }
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando equipo..." />
        </div>
      ) : project ? (
        <>
          <div className="flex flex-col gap-6">
            {/* TABS */}
            <div className="flex items-center border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setActiveTab("equipo")}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${
                  activeTab === "equipo"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <FontAwesomeIcon icon={faUsers} className="text-xs" />
                Equipo
              </button>
              <button
                onClick={() => setActiveTab("solicitudes")}
                className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${
                  activeTab === "solicitudes"
                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <FontAwesomeIcon icon={faClipboardList} className="text-xs" />
                Solicitudes
                {solicitudesCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1">
                    {solicitudesCount}
                  </span>
                )}
              </button>
            </div>

            {activeTab === "equipo" && (
            <>
            {/* Current Team Section - Full Width */}
            <div className="space-y-4">
              <div className="flex gap-4 items-center justify-between">
                <div className="relative w-full">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <FontAwesomeIcon icon={faSearch} />
                  </span>
                  <input type="text" className="input-field pl-10 h-10" placeholder="Buscar en equipo actual..." value={searchTermTeam} onChange={(e) => setSearchTermTeam(e.target.value)} />
                </div>

                <div className="items-center gap-2 shrink-0 hidden sm:flex">
                  <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${effectiveViewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
                    <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                  </button>
                  <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${effectiveViewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
                    <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {(() => {
                const coordinators = teamMembers.filter(checkIsCoordinator);
                const members = teamMembers.filter((u) => !checkIsCoordinator(u));

                // Render function for Table Row
                const renderUserRow = (user: User) => {
                  const userConfig = teamConfig.find((c) => c.userId === user._id);

                  // Metadata extraction
                  const projectMeta = user.metadata?.projects?.find((p) => {
                    const pId = p.projectId;
                    const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
                    if (idToCheck === projectId) return true;
                    if (project && p.nombre_proyecto && p.nombre_proyecto.toLowerCase().trim() === project.name.toLowerCase().trim()) return true;
                    return false;
                  });
                  const rolFrame = projectMeta?.nombre_rol_frame || (user.externalInfo?.rolFrames?.length ? user.externalInfo.rolFrames[0] : "-");

                  const activeContract = projectMeta?.contracts?.length ? projectMeta.contracts[projectMeta.contracts.length - 1] : null;
                  const contrato = activeContract?.nombre_contrato || "-";
                  const horario = activeContract?.hora_inicio && activeContract?.hora_fin ? `${activeContract.hora_inicio} - ${activeContract.hora_fin}` : "-";

                  return (
                    <tr key={user._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center shrink-0">
                            <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="font-medium text-gray-900 dark:text-white text-sm">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}` : user.email}</div>
                              {getUserVacationStatus(user._id) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800 animate-pulse">
                                  <FontAwesomeIcon icon={faUmbrellaBeach} className="mr-1" />
                                  DE VACACIONES
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {user.roles && user.roles.length > 0 ? (
                            user.roles.map((r) => {
                              const isCoord = r.name.toLowerCase().includes("coordinador");
                              return (
                                <span key={r._id} className={`text-[10px] px-2 py-0.5 rounded font-medium border ${isCoord ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800" : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"}`}>
                                  {r.name}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-xs text-gray-400">Sin roles</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{rolFrame}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${user.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{user.isActive ? "ACTIVO" : "INACTIVO"}</span>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? user.turnos[0]._id : user.turnos[0]) : undefined;
                          const finalShiftId = shiftIdFromUser || userConfig?.shiftId;
                          const shift = (project?.turnos || []).find((t: any) => (typeof t === "object" ? t._id : t) === finalShiftId);
                          return shift ? (
                            <div className="flex flex-col">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 uppercase tracking-wider w-fit">
                                {typeof shift === "object" ? shift.name : "..."}
                              </span>
                              <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium ml-0.5 mt-0.5 italic tracking-tight">
                                {shift.startTime} - {shift.endTime}
                              </span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(shift.days || [])
                                  .sort((a: number, b: number) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                                  .map((d: number) => (
                                    <span key={d} className="text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.25 font-bold border border-gray-200 dark:border-gray-600">
                                      {formatShiftDays([d])}
                                    </span>
                                  ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">No asignado</span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{contrato}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 font-medium">{horario}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleOpenScheduleModal(user)} className="p-1.5 text-gray-400 hover:text-blue-500 rounded transition-colors" title="Editar Horario">
                            <FontAwesomeIcon icon={faEdit} className="h-3.5 w-3.5" />
                          </button>

                          <button onClick={() => handleRemoveUser(user._id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors" title="Retirar del equipo">
                            <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                };

                const renderUserCard = (user: User) => {
                  const userConfig = teamConfig.find((c) => c.userId === user._id);

                  // Metadata extraction
                  const projectMeta = user.metadata?.projects?.find((p) => {
                    const pId = p.projectId;
                    const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
                    if (idToCheck === projectId) return true;
                    if (project && p.nombre_proyecto && p.nombre_proyecto.toLowerCase().trim() === project.name.toLowerCase().trim()) return true;
                    return false;
                  });
                  const rolFrame = projectMeta?.nombre_rol_frame || (user.externalInfo?.rolFrames?.length ? user.externalInfo.rolFrames[0] : "Sin rol frame");

                  return (
                    <Card
                      key={user._id}
                      className="h-full"
                      header={{
                        title: user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}` : user.email,
                        subtitle: user.email,
                        icon: faUser,
                        iconClassName: "text-blue-600",
                        badges: [
                          { text: user.isActive ? "Activo" : "Inactivo", variant: user.isActive ? "green" : "destructive" },
                          ...(getUserVacationStatus(user._id)
                            ? [
                                {
                                  text: "DE VACACIONES",
                                  variant: "warning" as const,
                                  icon: faUmbrellaBeach,
                                },
                              ]
                            : []),
                        ],
                        badgesPosition: "top",
                      }}
                      footer={{
                        actions: [
                          {
                            icon: faEdit,
                            title: "Editar Horario",
                            onClick: () => handleOpenScheduleModal(user),
                          },
                          {
                            icon: faTrash,
                            title: "Retirar del equipo",
                            onClick: () => handleRemoveUser(user._id),
                          },
                        ],
                      }}
                    >
                      <div className="flex flex-col gap-3">
                        {/* Roles */}
                        <div className="flex flex-col">
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex gap-1 items-center">
                            <FontAwesomeIcon icon={faUsers} className="h-3 w-3" /> Rol/es
                          </label>
                          <div className="flex flex-wrap gap-1">
                            {user.roles && user.roles.length > 0 ? (
                              user.roles.map((r) => {
                                const isCoord = r.name.toLowerCase().includes("coordinador");
                                return (
                                  <span key={r._id} className={`text-[10px] px-2 py-0.5 rounded font-medium border ${isCoord ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800" : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800"}`}>
                                    {r.name}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-xs text-gray-400">Sin roles</span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4">
                          {/* Rol Frame */}
                          <div className="flex flex-col">
                            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex gap-1 items-center">
                              <FontAwesomeIcon icon={faIdCard} className="h-3 w-3" /> Rol Frame
                            </label>
                            <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{rolFrame}</span>
                          </div>
                        </div>

                        {/* Turno Display */}
                        <div className="flex flex-col mt-1">
                          <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Turno</label>
                          <div>
                            {(() => {
                              const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? user.turnos[0]._id : user.turnos[0]) : undefined;
                              const finalShiftId = shiftIdFromUser || userConfig?.shiftId;
                              const shift = (project?.turnos || []).find((t: any) => (typeof t === "object" ? t._id : t) === finalShiftId);
                              return shift ? (
                                <div className="flex flex-col">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 uppercase tracking-wider w-fit">
                                    {typeof shift === "object" ? shift.name : "..."}
                                  </span>
                                  <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium ml-0.5 mt-0.5 italic tracking-tight">
                                    {shift.startTime} - {shift.endTime}
                                  </span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {(shift.days || [])
                                      .sort((a: number, b: number) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
                                      .map((d: number) => (
                                        <span key={d} className="text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded px-1.5 py-0.25 font-bold border border-gray-200 dark:border-gray-600">
                                          {formatShiftDays([d])}
                                        </span>
                                      ))}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic">No asignado</span>
                              );
                            })()}
                          </div>
                        </div>

                        {userConfig && (userConfig.useProjectSchedule === false || (userConfig.startTime && userConfig.endTime)) && (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-2 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded w-fit">
                            <FontAwesomeIcon icon={faClock} /> {userConfig.startTime} - {userConfig.endTime}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                };

                return (
                  <div className="bg-transparent">
                    {teamMembers.length === 0 ? (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center h-64 text-gray-500">
                        <FontAwesomeIcon icon={faUsers} className="h-12 w-12 mb-4 opacity-10" />
                        <p className="text-base font-medium">Aún no hay miembros en el equipo</p>
                        <p className="text-sm mt-1">Usa el botón "Agregar Miembro" para comenzar.</p>
                        <button onClick={() => setShowAddModal(true)} className="mt-4 btn-primary px-4 py-2 text-sm flex items-center gap-2">
                          <FontAwesomeIcon icon={faPlus} />
                          Agregar Miembro
                        </button>
                      </div>
                    ) : (
                      <>
                        {effectiveViewMode === "table" ? (
                          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    <th className="px-4 py-3 font-semibold">Usuario</th>
                                    <th className="px-4 py-3 font-semibold">Rol/es</th>
                                    <th className="px-4 py-3 font-semibold">Rol Frame</th>
                                    <th className="px-4 py-3 font-semibold">Estado</th>
                                    <th className="px-4 py-3 font-semibold">Turno</th>
                                    <th className="px-4 py-3 font-semibold">Contrato</th>
                                    <th className="px-4 py-3 font-semibold">Horario</th>
                                    <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {coordinators.map((u) => renderUserRow(u))}
                                  {members.map((u) => renderUserRow(u))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {coordinators.map((u) => renderUserCard(u))}
                            {members.map((u) => renderUserCard(u))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </>
          )}

          {/* Solicitudes Tab */}
          {activeTab === "solicitudes" && project && (
            <div className="mt-0">
              <TeamSolicitudesTab
                projectId={projectId!}
                project={project}
                onApproved={async () => {
                  // Re-fetch team data and solicitudes count
                  const [projectData, usersData] = await Promise.all([
                    projectsAPI.getProject(projectId!),
                    usersAPI.list({ limit: 10000 }),
                  ]);
                  setProject(projectData);
                  setTeamConfig(projectData.teamConfig || []);
                  setAllUsers(usersData.users);
                  // Update solicitudes count
                  const solis = await usersAPI.listSolicitudes();
                  setSolicitudesCount(solis.filter(u => u.metadata?.projectIds?.includes(projectId!)).length);
                }}
              />
            </div>
          )}
          </div>

          {/* User Schedule Modal */}
          <Modal isOpen={!!editingScheduleUser} onClose={() => setEditingScheduleUser(null)} title={`Horario de ${editingScheduleUser?.firstName || "Usuario"}`} size="sm">
            <div className="space-y-6 py-2">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50 flex gap-3">
                <FontAwesomeIcon icon={faClock} className="text-blue-500 mt-1" />
                <div className="text-sm">
                  <p className="font-semibold text-blue-900 dark:text-blue-200">Configurar Horario Laboral</p>
                  <p className="text-blue-700 dark:text-blue-400 opacity-80 mt-0.5 leading-relaxed">Este horario se usará como base para el cálculo automático de horas extras en el reporte diario.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Usar Horario del Proyecto</p>
                    <p className="text-xs text-gray-500">Usa el horario definido en la configuración general.</p>
                  </div>
                  <button onClick={() => setUserScheduleData((prev) => ({ ...prev, useProjectSchedule: !prev.useProjectSchedule }))} className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${userScheduleData.useProjectSchedule ? "bg-primary-600" : "bg-gray-200 dark:bg-gray-700"}`}>
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${userScheduleData.useProjectSchedule ? "translate-x-5" : "translate-x-0"}`} />
                  </button>
                </div>

                {!userScheduleData.useProjectSchedule && (
                  <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase ml-1">Entrada</label>
                      <input type="time" className="input-field w-full" value={userScheduleData.startTime} onChange={(e) => setUserScheduleData((prev) => ({ ...prev, startTime: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase ml-1">Salida</label>
                      <input type="time" className="input-field w-full" value={userScheduleData.endTime} onChange={(e) => setUserScheduleData((prev) => ({ ...prev, endTime: e.target.value }))} />
                    </div>
                  </div>
                )}
                {/* Selección de Turno en el Modal */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Turno Asignado</label>
                  <select
                    className="input-field w-full"
                    value={userScheduleData.shiftId}
                    onChange={(e) => setUserScheduleData((prev) => ({ ...prev, shiftId: e.target.value }))}
                  >
                    <option value="">Sin turno</option>
                    {(project?.turnos || []).map((t: any) => (
                      <option key={typeof t === "object" ? t._id : t} value={typeof t === "object" ? t._id : t}>
                        {typeof t === "object" ? `${t.name} (${t.startTime} - ${t.endTime}) [${formatShiftDays(t.days)}]` : "..."}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setEditingScheduleUser(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSaveUserSchedule} className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition-all active:scale-95">
                  Guardar Horario
                </button>
              </div>
            </div>
          </Modal>

          {/* Add Members Modal */}
          <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Agregar Miembros al Equipo" subtitle={`Diponibles para asignar (${filteredCandidates.length})`} size="lg">
            <div className="space-y-4 max-h-[70vh] flex flex-col">
              <div className="relative shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FontAwesomeIcon icon={faSearch} className="text-gray-400" />
                </div>
                <input type="text" placeholder="Buscar usuario por nombre o email..." className="input-field pl-10 w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus />
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-700 rounded-lg">
                {filteredCandidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-12 text-gray-500">
                    <FontAwesomeIcon icon={faFilter} className="h-8 w-8 mb-2 opacity-20" />
                    <p className="text-sm">No se encontraron usuarios disponibles</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredCandidates.map((user) => {
                      const isCoordinator = checkIsCoordinator(user);
                      return (
                        <div key={user._id} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="flex items-center justify-center shrink-0">
                              <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}` : user.email}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-gray-500">{user.email}</span>
                                {isCoordinator && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Coordinador</span>}
                                {user.roles?.map((r: any) => {
                                  const isCoord = r.name.toLowerCase().includes("coordinador");
                                  return (
                                    <span key={r._id} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${isCoord ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-100 dark:border-blue-800"}`}>
                                      {r.name}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                          <button onClick={() => handleAddUser(user._id)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-2 group-hover:bg-primary-50 group-hover:text-primary-700 group-hover:border-primary-200 dark:group-hover:bg-primary-900/20 dark:group-hover:text-primary-400 dark:group-hover:border-primary-800">
                            <FontAwesomeIcon icon={faPlus} />
                            Agregar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="shrink-0 pt-2 flex justify-end">
                <button onClick={() => setShowAddModal(false)} className="btn-ghost">
                  Cerrar
                </button>
              </div>
            </div>
          </Modal>
        </>
      ) : null}
    </PageLayout>
  );
};
