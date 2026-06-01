import React, { useEffect, useState, useMemo } from "react";
import { fuzzyMatch } from "../utils/searchHelpers";
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
import { SearchAndFilters } from "../components/ui/SearchAndFilters";

import { getHelp } from "../data/help/helpContent";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faSearch, faFilter, faTrash, faBriefcase, faClock, faGrip, faTable, faPlus, faEdit, faIdCard, faUser, faUmbrellaBeach, faClipboardList, faUserTie, faLayerGroup, faUserShield, faUserGraduate, faBuilding, faFileContract, faInfoCircle, faChevronDown, faXmark } from "@fortawesome/free-solid-svg-icons";
import { vacationsAPI, VacationRequest } from "../api/vacations";
import { TeamSolicitudesTab } from "../components/team/TeamSolicitudesTab";
import { TeamCoordinadoresTab } from "../components/team/TeamCoordinadoresTab";
import { Area, areasAPI } from "../api/areas";
import { positionsAPI, Position } from "../api/positions";
import { levelsAPI, Level } from "../api/levels";
import { userProjectsAPI } from "../api/userProjects";
import { shiftsAPI, Shift } from "../api/shifts";
import { clientsAPI } from "../api/clients";
import { infoAPI, InfoItem } from "../api/info";
import { roleFrameAPI, RoleFrameItem } from "../api/roleFrames";

const HELP_KEY = "projectTeam" as const;

export const ProjectTeamPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { token } = useAuthStore();

  // Help
  // Help
  const [openInfo, setOpenInfo] = useState(false);
  const [openCoordinadoresInfo, setOpenCoordinadoresInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  // Data
  const [project, setProject] = useState<Project | null>(null);
   const [allUsers, setAllUsers] = useState<User[]>([]);
   const [candidateUsers, setCandidateUsers] = useState<User[]>([]);
   const [searchingCandidates, setSearchingCandidates] = useState(false);
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
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [userLookup, setUserLookup] = useState<Map<number | string, string>>(new Map());

  // Filters
  const [searchTerm, setSearchTerm] = useState(""); // For Disponibles (Modal)
  const [filterRole, setFilterRole] = useState(""); // Filter by Role
  const [filterRoleFrame, setFilterRoleFrame] = useState(""); // Filter by Role Frame
  const [filterProject, setFilterProject] = useState(""); // Filter by Project
  const [showFilters, setShowFilters] = useState(false); // Toggle filters UI
  const [searchTermTeam, setSearchTermTeam] = useState(""); // For Equipo Actual
  const [filterUserStatus, setFilterUserStatus] = useState<string>("");
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedUserForWizard, setSelectedUserForWizard] = useState<User | null>(null);
  const [viewingShiftsData, setViewingShiftsData] = useState<{ user: User; areaId: string; areaName: string } | null>(null);
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
    sueldo_diario_neto: 0,
    diferencia_diaria_neto: 0,
    sueldo_neto: 0,
    sueldo_bruto: 0,
    // Step 3: Extras
    sede_id: "",
    reemplazo: false,
    empleado_id_reemplezado: "",
    observaciones: "",
    areaShiftAssignments: [] as { areaId: string; shiftIds: string[] }[],
    positionId: "",
    levelId: "",
  });

  // UI States
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLg, setIsLg] = useState(window.innerWidth >= 1024);
  const [activeTab, setActiveTab] = useState<"equipo" | "solicitudes" | "coordinadores">("equipo");
  const [solicitudesCount, setSolicitudesCount] = useState(0);
  const [showCandidatesInfo, setShowCandidatesInfo] = useState(false);

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
  
  /* -------------------------- Auto-Calculations --------------------------- */
  useEffect(() => {
    const sueldo_mano = wizardData.sueldo_jornada * wizardData.cantidad_jornadas_laborales;
    const sueldo_diario_neto = Number((wizardData.sueldo_neto / 30).toFixed(2));
    const diferencia_diaria_neto = Number((wizardData.sueldo_jornada - sueldo_diario_neto).toFixed(2));

    if (
      sueldo_mano !== wizardData.sueldo_mano ||
      sueldo_diario_neto !== wizardData.sueldo_diario_neto ||
      diferencia_diaria_neto !== wizardData.diferencia_diaria_neto
    ) {
      setWizardData((prev) => ({
        ...prev,
        sueldo_mano,
        sueldo_diario_neto,
        diferencia_diaria_neto,
      }));
    }
  }, [wizardData.sueldo_jornada, wizardData.cantidad_jornadas_laborales, wizardData.sueldo_neto]);

  /* ------------------------------ Fetchers ------------------------------- */

  useEffect(() => {
    if (!projectId || !token) return;

    const init = async () => {
      try {
        setLoading(true);
        const [projectData, usersData, vacationsData, areasData, positionsData, levelsData, shiftsData] = await Promise.all([
          projectsAPI.getProject(projectId),
          usersAPI.list({ projectId, limit: 500 }), // Only fetch team members initially
          vacationsAPI.getAll(),
          areasAPI.listAll(),
          positionsAPI.listAll(),
          levelsAPI.listAll(),
          shiftsAPI.getAll(),
        ]);

        setAllPositions(positionsData);
        setAllLevels(levelsData);
        setAllShifts(shiftsData);

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

        // Set initial users from the project query
        let teamUsers = usersData.users;
        
        // Check for users in project.assignedUsers that weren't returned by the query
        // This handles cases where the user's projectIds field is out of sync
        const currentProject = projectData; // may have been updated by cleanup
        const assignedIds = ((currentProject.assignedUsers as any[]) || []).map((u: any) => typeof u === "string" ? u : u._id);
        const loadedIds = new Set(teamUsers.map((u: User) => u._id));
        const missingIds = assignedIds.filter((id: string) => !loadedIds.has(id));
        
        if (missingIds.length > 0) {
          console.log(`📋 Fetching ${missingIds.length} missing team members by ID...`);
          const missingUsers = await Promise.all(
            missingIds.map(async (id: string) => {
              try {
                return await usersAPI.get(id);
              } catch {
                return null;
              }
            })
          );
          const validMissing = missingUsers.filter((u): u is User => u !== null);
          teamUsers = [...teamUsers, ...validMissing];
        }
        
        setAllUsers(teamUsers);
        setVacations(vacationsData);
        setAllAreas(areasData);

        // Fetch additional data for user cards
        const [allClientsData, allProjectsResponse] = await Promise.all([clientsAPI.listAll(), projectsAPI.listAll({ limit: 500 })]);

        setAllClients(allClientsData);
        setAllProjects(allProjectsResponse);

        // Fetch Metadata Info
        const [sedes, cats, estados, tipos, rf] = await Promise.all([infoAPI.listByType("sede"), infoAPI.listByType("categoria-sat"), infoAPI.listByType("estado-empleado"), infoAPI.listByType("contrato"), roleFrameAPI.list()]);
        setAllSedes(sedes);
        setAllCategoriasSat(cats);
        setAllEstados(estados);
        setAllTiposContrato(tipos);
        setAllRoleFrames(rf);

        // Default sede from project if available
        if (projectData.metadata?.sedeId) {
          const sId = String(projectData.metadata.sedeId);
          setWizardData((prev) => ({ ...prev, sede_id: sId }));
        }

        // Build user lookup map
        const lookupMap = new Map<number | string, string>();
        teamUsers.forEach((u: User) => {
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
        const count = solis.filter((u) => u.metadata?.projectIds?.includes(projectId)).length;
        setSolicitudesCount(count);
      } catch (e) {
        console.error("Error fetching solicitudes count:", e);
      }
    };
    fetchCount();
  }, [projectId]);

  // Candidate Search
  useEffect(() => {
    if (!showAddModal) {
      setCandidateUsers([]);
      setSearchTerm("");
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      // If we have 1 character, don't search yet to avoid noise
      if (searchTerm.length === 1) {
        setCandidateUsers([]);
        return;
      }

      try {
        setSearchingCandidates(true);
        // Fetch active users. If searchTerm is empty, it returns first page of active users.
        const params: any = { limit: 500, metadataActivo: "true" };
        if (searchTerm.length >= 2) {
          params.email = searchTerm;
        }
        const response = await usersAPI.list(params);
        setCandidateUsers(response.users);
      } catch (error) {
        console.error("Error fetching candidates:", error);
      } finally {
        setSearchingCandidates(false);
      }
    }, searchTerm.length >= 2 ? 500 : 0); // No debounce for initial load or empty search

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, showAddModal]);

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

    return Array.from(new Set(fromProject));
  }, [project, projectId]);

  const activeAddFiltersCount = useMemo(() => [filterRole, filterRoleFrame, filterProject].filter(Boolean).length, [filterRole, filterRoleFrame, filterProject]);

  // Filtered Users (candidates to add) - only search by name or email
   const filteredCandidates = useMemo(() => {
    // When in Add Modal, we use candidateUsers (which contains active users from API)
    const source = showAddModal ? candidateUsers : allUsers;
    
    return source.filter((user) => {
      // 1. Exclude already assigned
      if (assignedUserIds.includes(user._id)) return false;

      // 2. Search Term (name or email only)
      if (searchTerm && searchTerm.length >= 2) {
        if (!fuzzyMatch(`${user.firstName || ""} ${user.lastName || ""}`, searchTerm) && !fuzzyMatch(user.email, searchTerm)) return false;
      }

      // 3. Filter by Role
      if (filterRole) {
        if (!user.roles?.some((r) => r.name === filterRole)) return false;
      }

      // 4. Filter by Role Frame
      if (filterRoleFrame) {
        const metadataProjects = user.metadata?.projects || [];
        const userRF = metadataProjects[0]?.nombre_rol_frame || (user.externalInfo?.rolFrames?.length ? user.externalInfo.rolFrames[0] : "");
        if (userRF !== filterRoleFrame) return false;
      }

      // 5. Filter by Project
      if (filterProject) {
        const metadataProjects = user.metadata?.projects || [];
        const hasProject = metadataProjects.some((p) => p.nombre_proyecto === filterProject);
        if (!hasProject) return false;
      }

      return true;
    });
  }, [allUsers, candidateUsers, showAddModal, assignedUserIds, searchTerm, filterRole, filterRoleFrame, filterProject]);

  const teamMembers = useMemo(() => {
    return assignedUserIds.map((id) => allUsers.find((u) => u._id === id)).filter((u): u is User => !!u);
  }, [assignedUserIds, allUsers]);

  const filteredTeamMembers = useMemo(() => {
    return teamMembers.filter((user) => {
      // User Status Filter
      if (filterUserStatus === "active" && !user.metadata?.activo) return false;
      if (filterUserStatus === "inactive" && user.metadata?.activo) return false;

      // Search Filter
      if (searchTermTeam) {
        if (!fuzzyMatch(`${user.firstName || ""} ${user.lastName || ""}`, searchTermTeam) && !fuzzyMatch(user.email, searchTermTeam)) return false;
      }

      return true;
    });
  }, [teamMembers, searchTermTeam, filterUserStatus]);

  const displayedCount = useMemo(() => {
    if (activeTab === "equipo") {
      return filteredTeamMembers.length;
    }
    if (activeTab === "coordinadores") {
      const coordIds = new Set(
        (project?.coordinatorAssignments || [])
          .map((asm) => typeof asm.userId === "object" ? asm.userId?._id : asm.userId)
          .filter(Boolean)
      );
      return coordIds.size;
    }
    if (activeTab === "solicitudes") {
      return solicitudesCount;
    }
    return teamMembers.length;
  }, [activeTab, filteredTeamMembers.length, project?.coordinatorAssignments, solicitudesCount, teamMembers.length]);

  const hasMobileCoordinator = useMemo(() => {
    return teamMembers.some((u) => u.roles?.some((r) => {
      const n = r.name.toLowerCase();
      return n.includes("mobile") && n.includes("coordinador");
    }));
  }, [teamMembers]);


  const availableCategoriasSat = useMemo(() => {
    let list: any[] = [];
    if (wizardData.rol_frame_id) {
      const selectedRF = allRoleFrames.find((rf) => String(rf.data?.rol?.id) === String(wizardData.rol_frame_id));
      if (selectedRF && Array.isArray(selectedRF.data?.categoriasSat)) {
        list = [...selectedRF.data.categoriasSat];
      }
    }

    // Fallback: If list is empty but we have allCategoriasSat, use allCategoriasSat as options
    if (list.length === 0 && allCategoriasSat.length > 0) {
      list = allCategoriasSat.map((c) => ({
        id: c.data?.id,
        nombre: c.name,
        numeroCategoria: c.data?.numeroCategoria || c.data?.id
      }));
    }

    // Ensure the currently selected category is in the list
    if (wizardData.categoria_sat_id) {
      const alreadyInList = list.some((c) => String(c.id) === String(wizardData.categoria_sat_id));
      if (!alreadyInList) {
        // Find it in global list
        const globalCat = allCategoriasSat.find((c) => String(c.data?.id) === String(wizardData.categoria_sat_id));
        if (globalCat) {
          list.push({
            id: globalCat.data?.id,
            nombre: globalCat.name,
            numeroCategoria: globalCat.data?.numeroCategoria || globalCat.data?.id
          });
        }
      }
    }

    return list;
  }, [allRoleFrames, allCategoriasSat, wizardData.rol_frame_id, wizardData.categoria_sat_id]);

  const userAssignedRoleFrames = useMemo(() => {
    if (!selectedUserForWizard) return [];

    const assignedNames = selectedUserForWizard.externalInfo?.rolFrames || [];
    const projectsRFNames = (selectedUserForWizard.metadata?.projects || []).map((p) => p.nombre_rol_frame).filter(Boolean);
    
    // Add names from all contracts in projects as well!
    const contractRFNames: string[] = [];
    (selectedUserForWizard.metadata?.projects || []).forEach((p: any) => {
      (p.contracts || []).forEach((c: any) => {
        if (c.nombre_rol_frame) contractRFNames.push(c.nombre_rol_frame);
      });
    });

    const allAssignedNames = Array.from(new Set([...assignedNames, ...projectsRFNames, ...contractRFNames]));

    let filtered = allRoleFrames.filter((rf) => allAssignedNames.includes(rf.name));

    // If still empty, check the specific ID in metadata
    if (filtered.length === 0 && selectedUserForWizard.metadata?.roleFrameId) {
      const rfId = String(selectedUserForWizard.metadata.roleFrameId);
      filtered = allRoleFrames.filter((rf) => String(rf.data?.rol?.id) === rfId);
    }
    
    // Check contracts' rol_frame_id
    if (filtered.length === 0) {
      const contractRFIds: string[] = [];
      (selectedUserForWizard.metadata?.projects || []).forEach((p: any) => {
        (p.contracts || []).forEach((c: any) => {
          if (c.rol_frame_id) contractRFIds.push(String(c.rol_frame_id));
        });
      });
      if (contractRFIds.length > 0) {
        filtered = allRoleFrames.filter((rf) => contractRFIds.includes(String(rf.data?.rol?.id)));
      }
    }

    // If STILL empty (e.g. editing existing member with no rolFrame history), show all role frames
    if (filtered.length === 0) {
      filtered = allRoleFrames;
    }

    return filtered;
  }, [allRoleFrames, selectedUserForWizard]);

  // Check Is Coordinator Helper
  const checkIsCoordinator = (user: User) => (typeof user.positionId === "object" && user.positionId?.name?.toLowerCase().includes("coordinador")) || (user.roles && user.roles.some((r) => r.name.toLowerCase().includes("coordinador"))) || user.firstName?.toLowerCase().includes("coordinador") || user.lastName?.toLowerCase().includes("coordinador");

  // Get standard shifts for a user assigned to an area
  const getStandardShifts = (user: User, userConfig: any, activeContract: any, areaId: string, areaName: string) => {
    let shifts: any[] = [];
    if (!user) return shifts;

    // Helper to get coordinated shift IDs for exclusion
    const getCoordinatedShiftIds = () => {
      if (!project?.coordinatorAssignments) return [];
      return project.coordinatorAssignments
        .filter((asm) => {
          const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
          const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
          return String(uid) === String(user._id) && String(aid) === String(areaId);
        })
        .map((asm) => typeof asm.shiftId === "object" ? (asm.shiftId as any)?._id : asm.shiftId);
    };

    const coordShiftIds = getCoordinatedShiftIds();

    // 1. Check team configuration assignments (Wizard) and EXCLUDE coordinated ones
    const assignments = userConfig?.areaShiftAssignments || [];
    const areaAssign = assignments.find((a: any) => {
      const aid = typeof a.areaId === "object" ? a.areaId?._id : a.areaId;
      if (String(aid) === String(areaId)) return true;
      const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
      return aData && areaName && aData.name.toLowerCase() === areaName.toLowerCase();
    });

    if (areaAssign) {
      const sids = areaAssign.shiftIds || [];
      sids.forEach((sid: any) => {
        const actualSid = typeof sid === "object" ? sid?._id : sid;
        if (coordShiftIds.includes(actualSid)) return;
        const shift = allShifts.find((s) => String(s._id) === String(actualSid));
        if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
          shifts.push(shift);
        }
      });
    }

    // 2. Check user's contract history fallback
    if (shifts.length === 0) {
      if (activeContract?.areaShiftAssignments && activeContract.areaShiftAssignments.length > 0) {
        const fallbackAssign = activeContract.areaShiftAssignments.find((a: any) => {
          const aid = typeof a.areaId === "object" ? a.areaId?._id : a.areaId;
          if (String(aid) === String(areaId)) return true;
          const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
          return aData && areaName && aData.name.toLowerCase() === areaName.toLowerCase();
        });

        if (fallbackAssign) {
          const sids = fallbackAssign.shiftIds || [];
          sids.forEach((sid: any) => {
            const actualSid = typeof sid === "object" ? sid?._id : sid;
            if (coordShiftIds.includes(actualSid)) return;
            const shift = allShifts.find((s) => String(s._id) === String(actualSid));
            if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
              shifts.push(shift);
            }
          });
        }
      }
    }

    // 3. Legacy members fallback
    if (shifts.length === 0) {
      const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? user.turnos[0]._id : user.turnos[0]) : undefined;
      const finalShiftId = userConfig?.shiftId || shiftIdFromUser;
      const shift = allShifts.find((sh) => String(sh._id) === String(finalShiftId));
      if (shift) shifts = [shift];
    }

    return shifts;
  };

  // Get coordinated shifts for a user assigned to an area
  const getCoordinatedShifts = (user: User, areaId: string) => {
    let shifts: any[] = [];
    if (!user) return shifts;
    if (project?.coordinatorAssignments) {
      const myCoordAsgn = project.coordinatorAssignments.filter((asm) => {
        const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
        const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
        return String(uid) === String(user._id) && String(aid) === String(areaId);
      });
      myCoordAsgn.forEach((asm) => {
        const sid = typeof asm.shiftId === "object" ? (asm.shiftId as any)?._id : asm.shiftId;
        const shift = allShifts.find((s) => String(s._id) === String(sid));
        if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
          shifts.push(shift);
        }
      });
    }
    return shifts;
  };

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
    handleOpenWizard(user._id);
  };

  /* ------------------------------- Actions -------------------------------- */

  const handleOpenWizard = (userId: string) => {
    const user = allUsers.find((u) => u._id === userId) || candidateUsers.find((u) => u._id === userId);
    if (!user) return;

    // Attempt to find existing data to pre-fill from user history
    const metadataProjects = user.metadata?.projects || [];

    // Prioritize current project if existing
    const currentProjectMeta = metadataProjects.find((p: any) => String(typeof p.projectId === "string" ? p.projectId : p.projectId?._id) === String(project?._id));

    const lastProject = currentProjectMeta || (metadataProjects.length > 0 ? metadataProjects[metadataProjects.length - 1] : null);
    const lastContract = lastProject?.contracts?.length ? lastProject.contracts[lastProject.contracts.length - 1] : null;

    console.log("[Wizard] user:", user._id, "lastProject:", lastProject?._id, "lastContract keys:", lastContract ? Object.keys(lastContract) : "null");
    console.log("[Wizard] lastContract:", lastContract ? JSON.stringify({ categoria_sat_id: (lastContract as any).categoria_sat_id, nombre_categoria_sat: (lastContract as any).nombre_categoria_sat, estado_id: (lastContract as any).estado_id, nombre_estado_empleado: (lastContract as any).nombre_estado_empleado }) : "null");

    // Default statuses and IDs
    const activoEstado = allEstados.find((e) => e.name.toLowerCase().includes("activo"));

    // Prioritize IDs from last contract if they exist (numeric IDs stored in UserProject)
    let initialCatId = "";
    if (lastContract) {
      const catIdFromDb = (lastContract as any).categoria_sat_id;
      const catNameFromDb = (lastContract as any).nombre_categoria_sat;

      console.log("[Wizard] lastContract categoria_sat_id:", catIdFromDb, "nombre_categoria_sat:", catNameFromDb);
      console.log("[Wizard] allCategoriasSat count:", allCategoriasSat.length, "sample:", allCategoriasSat.slice(0, 3).map(c => ({ _id: c._id, dataId: c.data?.id, name: c.name })));

      // Try to find the category in the global list first by numeric ID, MongoDB ID, or Name
      let matchedCat = allCategoriasSat.find((c) => {
        const numericIdMatch = catIdFromDb != null && catIdFromDb !== "" && String(c.data?.id) === String(catIdFromDb);
        const mongoIdMatch = catIdFromDb != null && catIdFromDb !== "" && String(c._id) === String(catIdFromDb);
        const nameMatch = catNameFromDb && catNameFromDb !== "Sin categoria" && (
          c.name?.toLowerCase() === catNameFromDb.toLowerCase() ||
          c.data?.nombre?.toLowerCase() === catNameFromDb.toLowerCase()
        );
        return numericIdMatch || mongoIdMatch || nameMatch;
      });

      // Fallback: If not found, try to look up in the current Role Frame's categories
      if (!matchedCat) {
        const foundRF = allRoleFrames.find((rf) => rf.name === lastProject?.nombre_rol_frame);
        const rfCats = foundRF?.data?.categoriasSat || [];
        const matchedInRF = rfCats.find((c: any) => {
          const numericIdMatch = catIdFromDb != null && catIdFromDb !== "" && String(c.id) === String(catIdFromDb);
          const nameMatch = catNameFromDb && catNameFromDb !== "Sin categoria" && c.nombre?.toLowerCase() === catNameFromDb.toLowerCase();
          return numericIdMatch || nameMatch;
        });

        if (matchedInRF) {
          // Find global category matching that name
          matchedCat = allCategoriasSat.find((c) => 
            c.name?.toLowerCase() === matchedInRF.nombre?.toLowerCase() ||
            c.data?.nombre?.toLowerCase() === matchedInRF.nombre?.toLowerCase()
          );
        }
      }

      if (matchedCat) {
        initialCatId = String(matchedCat.data?.id ?? matchedCat._id);
        console.log("[Wizard] Matched cat:", matchedCat.name, "-> initialCatId:", initialCatId);
      } else {
        console.log("[Wizard] No matched cat found. catIdFromDb:", catIdFromDb, "catNameFromDb:", catNameFromDb);
        // Last resort: if we have a numeric catIdFromDb, just use it directly
        if (catIdFromDb != null && catIdFromDb !== "" && catIdFromDb !== 0) {
          initialCatId = String(catIdFromDb);
          console.log("[Wizard] Using catIdFromDb directly as initialCatId:", initialCatId);
        }
      }
    }

    // Secondary Fallbacks: User Metadata
    if (!initialCatId && user.metadata?.categoriaSatId) {
      initialCatId = String(user.metadata.categoriaSatId);
    } else if (!initialCatId && (user.metadata as any)?.categoria_sat_id) {
      initialCatId = String((user.metadata as any).categoria_sat_id);
    }

    console.log("[Wizard] FINAL initialCatId:", initialCatId);

    let initialTipoContratoId = lastContract?.tipo_contrato_id ? String(lastContract.tipo_contrato_id) : "";
    if (!initialTipoContratoId && lastContract?.nombre_contrato) {
      initialTipoContratoId = String(allTiposContrato.find((t) => t.name === lastContract.nombre_contrato)?.data.id || "");
    }
    if (!initialTipoContratoId && (user.metadata as any)?.tipoContratoId) {
      initialTipoContratoId = String((user.metadata as any).tipoContratoId);
    }
    if (!initialTipoContratoId && (user.metadata as any)?.tipo_contrato_id) {
      initialTipoContratoId = String((user.metadata as any).tipo_contrato_id);
    }

    let initialEstadoId = "";
    if (lastContract) {
      const estadoIdFromDb = (lastContract as any).estado_id;
      const estadoNameFromDb = (lastContract as any).nombre_estado_empleado;
      console.log("[Wizard] lastContract estado_id:", estadoIdFromDb, "nombre_estado_empleado:", estadoNameFromDb);
      console.log("[Wizard] allEstados count:", allEstados.length, "sample:", allEstados.slice(0, 3).map(e => ({ _id: e._id, dataId: e.data?.id, name: e.name })));

      // Match by numeric ID first
      if (estadoIdFromDb != null && estadoIdFromDb !== "" && estadoIdFromDb !== 0) {
        const matchedEstado = allEstados.find((e) => String(e.data?.id) === String(estadoIdFromDb) || String(e._id) === String(estadoIdFromDb));
        if (matchedEstado) {
          initialEstadoId = String(matchedEstado.data?.id ?? matchedEstado._id);
          console.log("[Wizard] Matched estado by ID:", matchedEstado.name, "-> initialEstadoId:", initialEstadoId);
        } else {
          // Use the numeric ID directly as fallback
          initialEstadoId = String(estadoIdFromDb);
          console.log("[Wizard] Using estadoIdFromDb directly:", initialEstadoId);
        }
      }
      // Match by name as fallback
      if (!initialEstadoId && estadoNameFromDb && estadoNameFromDb !== "Activo") {
        const matchedEstado = allEstados.find((e) => e.name?.toLowerCase() === estadoNameFromDb.toLowerCase());
        if (matchedEstado) {
          initialEstadoId = String(matchedEstado.data?.id ?? matchedEstado._id);
          console.log("[Wizard] Matched estado by name:", matchedEstado.name, "-> initialEstadoId:", initialEstadoId);
        }
      }
    }
    if (!initialEstadoId && user.metadata?.estadoId) {
      initialEstadoId = String(user.metadata.estadoId);
    }
    if (!initialEstadoId && (user.metadata as any)?.estado_id) {
      initialEstadoId = String((user.metadata as any).estado_id);
    }
    if (!initialEstadoId) {
      initialEstadoId = String(activoEstado?.data?.id || "");
    }
    console.log("[Wizard] FINAL initialEstadoId:", initialEstadoId);

    let initialSedeId = lastContract?.sede_id ? String(lastContract.sede_id) : project?.metadata?.sedeId ? String(project.metadata.sedeId) : "";
    if (!initialSedeId && lastContract?.nombre_sede) {
      const foundSede = allSedes.find((s) => s.name === lastContract.nombre_sede);
      if (foundSede) initialSedeId = String(foundSede.data.id);
    }
    if (!initialSedeId && (user.metadata as any)?.sedeId) {
      initialSedeId = String((user.metadata as any).sedeId);
    }

    let initialRolFrameId = lastContract?.rol_frame_id ? String(lastContract.rol_frame_id) : "";
    if (!initialRolFrameId && lastProject?.nombre_rol_frame) {
      // Find role frame by name
      const foundRF = allRoleFrames.find((rf) => rf.name === lastProject.nombre_rol_frame);
      if (foundRF) initialRolFrameId = String(foundRF.data.rol.id);
    } else if (!initialRolFrameId && user.metadata?.roleFrameId) {
      initialRolFrameId = String(user.metadata.roleFrameId);
    }

    // Pre-fill assignments if they already exist in teamConfig
    // Primary source: project teamConfig
    const existingConfig = teamConfig.find((c) => String(c.userId) === String(user._id));
    let existingAssignments = existingConfig?.areaShiftAssignments || [];

    // Secondary source: user contract history (if teamConfig is missing it)
    if (existingAssignments.length === 0 && lastContract?.areaShiftAssignments) {
      existingAssignments = lastContract.areaShiftAssignments;
    }

    // Map existing assignments to the wizard format, ensuring we use string IDs
    const areaShiftAssignments = (existingAssignments || []).map((a: any) => ({
      areaId: String(a.areaId?._id || a.areaId || ""),
      shiftIds: (a.shiftIds || []).map((s: any) => String(s?._id || s)),
    }));

    setSelectedUserForWizard(user);
    setWizardStep(1);

    // Helper for date formatting
    const formatDate = (dateStr: any) => {
      if (!dateStr) return "";
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return "";
        return d.toISOString().split("T")[0];
      } catch {
        return "";
      }
    };

    // Reset wizard data with pulled data or defaults
    setWizardData({
      rol_frame_id: initialRolFrameId,
      categoria_sat_id: initialCatId,
      tipo_contrato_id: initialTipoContratoId,
      estado_id: initialEstadoId,
      hora_inicio: lastContract?.hora_inicio || "09:00",
      hora_fin: lastContract?.hora_fin || "18:00",
      fecha_alta_contrato: formatDate(lastContract?.fecha_alta_contrato) || formatDate(new Date()),
      fecha_baja_contrato: formatDate(lastContract?.fecha_baja_contrato),
      cantidad_jornadas_laborales: lastContract?.cantidad_jornadas_laborales || 5,
      sueldo_jornada: lastContract?.sueldo_jornada || 0,
      sueldo_mano: lastContract?.sueldo_mano || 0,
      sueldo_mano_texto: lastContract?.sueldo_mano_texto || "",
      sueldo_diario_neto: lastContract?.sueldo_diario_neto || 0,
      diferencia_diaria_neto: lastContract?.diferencia_diaria_neto || 0,
      sueldo_neto: lastContract?.sueldo_neto || 0,
      sueldo_bruto: lastContract?.sueldo_bruto || 0,
      sede_id: initialSedeId,
      reemplazo: lastContract?.reemplazo || false,
      empleado_id_reemplezado: lastContract?.empleado_id_reemplezado || "",
      observaciones: lastContract?.observaciones || "",
      areaShiftAssignments: areaShiftAssignments,
      positionId: lastContract?.positionId || "",
      levelId: lastContract?.levelId || "",
    });
  };

  const handleSaveWizard = async () => {
    if (!selectedUserForWizard || !project) return;

    // Validate area/shift assignment is required
    if (!wizardData.areaShiftAssignments || wizardData.areaShiftAssignments.length === 0) {
      sweetAlert.error("Campo requerido", "Debes seleccionar al menos un área y turno para el miembro.");
      setWizardStep(1);
      return;
    }

    // Determine if this is an update (existing member) or new assignment
    const isExistingMember = teamMembers.some((m) => m._id === selectedUserForWizard._id);

    try {
      setLoading(true);
      // Construct the data to send to specific assignment endpoint
      // backend will handle UserProject and internal assignedUsers
      // Extract first assignment for backward-compatible contract fields
      const firstAssignment = wizardData.areaShiftAssignments[0];
      const primaryShiftId = firstAssignment?.shiftIds?.[0] || "";
      const primaryAreaId = firstAssignment?.areaId || "";

      await projectsAPI.assignMember(project._id, {
        userId: selectedUserForWizard._id,
        isUpdate: isExistingMember,
        contract: {
          ...wizardData,
          areaId: primaryAreaId,
          shiftId: primaryShiftId,
          areaShiftAssignments: wizardData.areaShiftAssignments,
          externalEmployeeId: (selectedUserForWizard.metadata as any)?.id,
          externalProjectId: (project.metadata as any)?.id || project.externalId,
          sede_id: Number(wizardData.sede_id),
          estado_id: Number(wizardData.estado_id),
          categoria_sat_id: Number(wizardData.categoria_sat_id),
          tipo_contrato_id: Number(wizardData.tipo_contrato_id),
          rol_frame_id: Number(wizardData.rol_frame_id),
          empleado_id_reemplezado: wizardData.empleado_id_reemplezado ? Number(wizardData.empleado_id_reemplezado) : null,
        },
      });

      sweetAlert.success(isExistingMember ? "Miembro Actualizado" : "Miembro Agregado", `${selectedUserForWizard.firstName} ha sido ${isExistingMember ? "actualizado" : "incorporado al equipo"}.`);

      // Refresh Data
      const updatedProject = await projectsAPI.getProject(project._id);
      setProject(updatedProject);
      setTeamConfig(updatedProject.teamConfig || []);

      const usersData = await usersAPI.list({ limit: 10000 });
      setAllUsers(usersData.users);

      setSelectedUserForWizard(null);
      setShowAddModal(false);
    } catch (error: any) {
      console.error("Assign member error:", error);
      let errorMsg = "Internal server error during assignment";
      if (error.response?.data?.error) {
        errorMsg = error.response.data.error;
        if (error.response?.data?.details) {
           errorMsg += `\nDetalles: ${error.response.data.details}`;
        }
      }
      sweetAlert.error("Error", errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!project) return;
    const result = await sweetAlert.confirm("¿Retirar del equipo?", "El usuario será retirado del proyecto y se eliminarán sus asignaciones de áreas y turnos.");
    if (!result.isConfirmed) return;

    try {
      setLoading(true);

      // Use the new thorough removal endpoint
      await projectsAPI.removeMember(project._id, userId);

      // Refresh local state
      const [updatedProject, usersData] = await Promise.all([projectsAPI.getProject(project._id), usersAPI.list({ limit: 10000 })]);

      setProject(updatedProject);
      setTeamConfig(updatedProject.teamConfig || []);
      setAllUsers(usersData.users);

      sweetAlert.success("Usuario Retirado", "El usuario ha sido retirado del equipo y sus asignaciones han sido limpiadas.");
    } catch (error: any) {
      console.error("Error removing user:", error);
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo retirar al usuario.");
    } finally {
      setLoading(false);
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
              <div className="flex flex-col gap-1.5 mt-0.5 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                  {getUserVacationStatus(user._id) && (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                      <FontAwesomeIcon icon={faUmbrellaBeach} className="mr-1" />
                      VC
                    </span>
                  )}
                </div>
                {(() => {
                  const projectRespId = project?.metadata?.responsableId;
                  const userMetaId = user.metadata?.id;
                  const isReallyResponsable = projectRespId && userMetaId && Number(projectRespId) === Number(userMetaId);
                  
                  if (isReallyResponsable) {
                    return <span className="w-fit text-[10px] px-2 py-0.5 rounded font-medium border whitespace-nowrap border-green-500/30 text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400">Responsable de Proyecto</span>;
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {(() => {
              const filteredRoles = user.roles.filter((r) => !r.name.toLowerCase().includes("responsable"));

              return (
                <>
                  {filteredRoles.slice(0, 3).map((r) => {
                    const lower = r.name.toLowerCase();
                    const isCoordinador = lower.includes("coordinador");

                    let badgeClasses = "border-blue-500/30 text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400";
                    if (isCoordinador) {
                      badgeClasses = "border-amber-500/30 text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400";
                    }

                    return (
                      <span key={r._id} className={`text-[10px] px-2 py-0.5 rounded font-medium border whitespace-nowrap ${badgeClasses}`}>
                        {r.name}
                      </span>
                    );
                  })}
                  {filteredRoles.length > 3 && <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">+{filteredRoles.length - 3}</span>}
                </>
              );
            })()}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{rolFrame}</td>
        <td className="px-4 py-3">
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${user.metadata?.activo ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{user.metadata?.activo ? "ACTIVO" : "INACTIVO"}</span>
        </td>
        <td className="px-4 py-3">
          {(() => {
            const isCoord = checkIsCoordinator(user);

            // Build area data list
            let areaData: { id: string; name: string }[] = [];

            // 1. Priority: Detailed project team configuration (areaShiftAssignments)
            const config = teamConfig.find((c) => String(c.userId) === String(user._id));
            if (config?.areaShiftAssignments && config.areaShiftAssignments.length > 0) {
              areaData = config.areaShiftAssignments
                .map((asa: any) => {
                  const aId = typeof asa.areaId === "object" ? asa.areaId?._id : asa.areaId;
                  const aName = typeof asa.areaId === "object" ? asa.areaId?.name : allAreas.find((a) => String(a._id) === String(aId) || String(a.data?.id) === String(aId))?.name;
                  return aName ? { id: String(aId), name: aName } : null;
                })
                .filter(Boolean) as { id: string; name: string }[];
            }

            // 1b. Alternative: Check last contract in projects metadata (backup source)
            if (areaData.length === 0 && activeContract?.areaShiftAssignments && activeContract.areaShiftAssignments.length > 0) {
              areaData = activeContract.areaShiftAssignments
                .map((asa: any) => {
                  const aId = typeof asa.areaId === "object" ? asa.areaId?._id : asa.areaId;
                  const aName = typeof asa.areaId === "object" ? asa.areaId?.name : allAreas.find((a) => String(a._id) === String(aId))?.name;
                  return aName ? { id: String(aId), name: aName } : null;
                })
                .filter(Boolean) as { id: string; name: string }[];
            }
            // 2. Secondary: If coordinator and no detailed config, check coordinatorAssignments
            if (areaData.length === 0 && isCoord && project?.coordinatorAssignments) {
              const myAssignments = project.coordinatorAssignments.filter((asm) => {
                const uid = typeof asm.userId === "object" ? asm.userId?._id : asm.userId;
                return String(uid) === String(user._id);
              });
              const areaIds = Array.from(new Set(myAssignments.map((asm) => (typeof asm.areaId === "object" ? asm.areaId?._id : asm.areaId))));
              areaData = areaIds
                .map((id) => {
                  const a = allAreas.find((area) => String(area._id) === String(id));
                  return a ? { id: String(a._id), name: a.name } : null;
                })
                .filter(Boolean) as { id: string; name: string }[];
            }

            // 3. Fallback: Global user area (legacy/basic)
            if (areaData.length === 0) {
              const userAreaId = typeof user.areaId === "object" ? user.areaId?._id : user.areaId;
              const userAreaName = typeof user.areaId === "object" ? user.areaId?.name : allAreas.find((a) => String(a._id) === String(userAreaId))?.name;
              if (userAreaId && userAreaName) {
                areaData = [{ id: String(userAreaId), name: userAreaName }];
              }
            }

            if (areaData.length === 0) return <span className="text-xs text-gray-400">—</span>;

            return (
              <div className="flex flex-wrap items-center gap-1.5">
                {areaData.map((ad, i) => {
                  const shifts = getStandardShifts(user, userConfig, activeContract, ad.id, ad.name);
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="group relative flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 pl-2 pr-1 py-1 rounded-lg border border-blue-100 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-600 transition-all w-fit">
                        <span className="text-blue-700 dark:text-blue-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{ad.name}</span>
                        <button type="button" onClick={() => setViewingShiftsData({ user, areaId: ad.id, areaName: ad.name, assignmentType: 'standard' })} className="flex items-center justify-center w-4 h-4 rounded-md text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 transition-colors text-xs font-black" title="Ver turnos">
                          +
                        </button>
                      </div>
                      {shifts.length > 0 && (
                        <div className="flex flex-col gap-1 mt-0.5 pl-0.5">
                          {shifts.map((s, idx) => (
                            <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-50/50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-100/50 dark:border-blue-900/40 whitespace-nowrap w-fit" title={`${s.startTime} - ${s.endTime}`}>
                              {s.name} ({s.startTime} - {s.endTime})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </td>
        <td className="px-4 py-3">
          {(() => {
            const myCoordinatedAssignments = project?.coordinatorAssignments?.filter((asm) => {
              const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
              return String(uid) === String(user._id);
            }) || [];

            if (myCoordinatedAssignments.length === 0) return <span className="text-xs text-gray-400">—</span>;

            const coordAreaDataMap = new Map<string, { id: string; name: string }>();
            myCoordinatedAssignments.forEach((asm) => {
              const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
              const aName = typeof asm.areaId === "object" ? (asm.areaId as any)?.name : allAreas.find((a) => String(a._id) === String(aid))?.name;
              if (aid && aName) {
                coordAreaDataMap.set(String(aid), { id: String(aid), name: aName });
              }
            });

            const coordAreaData = Array.from(coordAreaDataMap.values());

            return (
              <div className="flex flex-wrap items-center gap-1.5">
                {coordAreaData.map((ad, i) => {
                  const shifts = getCoordinatedShifts(user, ad.id);
                  return (
                    <div key={i} className="flex flex-col gap-1">
                      <div className="group relative flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/20 pl-2 pr-1 py-1 rounded-lg border border-amber-100 dark:border-amber-800 hover:border-amber-300 dark:hover:border-amber-600 transition-all w-fit">
                        <span className="text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{ad.name}</span>
                        <button type="button" onClick={() => setViewingShiftsData({ user, areaId: ad.id, areaName: ad.name, assignmentType: 'coordinated' })} className="flex items-center justify-center w-4 h-4 rounded-md text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors text-xs font-black" title="Ver turnos coordinados">
                          +
                        </button>
                      </div>
                      {shifts.length > 0 && (
                        <div className="flex flex-col gap-1 mt-0.5 pl-0.5">
                          {shifts.map((s, idx) => (
                            <span key={idx} className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50/50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-100/50 dark:border-amber-900/40 whitespace-nowrap w-fit" title={`${s.startTime} - ${s.endTime}`}>
                              {s.name} ({s.startTime} - {s.endTime})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-700 dark:text-gray-300">{activeContract?.nombre_contrato || "-"}</span>
            {activeContract?.reemplazo && (
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded border border-amber-200/50 dark:border-amber-800/50 w-fit">
                <FontAwesomeIcon icon={faIdCard} className="text-[9px]" />
                <span>
                  Reemplaza a:{" "}
                  {(() => {
                    const replaced = allUsers.find((u) => (u.metadata as any)?.id === activeContract.empleado_id_reemplezado);
                    return replaced ? `${replaced.firstName} ${replaced.lastName}` : `ID: ${activeContract.empleado_id_reemplezado}`;
                  })()}
                </span>
              </div>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 font-medium whitespace-nowrap">{activeContract?.hora_inicio ? `${activeContract.hora_inicio} - ${activeContract.hora_fin}` : "-"}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => handleOpenScheduleModal(user)} className="p-1 text-gray-400 hover:text-blue-500 transition-colors" title="Editar horario/área">
              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
            </button>
            <button onClick={() => handleRemoveUser(user._id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors ml-1" title="Retirar del proyecto">
              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderUserCard = (user: User) => {
    const userConfig = teamConfig.find((c) => String(c.userId) === String(user._id));
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
      itemCount={displayedCount}
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
      modal={
        openCoordinadoresInfo
          ? {
              isOpen: true,
              onClose: () => setOpenCoordinadoresInfo(false),
              title: "Asignación de Coordinadores",
              content: <p className="text-gray-600 dark:text-gray-300">Asigna un coordinador designado para cada combinación de Área y Turno del proyecto. Todas las combinaciones deben estar cubiertas.</p>,
            }
          : undefined
      }
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
          <div className="sticky top-[144px] pb-1 pt-3 z-[40] bg-[#f3f4f6] dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 flex items-center justify-between shadow-sm lg:shadow-none hover:shadow-md transition-shadow">
            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar flex-nowrap">
              <button onClick={() => setActiveTab("equipo")} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === "equipo" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                <FontAwesomeIcon icon={faUsers} className="text-xs" />
                Equipo
              </button>
              <button onClick={() => setActiveTab("coordinadores")} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === "coordinadores" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                <FontAwesomeIcon icon={faUserTie} className="text-xs" />
                Coordinadores
                <span
                  role="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenCoordinadoresInfo(true);
                  }}
                  className={`ml-1.5 text-gray-400 hover:text-blue-500 transition-colors cursor-pointer ${activeTab === "coordinadores" ? "text-blue-400" : ""}`}
                  title="Información de asignación"
                >
                  <FontAwesomeIcon icon={faInfoCircle} className="h-3.5 w-3.5" />
                </span>
              </button>
              <button onClick={() => setActiveTab("solicitudes")} className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === "solicitudes" ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"}`}>
                <FontAwesomeIcon icon={faClipboardList} className="text-xs" />
                Solicitudes
                {solicitudesCount > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-1">{solicitudesCount}</span>}
              </button>
            </div>
            {/* The right side portal target */}
            <div id="tab-actions-portal" className="shrink-0 mb-1 lg:mb-0"></div>
          </div>

          {/* Tab Content */}
          <div className="mt-0">
            {activeTab === "equipo" && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
                  <div className="flex-1 w-full">
                    <SearchAndFilters
                      searchTerm={searchTermTeam}
                      onSearchChange={setSearchTermTeam}
                      searchPlaceholder="Buscar en equipo actual..."
                      radioFilters={[
                        {
                          label: "Estado de usuarios",
                          value: filterUserStatus,
                          onChange: setFilterUserStatus,
                          options: [
                            { label: "Usuarios Activos", value: "active" },
                            { label: "Usuarios Inactivos", value: "inactive" },
                            { label: "Todos los usuarios", value: "" },
                          ],
                        },
                      ]}
                    />
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
                
                {!hasMobileCoordinator && teamMembers.length > 0 && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-xl space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                    <p className="text-amber-800 dark:text-amber-400 font-bold flex items-center gap-2 text-sm">
                      <FontAwesomeIcon icon={faInfoCircle} />
                      Asignación requerida
                    </p>
                    <p className="text-amber-700 dark:text-amber-500 text-xs leading-normal">
                      Usted debe asignar al equipo un usuario con el role de sistema <strong>"mobile coordinador"</strong> para poder asignarlo.
                    </p>
                  </div>
                )}


                {(() => {
                  const coordinators = filteredTeamMembers.filter(checkIsCoordinator);
                  const members = filteredTeamMembers.filter((u) => !checkIsCoordinator(u));

                  if (filteredTeamMembers.length === 0) {
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
                              <th className="px-4 py-3 font-semibold">Rol/es Frame</th>
                              <th className="px-4 py-3 font-semibold">Estado</th>
                              <th className="px-4 py-3 font-semibold">Área / Turno</th>
                              <th className="px-4 py-3 font-semibold text-amber-600 dark:text-amber-400">Área/Turno Coordinada</th>
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
                onGoToTeam={() => setActiveTab("equipo")}
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
                  const [projectData, usersData] = await Promise.all([projectsAPI.getProject(projectId!), usersAPI.list({ limit: 10000 })]);
                  setProject(projectData);
                  setTeamConfig(projectData.teamConfig || []);
                  setAllUsers(usersData.users);
                  const solis = await usersAPI.listSolicitudes();
                  setSolicitudesCount(solis.filter((u) => u.metadata?.projectIds?.includes(projectId!)).length);
                }}
              />
            )}
          </div>

          {/* Modals */}

          <Modal 
            isOpen={showAddModal} 
            onClose={() => setShowAddModal(false)} 
            title="Agregar Miembros al Equipo" 
            subtitle={
              <div className="flex items-center gap-2">
                <span>Disponibles para asignar ({filteredCandidates.length})</span>
                <button 
                  type="button"
                  onClick={() => setShowCandidatesInfo(true)}
                  className="text-gray-400 hover:text-blue-500 transition-colors"
                  title="¿Qué usuarios se muestran?"
                >
                  <FontAwesomeIcon icon={faInfoCircle} className="text-xs" />
                </button>
              </div>
            } 
            size="xl"
          >
            <div className="space-y-4 max-h-[85vh] flex flex-col">
              <div className="flex flex-col gap-3 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <FontAwesomeIcon icon={faSearch} className="text-gray-400" />
                    </div>
                    <input type="text" placeholder="Buscar usuario por nombre o email..." className="input-field pl-10 w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} autoFocus />
                  </div>
                  <button 
                    onClick={() => setShowFilters(true)} 
                    className={`relative px-4 py-2 rounded-lg border transition-all flex items-center gap-2 text-sm font-medium ${activeAddFiltersCount > 0 ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400"}`}
                  >
                    <FontAwesomeIcon icon={faFilter} className="text-xs" />
                    Filtros
                    {activeAddFiltersCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center bg-blue-500 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-gray-800 shadow-sm">
                        {activeAddFiltersCount}
                      </span>
                    )}
                  </button>
                </div>

                {/* Filter Badges */}
                {activeAddFiltersCount > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-1 px-1">
                    {filterRole && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <span className="opacity-60">Rol:</span> {filterRole}
                        <button onClick={() => setFilterRole("")} className="hover:text-blue-900 dark:hover:text-blue-100 transition-colors">
                          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                        </button>
                      </span>
                    )}
                    {filterRoleFrame && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        <span className="opacity-60">Role Frame:</span> {filterRoleFrame}
                        <button onClick={() => setFilterRoleFrame("")} className="hover:text-purple-900 dark:hover:text-purple-100 transition-colors">
                          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                        </button>
                      </span>
                    )}
                    {filterProject && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800">
                        <span className="opacity-60">Proyecto:</span> {filterProject}
                        <button onClick={() => setFilterProject("")} className="hover:text-green-900 dark:hover:text-green-100 transition-colors">
                          <FontAwesomeIcon icon={faXmark} className="text-[10px]" />
                        </button>
                      </span>
                    )}
                    <button 
                      onClick={() => { setFilterRole(""); setFilterRoleFrame(""); setFilterProject(""); }}
                      className="text-[10px] text-gray-500 hover:text-red-500 font-bold ml-1 transition-colors uppercase tracking-wider"
                    >
                      Limpiar Todo
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-700 rounded-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-gray-50/50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-700 text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3">Rol</th>
                        <th className="px-4 py-3">Rol/es Frame</th>
                        <th className="px-4 py-3">Proyecto/s</th>
                        <th className="px-4 py-3">Turnos asociados</th>
                        <th className="px-4 py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
                      {searchingCandidates ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            <FontAwesomeIcon icon={faSearch} className="animate-pulse mr-2" />
                            Buscando candidatos...
                          </td>
                        </tr>
                      ) : searchTerm.length >= 2 && filteredCandidates.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                            No se encontraron usuarios para "{searchTerm}"
                          </td>
                        </tr>
                      ) : searchTerm.length < 2 && filteredCandidates.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-500 italic">
                            Escribe al menos 2 caracteres para buscar candidatos...
                          </td>
                        </tr>
                      ) : (
                        filteredCandidates.map((user) => {
                        const isCoordinator = checkIsCoordinator(user);
                        const metadataProjects = user.metadata?.projects || [];
                        const rolFrame = metadataProjects[0]?.nombre_rol_frame || (user.externalInfo?.rolFrames?.length ? user.externalInfo.rolFrames[0] : "-");
                        const activeProjects = Array.from(new Set(metadataProjects.map((p) => p.nombre_proyecto))).filter(Boolean);

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
                                {(user.roles || []).map((r) => {
                                  const lower = r.name.toLowerCase();
                                  const isCoord = lower.includes("coordinador");
                                  const isResp = lower.includes("responsable");

                                  let classes = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-100 dark:border-blue-800";
                                  if (isCoord) {
                                    classes = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
                                  } else if (isResp) {
                                    classes = "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800";
                                  }

                                  return (
                                    <span key={r._id} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap border ${classes}`}>
                                      {r.name}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {rolFrame && rolFrame !== "-" ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800">{rolFrame}</span>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-0.5">
                                {activeProjects.length > 0 ? (
                                  activeProjects.map((p, idx) => (
                                    <span key={idx} className="text-[10px] text-gray-500 dark:text-gray-400 italic truncate max-w-[150px]">
                                      {p}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1.5">
                                {user.turnos && user.turnos.length > 0 ? (
                                  user.turnos.map((t) => (
                                    <div key={typeof t === "string" ? t : t._id} className="flex flex-col gap-0.5">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border border-gray-200 dark:border-gray-700 uppercase w-fit">{typeof t === "object" ? t.name : "Turno"}</span>
                                      {typeof t === "object" && t.startTime && t.endTime && (
                                        <span className="text-[9px] text-gray-400 dark:text-gray-500 font-medium ml-0.5 italic">
                                          {t.startTime} - {t.endTime}
                                        </span>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <span className="text-xs text-gray-400">—</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => handleOpenWizard(user._id)} className="btn-secondary text-[11px] py-1.5 px-3 flex items-center gap-2 ml-auto hover:bg-primary-600 hover:text-white hover:border-primary-600 transition-all font-bold">
                                <FontAwesomeIcon icon={faPlus} className="text-[10px]" />
                                Agregar
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                    </tbody>
                  </table>
                </div>
              </div>


            </div>
          </Modal>

          {/* Candidates Filter Modal */}
          <Modal
            isOpen={showFilters}
            onClose={() => setShowFilters(false)}
            title="Filtros Avanzados"
            subtitle="Configura los filtros para refinar los candidatos"
            size="sm"
            footer={
              <div className="flex items-center justify-between w-full">
                <button 
                  onClick={() => { setFilterRole(""); setFilterRoleFrame(""); setFilterProject(""); setShowFilters(false); }}
                  className="btn-secondary"
                >
                  Limpiar Todo
                </button>
                <button onClick={() => setShowFilters(false)} className="btn-primary">
                  Aplicar
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Filtrar por Rol</label>
                <div className="relative">
                  <select className="input-field py-2 w-full text-xs pr-8" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                    <option value="">Todos los Roles</option>
                    {Array.from(new Set(allUsers.flatMap((u) => (u.roles || []).map((r) => r.name))))
                      .sort()
                      .map((roleName) => (
                        <option key={roleName} value={roleName}>
                          {roleName}
                        </option>
                      ))}
                  </select>
                  <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Filtrar por Rol/es Frame</label>
                <div className="relative">
                  <select className="input-field py-2 w-full text-xs pr-8" value={filterRoleFrame} onChange={(e) => setFilterRoleFrame(e.target.value)}>
                    <option value="">Todos los Rol Frames</option>
                    {allRoleFrames.map((rf) => (
                      <option key={rf._id} value={rf.name}>
                        {rf.name}
                      </option>
                    ))}
                  </select>
                  <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Filtrar por Proyecto/s</label>
                <div className="relative">
                  <select className="input-field py-2 w-full text-xs pr-8" value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
                    <option value="">Todos los Proyectos</option>
                    {Array.from(new Set(allUsers.flatMap((u) => (u.metadata?.projects || []).map((p) => p.nombre_proyecto))))
                      .filter(Boolean)
                      .sort()
                      .map((projectName) => (
                        <option key={projectName} value={projectName}>
                          {projectName}
                        </option>
                      ))}
                  </select>
                  <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                </div>
              </div>

              {activeAddFiltersCount > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 font-medium">
                    Tienes <strong>{activeAddFiltersCount}</strong> filtro{activeAddFiltersCount > 1 ? "s" : ""} aplicado{activeAddFiltersCount > 1 ? "s" : ""}.
                  </p>
                </div>
              )}
            </div>
          </Modal>

          {/* Info Modal for Candidates */}
          <Modal
            isOpen={showCandidatesInfo}
            onClose={() => setShowCandidatesInfo(false)}
            title="Usuarios Disponibles"
            size="md"
          >
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl">
                <FontAwesomeIcon icon={faInfoCircle} className="text-blue-600 dark:text-blue-400 mt-1" />
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  <p className="font-bold mb-2">¿Quiénes aparecen en esta lista?</p>
                  <p>La lista muestra a todos los <strong>usuarios activos</strong> de la plataforma que actualmente <strong>no forman parte del equipo</strong> de este proyecto.</p>
                </div>
              </div>
              <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400 ml-4 list-disc">
                <li>Usuarios con estado "Activo" en sus metadatos.</li>
                <li>Se excluyen usuarios que ya están asignados a este proyecto.</li>
                <li>Puedes buscar por nombre o email para filtrar resultados específicos.</li>
              </ul>
            </div>
          </Modal>

          {/* Viewing Shifts Modal */}
          <Modal
            isOpen={!!viewingShiftsData}
            onClose={() => setViewingShiftsData(null)}
            title={`Turnos ${viewingShiftsData?.assignmentType === 'coordinated' ? 'Coordinados' : 'Asignados'} - ${viewingShiftsData?.areaName}`}
            subtitle={
              viewingShiftsData ? (
                <p className="text-lg font-black text-blue-600 dark:text-blue-400 mt-1 uppercase tracking-tight">
                  {viewingShiftsData.user.firstName} {viewingShiftsData.user.lastName}
                </p>
              ) : (
                ""
              )
            }
            size="md"
          >
            <div className="space-y-4">
              {(() => {
                if (!viewingShiftsData) return null;
                const { user, areaId, assignmentType } = viewingShiftsData;
                const userConfig = teamConfig.find((c) => String(c.userId) === String(user._id));
                let shifts: any[] = [];

                // Helper to get coordinated shift IDs for exclusion
                const getCoordinatedShiftIds = () => {
                  if (!project?.coordinatorAssignments) return [];
                  return project.coordinatorAssignments
                    .filter((asm) => {
                      const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
                      const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
                      return String(uid) === String(user._id) && String(aid) === String(areaId);
                    })
                    .map((asm) => typeof asm.shiftId === "object" ? (asm.shiftId as any)?._id : asm.shiftId);
                };

                const coordShiftIds = getCoordinatedShiftIds();

                // 1. If viewing coordinated, check ONLY coordinatorAssignments
                if (assignmentType === 'coordinated') {
                  if (project?.coordinatorAssignments) {
                    const myCoordAsgn = project.coordinatorAssignments.filter((asm) => {
                      const uid = typeof asm.userId === "object" ? (asm.userId as any)?._id : asm.userId;
                      const aid = typeof asm.areaId === "object" ? (asm.areaId as any)?._id : asm.areaId;
                      return String(uid) === String(user._id) && String(aid) === String(areaId);
                    });
                    myCoordAsgn.forEach((asm) => {
                      const sid = typeof asm.shiftId === "object" ? (asm.shiftId as any)?._id : asm.shiftId;
                      const shift = allShifts.find((s) => String(s._id) === String(sid));
                      if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) shifts.push(shift);
                    });
                  }
                } else {
                  // 2. If viewing standard, check team configuration assignments (Wizard) and EXCLUDE coordinated ones
                  const assignments = userConfig?.areaShiftAssignments || [];
                  const areaAssign = assignments.find((a: any) => {
                    const aid = typeof a.areaId === "object" ? a.areaId?._id : a.areaId;
                    if (String(aid) === String(areaId)) return true;
                    const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
                    const targetName = viewingShiftsData.areaName;
                    return aData && targetName && aData.name.toLowerCase() === targetName.toLowerCase();
                  });

                  if (areaAssign) {
                    const sids = areaAssign.shiftIds || [];
                    sids.forEach((sid: any) => {
                      const actualSid = typeof sid === "object" ? sid?._id : sid;
                      
                      // EXCLUDE if it's in coordinated
                      if (coordShiftIds.includes(actualSid)) return;

                      const shift = allShifts.find((s) => String(s._id) === String(actualSid));
                      if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
                        shifts.push(shift);
                      }
                    });
                  }

                  // 3. Check user's contract history (metadata) fallback
                  if (shifts.length === 0) {
                    const projectMeta = user.metadata?.projects?.find((p: any) => {
                      const pId = p.projectId;
                      const idToCheck = typeof pId === "object" ? (pId as any)?._id : pId;
                      return String(idToCheck) === String(project?._id);
                    });
                    const activeContract = projectMeta?.contracts?.length ? projectMeta.contracts[projectMeta.contracts.length - 1] : null;

                    if (activeContract?.areaShiftAssignments && activeContract.areaShiftAssignments.length > 0) {
                      const fallbackAssign = activeContract.areaShiftAssignments.find((a: any) => {
                        const aid = typeof a.areaId === "object" ? a.areaId?._id : a.areaId;
                        if (String(aid) === String(areaId)) return true;
                        const aData = allAreas.find((area) => String(area._id) === String(aid) || String(area.data?.id) === String(aid));
                        const targetName = viewingShiftsData.areaName;
                        return aData && targetName && aData.name.toLowerCase() === targetName.toLowerCase();
                      });

                      if (fallbackAssign) {
                        const sids = fallbackAssign.shiftIds || [];
                        sids.forEach((sid: any) => {
                          const actualSid = typeof sid === "object" ? sid?._id : sid;
                          
                          // EXCLUDE if it's in coordinated
                          if (coordShiftIds.includes(actualSid)) return;

                          const shift = allShifts.find((s) => String(s._id) === String(actualSid));
                          if (shift && !shifts.some((s) => String(s._id) === String(shift._id))) {
                            shifts.push(shift);
                          }
                        });
                      }
                    }
                  }
                }

                // 4. Legacy members fallback
                if (shifts.length === 0) {
                  // Fallback for legacy members (only if nothing found yet)
                  const shiftIdFromUser = user.turnos && user.turnos.length > 0 ? (typeof user.turnos[0] === "object" ? user.turnos[0]._id : user.turnos[0]) : undefined;
                  const finalShiftId = userConfig?.shiftId || shiftIdFromUser;
                  const shift = allShifts.find((sh) => String(sh._id) === String(finalShiftId));
                  if (shift) shifts = [shift];
                }

                if (shifts.length === 0) return <p className="text-center text-gray-500 py-12">No hay turnos asignados para esta área.</p>;

                return shifts.map((s, idx) => (
                  <div key={idx} className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 flex flex-col gap-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tighter">{s.name}</span>
                      <span className="px-2 py-1 bg-blue-500 text-white rounded-lg text-[10px] font-black shadow-sm">
                        {s.startTime} — {s.endTime} HS
                      </span>
                    </div>
                    {s.days && s.days.length > 0 && (
                      <div className="flex gap-1.5 mt-1">
                        {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"].map((label, dIdx) => (
                          <span key={dIdx} className={`text-[10px] font-black px-2 py-1 rounded-md transition-all ${s.days.includes(dIdx) ? "bg-white dark:bg-blue-800 text-blue-600 dark:text-blue-300 shadow-sm ring-1 ring-blue-200 dark:ring-blue-700" : "text-gray-300 dark:text-gray-600"}`}>
                            {label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </Modal>

          {/* Wizard Modal */}
          <Modal
            isOpen={!!selectedUserForWizard}
            onClose={() => setSelectedUserForWizard(null)}
            title={teamMembers.some((m) => m._id === selectedUserForWizard?._id) ? "Configurar Miembro" : "Agregar Miembro"}
            subtitle={project?.name}
            size="xl"
            footer={
              <div className="flex gap-3 w-full">
                {wizardStep > 1 && (
                  <button
                    type="button"
                    onClick={() => setWizardStep((wizardStep - 1) as any)}
                    className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-all uppercase tracking-wider"
                  >
                    ANTERIOR
                  </button>
                )}
                {wizardStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => {
                      // Validate step 1: at least one area/shift must be selected
                      if (wizardStep === 1 && (!wizardData.areaShiftAssignments || wizardData.areaShiftAssignments.length === 0)) {
                        sweetAlert.error("Campo requerido", "Debes seleccionar al menos un área y turno para el miembro.");
                        return;
                      }
                      setWizardStep((wizardStep + 1) as any);
                    }}
                    className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 shadow-lg shadow-blue-500/20 transition-all active:scale-95 uppercase tracking-wider"
                  >
                    SIGUIENTE
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSaveWizard}
                    className="flex-1 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg shadow-green-600/20 transition-all active:scale-95 uppercase tracking-wider"
                  >
                    GUARDAR
                  </button>
                )}
              </div>
            }
          >
            <div className="flex flex-col h-[520px]">
              {/* Stepper Header (Fixed/Sticky at the top of the flex container) */}
              <div className="bg-white dark:bg-gray-800 pb-4 border-b border-gray-100 dark:border-gray-700 shrink-0 mb-4">
                <div className="flex items-center bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1">
                  {[
                    { step: 1, label: "Contrato" },
                    { step: 2, label: "Sueldo" },
                    { step: 3, label: "Extras" },
                  ].map((s) => (
                    <button
                      key={s.step}
                      type="button"
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
              </div>

              {/* Step Content (Scrollable) */}
              <div className="flex-1 overflow-y-auto pr-1 space-y-6">
                {/* Step 1: Contrato */}
                {wizardStep === 1 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empleado *</label>
                    <input type="text" className="input-field w-full bg-gray-50 dark:bg-transparent" value={`${selectedUserForWizard?.firstName} ${selectedUserForWizard?.lastName}`} readOnly />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Role Frame a Desempeñar *</label>
                    <select className="input-field w-full" value={wizardData.rol_frame_id} onChange={(e) => setWizardData((prev) => ({ ...prev, rol_frame_id: e.target.value, categoria_sat_id: "" }))} required>
                      <option value="">Selecciona role frame...</option>
                      {userAssignedRoleFrames.map((rf) => (
                        <option key={rf._id} value={rf.data.rol.id}>
                          {rf.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Categoria SAT *</label>
                    <select className="input-field w-full" value={wizardData.categoria_sat_id} onChange={(e) => setWizardData((prev) => ({ ...prev, categoria_sat_id: e.target.value }))} required>
                      <option value="">Selecciona categoria...</option>
                      {availableCategoriasSat.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          Cat {c.numeroCategoria || c.id} - {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Tipo de contrato *</label>
                    <select className="input-field w-full" value={wizardData.tipo_contrato_id} onChange={(e) => setWizardData((prev) => ({ ...prev, tipo_contrato_id: e.target.value }))} required>
                      <option value="">Selecciona tipo...</option>
                      {allTiposContrato.map((t) => (
                        <option key={t._id} value={t.data.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Estado *</label>
                    <select className="input-field w-full" value={wizardData.estado_id} onChange={(e) => setWizardData((prev) => ({ ...prev, estado_id: e.target.value }))} required>
                      <option value="">Selecciona estado...</option>
                      {allEstados.map((e) => (
                        <option key={e._id} value={e.data.id}>
                          {e.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Cargo *</label>
                    <select className="input-field w-full" value={wizardData.positionId} onChange={(e) => setWizardData((prev) => ({ ...prev, positionId: e.target.value, levelId: "" }))} required>
                      <option value="">Selecciona cargo...</option>
                      {allPositions.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nivel *</label>
                    <select className="input-field w-full" value={wizardData.levelId} onChange={(e) => setWizardData((prev) => ({ ...prev, levelId: e.target.value }))} disabled={!wizardData.positionId} required>
                      <option value="">{wizardData.positionId ? "Selecciona nivel..." : "Primero selecciona cargo"}</option>
                      {allLevels
                        .filter((l) => String(typeof l.positionId === "object" ? (l.positionId as any)?._id : l.positionId) === String(wizardData.positionId))
                        .map((l) => (
                          <option key={l._id} value={l._id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Hora inicio - HH:MM</label>
                    <input type="time" className="input-field w-full" value={wizardData.hora_inicio} onChange={(e) => setWizardData((prev) => ({ ...prev, hora_inicio: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Hora fin - HH:MM</label>
                    <input type="time" className="input-field w-full" value={wizardData.hora_fin} onChange={(e) => setWizardData((prev) => ({ ...prev, hora_fin: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Fecha alta contrato</label>
                    <input type="date" className="input-field w-full text-sm" value={wizardData.fecha_alta_contrato} onChange={(e) => setWizardData((prev) => ({ ...prev, fecha_alta_contrato: e.target.value }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Fecha baja contrato</label>
                    <input type="date" className="input-field w-full text-sm" value={wizardData.fecha_baja_contrato} onChange={(e) => setWizardData((prev) => ({ ...prev, fecha_baja_contrato: e.target.value }))} />
                  </div>

                  {/* --- CONFIGURACIÓN POR ÁREA (visual toggle) --- */}
                  <div className="md:col-span-2 space-y-3 pt-6 border-t border-gray-100 dark:border-gray-700">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">
                      <FontAwesomeIcon icon={faLayerGroup} className="mr-1" />
                      Asignación por Área y Turno *
                    </label>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 -mt-1 ml-1">Selecciona las áreas y turnos donde trabajará este miembro. Los turnos con horarios superpuestos se bloquean automáticamente.</p>

                    {(project?.areasConfig || []).length === 0 && <div className="text-center py-4 text-gray-500 text-sm bg-gray-50 dark:bg-gray-900/30 rounded-lg">Este proyecto no tiene áreas configuradas.</div>}

                    <div className="space-y-3">
                      {(() => {
                        const isCoordinadorRole = (selectedUserForWizard?.roles || []).some((r: any) => r.name.toLowerCase().includes("mobile-coordinador"));
                        // Helper to check time overlap
                        const timeToMinutes = (t: string) => {
                          const [h, m] = t.split(":").map(Number);
                          return h * 60 + m;
                        };
                        const timesOverlap = (s1Start: string, s1End: string, s2Start: string, s2End: string) => {
                          let a1 = timeToMinutes(s1Start),
                            b1 = timeToMinutes(s1End);
                          let a2 = timeToMinutes(s2Start),
                            b2 = timeToMinutes(s2End);
                          if (b1 <= a1) b1 += 24 * 60;
                          if (b2 <= a2) b2 += 24 * 60;
                          return a1 < b2 && a2 < b1;
                        };
                        // Helper to check if two shifts share at least one work day
                        const daysOverlap = (d1: number[], d2: number[]) => {
                          if (d1.length === 0 || d2.length === 0) return true; // if no days configured, assume overlap
                          return d1.some((d) => d2.includes(d));
                        };

                        return (project?.areasConfig || []).map((ac: any) => {
                          const aId = typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId;
                          const areaObj = allAreas.find((a) => a._id === aId);
                          const aName = typeof ac.areaId === "object" ? ac.areaId?.name : areaObj?.name;
                          const isCoordinadorArea = areaObj?.isSystem;
                          const isAreaRestricted = isCoordinadorArea && !isCoordinadorRole;

                          const shiftIdsForArea = (ac.shiftIds || []).map((s: any) => String(typeof s === "object" ? s._id : s));
                          const shiftsForArea = allShifts.filter((s) => shiftIdsForArea.includes(String(s._id))).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                        // Current assignment for this area
                        const currentAssignment = wizardData.areaShiftAssignments.find((a) => a.areaId === aId);
                        const selectedShiftIds = currentAssignment?.shiftIds || [];
                        const isAreaActive = selectedShiftIds.length > 0;

                        // Collect ALL selected shift data across ALL areas for overlap detection
                        const allSelectedShiftData: { areaId: string; shiftId: string; name: string; start: string; end: string; days: number[] }[] = [];
                        wizardData.areaShiftAssignments.forEach((asa) => {
                          asa.shiftIds.forEach((sid) => {
                            const sh = allShifts.find((s) => String(s._id) === sid);
                            if (sh) allSelectedShiftData.push({ areaId: asa.areaId, shiftId: sid, name: sh.name, start: sh.startTime, end: sh.endTime, days: sh.days || [] });
                          });
                        });

                        return (
                          <div key={aId} className={`rounded-xl border transition-all ${isAreaActive ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/10" : isAreaRestricted ? "border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10 opacity-75" : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20"}`}>
                            <div className="flex items-center justify-between px-4 py-3">
                              <div className="flex items-center gap-2">
                                <FontAwesomeIcon icon={faLayerGroup} className={`h-4 w-4 ${isAreaActive ? "text-blue-500" : isAreaRestricted ? "text-amber-500" : "text-gray-400"}`} />
                                <span className="font-bold text-sm uppercase tracking-wide">{aName || aId}</span>
                                {isAreaRestricted && (
                                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800 uppercase tracking-tighter">
                                    Requiere Rol Coordinador
                                  </span>
                                )}
                              </div>
                              {isAreaActive && (
                                <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase">
                                  {selectedShiftIds.length} turno{selectedShiftIds.length > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                            {isAreaRestricted && (
                              <div className="px-4 pb-3">
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                                  Este usuario no tiene el rol "mobile-coordinador". Debes asignarle el rol primero para habilitar esta área.
                                </p>
                              </div>
                            )}
                            <div className={`px-4 pb-3 flex flex-wrap gap-3 ${isAreaRestricted ? "pointer-events-none grayscale-[0.5]" : ""}`}>

                              {shiftsForArea.map((shift) => {
                                const isSelected = selectedShiftIds.includes(String(shift._id));

                                // Check if this shift overlaps with ANY currently selected shift
                                const overlappingWith = allSelectedShiftData.find((sel) => (sel.areaId !== aId || sel.shiftId !== String(shift._id)) && timesOverlap(shift.startTime, shift.endTime, sel.start, sel.end) && daysOverlap(shift.days || [], sel.days));
                                const isBlocked = !isSelected && !!overlappingWith;

                                const DAY_LABELS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

                                return (
                                  <button
                                    key={shift._id}
                                    type="button"
                                    disabled={isAreaRestricted}
                                    onClick={() => {
                                      setWizardData((prev) => {
                                        let assignments = [...prev.areaShiftAssignments];

                                        if (isSelected) {
                                          const idx = assignments.findIndex((a) => a.areaId === aId);
                                          if (idx !== -1) {
                                            assignments[idx] = {
                                              ...assignments[idx],
                                              shiftIds: assignments[idx].shiftIds.filter((id) => id !== String(shift._id)),
                                            };
                                            if (assignments[idx].shiftIds.length === 0) assignments.splice(idx, 1);
                                          }
                                        } else {
                                          // AUTO-DEACTIVATE OVERLAPPING SHIFTS
                                          assignments = assignments
                                            .map((a) => ({
                                              ...a,
                                              shiftIds: a.shiftIds.filter((sid) => {
                                                const sh = allShifts.find((s) => String(s._id) === sid);
                                                if (!sh) return true;
                                                const overlaps = timesOverlap(shift.startTime, shift.endTime, sh.startTime, sh.endTime) && daysOverlap(shift.days || [], sh.days);
                                                return !overlaps;
                                              }),
                                            }))
                                            .filter((a) => a.shiftIds.length > 0);

                                          // Add the new shift
                                          const idx = assignments.findIndex((a) => a.areaId === aId);
                                          if (idx !== -1) {
                                            assignments[idx] = {
                                              ...assignments[idx],
                                              shiftIds: [...assignments[idx].shiftIds, String(shift._id)],
                                            };
                                          } else {
                                            assignments.push({ areaId: aId, shiftIds: [String(shift._id)] });
                                          }
                                        }

                                        const allShiftIds = assignments.flatMap((a) => a.shiftIds);
                                        const firstShift = allShifts.find((s) => allShiftIds.includes(String(s._id)));

                                        return {
                                          ...prev,
                                          areaShiftAssignments: assignments,
                                          hora_inicio: firstShift ? firstShift.startTime : prev.hora_inicio,
                                          hora_fin: firstShift ? firstShift.endTime : prev.hora_fin,
                                        };
                                      });
                                    }}
                                    className={`px-3 py-2 rounded-xl border transition-all flex flex-col min-w-[120px] cursor-pointer ${isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-2 ring-blue-400/50" : isBlocked ? "bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 hover:border-blue-300 dark:hover:border-blue-600 opacity-80" : "bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"}`}
                                    title={isBlocked ? `Se superpone con "${overlappingWith?.name}"` : shift.name}
                                  >
                                    <span className={`text-xs font-bold uppercase tracking-wider ${isSelected ? "text-blue-700 dark:text-blue-400" : isBlocked ? "text-gray-400 dark:text-gray-500" : "text-gray-800 dark:text-gray-200"}`}>{shift.name}</span>
                                    <span className={`text-[10px] font-medium uppercase mt-0.5 ${isSelected ? "text-blue-600 dark:text-blue-500" : isBlocked ? "text-gray-400" : "text-gray-500"}`}>
                                      {shift.startTime} — {shift.endTime} hs
                                    </span>
                                    {shift.days && shift.days.length > 0 && (
                                      <div className="flex gap-1 mt-1.5">
                                        {DAY_LABELS.map((label, dayIdx) => (
                                          <span key={dayIdx} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${shift.days.includes(dayIdx) ? (isSelected ? "bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200" : isBlocked ? "text-gray-400 dark:text-gray-600" : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300") : "text-gray-300 dark:text-gray-600"}`}>
                                            {label}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    {isBlocked && <span className="text-[9px] text-red-500 dark:text-red-400 mt-1 normal-case font-medium">⚠ Se superpone con "{overlappingWith?.name}"</span>}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>

                    {wizardData.areaShiftAssignments.length === 0 && (project?.areasConfig || []).length > 0 && <p className="text-[11px] text-amber-500 dark:text-amber-400 ml-1">⚠ Debes seleccionar al menos un área y turno.</p>}
                  </div>
                </div>
              )}

              {/* Step 2: Sueldo */}
              {wizardStep === 2 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Cantidad de jornadas laborales *</label>
                      <input type="number" className="input-field w-full" value={wizardData.cantidad_jornadas_laborales} onChange={(e) => setWizardData((prev) => ({ ...prev, cantidad_jornadas_laborales: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo por jornada *</label>
                      <input type="number" className="input-field w-full" value={wizardData.sueldo_jornada} onChange={(e) => setWizardData((prev) => ({ ...prev, sueldo_jornada: Number(e.target.value) }))} />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo en mano</label>
                    <input type="number" className="input-field w-full" value={wizardData.sueldo_mano} onChange={(e) => setWizardData((prev) => ({ ...prev, sueldo_mano: Number(e.target.value) }))} />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo en mano texto *</label>
                    <input type="text" className="input-field w-full" placeholder="Ej: Cincuenta mil pesos" value={wizardData.sueldo_mano_texto} onChange={(e) => setWizardData((prev) => ({ ...prev, sueldo_mano_texto: e.target.value }))} />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo diario neto</label>
                      <input type="number" step="0.01" className="input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed" value={wizardData.sueldo_diario_neto} readOnly />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Diferencia diaria neto</label>
                      <input type="number" step="0.01" className={`input-field w-full bg-gray-50 dark:bg-gray-900/50 cursor-not-allowed ${wizardData.diferencia_diaria_neto < 0 ? "text-red-500 font-bold" : "text-green-500 font-bold"}`} value={wizardData.diferencia_diaria_neto} readOnly />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo neto</label>
                      <input type="number" className="input-field w-full" value={wizardData.sueldo_neto} onChange={(e) => setWizardData((prev) => ({ ...prev, sueldo_neto: Number(e.target.value) }))} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sueldo bruto</label>
                      <input type="number" className="input-field w-full" value={wizardData.sueldo_bruto} onChange={(e) => setWizardData((prev) => ({ ...prev, sueldo_bruto: Number(e.target.value) }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Extras */}
              {wizardStep === 3 && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sede *</label>
                    <select className="input-field w-full" value={wizardData.sede_id} onChange={(e) => setWizardData((prev) => ({ ...prev, sede_id: e.target.value }))}>
                      <option value="">Selecciona sede...</option>
                      {allSedes.map((s) => (
                        <option key={s._id} value={s.data.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/30 rounded-lg border border-gray-100 dark:border-gray-800">
                    <input type="checkbox" id="esReemplazo" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={wizardData.reemplazo} onChange={(e) => setWizardData((prev) => ({ ...prev, reemplazo: e.target.checked }))} />
                    <label htmlFor="esReemplazo" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Es reemplazo
                    </label>
                  </div>

                  {wizardData.reemplazo && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Empleado reemplazado</label>
                      <select className="input-field w-full" value={wizardData.empleado_id_reemplezado} onChange={(e) => setWizardData((prev) => ({ ...prev, empleado_id_reemplezado: e.target.value }))}>
                        <option value="">Selecciona empleado...</option>
                        {teamMembers
                          .filter((m) => String(m._id) !== String(selectedUserForWizard?._id))
                          .map((m) => (
                            <option key={m._id} value={(m.metadata as any)?.id}>
                              {m.firstName} {m.lastName}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Observaciones</label>
                    <textarea className="input-field w-full min-h-[100px] py-3" placeholder="Notas adicionales..." value={wizardData.observaciones} onChange={(e) => setWizardData((prev) => ({ ...prev, observaciones: e.target.value }))} />
                  </div>
                </div>
              )}

              </div>
            </div>
          </Modal>
        </div>
      ) : null}
    </PageLayout>
  );
};
