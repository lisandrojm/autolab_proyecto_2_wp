import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { projectsAPI, Project } from "../api/projects";
import { usersAPI, User } from "../api/users";
import { useAuthStore } from "../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";

import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { InfoModal } from "../components/ui/InfoModal";
import { Modal } from "../components/ui/Modal";

import { getHelp } from "../data/help/helpContent";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faSearch, faFilter, faUserPlus, faTrash, faBriefcase, faBell, faInfoCircle, faClock } from "@fortawesome/free-solid-svg-icons";

const HELP_KEY = "projectTeam" as const;

export const ProjectTeamPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { token } = useAuthStore();

  // Help
  const [openInfo, setOpenInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  // Notifications Info Modal
  const [showNotifInfo, setShowNotifInfo] = useState(false);

  // Data
  const [project, setProject] = useState<Project | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamConfig, setTeamConfig] = useState<any[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState(""); // For Disponibles
  const [searchTermTeam, setSearchTermTeam] = useState(""); // For Equipo Actual
  const [editingScheduleUser, setEditingScheduleUser] = useState<User | null>(null);
  const [userScheduleData, setUserScheduleData] = useState({
    useProjectSchedule: true,
    startTime: "09:00",
    endTime: "18:00",
  });

  /* ------------------------------ Fetchers ------------------------------- */

  useEffect(() => {
    if (!projectId || !token) return;

    const init = async () => {
      try {
        setLoading(true);
        const [projectData, usersData] = await Promise.all([
          projectsAPI.getProject(projectId),
          usersAPI.list({ limit: 10000 }), // Get all users (no limit)
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
      } catch (error) {
        console.error("Error loading data:", error);
        sweetAlert.error("Error", "No se pudieron cargar los datos del equipo.");
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [projectId, token]);

  /* ------------------------------- Logic --------------------------------- */

  // Derived state
  const clientName = useMemo(() => {
    if (!project) return "";
    if (typeof project.clientId === "object" && project.clientId?.name) {
      return project.clientId.name;
    }
    return "";
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

  // Check Is Coordinator Helper
  const checkIsCoordinator = (user: User) => (typeof user.positionId === "object" && user.positionId?.name?.toLowerCase().includes("coordinador")) || (user.roles && user.roles.some((r) => r.name.toLowerCase().includes("coordinador"))) || user.firstName?.toLowerCase().includes("coordinador") || user.lastName?.toLowerCase().includes("coordinador");

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
  const handleToggleNotifier = (userId: string) => {
    // Logic: Single Selection. Set target true, others false.
    const newConfig = teamMembers.map((member) => {
      const existing = teamConfig.find((c) => c.userId === member._id);
      const isActivating = member._id === userId;

      return {
        userId: member._id,
        canRegister: existing ? existing.canRegister : true,
        isNotifier: isActivating,
        // Preserve other fields with defaults if missing
        useProjectSchedule: existing?.useProjectSchedule ?? true,
        startTime: existing?.startTime || "09:00",
        endTime: existing?.endTime || "18:00",
      };
    });

    updateTeamConfig(newConfig);
  };

  const handleOpenScheduleModal = (user: User) => {
    const existing = teamConfig.find((c) => c.userId === user._id);
    setEditingScheduleUser(user);
    setUserScheduleData({
      useProjectSchedule: existing ? (existing.useProjectSchedule !== undefined ? existing.useProjectSchedule : true) : true,
      startTime: existing?.startTime || project?.workSchedule?.weekdays?.startTime || "09:00",
      endTime: existing?.endTime || project?.workSchedule?.weekdays?.endTime || "18:00",
    });
  };

  const handleSaveUserSchedule = () => {
    if (!editingScheduleUser) return;

    const newConfig = teamMembers.map((member) => {
      const existing = teamConfig.find((c) => c.userId === member._id);
      if (member._id === editingScheduleUser._id) {
        return {
          userId: member._id,
          isNotifier: existing ? existing.isNotifier : false,
          canRegister: existing ? existing.canRegister : true,
          ...userScheduleData,
        };
      }
      return {
        userId: member._id,
        isNotifier: existing ? existing.isNotifier : false,
        canRegister: existing ? existing.canRegister : true,
        useProjectSchedule: existing?.useProjectSchedule ?? true,
        startTime: existing?.startTime || "09:00",
        endTime: existing?.endTime || "18:00",
      };
    });

    updateTeamConfig(newConfig);
    setEditingScheduleUser(null);
    sweetAlert.success("Horario Actualizado", `El horario de ${editingScheduleUser.firstName} ha sido actualizado.`);
  };

  // Ensure Default Notifier
  useEffect(() => {
    if (!loading && teamMembers.length > 0) {
      const coords = teamMembers.filter(checkIsCoordinator);
      if (coords.length > 0) {
        // Check if any coordinator is notifier
        const hasNotifier = teamConfig.some((c) => c.isNotifier && coords.some((u) => u._id === c.userId));
        if (!hasNotifier) {
          // Set first coord as notifier
          handleToggleNotifier(coords[0]._id);
        }
      }
    }
  }, [teamMembers, loading]);

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
      badgeSecondary={{ text: "Equipo", variant: "default" }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Información",
        content: helpEntry?.content,
      }}
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando equipo..." />
        </div>
      ) : project ? (
        <>
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Candidates Column */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Disponibles ({filteredCandidates.length})</h3>
                </div>

                {/* Search input - only for Disponibles */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FontAwesomeIcon icon={faSearch} className="text-gray-400" />
                  </div>
                  <input type="text" placeholder="Buscar por nombre o email..." className="input-field pl-10 w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-y-auto p-2 custom-scrollbar">
                  {filteredCandidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                      <FontAwesomeIcon icon={faFilter} className="h-8 w-8 mb-2 opacity-20" />
                      <p className="text-sm">No se encontraron usuarios</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredCandidates.map((user) => {
                        const isCoordinator = checkIsCoordinator(user);

                        return (
                          <div key={user._id} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all group">
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="w-10 h-10 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 font-bold shrink-0">{user.firstName?.charAt(0) || user.email.charAt(0).toUpperCase()}</div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}` : user.email}</p>
                                <p className="text-xs text-gray-500 truncate">{user.email}</p>

                                {/* Roles Badges */}
                                <div className="flex flex-wrap gap-1 mt-1.5 mb-1">
                                  {user.roles?.map((role) => (
                                    <span key={role._id} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-medium ${role.name.toLowerCase().includes("coordinador") ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"}`}>
                                      {role.name}
                                    </span>
                                  ))}
                                  {isCoordinator && !user.roles?.some((r) => r.name.toLowerCase().includes("coordinador")) && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Coordinador</span>}
                                </div>

                                <div className="flex flex-wrap gap-1">
                                  {user.areaId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.areaId === "object" ? user.areaId.name : "Area"}</span>}
                                  {user.positionId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.positionId === "object" ? user.positionId.name : "Cargo"}</span>}
                                  {user.levelId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.levelId === "object" ? user.levelId.name : "Nivel"}</span>}
                                  {(user as any).externalInfo?.rolFrames?.map((rf: string, idx: number) => (
                                    <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                      {rf}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <button onClick={() => handleAddUser(user._id)} className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors" title="Agregar al equipo">
                              <FontAwesomeIcon icon={faUserPlus} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Current Team Column */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                    Equipo Actual | {project.name} ({teamMembers.length})
                  </h3>
                </div>

                {/* Search input - only for Equipo Actual */}
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <FontAwesomeIcon icon={faSearch} className="text-gray-400" />
                  </div>
                  <input type="text" placeholder="Buscar por nombre o email..." className="input-field pl-10 w-full" value={searchTermTeam} onChange={(e) => setSearchTermTeam(e.target.value)} />
                </div>

                {(() => {
                  const coordinators = teamMembers.filter(checkIsCoordinator);
                  const members = teamMembers.filter((u) => !checkIsCoordinator(u));

                  const renderUserCard = (user: User, isCoord: boolean) => {
                    const userConfig = teamConfig.find((c) => c.userId === user._id);
                    const isNotifier = userConfig ? userConfig.isNotifier : false;

                    return (
                      <div key={user._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/20 rounded border border-gray-100 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-900/30 transition-colors group">
                        <div className="flex items-center gap-3 overflow-hidden flex-1">
                          <div className="w-10 h-10 rounded bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold shrink-0">{user.firstName?.charAt(0) || user.email.charAt(0).toUpperCase()}</div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}` : user.email}</p>
                            <p className="text-xs text-gray-500 truncate">{user.email}</p>

                            {/* Roles Badges */}
                            <div className="flex flex-wrap gap-1 mt-1.5 mb-1">
                              {user.roles?.map((role) => (
                                <span key={role._id} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-medium ${role.name.toLowerCase().includes("coordinador") ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"}`}>
                                  {role.name}
                                </span>
                              ))}
                              {isCoord && !user.roles?.some((r) => r.name.toLowerCase().includes("coordinador")) && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Coordinador</span>}
                            </div>

                            <div className="flex flex-wrap gap-1">
                              {user.areaId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.areaId === "object" ? user.areaId.name : "Area"}</span>}
                              {user.positionId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.positionId === "object" ? user.positionId.name : "Cargo"}</span>}
                              {(user as any).externalInfo?.rolFrames?.map((rf: string, idx: number) => (
                                <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                  {rf}
                                </span>
                              ))}
                            </div>

                            {/* Individual Schedule Display */}
                            {userConfig && userConfig.useProjectSchedule === false && userConfig.startTime && (
                              <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-2 py-0.5 rounded-full w-fit">
                                <FontAwesomeIcon icon={faClock} className="text-[9px]" />
                                <span>
                                  Horario: {userConfig.startTime} - {userConfig.endTime}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isCoord && (
                            <button onClick={() => handleToggleNotifier(user._id)} title={isNotifier ? "Recibe notificaciones" : "Activar notificaciones"} className={`p-2 rounded transition-all ${isNotifier ? "text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30" : "text-gray-300 dark:text-gray-600 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                              <FontAwesomeIcon icon={faBell} />
                            </button>
                          )}
                          <button onClick={() => handleOpenScheduleModal(user)} className="p-2 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors" title="Configurar horario">
                            <FontAwesomeIcon icon={faClock} />
                          </button>
                          <button onClick={() => handleRemoveUser(user._id)} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors" title="Retirar del equipo">
                            <FontAwesomeIcon icon={faTrash} />
                          </button>
                        </div>
                      </div>
                    );
                  };

                  return (
                    <div className="bg-white dark:bg-blue-900/20 rounded-xl shadow-sm border border-blue-200 dark:border-blue-700 overflow-hidden p-4 custom-scrollbar">
                      {teamMembers.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
                          <FontAwesomeIcon icon={faUsers} className="h-8 w-8 mb-2 opacity-20" />
                          <p className="text-sm">Aún no hay miembros en el equipo</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {/* Coordinators Section */}
                          {coordinators.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-3 border-b border-indigo-100 dark:border-indigo-800 pb-1">
                                <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Coordinadores</h4>
                                <button onClick={() => setShowNotifInfo(true)} className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors focus:outline-none" title="Información sobre notificaciones">
                                  <FontAwesomeIcon icon={faInfoCircle} className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="space-y-2">{coordinators.map((u) => renderUserCard(u, true))}</div>
                            </div>
                          )}

                          {/* Members Section */}
                          <div>
                            {coordinators.length > 0 && <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 dark:border-gray-700 pb-1">Colaboradores</h4>}
                            <div className="space-y-2">{members.map((u) => renderUserCard(u, false))}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Notifications Info Modal */}
          <InfoModal isOpen={showNotifInfo} onClose={() => setShowNotifInfo(false)} title="Coordinadores">
            <div className="space-y-6 text-sm text-gray-600 dark:text-gray-300">
              {/* Coordinadores Section */}
              <div className="space-y-3">
                <p>
                  Los <strong className="text-gray-900 dark:text-white">Coordinadores</strong> son los miembros del equipo responsables de generar el <strong className="text-gray-900 dark:text-white">Reporte Diario de Novedades</strong> para este proyecto.
                </p>
                <p>Cada día, el coordinador designado deberá completar el registro de asistencia, horas trabajadas y cualquier novedad relevante del personal asignado.</p>
              </div>

              {/* Divider */}
              <div className="border-t border-gray-200 dark:border-gray-700"></div>

              {/* Gestión de Notificaciones Subsection */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Gestión de Notificaciones</h3>
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded text-yellow-600 dark:text-yellow-400 shrink-0">
                    <FontAwesomeIcon icon={faBell} className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-white block mb-1">Notificador Principal</span>
                    El coordinador seleccionado con la campana activa (icono amarillo) será el responsable de recibir todas las notificaciones importantes del proyecto.
                  </div>
                </div>
                <p className="pl-[3.25rem]">
                  Solo puede haber <strong>un único coordinador</strong> activo como notificador por proyecto. Al activar uno, se desactivará automáticamente cualquier otro que estuviera seleccionado.
                </p>
                <div className="pl-[3.25rem] pt-2">
                  <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-500 border border-gray-200 dark:border-gray-600">Nota: Si no seleccionas a ninguno, el sistema asignará uno por defecto.</span>
                </div>
              </div>
            </div>
          </InfoModal>

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
        </>
      ) : null}
    </PageLayout>
  );
};
