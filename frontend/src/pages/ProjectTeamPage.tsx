import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "../api/axiosConfig";
import { projectsAPI, Project } from "../api/projects";
import { usersAPI, User } from "../api/users";
import { useAuthStore } from "../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";

import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { UserCard } from "../components/users/UserCard";
import { Modal } from "../components/ui/Modal";

import { getHelp } from "../data/help/helpContent";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faSearch, faFilter, faTrash, faBriefcase, faClock, faGrip, faTable, faPlus, faEdit, faIdCard, faUser, faUmbrellaBeach, faClipboardList, faUserTie, faLayerGroup, faUserShield, faUserGraduate, faBuilding, faFileContract } from "@fortawesome/free-solid-svg-icons";
import { vacationsAPI, VacationRequest } from "../api/vacations";
import { TeamSolicitudesTab } from "../components/team/TeamSolicitudesTab";
import { TeamCoordinadoresTab } from "../components/team/TeamCoordinadoresTab";
import { Area, areasAPI } from "../api/areas";
import { positionsAPI, Position } from "../api/positions";
import { levelsAPI, Level } from "../api/levels";
import { userProjectsAPI } from "../api/userProjects";
import { clientsAPI } from "../api/clients";
import { infoAPI, InfoItem } from "../api/info";
import { roleFrameAPI, RoleFrameItem } from "../api/roleFrames";

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
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [allLevels, setAllLevels] = useState<Level[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allSedes, setAllSedes] = useState<InfoItem[]>([]);
  const [allCategoriasSat, setAllCategoriasSat] = useState<InfoItem[]>([]);
  const [allEstados, setAllEstados] = useState<InfoItem[]>([]);
  const [allTiposContrato, setAllTiposContrato] = useState<InfoItem[]>([]);
  const [allRoleFrames, setAllRoleFrames] = useState<RoleFrameItem[]>([]);
  const [userLookup, setUserLookup] = useState<Map<number | string, string>>(new Map());

  // Filters
  const [searchTerm, setSearchTerm] = useState(""); // For Disponibles (Modal)
  const [searchTermTeam, setSearchTermTeam] = useState(""); // For Equipo Actual
  const [editingScheduleUser, setEditingScheduleUser] = useState<User | null>(null);
  const [userScheduleData, setUserScheduleData] = useState({
    shiftId: "",
    areaId: "",
    positionId: "",
    levelId: "",
  });
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedUserForWizard, setSelectedUserForWizard] = useState<User | null>(null);
  const [wizardData, setWizardData] = useState({
    // Step 1: Contrato
    rol_frame_id: "",
    categoria_sat_id: "",
    tipo_contrato_id: "",
    estado_id: "",
    hora_inicio: "09:00",
    hora_fin: "18:00",
    fecha_alta_contrato: new Date().toISOString().split("T")[0],
    fecha_baja_contrato: "",
    // Step 2: Sueldo
    cantidad_jornadas_laborales: 5,
    sueldo_jornada: 0,
    sueldo_mano: 0,
    sueldo_mano_texto: "",
    sueldo_neto: 0,
    sueldo_bruto: 0,
    // Step 3: Extras
    sede_id: "",
    reemplazo: false,
    empleado_id_reemplezado: "",
    observaciones: "",
  });

  // UI States
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLg, setIsLg] = useState(window.innerWidth >= 1024);
  const [activeTab, setActiveTab] = useState<"equipo" | "solicitudes" | "coordinadores">("coordinadores");
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
        const [projectData, usersData, vacationsData, areasData, positionsData, levelsData] = await Promise.all([
          projectsAPI.getProject(projectId),
          usersAPI.list({ limit: 10000 }), // Get all users (no limit)
          vacationsAPI.getAll(),
          areasAPI.listAll(),
          positionsAPI.listAll(),
          levelsAPI.listAll(),
        ]);

        setAllPositions(positionsData);
        setAllLevels(levelsData);

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
        setAllAreas(areasData);

        // Fetch additional data for user cards
        const [allClientsData, allProjectsResponse] = await Promise.all([
          clientsAPI.listAll(),
          projectsAPI.listAll({ limit: 500 })
        ]);
        
        setAllClients(allClientsData);
        setAllProjects(allProjectsResponse);

        // Fetch Metadata Info
        const [sedes, cats, estados, tipos, rf] = await Promise.all([
          infoAPI.listByType("sede"),
          infoAPI.listByType("categoria-sat"),
          infoAPI.listByType("estado-empleado"),
          infoAPI.listByType("tipo-contrato"),
          roleFrameAPI.list(),
        ]);
        setAllSedes(sedes);
        setAllCategoriasSat(cats);
        setAllEstados(estados);
        setAllTiposContrato(tipos);
        setAllRoleFrames(rf);

        // Default sede from project if available
        if (projectData.metadata?.sedeId) {
          const sId = String(projectData.metadata.sedeId);
          setWizardData(prev => ({ ...prev, sede_id: sId }));
        }

        // Build user lookup map
        const lookupMap = new Map<number | string, string>();
        usersData.users.forEach((u: User) => {
          const metaId = (u.metadata as any)?.id;
          if (metaId) {
            const name = u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : u.email.split("@")[0];
            lookupMap.set(metaId, name);
          }
        });
        setUserLookup(lookupMap);
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

  const projectMap = useMemo(() => new Map(allProjects.map((p) => [p._id, p])), [allProjects]);
  const clientMap = useMemo(() => new Map(allClients.map((c) => [c._id, c])), [allClients]);

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

  const calculateDuration = (start: string, end: string) => {
    if (!start || !end) return "";
    try {
      const [startH, startM] = start.split(":").map(Number);
      const [endH, endM] = end.split(":").map(Number);
      if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return "";

      let startTotal = startH * 60 + startM;
      let endTotal = endH * 60 + endM;

      if (endTotal <= startTotal) {
        endTotal += 24 * 60; // Cruza la medianoche
      }

      const diff = endTotal - startTotal;
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;

      if (mins === 0) return `${hours}hs`;
      return `${hours}h ${mins}m`;
    } catch (e) {
      return "";
    }
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
    
    // Find project-specific assignment (UserProject)
    const userProject = (user.metadata?.projects as any[])?.find((p: any) => 
      String(typeof p.projectId === 'string' ? p.projectId : p.projectId?._id) === String(project?._id)
    );

    const areaId = (userProject?.areaId?._id || userProject?.areaId || (typeof user.areaId === "object" ? user.areaId?._id : user.areaId)) || "";
    const positionId = (userProject?.positionId?._id || userProject?.positionId || (typeof user.positionId === "object" ? user.positionId?._id : user.positionId)) || "";
    const levelId = (userProject?.levelId?._id || userProject?.levelId || (typeof user.levelId === "object" ? user.levelId?._id : user.levelId)) || "";
    
    const shiftId = (user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? user.turnos[0]._id : user.turnos[0]) : existing?.shiftId) || "";

    setEditingScheduleUser(user);
    setUserScheduleData({
      shiftId,
      areaId,
      positionId,
      levelId,
    });
  };

  const handleSaveUserSchedule = async () => {
    if (!editingScheduleUser) return;

    try {
      // Find selected shift to get times
      const selectedShift = (project?.turnos || []).find(t => String(typeof t === 'object' ? t._id : t) === String(userScheduleData.shiftId));
      const startTime = typeof selectedShift === 'object' ? selectedShift.startTime : "09:00";
      const endTime = typeof selectedShift === 'object' ? selectedShift.endTime : "18:00";

      // 1. Update Project Team Config
      const newConfig = teamMembers.map((member) => {
        const existing = teamConfig.find((c) => c.userId === member._id);
        if (member._id === editingScheduleUser._id) {
          return {
            userId: member._id,
            canRegister: existing ? existing.canRegister : true,
            shiftId: userScheduleData.shiftId,
            useProjectSchedule: true,
            startTime,
            endTime
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

      // 2. Update Global User Info (Turnos & Fallback Area)
      const shiftIds = userScheduleData.shiftId ? [userScheduleData.shiftId] : [];
      await usersAPI.update(editingScheduleUser._id, { 
        turnos: shiftIds,
        areaId: userScheduleData.areaId || null,
        positionId: userScheduleData.positionId || null,
        levelId: userScheduleData.levelId || null
      });

      // 3. Update Project-Specific Assignment (UserProject)
      const userProject = (editingScheduleUser.metadata?.projects as any[])?.find((p: any) => 
        String(typeof p.projectId === 'string' ? p.projectId : p.projectId?._id) === String(project?._id)
      );

      if (userProject?._id) {
        await userProjectsAPI.update(userProject._id, {
          areaId: userScheduleData.areaId || null,
          positionId: userScheduleData.positionId || null,
          levelId: userScheduleData.levelId || null,
        });
      }

      setEditingScheduleUser(null);
      sweetAlert.success("Perfil Actualizado", `El cargo, nivel y área de ${editingScheduleUser.firstName} han sido personalizados para este proyecto.`);

      // Refresh users to show updated data
      const usersData = await usersAPI.list({ limit: 10000 });
      setAllUsers(usersData.users);
    } catch (err) {
      console.error("Error saving user schedule/shift:", err);
      sweetAlert.error("Error", "No se pudo guardar la configuración.");
    }
  };

  /* ------------------------------- Actions -------------------------------- */

  const handleAddUser = (userId: string) => {
    const user = allUsers.find(u => u._id === userId);
    if (!user) return;
    
    // Attempt to find existing data to pre-fill from user history
    const metadataProjects = user.metadata?.projects || [];
    const lastProject = metadataProjects.length > 0 ? metadataProjects[metadataProjects.length - 1] : null;
    const lastContract = lastProject?.contracts?.length ? lastProject.contracts[lastProject.contracts.length - 1] : null;

    // Default statuses and IDs
    const activoEstado = allEstados.find(e => e.name.toLowerCase().includes("activo"));
    
    // Try to map names from last contract to current IDs
    let initialCatId = "";
    if (lastContract?.nombre_categoria_sat) {
      initialCatId = String(allCategoriasSat.find(c => c.name === lastContract.nombre_categoria_sat)?.data.id || "");
    } else if (user.metadata?.categoriaSatId) {
      initialCatId = String(user.metadata.categoriaSatId);
    }

    let initialTipoContratoId = "";
    if (lastContract?.nombre_contrato) {
      initialTipoContratoId = String(allTiposContrato.find(t => t.name === lastContract.nombre_contrato)?.data.id || "");
    }

    let initialEstadoId = String(activoEstado?.data.id || "");
    if (lastContract?.nombre_estado_empleado) {
      const foundEstado = allEstados.find(e => e.name === lastContract.nombre_estado_empleado);
      if (foundEstado) initialEstadoId = String(foundEstado.data.id);
    }

    let initialSedeId = project?.metadata?.sedeId ? String(project.metadata.sedeId) : "";
    if (lastContract?.nombre_sede) {
      const foundSede = allSedes.find(s => s.name === lastContract.nombre_sede);
      if (foundSede) initialSedeId = String(foundSede.data.id);
    }

    let initialRolFrameId = "";
    if (lastProject?.nombre_rol_frame) {
      // Find role frame by name
      const foundRF = allRoleFrames.find(rf => rf.name === lastProject.nombre_rol_frame);
      if (foundRF) initialRolFrameId = String(foundRF.data.rol.id);
    } else if (user.metadata?.roleFrameId) {
      initialRolFrameId = String(user.metadata.roleFrameId);
    }

    setSelectedUserForWizard(user);
    setWizardStep(1);
    
    // Reset wizard data with pulled data or defaults
    setWizardData({
      rol_frame_id: initialRolFrameId,
      categoria_sat_id: initialCatId,
      tipo_contrato_id: initialTipoContratoId,
      estado_id: initialEstadoId,
      hora_inicio: lastContract?.hora_inicio || "09:00",
      hora_fin: lastContract?.hora_fin || "18:00",
      fecha_alta_contrato: new Date().toISOString().split("T")[0],
      fecha_baja_contrato: "",
      cantidad_jornadas_laborales: lastContract?.cantidad_jornadas_laborales || 5,
      sueldo_jornada: lastContract?.sueldo_jornada || 0,
      sueldo_mano: lastContract?.sueldo_mano || 0,
      sueldo_mano_texto: lastContract?.sueldo_mano_texto || "",
      sueldo_neto: 0,
      sueldo_bruto: 0,
      sede_id: initialSedeId,
      reemplazo: false,
      empleado_id_reemplezado: "",
      observaciones: "",
    });
  };

  const handleSaveWizard = async () => {
    if (!selectedUserForWizard || !project) return;

    try {
      setLoading(true);
      // Construct the data to send to specific assignment endpoint
      // backend will handle UserProject and internal assignedUsers
      await projectsAPI.assignMember(project._id, {
        userId: selectedUserForWizard._id,
        contract: {
          ...wizardData,
          externalEmployeeId: (selectedUserForWizard.metadata as any)?.id,
          externalProjectId: (project.metadata as any)?.id || project.externalId,
          // Convert string IDs to numbers as required by IContract
          sede_id: Number(wizardData.sede_id),
          estado_id: Number(wizardData.estado_id),
          categoria_sat_id: Number(wizardData.categoria_sat_id),
          tipo_contrato_id: Number(wizardData.tipo_contrato_id),
          rol_frame_id: Number(wizardData.rol_frame_id),
          empleado_id_reemplezado: wizardData.empleado_id_reemplezado ? Number(wizardData.empleado_id_reemplezado) : null
        }
      });

      sweetAlert.success("Miembro Agregado", `${selectedUserForWizard.firstName} ha sido incorporado al equipo.`);
      
      // Refresh Data
      const updatedProject = await projectsAPI.getProject(project._id);
      setProject(updatedProject);
      setTeamConfig(updatedProject.teamConfig || []);
      
      const usersData = await usersAPI.list({ limit: 10000 });
      setAllUsers(usersData.users);

      setSelectedUserForWizard(null);
      setShowAddModal(false);
    } catch (error: any) {
      console.error("Error assigning member:", error);
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo agregar al miembro.");
    } finally {
      setLoading(false);
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

  // Render function for Table Row
  const renderUserRow = (user: User) => {
    const userConfig = teamConfig.find((c) => c.userId === user._id);
    const projectMeta = user.metadata?.projects?.find((p: any) => {
      const pId = p.projectId;
      const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
      return String(idToCheck) === String(projectId);
    });
    const rolFrame = projectMeta?.nombre_rol_frame || (user.externalInfo?.rolFrames?.length ? user.externalInfo.rolFrames[0] : "-");
    const activeContract = projectMeta?.contracts?.length ? projectMeta.contracts[projectMeta.contracts.length - 1] : null;

    return (
      <tr key={user._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center shrink-0">
              <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}` : user.email}</p>
              <div className="flex items-center gap-1.5 min-w-0">
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
                {getUserVacationStatus(user._id) && (
                  <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                    <FontAwesomeIcon icon={faUmbrellaBeach} className="mr-1" />
                    VC
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {user.roles.slice(0, 2).map((r) => (
              <span key={r._id} className="text-[10px] px-2 py-0.5 rounded font-medium border bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                {r.name}
              </span>
            ))}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{rolFrame}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${user.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{user.isActive ? "ACTIVO" : "INACTIVO"}</span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">
          {typeof user.areaId === "object" ? user.areaId?.name : "-"}
        </td>
        <td className="px-4 py-3">
          {(() => {
            const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? user.turnos[0]._id : user.turnos[0]) : undefined;
            const finalShiftId = userConfig?.shiftId || shiftIdFromUser;
            const shift = (project?.turnos || []).find((t: any) => String(typeof t === "object" ? t._id : t) === String(finalShiftId));
            return shift ? (
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300 uppercase">{typeof shift === "object" ? shift.name : "..."}</span>
                <span className="text-[9px] text-gray-500 italic">{shift.startTime} - {shift.endTime}</span>
              </div>
            ) : (
              <span className="text-xs text-gray-400">-</span>
            );
          })()}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
          {activeContract?.nombre_contrato || "-"}
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">
          {activeContract?.hora_inicio ? `${activeContract.hora_inicio} - ${activeContract.hora_fin}` : "-"}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button onClick={() => handleOpenScheduleModal(user)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Editar horario/área">
              <FontAwesomeIcon icon={faEdit} className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => handleRemoveUser(user._id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title="Retirar del proyecto">
              <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderUserCard = (user: User) => {
    const userConfig = teamConfig.find((c) => c.userId === user._id);
    return (
      <UserCard
        key={user._id}
        user={user}
        allProjects={allProjects}
        allClients={allClients}
        vacations={vacations as any}
        projectContext={project!}
        userConfig={userConfig}
        userLookup={userLookup}
        actions={[
          {
            icon: faEdit,
            title: "Editar Horario",
            onClick: () => handleOpenScheduleModal(user),
          },
          {
            icon: faTrash,
            title: "Retirar del equipo",
            onClick: () => handleRemoveUser(user._id),
            className: "text-red-500 hover:text-red-700",
          },
        ]}
      />
    );
  };

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
        <div className="flex flex-col gap-6">
          {/* TABS */}
          <div className="flex items-center border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab("coordinadores")}
              className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${
                activeTab === "coordinadores"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <FontAwesomeIcon icon={faUserTie} className="text-xs" />
              Coordinadores
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
          </div>

          {/* Tab Content */}
          <div className="mt-0">
            {activeTab === "equipo" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="relative w-full">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <FontAwesomeIcon icon={faSearch} />
                    </span>
                    <input type="text" className="input-field pl-10 h-10" placeholder="Buscar en equipo actual..." value={searchTermTeam} onChange={(e) => setSearchTermTeam(e.target.value)} />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => setViewMode("cards")} className={`px-3 py-2 rounded-md transition-all border dark:border-gray-700 ${effectiveViewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
                      <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                    </button>
                    <button onClick={() => setViewMode("table")} className={`px-3 py-2 rounded-md transition-all border dark:border-gray-700 ${effectiveViewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
                      <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {(() => {
                  const coordinators = teamMembers.filter(checkIsCoordinator);
                  const members = teamMembers.filter((u) => !checkIsCoordinator(u));

                  if (teamMembers.length === 0) {
                    return (
                      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center h-64 text-gray-500">
                        <FontAwesomeIcon icon={faUsers} className="h-12 w-12 mb-4 opacity-10" />
                        <p className="text-base font-medium">Aún no hay miembros en el equipo</p>
                        <p className="text-sm mt-1">Usa el botón "Agregar Miembro" para comenzar.</p>
                      </div>
                    );
                  }

                  return effectiveViewMode === "table" ? (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              <th className="px-4 py-3 font-semibold">Usuario</th>
                              <th className="px-4 py-3 font-semibold">Rol/es</th>
                              <th className="px-4 py-3 font-semibold">Rol Frame</th>
                              <th className="px-4 py-3 font-semibold">Estado</th>
                              <th className="px-4 py-3 font-semibold">Area</th>
                              <th className="px-4 py-3 font-semibold">Turno</th>
                              <th className="px-4 py-3 font-semibold">Contrato</th>
                              <th className="px-4 py-3 font-semibold">Horario</th>
                              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
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
                  );
                })()}
              </div>
            )}

            {activeTab === "coordinadores" && project && (
              <TeamCoordinadoresTab
                projectId={projectId!}
                project={project}
                allUsers={allUsers}
                teamMembers={teamMembers}
                onUpdated={async () => {
                  const updatedProject = await projectsAPI.getProject(projectId!);
                  setProject(updatedProject);
                  setTeamConfig(updatedProject.teamConfig || []);
                }}
              />
            )}

            {activeTab === "solicitudes" && project && (
              <TeamSolicitudesTab
                projectId={projectId!}
                project={project}
                onApproved={async () => {
                  const [projectData, usersData] = await Promise.all([
                    projectsAPI.getProject(projectId!),
                    usersAPI.list({ limit: 10000 }),
                  ]);
                  setProject(projectData);
                  setTeamConfig(projectData.teamConfig || []);
                  setAllUsers(usersData.users);
                  const solis = await usersAPI.listSolicitudes();
                  setSolicitudesCount(solis.filter(u => u.metadata?.projectIds?.includes(projectId!)).length);
                }}
              />
            )}
          </div>

          {/* Modals */}
          <Modal isOpen={!!editingScheduleUser} onClose={() => setEditingScheduleUser(null)} title={`Configurar Miembro: ${editingScheduleUser?.firstName || "Usuario"}`} size="sm">
            <div className="space-y-6 py-2">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900/50 flex gap-3">
                <FontAwesomeIcon icon={faIdCard} className="text-blue-500 mt-1" />
                <div className="text-sm">
                  <p className="font-semibold text-blue-900 dark:text-blue-200">Asignar Área y Turno</p>
                  <p className="text-blue-700 dark:text-blue-400 opacity-80 mt-0.5 leading-relaxed">Define el área de trabajo y el turno correspondiente para este proyecto.</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5 text-left">
                  <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Área de Trabajo</label>
                  <select
                    className="input-field w-full text-sm font-medium"
                    value={userScheduleData.areaId}
                    onChange={(e) => setUserScheduleData(prev => ({ ...prev, areaId: e.target.value, shiftId: "" }))}
                  >
                    <option value="">Sin área asignada</option>
                    {allAreas.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5 pt-1 text-left">
                  <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Cargo</label>
                  <select
                    className="input-field w-full text-sm font-medium"
                    value={userScheduleData.positionId}
                    onChange={(e) => setUserScheduleData(prev => ({ ...prev, positionId: e.target.value, levelId: "" }))}
                  >
                    <option value="">Sin cargo asignado</option>
                    {allPositions.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5 pt-1 text-left">
                  <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Nivel</label>
                  <select
                    className="input-field w-full text-sm font-medium"
                    value={userScheduleData.levelId}
                    onChange={(e) => setUserScheduleData(prev => ({ ...prev, levelId: e.target.value }))}
                    disabled={!userScheduleData.positionId}
                  >
                    <option value="">{userScheduleData.positionId ? "Sin nivel asignado" : "Primero elige un cargo"}</option>
                    {allLevels
                      .filter(l => String(typeof l.positionId === 'object' ? (l.positionId as any)?._id : l.positionId) === String(userScheduleData.positionId))
                      .map(l => <option key={l._id} value={l._id}>{l.name}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5 pt-1 text-left">
                  <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest ml-1">Turno Asignado</label>
                  <select
                    className="input-field w-full text-sm font-medium"
                    value={userScheduleData.shiftId}
                    onChange={(e) => setUserScheduleData((prev) => ({ ...prev, shiftId: e.target.value }))}
                    disabled={!userScheduleData.areaId}
                  >
                    <option value="">{userScheduleData.areaId ? "Selecciona un turno" : "Primero elige un área"}</option>
                    {(() => {
                      if (!project || !userScheduleData.areaId) return null;
                      const areaCfg = project.areasConfig?.find((ac: any) => String(typeof ac.areaId === 'object' ? ac.areaId?._id : ac.areaId) === String(userScheduleData.areaId));
                      const allowedShiftIds = (areaCfg?.shiftIds || []).map((s: any) => typeof s === 'object' ? s._id : s);
                      return (project.turnos || [])
                        .filter(t => allowedShiftIds.some(id => String(id) === String(typeof t === "object" ? t._id : t)))
                        .map((t: any) => (
                          <option key={typeof t === "object" ? t._id : t} value={typeof t === "object" ? t._id : t}>
                            {typeof t === "object" ? `${t.name} (${t.startTime} - ${t.endTime})` : "..."}
                          </option>
                        ));
                    })()}
                  </select>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button onClick={() => setEditingScheduleUser(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Cancelar
                </button>
                <button onClick={handleSaveUserSchedule} className="flex-1 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 shadow-lg shadow-primary-500/20 transition-all active:scale-95">
                  Guardar Cambios
                </button>
              </div>
            </div>
          </Modal>

          <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Agregar Miembros al Equipo" subtitle={`Diponibles para asignar (${filteredCandidates.length})`} size="xl">
            <div className="space-y-4 max-h-[85vh] flex flex-col">
              <div className="relative shrink-0">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FontAwesomeIcon icon={faSearch} className="text-gray-400" />
                </div>
                <input type="text" placeholder="Buscar usuario por nombre o email..." className="input-field pl-10 w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus />
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-700 rounded-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Rol</th>
                        <th className="px-4 py-3">Rol Frame</th>
                        <th className="px-4 py-3">Proyecto/s</th>
                        <th className="px-4 py-3">Turnos asociados</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                      {filteredCandidates.map((user) => {
                        const isCoordinator = checkIsCoordinator(user);
                        const metadataProjects = user.metadata?.projects || [];
                        const rolFrame = metadataProjects[0]?.nombre_rol_frame || (user.externalInfo?.rolFrames?.length ? user.externalInfo.rolFrames[0] : "-");
                        const activeProjects = Array.from(new Set(metadataProjects.map(p => p.nombre_proyecto))).filter(Boolean);

                        return (
                          <tr key={user._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}` : user.email}</span>
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[180px]">{user.email}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1 max-w-[150px]">
                                {isCoordinator && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 whitespace-nowrap">Coord.</span>}
                                {(user.roles || []).map(r => <span key={r._id} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap border bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-100 dark:border-blue-800">{r.name}</span>)}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">{rolFrame}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-0.5">
                                {activeProjects.length > 0 ? activeProjects.map((p, idx) => <span key={idx} className="text-[10px] text-gray-500 dark:text-gray-400 italic truncate max-w-[150px]">{p}</span>) : <span className="text-xs text-gray-400">—</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1.5">
                                {user.turnos && user.turnos.length > 0 ? user.turnos.map(t => (
                                  <div key={typeof t === 'string' ? t : t._id} className="flex flex-col gap-0.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 uppercase w-fit">{typeof t === 'object' ? t.name : "Turno"}</span>
                                    {typeof t === 'object' && t.startTime && t.endTime && <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium ml-0.5 italic">{t.startTime} - {t.endTime}</span>}
                                  </div>
                                )) : <span className="text-xs text-gray-400">—</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => handleAddUser(user._id)} className="btn-secondary text-[11px] py-1.5 px-3 flex items-center gap-2 ml-auto hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all font-bold">
                                <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
                                Agregar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="shrink-0 pt-2 flex justify-end">
                <button onClick={() => setShowAddModal(false)} className="btn-ghost">Cerrar</button>
              </div>
            </div>
          </Modal>

          {/* Wizard Modal */}
          <Modal isOpen={!!selectedUserForWizard} onClose={() => setSelectedUserForWizard(null)} title="Edición integrante" subtitle={project?.name} size="xl">
            <div className="space-y-6">
              {/* Stepper Header */}
              <div className="flex items-center bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1">
                {[
                  { step: 1, label: "Contrato" },
                  { step: 2, label: "Sueldo" },
                  { step: 3, label: "Extras" }
                ].map(s => (
                  <button
                    key={s.step}
                    onClick={() => s.step < wizardStep && setWizardStep(s.step as any)}
                    className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                      wizardStep === s.step 
                        ? "bg-white dark:bg-gray-800 text-blue-600 shadow-sm border border-gray-100 dark:border-gray-700" 
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Step 1: Contrato */}
              {wizardStep === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empleado *</label>
                    <input type="text" className="input-field w-full bg-gray-50 dark:bg-transparent" value={`${selectedUserForWizard?.firstName} ${selectedUserForWizard?.lastName}`} readOnly />
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Rol a desempeñar</label>
                    <select 
                      className="input-field w-full" 
                      value={wizardData.rol_frame_id} 
                      onChange={e => setWizardData(prev => ({ ...prev, rol_frame_id: e.target.value }))}
                    >
                      <option value="">Selecciona rol...</option>
                      {allRoleFrames.map(rf => (
                        <option key={rf._id} value={rf.data.rol.id}>{rf.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Categoria SAT *</label>
                    <select 
                      className="input-field w-full"
                      value={wizardData.categoria_sat_id}
                      onChange={e => setWizardData(prev => ({ ...prev, categoria_sat_id: e.target.value }))}
                      required
                    >
                      <option value="">Selecciona categoria...</option>
                      {allCategoriasSat.map(c => <option key={c._id} value={c.data.id}>{c.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Tipo de contrato *</label>
                    <select 
                      className="input-field w-full"
                      value={wizardData.tipo_contrato_id}
                      onChange={e => setWizardData(prev => ({ ...prev, tipo_contrato_id: e.target.value }))}
                      required
                    >
                      <option value="">Selecciona tipo...</option>
                      {allTiposContrato.map(t => <option key={t._id} value={t.data.id}>{t.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Estado *</label>
                    <select 
                      className="input-field w-full"
                      value={wizardData.estado_id}
                      onChange={e => setWizardData(prev => ({ ...prev, estado_id: e.target.value }))}
                      required
                    >
                      <option value="">Selecciona estado...</option>
                      {allEstados.map(e => <option key={e._id} value={e.data.id}>{e.name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Hora inicio - HH:MM</label>
                    <input 
                      type="time" 
                      className="input-field w-full" 
                      value={wizardData.hora_inicio} 
                      onChange={e => setWizardData(prev => ({ ...prev, hora_inicio: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Hora fin - HH:MM</label>
                    <input 
                      type="time" 
                      className="input-field w-full" 
                      value={wizardData.hora_fin} 
                      onChange={e => setWizardData(prev => ({ ...prev, hora_fin: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Fecha alta contrato</label>
                    <input 
                      type="date" 
                      className="input-field w-full text-sm" 
                      value={wizardData.fecha_alta_contrato} 
                      onChange={e => setWizardData(prev => ({ ...prev, fecha_alta_contrato: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Fecha baja contrato</label>
                    <input 
                      type="date" 
                      className="input-field w-full text-sm" 
                      value={wizardData.fecha_baja_contrato} 
                      onChange={e => setWizardData(prev => ({ ...prev, fecha_baja_contrato: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {/* Step 2: Sueldo */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Cantidad de jornadas laborales *</label>
                      <input 
                        type="number" 
                        className="input-field w-full"
                        value={wizardData.cantidad_jornadas_laborales}
                        onChange={e => setWizardData(prev => ({ ...prev, cantidad_jornadas_laborales: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo por jornada *</label>
                      <input 
                        type="number" 
                        className="input-field w-full"
                        value={wizardData.sueldo_jornada}
                        onChange={e => setWizardData(prev => ({ ...prev, sueldo_jornada: Number(e.target.value) }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo en mano</label>
                    <input 
                      type="number" 
                      className="input-field w-full"
                      value={wizardData.sueldo_mano}
                      onChange={e => setWizardData(prev => ({ ...prev, sueldo_mano: Number(e.target.value) }))}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo en mano texto *</label>
                    <input 
                      type="text" 
                      className="input-field w-full"
                      placeholder="Ej: Cincuenta mil pesos"
                      value={wizardData.sueldo_mano_texto}
                      onChange={e => setWizardData(prev => ({ ...prev, sueldo_mano_texto: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo neto</label>
                      <input 
                        type="number" 
                        className="input-field w-full"
                        value={wizardData.sueldo_neto}
                        onChange={e => setWizardData(prev => ({ ...prev, sueldo_neto: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo bruto</label>
                      <input 
                        type="number" 
                        className="input-field w-full"
                        value={wizardData.sueldo_bruto}
                        onChange={e => setWizardData(prev => ({ ...prev, sueldo_bruto: Number(e.target.value) }))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Extras */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sede *</label>
                    <select 
                      className="input-field w-full"
                      value={wizardData.sede_id}
                      onChange={e => setWizardData(prev => ({ ...prev, sede_id: e.target.value }))}
                    >
                      <option value="">Selecciona sede...</option>
                      {allSedes.map(s => <option key={s._id} value={s.data.id}>{s.name}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-100 dark:border-gray-800">
                    <input 
                      type="checkbox" 
                      id="esReemplazo" 
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" 
                      checked={wizardData.reemplazo}
                      onChange={e => setWizardData(prev => ({ ...prev, reemplazo: e.target.checked }))}
                    />
                    <label htmlFor="esReemplazo" className="text-sm font-medium text-gray-700 dark:text-gray-300">Es reemplazo</label>
                  </div>

                  {wizardData.reemplazo && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empleado reemplazado</label>
                      <select 
                        className="input-field w-full"
                        value={wizardData.empleado_id_reemplezado}
                        onChange={e => setWizardData(prev => ({ ...prev, empleado_id_reemplezado: e.target.value }))}
                      >
                        <option value="">Selecciona empleado...</option>
                        {teamMembers.map(m => (
                          <option key={m._id} value={(m.metadata as any)?.id}>{m.firstName} {m.lastName}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Observaciones</label>
                    <textarea 
                      className="input-field w-full min-h-[100px] py-3" 
                      placeholder="Notas adicionales..."
                      value={wizardData.observaciones}
                      onChange={e => setWizardData(prev => ({ ...prev, observaciones: e.target.value }))}
                    />
                  </div>
                </div>
              )}

              {/* Wizard Footer */}
              <div className="flex gap-3 pt-6 border-t border-gray-100 dark:border-gray-700">
                {wizardStep > 1 && (
                  <button onClick={() => setWizardStep((wizardStep - 1) as any)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all">
                    ANTERIOR
                  </button>
                )}
                {wizardStep < 3 ? (
                  <button onClick={() => setWizardStep((wizardStep + 1) as any)} className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95 uppercase tracking-wider">
                    SIGUIENTE
                  </button>
                ) : (
                  <button onClick={handleSaveWizard} className="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg shadow-green-600/20 transition-all active:scale-95 uppercase tracking-wider">
                    GUARDAR
                  </button>
                )}
              </div>
            </div>
          </Modal>
        </div>
      ) : null}
    </PageLayout>
  );
};
