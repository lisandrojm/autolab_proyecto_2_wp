import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { projectsAPI, Project } from "../api/projects";
import { usersAPI, User } from "../api/users";
import { areasAPI, Area } from "../api/areas";
import { positionsAPI, Position } from "../api/positions";
import { useAuthStore } from "../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";

import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { InfoModal } from "../components/ui/InfoModal";

import { getHelp } from "../data/help/helpContent";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faSearch, faFilter, faUserPlus, faTrash, faBriefcase, faBell, faInfoCircle } from "@fortawesome/free-solid-svg-icons";

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
  const [areas, setAreas] = useState<Area[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamConfig, setTeamConfig] = useState<any[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedPosition, setSelectedPosition] = useState<string>("");

  /* ------------------------------ Fetchers ------------------------------- */

  useEffect(() => {
    if (!projectId || !token) return;

    const init = async () => {
      try {
        setLoading(true);
        const [projectData, usersData, areasData, positionsData] = await Promise.all([
          projectsAPI.getProject(projectId),
          usersAPI.list({ limit: 1000 }), // Get all users
          areasAPI.list({ limit: 100 }),
          positionsAPI.list({ limit: 1000 }),
        ]);

        setProject(projectData);
        setTeamConfig(projectData.teamConfig || []);
        setAllUsers(usersData.users);
        setAreas(areasData.areas);
        setPositions(positionsData.positions);
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

  const assignedUserIds = useMemo(() => {
    if (!project || !project.assignedUsers) return [];
    return (project.assignedUsers as any[]).map((u) => (typeof u === "string" ? u : u._id));
  }, [project]);

  // Filtered Users (candidates to add)
  const filteredCandidates = useMemo(() => {
    return allUsers.filter((user) => {
      // 1. Exclude already assigned
      if (assignedUserIds.includes(user._id)) return false;

      // 2. Search Term
      const fullName = `${user.firstName || ""} ${user.lastName || ""}`.toLowerCase();
      const email = user.email.toLowerCase();
      const search = searchTerm.toLowerCase();
      if (search && !fullName.includes(search) && !email.includes(search)) return false;

      // 3. Area Filter
      if (selectedArea) {
        const userAreaId = typeof user.areaId === "object" ? user.areaId?._id : user.areaId;
        if (userAreaId !== selectedArea) return false;
      }

      // 4. Position Filter
      if (selectedPosition) {
        const userPosId = typeof user.positionId === "object" ? user.positionId?._id : user.positionId;
        if (userPosId !== selectedPosition) return false;
      }

      return true;
    });
  }, [allUsers, assignedUserIds, searchTerm, selectedArea, selectedPosition]);

  // Current Team Members
  const teamMembers = useMemo(() => {
    if (!project) return [];
    return assignedUserIds.map((id) => allUsers.find((u) => u._id === id)).filter((u): u is User => !!u);
  }, [project, assignedUserIds, allUsers]);

  // Check Is Coordinator Helper
  const checkIsCoordinator = (user: User) => (typeof user.positionId === "object" && user.positionId?.name?.toLowerCase().includes("coordinador")) || (user.roles && user.roles.some((r) => r.name.toLowerCase().includes("coordinador"))) || user.firstName?.toLowerCase().includes("coordinador") || user.lastName?.toLowerCase().includes("coordinador");

  /* --------------------------- Notifications Logic ------------------------- */

  const updateTeamConfig = async (newConfig: any[]) => {
    if (!project) return;
    try {
      await fetch(`${import.meta.env.VITE_API_URL}/projects/${project._id}/team-config`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ config: newConfig }),
      });
      setTeamConfig(newConfig);
    } catch (err) {
      console.error("Error updating team config", err);
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
      };
    });

    updateTeamConfig(newConfig);
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

  if (loading) return <LoadingSpinner message="Cargando equipo..." />;

  if (!project) {
    return <EmptyState icon={faBriefcase} title="Proyecto no encontrado" description="El proyecto no existe o no tienes acceso." action={{ label: "volver", onClick: () => navigate(-1) }} />;
  }

  return (
    <PageLayout
      title="Gestionar Equipo"
      subtitle="Agrega o quita miembros del equipo"
      onBack={() => navigate(`/projects/${project._id}`)}
      faIcon={{ icon: faUsers }}
      clientMiniAvatar={{
        label: displayedClientName,
        fallback: displayedClientName.charAt(0).toUpperCase(),
        src: client?.logo,
      }}
      badge={{ text: project.name, variant: "default" }}
      badgeSecondary={{ text: `${teamMembers.length} Miembros`, variant: "default" }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Información",
        content: helpEntry?.content,
      }}
    >
      <div className="flex flex-col gap-6">
        {/* Filters Bar */}
        <div className="p-4 min">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FontAwesomeIcon icon={faSearch} className="text-gray-400" />
              </div>
              <input type="text" placeholder="Buscar por nombre o email..." className="input-field pl-10 w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
            <div className="w-full md:w-64">
              <select className="input-field w-full" value={selectedArea} onChange={(e) => setSelectedArea(e.target.value)}>
                <option value="">Todas las Áreas</option>
                {areas.map((area) => (
                  <option key={area._id} value={area._id}>
                    {area.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-64">
              <select className="input-field w-full" value={selectedPosition} onChange={(e) => setSelectedPosition(e.target.value)}>
                <option value="">Todos los Cargos</option>
                {positions.map((pos) => (
                  <option key={pos._id} value={pos._id}>
                    {pos.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Candidates Column */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Disponibles ({filteredCandidates.length})</h3>
              {(searchTerm || selectedArea || selectedPosition) && <span className="text-xs text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 px-2 py-1 rounded-full">Filtros activos</span>}
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
                      <div key={user._id} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 transition-all group">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 font-bold shrink-0">{user.firstName?.charAt(0) || user.email.charAt(0).toUpperCase()}</div>
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

                            <div className="flex gap-1">
                              {user.areaId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.areaId === "object" ? user.areaId.name : "Area"}</span>}
                              {user.positionId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.positionId === "object" ? user.positionId.name : "Cargo"}</span>}
                              {user.levelId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.levelId === "object" ? user.levelId.name : "Nivel"}</span>}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => handleAddUser(user._id)} className="p-2 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors" title="Agregar al equipo">
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
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Equipo Actual | {project.name} ({teamMembers.length})
            </h3>

            {(() => {
              const coordinators = teamMembers.filter(checkIsCoordinator);
              const members = teamMembers.filter((u) => !checkIsCoordinator(u));

              const renderUserCard = (user: User, isCoord: boolean) => {
                const userConfig = teamConfig.find((c) => c.userId === user._id);
                const isNotifier = userConfig ? userConfig.isNotifier : false;

                return (
                  <div key={user._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/20 rounded-lg border border-gray-100 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-900/30 transition-colors group">
                    <div className="flex items-center gap-3 overflow-hidden flex-1">
                      <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-700 dark:text-primary-300 font-bold shrink-0">{user.firstName?.charAt(0) || user.email.charAt(0).toUpperCase()}</div>
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

                        <div className="flex gap-1">
                          {user.areaId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.areaId === "object" ? user.areaId.name : "Area"}</span>}
                          {user.positionId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.positionId === "object" ? user.positionId.name : "Cargo"}</span>}
                          {user.levelId && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{typeof user.levelId === "object" ? user.levelId.name : "Nivel"}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isCoord && (
                        <button onClick={() => handleToggleNotifier(user._id)} title={isNotifier ? "Recibe notificaciones" : "Activar notificaciones"} className={`p-2 rounded-full transition-all ${isNotifier ? "text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30" : "text-gray-300 dark:text-gray-600 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                          <FontAwesomeIcon icon={faBell} />
                        </button>
                      )}
                      <button onClick={() => handleRemoveUser(user._id)} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Retirar del equipo">
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
      <InfoModal isOpen={showNotifInfo} onClose={() => setShowNotifInfo(false)} title="Gestión de Notificaciones">
        <div className="space-y-4 text-sm text-gray-600 dark:text-gray-300">
          <div className="flex items-start gap-3">
            <div className="mt-1 p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-full text-yellow-600 dark:text-yellow-400 shrink-0">
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
      </InfoModal>
    </PageLayout>
  );
};
