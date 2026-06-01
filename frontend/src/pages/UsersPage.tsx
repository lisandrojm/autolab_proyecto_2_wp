import React, { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../stores/authStore";
import { usersAPI, User } from "../api/users";
import { rolesAPI, Role } from "../api/roles";
import { positionsAPI, Position } from "../api/positions";
import { levelsAPI, Level } from "../api/levels";
import { areasAPI, Area } from "../api/areas";
import { clientsAPI, Client } from "../api/clients";
import { projectsAPI, Project } from "../api/projects";
import { roleFrameAPI, RoleFrameItem } from "../api/roleFrames";
import { infoAPI, InfoItem } from "../api/info";
import { shiftsAPI, Shift } from "../api/shifts";
import { vacationsAPI, VacationRequest } from "../api/vacations";
import { PageLayout } from "../components/ui/PageLayout";
import { InfoModal } from "../components/ui/InfoModal";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { UserCard } from "../components/users/UserCard";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faUserShield, faUserTie, faUserGraduate, faEdit, faTrash, faKey, faPlus, faEye, faEyeSlash, faLayerGroup, faHourglassHalf, faCalendar, faToggleOn, faToggleOff, faBriefcase, faChevronLeft, faChevronRight, faBuilding, faIdCard, faTable, faGrip, faClock, faFileContract, faChevronDown, faChevronUp, faMapMarkerAlt, faUniversity, faPassport, faVenusMars, faGraduationCap, faStethoscope, faCreditCard, faMobileAlt, faSearch, faTimes, faLock, faUmbrellaBeach, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { useNavigate, useParams } from "react-router-dom";
import { getImageUrl } from "../utils/imageHelpers";
import { fuzzyMatch } from "../utils/searchHelpers";

const HELP_KEY = "users" as const;

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: string[];
  hireDate: string;
  extraVacationDays: number;
  clientIds: string[];
  isSolicitud?: boolean;
  // Metadata fields
  generoId?: number;
  tipoDocumentoId?: number;
  documento?: string;
  cuit?: string;
  estadoCivil?: string;
  calle?: string;
  altura?: string;
  pisoDepto?: string;
  codigoPostal?: string;
  localidad?: string;
  paisId?: number;
  nacionalidadId?: number;
  nivelEstudioId?: number;
  osId?: number;
  osPrepaga?: boolean;
  fechaNac?: string;
  telefono?: string;
  telefono2?: string;
  visa?: boolean;
  bancoId?: number;
  cbu?: string;
  tipoDeCuentaBancaria?: string;
  nroDeCuentaBancaria?: string;
  aliasBancario?: string;
  numeroLegajoTango?: string;
  afiliadoAlSindicato?: boolean;
  inHouse?: boolean;
  rolesFrameIds?: string[];
}

type ModalTab = "general" | "domicilio" | "bancarios" | "proyectos";

type ModalMode = "edit" | "password";

export const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const { clientId } = useParams<{ clientId: string }>();
  const { hasPermission } = useAuthStore();

  // data
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allRoleFrames, setAllRoleFrames] = useState<RoleFrameItem[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [allVacations, setAllVacations] = useState<VacationRequest[]>([]);
  const [initialLoading, setInitialLoading] = useState(true); // solo primer render
  const [isFetching, setIsFetching] = useState(false); // búsquedas/filtrado
  const [totalUsers, setTotalUsers] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  // Map for ID -> Name lookup for all users
  const [userLookup, setUserLookup] = useState<Map<number | string, string>>(new Map());

  // Specific client context
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // búsqueda/filters (server-side)
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  // New filters
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterRoleFrameId, setFilterRoleFrameId] = useState("");
  const [filterRoleId, setFilterRoleId] = useState("");
  const [filterActiveContract, setFilterActiveContract] = useState(false);
  const [filterIsReplacement, setFilterIsReplacement] = useState(false);
  const [filterIsSolicitud, setFilterIsSolicitud] = useState(false);
  const [filterUserStatus, setFilterUserStatus] = useState<string>("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(25);
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);

  // vacation info modal
  const [vacationModalOpen, setVacationModalOpen] = useState(false);
  const [selectedVacationUser, setSelectedVacationUser] = useState<{ id: string; name: string } | null>(null);

  // modal create/edit/password
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("edit");
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // form create/edit
  const [formData, setFormData] = useState<UserFormData>({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    isActive: true,
    roles: [],
    hireDate: new Date().toISOString().split("T")[0],
    extraVacationDays: 0,
    clientIds: [],
  });

  const [modalActiveTab, setModalActiveTab] = useState<ModalTab>("general");

  // Info data for selects
  const [genders, setGenders] = useState<InfoItem[]>([]);
  const [documentTypes, setDocumentTypes] = useState<InfoItem[]>([]);
  const [countries, setCountries] = useState<InfoItem[]>([]);
  const [nationalities, setNationalities] = useState<InfoItem[]>([]);
  const [educationLevels, setEducationLevels] = useState<InfoItem[]>([]);
  const [banks, setBanks] = useState<InfoItem[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<InfoItem[]>([]);
  const [contractTypes, setContractTypes] = useState<InfoItem[]>([]);
  const [employeeStatuses, setEmployeeStatuses] = useState<InfoItem[]>([]);

  // password modal fields (cuando modalMode === "password")
  const [passwordUserId, setPasswordUserId] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // info modal (ⓘ)
  const [openInfo, setOpenInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  // view modal (solo lectura)
  const [viewOpen, setViewOpen] = useState(false);
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [viewActiveTab, setViewActiveTab] = useState<ModalTab>("general");
  const [roleFrameSearch, setRoleFrameSearch] = useState("");

  const canManage = hasPermission("admin_users:view");

  // Para descartar respuestas viejas
  const requestIdRef = useRef(0);

  useEffect(() => {
    let timeoutId: any;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const isNowXXL = window.innerWidth >= 1200;
        setIsXXL(isNowXXL);

        if (!isNowXXL) {
          setViewMode("cards");
        } else {
          const saved = localStorage.getItem("userViewMode");
          if (saved && (saved === "table" || saved === "cards")) {
            setViewMode(saved as "table" | "cards");
          } else {
            setViewMode("cards");
          }
        }
      }, 150);
    };

    const isInitialXXL = window.innerWidth >= 1200;
    setIsXXL(isInitialXXL);

    if (isInitialXXL) {
      const saved = localStorage.getItem("userViewMode");
      if (saved && (saved === "table" || saved === "cards")) {
        setViewMode(saved as "table" | "cards");
      } else {
        setViewMode("cards");
      }
    } else {
      setViewMode("cards");
    }

    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (isXXL) {
      localStorage.setItem("userViewMode", viewMode);
    }
  }, [viewMode, isXXL]);

  useEffect(() => {
    // Carga inicial
    const init = async () => {
      try {
        setInitialLoading(true);
        // Prioridad: usuarios, roles, cargos, niveles, areas
        await Promise.all([fetchUsers({ silent: false }), fetchRoles(), fetchPositions(), fetchLevels(), fetchAreas()]);
      } finally {
        setInitialLoading(false);
        // Carga secundaria (no bloqueante para la lista inicial)
        fetchAllClients();
        fetchAllProjects();
        fetchAllRoleFrames();
        fetchAllShifts();
        fetchUserLookup(); // Fetch all users for name resolution
        fetchVacations();
        fetchInfo();
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchInfo = async () => {
    try {
      const [g, dt, c, n, el, b, ic, ct, es] = await Promise.all([infoAPI.listByType("genero"), infoAPI.listByType("tipo-documento"), infoAPI.listByType("pais"), infoAPI.listByType("nacionalidad"), infoAPI.listByType("nivel-estudio"), infoAPI.listByType("banco"), infoAPI.listByType("obra-social"), infoAPI.listByType("contrato"), infoAPI.listByType("estado-empleado")]);
      setGenders(g);
      setDocumentTypes(dt);
      setCountries(c);
      setNationalities(n);
      setEducationLevels(el);
      setBanks(b);
      setInsuranceCompanies(ic);
      setContractTypes(ct);
      setEmployeeStatuses(es);
    } catch (error) {
      console.error("Error fetching info:", error);
    }
  };

  const fetchVacations = async () => {
    try {
      const vacationsList = await vacationsAPI.getAll();
      setAllVacations(vacationsList);
    } catch (error) {
      console.error("Error fetching vacations:", error);
    }
  };

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

  // Debounce para refrescar la lista cuando cambian searchTerm / filterActive / fechas
  useEffect(() => {
    const h = setTimeout(() => {
      setCurrentPage(1); // Reset to first page on search/filter change
      fetchUsers({ silent: false, page: 1 });
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, startDate, endDate, clientId, allProjects.length, filterProjectId, filterRoleFrameId, filterRoleId, filterActiveContract, filterIsReplacement, filterIsSolicitud, filterUserStatus]);

  // Refrescar cuando cambia la página
  useEffect(() => {
    if (!initialLoading) {
      fetchUsers({ silent: false, page: currentPage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, limit]);

  const fetchUserLookup = async () => {
    try {
      // Fetch all users for lookup map (limit 10000 to get all)
      const response = await usersAPI.list({ limit: 10000, page: 1 });
      const map = new Map<number | string, string>();
      response.users.forEach((u) => {
        const metaId = (u.metadata as any)?.id;
        if (metaId) {
          const name = u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : u.email;
          map.set(metaId, name);
        }
      });
      setUserLookup(map);
      console.log(`📋 User lookup map built with ${map.size} entries`);
    } catch (error) {
      console.error("Error fetching user lookup:", error);
    }
  };

  const fetchUsers = async ({ silent = false, page = currentPage }: { silent?: boolean; page?: number } = {}) => {
    try {
      if (!silent) setIsFetching(true);
      const currentId = ++requestIdRef.current;

      // Always use server-side pagination and filtering
      const params: any = {
        page: page,
        limit: limit,
      };
      if (searchTerm) params.email = searchTerm;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (clientId) params.clientId = clientId;
      if (filterProjectId) params.projectId = filterProjectId;
      if (filterRoleId) params.roleId = filterRoleId;
      if (filterIsSolicitud) params.isSolicitud = "true";
      if (filterUserStatus === "active") params.metadataActivo = "true";
      if (filterUserStatus === "inactive") params.metadataActivo = "false";


      // Reset client context if we're not filtering by client anymore (though normally we stay in the route)
      if (!clientId && selectedClient) setSelectedClient(null);

      const response = await usersAPI.list(params);

      // Solo aplico si esta respuesta es la más reciente
      if (currentId === requestIdRef.current) {
        let finalUsers = response.users;
        let finalTotal = response.pagination.total;
        let finalPages = response.pagination.pages;

        let workingList = response.users;

        // 3. APPLY SERVER RESPONSE DIRECTLY
        setUsers(response.users);
        setTotalUsers(response.pagination.total);
        setTotalPages(response.pagination.pages);
        setHasLoaded(true);
        console.log("📋 Usuarios cargados:", response.users.length, "de un total de:", response.pagination.total);
      }
    } catch (error) {
      console.error("Error fetching users:", error);
      sweetAlert.error("Error", "No se pudieron cargar los usuarios");
      setHasLoaded(true);
    } finally {
      if (!silent) setIsFetching(false);
    }
  };

  // Fetch client details if filtering by client
  useEffect(() => {
    if (clientId) {
      const fetchClientDetails = async () => {
        try {
          const client = await clientsAPI.get(clientId);
          setSelectedClient(client);
        } catch (error) {
          console.error("Error fetching client details:", error);
        }
      };
      fetchClientDetails();
    } else {
      setSelectedClient(null);
    }
  }, [clientId]);

  const fetchRoles = async () => {
    try {
      const response = await rolesAPI.list({ limit: 100 });
      // Mostrar TODOS los roles disponibles
      setRoles(response.roles);
    } catch (error) {
      console.error("Error fetching roles:", error);
    }
  };

  const fetchPositions = async () => {
    try {
      const response = await positionsAPI.list({ limit: 100 });
      setPositions(response.positions);
    } catch (error) {
      console.error("Error fetching positions:", error);
    }
  };

  const fetchLevels = async (positionId?: string) => {
    try {
      if (positionId) {
        const levelsForPosition = await levelsAPI.listForPosition(positionId);
        setLevels(levelsForPosition);
      } else {
        const response = await levelsAPI.list({ limit: 100 });
        const generalLevels = response.levels.filter((l) => l.type === "general");
        setLevels(generalLevels);
      }
    } catch (error) {
      console.error("Error fetching levels:", error);
    }
  };

  const fetchAreas = async () => {
    try {
      const response = await areasAPI.list({ limit: 100 });
      setAreas(response.areas);
    } catch (error) {
      console.error("Error fetching areas:", error);
    }
  };

  const fetchAllClients = async () => {
    try {
      const clients = await clientsAPI.listAll();
      setAllClients(clients);
    } catch (error) {
      console.error("Error fetching all clients:", error);
    }
  };

  const fetchAllProjects = async () => {
    try {
      const projects = await projectsAPI.listAll({ limit: 500 }); // Increase limit for safety
      setAllProjects(projects);
      console.log("📂 Proyectos cargados para asignación:", {
        count: projects.length,
        projects: projects.map((p) => ({
          name: p.name,
          cid: typeof p.clientId === "string" ? p.clientId : p.clientId?._id,
        })),
      });
    } catch (error: any) {
      console.error("Error fetching all projects:", error);
      // Solo loguear, pero podríamos poner un estado de error si quisiéramos
    }
  };

  const fetchAllRoleFrames = async () => {
    try {
      const roleFrames = await roleFrameAPI.list();
      const arrayData = Array.isArray(roleFrames)
        ? roleFrames
        : (roleFrames && Array.isArray((roleFrames as any).data))
          ? (roleFrames as any).data
          : [];
      setAllRoleFrames(arrayData);
    } catch (error: any) {
      console.error("Error fetching role frames:", error);
      setAllRoleFrames([]);
    }
  };

  const fetchAllShifts = async () => {
    try {
      const shifts = await shiftsAPI.getAll();
      setAllShifts(shifts);
    } catch (error) {
      console.error("Error fetching shifts:", error);
    }
  };

  // Abrir modales
  const openCreate = () => {
    setEditingUser(null);
    setModalMode("edit");

    // Pre-seleccionar el rol por defecto (isDefault: true) y "Mobile-Colaborador"
    const defaultRole = roles.find((role) => role.isDefault);
    const mobileCollabRole = roles.find((role) => role.name.toLowerCase() === "mobile-colaborador");

    // Set ensures uniqueness
    const defaultRolesSet = new Set<string>();
    if (defaultRole) defaultRolesSet.add(defaultRole._id);
    if (mobileCollabRole) defaultRolesSet.add(mobileCollabRole._id);

    setFormData({
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      isActive: true,
      roles: Array.from(defaultRolesSet),
      hireDate: new Date().toISOString().split("T")[0],
      extraVacationDays: 0,
      clientIds: [],
      // Metadata defaults
      osPrepaga: false,
      visa: false,
      afiliadoAlSindicato: false,
      inHouse: false,
      rolesFrameIds: [],
    });
    setModalActiveTab("general");
    setShowPassword(false);
    setShowModal(true);
  };

  useEffect(() => {
    if (showModal && modalMode === "edit") {
      if (formData.positionId) {
        fetchLevels(formData.positionId);
      } else {
        fetchLevels();
      }
    }
  }, [formData.positionId, showModal, modalMode]);

  const openEdit = (user: User) => {
    setEditingUser(user);
    setModalMode("edit");

    // Extraer positionId correctamente (puede ser string u objeto)
    const isSolicitud = user.metadata?.isSolicitud;
    let firstName = user.firstName || "";
    let lastName = user.lastName || "";
    let hireDate = user.hireDate ? new Date(user.hireDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

    // Pre-fill from metadata if it's a solicitud
    if (isSolicitud && user.metadata?.fullName) {
      const parts = user.metadata.fullName.trim().split(" ");
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ") || "";
      if (user.metadata.startDate) {
        hireDate = user.metadata.startDate;
      }
    }

    setFormData({
      email: user.email.startsWith("solicitud_") ? "" : user.email,
      password: "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      isActive: user.metadata?.activo ?? true,
      roles: user.roles.map((r) => r._id),
      hireDate,
      extraVacationDays: user.extraVacationDays || 0,
      clientIds: user.clientIds ? user.clientIds.map((c) => c._id) : [],
      isSolicitud,
      // Metadata fields
      generoId: user.metadata?.generoId,
      tipoDocumentoId: user.metadata?.tipoDocumentoId,
      documento: user.metadata?.documento,
      cuit: user.metadata?.cuit,
      estadoCivil: user.metadata?.estadoCivil || "",
      calle: user.metadata?.calle,
      altura: user.metadata?.altura,
      pisoDepto: user.metadata?.pisoDepto || "",
      codigoPostal: user.metadata?.codigoPostal || "",
      localidad: user.metadata?.localidad || "",
      paisId: user.metadata?.paisId,
      nacionalidadId: user.metadata?.nacionalidadId || user.metadata?.paisId,
      nivelEstudioId: user.metadata?.nivelEstudioId,
      osId: user.metadata?.osId,
      osPrepaga: user.metadata?.osPrepaga || false,
      fechaNac: user.metadata?.fechaNac ? new Date(user.metadata.fechaNac).toISOString().split("T")[0] : "",
      telefono: user.metadata?.telefono,
      telefono2: user.metadata?.telefono2 || "",
      visa: user.metadata?.visa || false,
      bancoId: user.metadata?.bancoId,
      cbu: user.metadata?.cbu || "",
      tipoDeCuentaBancaria: user.metadata?.tipoDeCuentaBancaria || "",
      nroDeCuentaBancaria: user.metadata?.nroDeCuentaBancaria || "",
      aliasBancario: user.metadata?.aliasBancario || "",
      numeroLegajoTango: user.metadata?.numeroLegajoTango || "",
      afiliadoAlSindicato: user.metadata?.afiliadoAlSindicato || false,
      inHouse: user.metadata?.inHouse || false,
      rolesFrameIds: (() => {
        const rawRf = user.metadata?.rolesFrameIds || (user.metadata as any)?.roles_frame || [];
        const rfArray = Array.isArray(rawRf) ? rawRf : [rawRf];
        
        const resolvedIds = new Set<string>();
        rfArray.forEach((rf: any) => {
          if (!rf) return;
          const id = typeof rf === "string" ? rf : rf._id;
          const name = typeof rf === "object" ? rf.name : null;

          // 1. Intentar match por _id en allRoleFrames
          let match = allRoleFrames.find((item) => item._id === id);
          
          // 2. Intentar match por externalId o data.rol.id
          if (!match && id) {
            match = allRoleFrames.find((item) => item.externalId === String(id) || String(item.data?.rol?.id) === String(id));
          }

          // 3. Intentar match por nombre (si tenemos el nombre)
          if (!match && name) {
            match = allRoleFrames.find((item) => item.name === name);
          }
          
          // 4. Si encontramos un match en allRoleFrames, usamos SU _id actual
          if (match) {
            resolvedIds.add(match._id);
          } else if (typeof id === "string" && id.length === 24) {
            // Fallback: si parece un ObjectId, lo mantenemos por si acaso es válido pero no está en la lista actual
            resolvedIds.add(id);
          }
        });
        return Array.from(resolvedIds);
      })(),
    });
    setModalActiveTab("general");
    setShowPassword(false);
    setShowModal(true);
  };

  const openPassword = (userId: string) => {
    setModalMode("password");
    setPasswordUserId(userId);
    setNewPassword("");
    setShowNewPassword(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setPasswordUserId("");
    setNewPassword("");
    setShowPassword(false);
    setShowNewPassword(false);
    setRoleFrameSearch("");
  };

  const openView = (user: User) => {
    setViewUser(user);
    setViewActiveTab("general");
    setViewOpen(true);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewUser(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData: any = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        roles: formData.roles,
        hireDate: formData.hireDate,
        extraVacationDays: formData.extraVacationDays,
        clientIds: formData.clientIds,
        metadata: {
          ...(editingUser?.metadata || {}),
          activo: formData.isActive,
          generoId: formData.generoId,
          tipoDocumentoId: formData.tipoDocumentoId,
          documento: formData.documento,
          cuit: formData.cuit,
          estadoCivil: formData.estadoCivil,
          calle: formData.calle,
          altura: formData.altura,
          pisoDepto: formData.pisoDepto,
          codigoPostal: formData.codigoPostal,
          localidad: formData.localidad,
          paisId: formData.paisId,
          nacionalidadId: formData.nacionalidadId,
          nivelEstudioId: formData.nivelEstudioId,
          osId: formData.osId,
          osPrepaga: formData.osPrepaga,
          fechaNac: formData.fechaNac,
          telefono: formData.telefono,
          telefono2: formData.telefono2,
          visa: formData.visa,
          bancoId: formData.bancoId,
          cbu: formData.cbu,
          tipoDeCuentaBancaria: formData.tipoDeCuentaBancaria,
          nroDeCuentaBancaria: formData.nroDeCuentaBancaria,
          aliasBancario: formData.aliasBancario,
          numeroLegajoTango: formData.numeroLegajoTango,
          afiliadoAlSindicato: formData.afiliadoAlSindicato,
          inHouse: formData.inHouse,
          roles_frame: formData.rolesFrameIds,
          rolesFrameIds: formData.rolesFrameIds,
        },
      };

      if (!editingUser || formData.isSolicitud) {
        submitData.password = formData.password;
      }

      // Si es una solicitud que se está aprobando, quitar el flag
      if (formData.isSolicitud) {
        submitData.metadata.isSolicitud = false;
        // Forzamos activo true si se está aprobando, a menos que el admin diga lo contrario
        submitData.metadata.activo = formData.isActive;
      }

      if (editingUser) {
        delete submitData.password;
        await usersAPI.update(editingUser._id, submitData);
        sweetAlert.success(formData.isSolicitud ? "Solicitud Aprobada" : "Usuario actualizado", formData.isSolicitud ? "El usuario ha sido dado de alta correctamente" : "Los cambios se han guardado correctamente");
      } else {
        await usersAPI.create(submitData);
        sweetAlert.success("Usuario creado", "El usuario se ha creado correctamente");
      }
      closeModal();
      fetchUsers({ silent: true });
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar el usuario";
      sweetAlert.error("Error", message);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await usersAPI.updatePassword(passwordUserId, newPassword);
      sweetAlert.success("Contraseña actualizada", "La contraseña se ha actualizado correctamente");
      closeModal();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al actualizar la contraseña";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (user: User) => {
    const result = await sweetAlert.confirm("¿Eliminar usuario?", `¿Estás seguro de que quieres eliminar al usuario "${user.email}"?`);
    if (result.isConfirmed) {
      try {
        await usersAPI.remove(user._id);
        sweetAlert.success("Usuario eliminado", "El usuario ha sido eliminado correctamente");
        fetchUsers({ silent: true });
      } catch (error: any) {
        const message = error.response?.data?.error || "Error al eliminar el usuario";
        sweetAlert.error("Error", message);
      }
    }
  };

  const getActiveContractType = (user: User): string | null => {
    let contractType: string | null = null;
    if (user.metadata?.projects) {
      user.metadata.projects.forEach((p: any) => {
        if (p.contracts) {
          p.contracts.forEach((c: any) => {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);

            const isActive = !endDate || endDate.getTime() >= new Date().getTime();

            const type = c.nombre_contrato || c.tipo_contrato;
            if (isActive && type) {
              contractType = type;
            }
          });
        }
      });
    }

    if (!contractType && user.externalInfo && (user.externalInfo as any).contracts && (user.externalInfo as any).contracts.length > 0) {
      contractType = (user.externalInfo as any).contracts[0];
    }
    return contractType;
  };

  const getActiveSchedule = (user: User): string | null => {
    let schedule: string | null = null;
    if (user.metadata?.projects) {
      user.metadata.projects.forEach((p: any) => {
        if (p.contracts) {
          p.contracts.forEach((c: any) => {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            if (endDate) endDate.setHours(23, 59, 59, 999);

            const isActive = !endDate || endDate.getTime() >= new Date().getTime();

            if (isActive && (c.hora_inicio || c.hora_fin)) {
              const start = c.hora_inicio || "?";
              const end = c.hora_fin || "?";
              schedule = `${start} - ${end} Hs`;
            }
          });
        }
      });
    }
    return schedule;
  };

  const projectMap = React.useMemo(() => new Map(allProjects.map((p) => [p._id, p])), [allProjects]);

  return (
    <PageLayout
      title={selectedClient ? "Usuarios del Cliente" : "Usuarios"}
      itemCount={totalUsers}
      subtitle={selectedClient ? `Gestiona los usuarios de ${selectedClient.name}` : "Gestiona usuarios y sus roles"}
      faIcon={{ icon: faUser }}
      clientMiniAvatar={
        selectedClient
          ? {
              src: getImageUrl(selectedClient.attachments?.find((a) => a.name?.toLowerCase().includes("logo") || a.fileType?.includes("image"))?.url || selectedClient.brandKit?.logos?.[0]?.url),
              alt: selectedClient.name ? `${selectedClient.name} logo` : undefined,
              fallback: selectedClient.name?.charAt(0)?.toUpperCase() || "?",
              label: selectedClient.name,
            }
          : undefined
      }
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      headerActions={
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={openCreate} className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
            </button>
          )}
          <button onClick={() => navigate("/roles")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserShield} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Roles</span>
          </button>
          <button onClick={() => navigate("/positions")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserTie} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Cargos</span>
          </button>
          <button onClick={() => navigate("/levels")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Niveles</span>
          </button>
          <button onClick={() => navigate("/areas")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Areas</span>
          </button>
          <button onClick={() => navigate("/shifts")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faClock} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Turnos</span>
          </button>
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-start">
          <div className="flex-1 w-full">
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar por email..."
              dateFilter={{
                startDate,
                endDate,
                onStartDateChange: setStartDate,
                onEndDateChange: setEndDate,
              }}
              selectFilters={[
                {
                  value: filterProjectId,
                  onChange: setFilterProjectId,
                  options: allProjects.map((p) => ({ value: p._id, label: p.name })),
                  label: "Proyecto",
                  placeholder: "Todos los proyectos",
                },
                {
                  value: filterRoleFrameId,
                  onChange: setFilterRoleFrameId,
                  options: allRoleFrames.map((rf) => ({ value: rf._id, label: rf.name })),
                  label: "Role Frame",
                  placeholder: "Todos los roles (Frame)",
                },
                {
                  value: filterRoleId,
                  onChange: setFilterRoleId,
                  options: roles.map((r) => ({ value: r._id, label: r.name })),
                  label: "Rol Sistema",
                  placeholder: "Todos los roles",
                },
              ]}
              switchFilters={[
                {
                  value: filterActiveContract,
                  onChange: setFilterActiveContract,
                  label: "Contrato Activo",
                },
                {
                  value: filterIsReplacement,
                  onChange: setFilterIsReplacement,
                  label: "Es Reemplazo",
                },
                {
                  value: filterIsSolicitud,
                  onChange: setFilterIsSolicitud,
                  label: "Solicitudes",
                },
              ]}
              radioFilters={[
                {
                  label: "Estado de usuarios",
                  value: filterUserStatus,
                  onChange: setFilterUserStatus,
                  options: [
                    { label: "Usuarios Activos", value: "active" },
                    { label: "Usuarios Inactivos", value: "inactive" },
                    { label: "Todos los usuarios (Activos e Inactivos)", value: "" },
                  ],
                },
              ]}
            />
          </div>
          {isXXL && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      }
      viewModal={{
        isOpen: viewOpen,
        onClose: closeView,
        title: viewUser ? `Detalle: ${viewUser.firstName || ""} ${viewUser.lastName || ""}`.trim() || viewUser.email : "Detalle de Usuario",
        subtitle: undefined,
        size: "md",
        actions: [
          ...(canManage
            ? [
                {
                  label: "Editar",
                  onClick: () => {
                    if (viewUser) openEdit(viewUser);
                    closeView();
                  },
                  variant: "secondary",
                } as const,
                {
                  label: "Cambiar contraseña",
                  onClick: () => {
                    if (viewUser) openPassword(viewUser._id);
                    closeView();
                  },
                  variant: "ghost",
                } as const,
              ]
            : []),
          {
            label: "Cancelar",
            onClick: closeView,
            variant: "ghost",
          },
        ],
        content: viewUser ? (
          <div className="flex flex-col h-[550px] -mx-6 -mb-6">
            {/* Tabs Header */}
            <div className="z-20 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm shrink-0">
              <div className="flex">
                <button type="button" onClick={() => setViewActiveTab("general")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${viewActiveTab === "general" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                  <FontAwesomeIcon icon={faUser} className="text-xs" />
                  General
                </button>
                <button type="button" onClick={() => setViewActiveTab("domicilio")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${viewActiveTab === "domicilio" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                  <FontAwesomeIcon icon={faMapMarkerAlt} className="text-xs" />
                  Domicilio
                </button>
                <button type="button" onClick={() => setViewActiveTab("bancarios")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${viewActiveTab === "bancarios" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                  <FontAwesomeIcon icon={faUniversity} className="text-xs" />
                  Datos Bancarios
                </button>
                <button type="button" onClick={() => setViewActiveTab("proyectos")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${viewActiveTab === "proyectos" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                  <FontAwesomeIcon icon={faBriefcase} className="text-xs" />
                  Proyectos
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">

            {viewActiveTab === "general" && (
              <div className="space-y-6 animate-fadeIn transition-opacity duration-300">
                <div className="flex justify-between items-start pb-4 border-b border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                      {viewUser.firstName?.charAt(0) || viewUser.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">{viewUser.firstName || viewUser.lastName ? `${viewUser.firstName || ""} ${viewUser.lastName || ""}`.trim() : viewUser.email.split("@")[0]}</h3>
                      <p className="text-sm text-gray-500">{viewUser.email}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-bold uppercase ${viewUser.metadata?.activo ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{viewUser.metadata?.activo ? "Activo" : "Inactivo"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
                  {/* Basic Info */}
                  {viewUser.metadata?.documento && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faIdCard} className="text-gray-300" />
                        Documento
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.documento}</p>
                    </div>
                  )}

                  {viewUser.metadata?.tipoDocumentoId && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faPassport} className="text-gray-300" />
                        Tipo Documento
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{documentTypes.find((dt) => dt.data.id === viewUser.metadata?.tipoDocumentoId)?.name || "—"}</p>
                    </div>
                  )}

                  {viewUser.metadata?.fechaNac && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faCalendar} className="text-gray-300" />
                        Fecha Nacimiento
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{new Date(viewUser.metadata.fechaNac).toLocaleDateString()}</p>
                    </div>
                  )}

                  {viewUser.metadata?.generoId && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faVenusMars} className="text-gray-300" />
                        Género
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{genders.find((g) => g.data.id === viewUser.metadata?.generoId)?.name || "—"}</p>
                    </div>
                  )}

                  {viewUser.metadata?.estadoCivil && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faUser} className="text-gray-300" />
                        Estado Civil
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.estadoCivil}</p>
                    </div>
                  )}

                  {viewUser.metadata?.nivelEstudioId && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faGraduationCap} className="text-gray-300" />
                        Nivel de Estudio
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{educationLevels.find((el) => el.data.id === viewUser.metadata?.nivelEstudioId)?.name || "—"}</p>
                    </div>
                  )}

                  {(viewUser.metadata?.nacionalidadId || viewUser.metadata?.paisId) && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faPassport} className="text-gray-300" />
                        Nacionalidad
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        {(() => {
                          const targetId = viewUser.metadata?.nacionalidadId || viewUser.metadata?.paisId;
                          const list = nationalities.length > 0 ? nationalities : countries;
                          return list.find((n) => n.data.id === targetId)?.name || "—";
                        })()}
                      </p>
                    </div>
                  )}

                  {viewUser.metadata?.osId && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faStethoscope} className="text-gray-300" />
                        Obra Social
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{insuranceCompanies.find((ic) => ic.data.id === viewUser.metadata?.osId)?.name || "—"}</p>
                    </div>
                  )}

                  {viewUser.metadata?.cuit && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faIdCard} className="text-gray-300" />
                        CUIT / CUIL
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.cuit}</p>
                    </div>
                  )}

                  {viewUser.hireDate && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faBriefcase} className="text-gray-300" />
                        Fecha de Ingreso
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{new Date(viewUser.hireDate).toLocaleDateString()}</p>
                    </div>
                  )}

                  {(() => {
                    const totalDaysCount = (viewUser.metadata?.projects as any[])?.reduce((acc: number, p: any) => {
                      return acc + (p.contracts?.reduce((pAcc: number, c: any) => pAcc + (c.cantidad_jornadas_laborales || 0), 0) || 0);
                    }, 0) || 0;

                    if (totalDaysCount === 0) return null;

                    return (
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                          <FontAwesomeIcon icon={faClock} className="text-gray-300" />
                          Antigüedad Total
                        </label>
                        <div>
                          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                            {totalDaysCount} {totalDaysCount === 1 ? "día" : "días"}
                          </p>
                          <p className="text-[10px] text-gray-400 mt-0.5">({totalDaysCount} días en total)</p>
                        </div>
                      </div>
                    );
                  })()}
                </div>


                <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  {viewUser.roles.length > 0 && (
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                        <FontAwesomeIcon icon={faUserShield} className="text-gray-300" />
                        Roles de Sistema
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {viewUser.roles.map((role) => {
                          const isCoord = role.name.toLowerCase().includes("coordinador");
                          const classes = isCoord
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800";
                          
                          return (
                            <span key={role._id} className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${classes}`}>
                              {role.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(() => {
                    const rfIds = viewUser.metadata?.rolesFrameIds || (viewUser.metadata as any)?.roles_frame;
                    if (!rfIds || rfIds.length === 0) return null;
                    return (
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 mb-3">
                          <FontAwesomeIcon icon={faLayerGroup} className="text-gray-300" />
                          Roles Frame
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {rfIds.map((rf: any, idx: number) => {
                            const roleFrameId = typeof rf === "string" ? rf : rf._id;
                            const roleFrameObj = allRoleFrames.find((item) => item._id === roleFrameId);
                            const roleFrameName = roleFrameObj ? roleFrameObj.name : typeof rf === "object" ? rf.name : roleFrameId;
                            return (
                              <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 uppercase tracking-tight">
                                {roleFrameName}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {viewActiveTab === "domicilio" && (
              <div className="space-y-6 animate-fadeIn transition-opacity duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
                  {viewUser.metadata?.paisId && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faMapMarkerAlt} className="text-gray-300" />
                        País
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{countries.find((c) => c.data.id === viewUser.metadata?.paisId)?.name || "—"}</p>
                    </div>
                  )}

                  {viewUser.metadata?.localidad && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faMapMarkerAlt} className="text-gray-300" />
                        Localidad
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.localidad}</p>
                    </div>
                  )}

                  {viewUser.metadata?.calle && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faMapMarkerAlt} className="text-gray-300" />
                        Calle
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        {viewUser.metadata.calle} {viewUser.metadata.altura}
                      </p>
                    </div>
                  )}

                  {viewUser.metadata?.pisoDepto && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faMapMarkerAlt} className="text-gray-300" />
                        Piso/Depto
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.pisoDepto}</p>
                    </div>
                  )}

                  {viewUser.metadata?.codigoPostal && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faMapMarkerAlt} className="text-gray-300" />
                        Código Postal
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.codigoPostal}</p>
                    </div>
                  )}

                  {viewUser.metadata?.telefono && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faUser} className="text-gray-300" />
                        Teléfono
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.telefono}</p>
                    </div>
                  )}

                  {viewUser.metadata?.telefono2 && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faUser} className="text-gray-300" />
                        Teléfono Emergencia
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.telefono2}</p>
                    </div>
                  )}

                  {viewUser.metadata?.visa !== undefined && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faPassport} className="text-gray-300" />
                        Visa
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.visa ? "Sí" : "No"}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {viewActiveTab === "bancarios" && (
              <div className="space-y-6 animate-fadeIn transition-opacity duration-300">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
                  {viewUser.metadata?.bancoId && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faUniversity} className="text-gray-300" />
                        Banco
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{banks.find((b) => b.data.id === viewUser.metadata?.bancoId)?.name || "—"}</p>
                    </div>
                  )}

                  {viewUser.metadata?.cbu && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faCreditCard} className="text-gray-300" />
                        CBU / CVU
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 tracking-wider transition-all hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1 -mx-1">{viewUser.metadata.cbu}</p>
                    </div>
                  )}

                  {viewUser.metadata?.tipoDeCuentaBancaria && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faUniversity} className="text-gray-300" />
                        Tipo de Cuenta
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.tipoDeCuentaBancaria}</p>
                    </div>
                  )}

                  {viewUser.metadata?.nroDeCuentaBancaria && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faCreditCard} className="text-gray-300" />
                        Número de Cuenta
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.nroDeCuentaBancaria}</p>
                    </div>
                  )}

                  {viewUser.metadata?.aliasBancario && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <FontAwesomeIcon icon={faUniversity} className="text-gray-300" />
                        Alias Bancario
                      </label>
                      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{viewUser.metadata.aliasBancario}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {viewActiveTab === "proyectos" && (
              <div className="space-y-4 animate-fadeIn transition-opacity duration-300">
                {viewUser.metadata?.projects && viewUser.metadata.projects.length > 0 ? (
                  viewUser.metadata.projects.map((up: any, upIdx: number) => {
                    const pId = typeof up.projectId === "object" ? up.projectId?._id : up.projectId;
                    const project = projectMap.get(pId);
                    const clientId = typeof project?.clientId === "object" ? project?.clientId?._id : project?.clientId;
                    const client = allClients.find((c) => c._id === clientId);

                    return (
                      <div key={upIdx} className="bg-gray-50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden shadow-sm">
                        {/* Project Header */}
                        <div className="bg-white dark:bg-gray-800 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex flex-col md:flex-row md:items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{client?.name || "Cliente"}</span>
                              <span className="text-gray-300 dark:text-gray-600">/</span>
                              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{up.nombre_proyecto || project?.name || "Proyecto"}</span>
                            </div>
                          </div>
                          {up.nombre_rol_frame && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800 uppercase tracking-tight self-start">
                              {up.nombre_rol_frame}
                            </span>
                          )}
                        </div>

                        {/* Contracts List */}
                        <div className="p-4 space-y-3">
                          {up.contracts && up.contracts.length > 0 ? (
                            up.contracts.map((c: any, cIdx: number) => (
                              <div key={cIdx} className="bg-white dark:bg-gray-800/50 rounded-lg p-3 border border-gray-100 dark:border-gray-700/50 shadow-sm transition-all hover:border-blue-200 dark:hover:border-blue-800">
                                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                  <div className="flex items-center gap-2">
                                    <FontAwesomeIcon icon={faFileContract} className="text-blue-500 text-xs" />
                                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{c.nombre_contrato || "Contrato"}</span>
                                  </div>
                                  <div className="flex gap-2">
                                    {c.nombre_sede && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600">
                                        {c.nombre_sede}
                                      </span>
                                    )}
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${c.nombre_estado_empleado === "Activo" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800" : "bg-gray-50 text-gray-600 dark:bg-gray-900/20 dark:text-gray-400 border border-gray-100 dark:border-gray-800"}`}>
                                      {c.nombre_estado_empleado || "Estado"}
                                    </span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                                  <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Periodo</label>
                                    <p className="font-semibold text-gray-600 dark:text-gray-400">
                                      {c.fecha_alta_contrato ? new Date(c.fecha_alta_contrato).toLocaleDateString() : "?"} - {c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato).toLocaleDateString() : "Indef."}
                                    </p>
                                  </div>
                                  <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Turno</label>
                                    <div className="flex flex-wrap items-center gap-1.5 font-semibold text-gray-600 dark:text-gray-400">
                                      <FontAwesomeIcon icon={faGrip} className="text-blue-500 text-[10px]" />
                                      {(() => {
                                        const shifts: string[] = [];
                                        if (c.areaShiftAssignments && Array.isArray(c.areaShiftAssignments)) {
                                          c.areaShiftAssignments.forEach((asa: any) => {
                                            if (asa.shiftIds && Array.isArray(asa.shiftIds)) {
                                              asa.shiftIds.forEach((sId: any) => {
                                                const id = typeof sId === "object" ? sId?._id : sId;
                                                const sName = typeof sId === "object" && sId.name ? sId.name : allShifts.find((s) => s._id === id)?.name;
                                                if (sName) shifts.push(sName);
                                              });
                                            }
                                          });
                                        }
                                        if (shifts.length > 0) return Array.from(new Set(shifts)).join(", ");
                                        return c.nombre_turno && !c.nombre_turno.includes(":") ? c.nombre_turno : "Sin asignar";
                                      })()}
                                    </div>
                                  </div>
                                  <div className="space-y-0.5">
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Horario</label>
                                    <div className="flex items-center gap-1.5 font-semibold text-gray-600 dark:text-gray-400">
                                      <FontAwesomeIcon icon={faClock} className="text-amber-500 text-[10px]" />
                                      {c.hora_inicio && c.hora_fin ? `${c.hora_inicio} - ${c.hora_fin}` : "Sin horario"}
                                    </div>
                                  </div>
                                  {c.nombre_area && (
                                    <div className="space-y-0.5">
                                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Área</label>
                                      <p className="font-semibold text-gray-600 dark:text-gray-400">{c.nombre_area}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center py-4 text-xs text-gray-400 italic">No hay contratos registrados para este proyecto.</div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <FontAwesomeIcon icon={faBriefcase} className="text-2xl text-gray-300" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Sin proyectos asignados</h4>
                      <p className="text-xs text-gray-500">Este usuario aún no tiene participación en proyectos.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        ) : null,
      }}
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: modalMode === "password" ? "Cambiar Contraseña" : formData.isSolicitud ? "Aprobar Solicitud de Alta" : editingUser ? `Editar Usuario: ${editingUser.firstName || ""} ${editingUser.lastName || ""}`.trim() || editingUser.email : "Nuevo Usuario",
        subtitle: modalMode === "password" ? undefined : formData.isSolicitud ? "Completa los datos para dar de alta al usuario" : "Define datos básicos y roles",
        size: modalMode === "password" ? "sm" : "lg",
        actions:
          modalMode === "password"
            ? [
                { label: "Actualizar", onClick: () => document.querySelector<HTMLFormElement>("#password-form")?.requestSubmit(), variant: "primary" },
                { label: "Cancelar", onClick: closeModal, variant: "ghost" },
              ]
            : [
                { label: formData.isSolicitud ? "Aprobar y Crear" : editingUser ? "Actualizar" : "Crear", onClick: () => document.querySelector<HTMLFormElement>("#user-form")?.requestSubmit(), variant: "primary" },
                { label: "Cancelar", onClick: closeModal, variant: "ghost" },
              ],
        content:
          modalMode === "password" ? (
            <form id="password-form" onSubmit={handlePasswordSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nueva Contraseña *</label>
                  <div className="relative">
                    <input type={showNewPassword ? "text" : "password"} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field pr-10" placeholder="••••••••" minLength={6} />
                    <button type="button" onClick={() => setShowNewPassword((v) => !v)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                      <FontAwesomeIcon icon={showNewPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            </form>
          ) : (
            <form id="user-form" onSubmit={handleSubmit} className="flex flex-col h-[550px] -mx-6 -mb-6">
              {/* Tabs Header Sticky Container */}
              <div className="z-20 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm shrink-0">
                <div className="flex">
                  <button type="button" onClick={() => setModalActiveTab("general")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${modalActiveTab === "general" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                    <FontAwesomeIcon icon={faUser} className="text-xs" />
                    General
                  </button>
                  <button type="button" onClick={() => setModalActiveTab("domicilio")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${modalActiveTab === "domicilio" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                    <FontAwesomeIcon icon={faMapMarkerAlt} className="text-xs" />
                    Domicilio
                  </button>
                  <button type="button" onClick={() => setModalActiveTab("bancarios")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${modalActiveTab === "bancarios" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                    <FontAwesomeIcon icon={faUniversity} className="text-xs" />
                    Datos Bancarios
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* Tab Content */}
                {modalActiveTab === "general" && (
                  <div className="space-y-6 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre *</label>
                        <input type="text" required value={formData.firstName} onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))} className="input-field" placeholder="Ej: Juan" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Apellido *</label>
                        <input type="text" required value={formData.lastName} onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))} className="input-field" placeholder="Ej: Pérez" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email *</label>
                        <input type="email" required value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} className="input-field" placeholder="usuario@ejemplo.com" />
                      </div>
                      {(!editingUser || formData.isSolicitud) && (
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{formData.isSolicitud ? "Asignar Contraseña *" : "Contraseña *"}</label>
                          <div className="relative">
                            <input type={showPassword ? "text" : "password"} required value={formData.password} onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))} className="input-field pr-10" placeholder="••••••••" minLength={6} />
                            <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                              <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo de Documento</label>
                        <select value={formData.tipoDocumentoId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, tipoDocumentoId: parseInt(e.target.value) || undefined }))} className="input-field">
                          <option value="">Seleccionar...</option>
                          {documentTypes.map((it) => (
                            <option key={it._id} value={it.data.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Documento *</label>
                        <input type="text" required value={formData.documento || ""} onChange={(e) => setFormData((prev) => ({ ...prev, documento: e.target.value }))} className="input-field" placeholder="DNI / Pasaporte" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Fecha de Nacimiento</label>
                        <input type="date" value={formData.fechaNac || ""} onChange={(e) => setFormData((prev) => ({ ...prev, fechaNac: e.target.value }))} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nivel de Estudio</label>
                        <select value={formData.nivelEstudioId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, nivelEstudioId: parseInt(e.target.value) || undefined }))} className="input-field">
                          <option value="">Seleccionar...</option>
                          {educationLevels.map((it) => (
                            <option key={it._id} value={it.data.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">CUIT / CUIL</label>
                        <input type="text" value={formData.cuit || ""} onChange={(e) => setFormData((prev) => ({ ...prev, cuit: e.target.value }))} className="input-field" placeholder="20-XXXXXXXX-X" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nacionalidad</label>
                        <select value={formData.nacionalidadId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, nacionalidadId: parseInt(e.target.value) || undefined }))} className="input-field">
                          <option value="">Seleccionar...</option>
                          {(nationalities.length > 0 ? nationalities : countries).map((it) => (
                            <option key={it._id} value={it.data.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Género</label>
                        <select value={formData.generoId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, generoId: parseInt(e.target.value) || undefined }))} className="input-field">
                          <option value="">Seleccionar...</option>
                          {genders.map((it) => (
                            <option key={it._id} value={it.data.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Estado Civil</label>
                        <select value={formData.estadoCivil || ""} onChange={(e) => setFormData((prev) => ({ ...prev, estadoCivil: e.target.value }))} className="input-field">
                          <option value="">Seleccionar...</option>
                          <option value="Soltero">Soltero/a</option>
                          <option value="Casado">Casado/a</option>
                          <option value="Divorciado">Divorciado/a</option>
                          <option value="Viudo">Viudo/a</option>
                          <option value="Concuvino">Concubino/a</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center space-x-6 h-full pt-4">
                        <label className="flex items-center space-x-3 cursor-pointer group">
                          <div className={`w-10 h-6 flex items-center bg-gray-300 dark:bg-gray-700 rounded-full p-1 duration-300 ease-in-out ${formData.osPrepaga ? "bg-blue-500 dark:bg-blue-600" : ""}`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${formData.osPrepaga ? "translate-x-4" : ""}`}></div>
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">OS Prepaga</span>
                          <input type="checkbox" className="hidden" checked={formData.osPrepaga} onChange={(e) => setFormData((prev) => ({ ...prev, osPrepaga: e.target.checked }))} />
                        </label>
                        <label className="flex items-center space-x-3 cursor-pointer group">
                          <div className={`w-10 h-6 flex items-center bg-gray-300 dark:bg-gray-700 rounded-full p-1 duration-300 ease-in-out ${formData.inHouse ? "bg-blue-500 dark:bg-blue-600" : ""}`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${formData.inHouse ? "translate-x-4" : ""}`}></div>
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">In House</span>
                          <input type="checkbox" className="hidden" checked={formData.inHouse} onChange={(e) => setFormData((prev) => ({ ...prev, inHouse: e.target.checked }))} />
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Obra Social</label>
                        <select value={formData.osId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, osId: parseInt(e.target.value) || undefined }))} className="input-field">
                          <option value="">Seleccionar...</option>
                          {insuranceCompanies.map((it) => (
                            <option key={it._id} value={it.data.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Fecha de Ingreso *</label>
                        <input type="date" required value={formData.hireDate} onChange={(e) => setFormData((prev) => ({ ...prev, hireDate: e.target.value }))} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Vacaciones (Días Extra)</label>
                        <input type="number" min="0" value={formData.extraVacationDays} onChange={(e) => setFormData((prev) => ({ ...prev, extraVacationDays: parseInt(e.target.value) || 0 }))} className="input-field" />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-4 mb-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Rol/es Frame</label>
                        <div className="relative w-48 md:w-64">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <FontAwesomeIcon icon={faSearch} className="h-3 w-3 text-gray-400" />
                          </div>
                          <input type="text" value={roleFrameSearch} onChange={(e) => setRoleFrameSearch(e.target.value)} placeholder="Buscar especialidad..." className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                          {roleFrameSearch && (
                            <button type="button" onClick={() => setRoleFrameSearch("")} className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                              <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/30">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                          {allRoleFrames
                            .filter((rf) => fuzzyMatch(rf.name, roleFrameSearch))
                            .map((rf) => (
                              <label key={rf._id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${formData.rolesFrameIds?.includes(rf._id) ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300"}`}>
                                <input
                                  type="checkbox"
                                  checked={formData.rolesFrameIds?.includes(rf._id)}
                                  onChange={(e) => {
                                    const newRF = e.target.checked ? [...(formData.rolesFrameIds || []), rf._id] : (formData.rolesFrameIds || []).filter((id) => id !== rf._id);
                                    setFormData((prev) => ({ ...prev, rolesFrameIds: newRF }));
                                  }}
                                  className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                                />
                                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{rf.name}</span>
                              </label>
                            ))}
                          {allRoleFrames.filter((rf) => fuzzyMatch(rf.name, roleFrameSearch)).length === 0 && <div className="col-span-full py-8 text-center text-xs text-gray-500 italic">No se encontraron especialidades que coincidan con "{roleFrameSearch}"</div>}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Legajo Tango</label>
                        <input type="text" value={formData.numeroLegajoTango || ""} onChange={(e) => setFormData((prev) => ({ ...prev, numeroLegajoTango: e.target.value }))} className="input-field" placeholder="Ej: 01505" />
                      </div>
                      <div className="flex items-center pt-4">
                        <label className="flex items-center space-x-3 cursor-pointer group">
                          <div className={`w-10 h-6 flex items-center bg-gray-300 dark:bg-gray-700 rounded-full p-1 duration-300 ease-in-out ${formData.afiliadoAlSindicato ? "bg-blue-500 dark:bg-blue-600" : ""}`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${formData.afiliadoAlSindicato ? "translate-x-4" : ""}`}></div>
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Afiliado al Sindicato</span>
                          <input type="checkbox" className="hidden" checked={formData.afiliadoAlSindicato} onChange={(e) => setFormData((prev) => ({ ...prev, afiliadoAlSindicato: e.target.checked }))} />
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Roles de Sistema</label>
                      <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/30 max-h-64 overflow-y-auto space-y-4">
                        <div>
                          <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <FontAwesomeIcon icon={faUserShield} className="text-gray-300" />
                            Sistema
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {roles
                              .filter((r) => r.name.toLowerCase() !== "superadmin" && !r.name.toLowerCase().includes("mobile"))
                              .map((r) => (
                                <label key={r._id} className={`flex items-start space-x-3 p-3 rounded-lg border transition-all cursor-pointer ${formData.roles.includes(r._id) ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-200"}`}>
                                  <input
                                    type="checkbox"
                                    checked={formData.roles.includes(r._id)}
                                    onChange={(e) => {
                                      let newRoles = e.target.checked ? [...formData.roles, r._id] : formData.roles.filter((id) => id !== r._id);
                                      const name = r.name.toLowerCase();
                                      if (e.target.checked) {
                                        if (name === "admin") newRoles = newRoles.filter((id) => roles.find((ro) => ro._id === id)?.name.toLowerCase() !== "user");
                                        else if (name === "user") newRoles = newRoles.filter((id) => roles.find((ro) => ro._id === id)?.name.toLowerCase() !== "admin");
                                      }
                                      setFormData((prev) => ({ ...prev, roles: newRoles }));
                                    }}
                                    className="mt-0.5 rounded text-blue-500 focus:ring-blue-500"
                                  />
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{r.name}</span>
                                </label>
                              ))}
                          </div>
                        </div>
                        {roles.some((r) => r.name.toLowerCase().includes("mobile")) && (
                          <div>
                            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                              <FontAwesomeIcon icon={faMobileAlt} className="text-indigo-300" />
                              Mobile (App)
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {roles
                                .filter((r) => r.name.toLowerCase().includes("mobile"))
                                .map((r) => (
                                  <label key={r._id} className={`flex items-start space-x-3 p-3 rounded-lg border transition-all cursor-pointer ${formData.roles.includes(r._id) ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800 ring-2 ring-indigo-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-200"}`}>
                                    <input
                                      type="checkbox"
                                      checked={formData.roles.includes(r._id)}
                                      onChange={(e) => {
                                        let newRoles = e.target.checked ? [...formData.roles, r._id] : formData.roles.filter((id) => id !== r._id);
                                        const name = r.name.toLowerCase();
                                        if (e.target.checked) {
                                          if (name.includes("coordinador"))
                                            newRoles = newRoles.filter(
                                              (id) =>
                                                !roles
                                                  .find((ro) => ro._id === id)
                                                  ?.name.toLowerCase()
                                                  .includes("colaborador"),
                                            );
                                          else if (name.includes("colaborador"))
                                            newRoles = newRoles.filter(
                                              (id) =>
                                                !roles
                                                  .find((ro) => ro._id === id)
                                                  ?.name.toLowerCase()
                                                  .includes("coordinador"),
                                            );
                                        } else {
                                          if (
                                            !newRoles.some((id) =>
                                              roles
                                                .find((ro) => ro._id === id)
                                                ?.name.toLowerCase()
                                                .includes("mobile"),
                                            )
                                          ) {
                                            sweetAlert.warningAlert("Atención", "Debe tener al menos un rol Mobile.");
                                            return;
                                          }
                                        }
                                        setFormData((prev) => ({ ...prev, roles: newRoles }));
                                      }}
                                      className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{r.name}</span>
                                  </label>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-100 dark:border-gray-800">
                      <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Estado de la cuenta</span>
                      <button type="button" onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${formData.isActive ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-gray-400 text-white shadow-lg shadow-gray-400/20"}`}>
                        <FontAwesomeIcon icon={formData.isActive ? faToggleOn : faToggleOff} className="text-base" />
                        {formData.isActive ? "Activo" : "Inactivo"}
                      </button>
                    </div>
                  </div>
                )}

                {modalActiveTab === "domicilio" && (
                  <div className="space-y-6 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">País</label>
                        <select value={formData.paisId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, paisId: parseInt(e.target.value) || undefined }))} className="input-field">
                          <option value="">Seleccionar...</option>
                          {countries.map((it) => (
                            <option key={it._id} value={it.data.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Localidad</label>
                        <input type="text" value={formData.localidad || ""} onChange={(e) => setFormData((prev) => ({ ...prev, localidad: e.target.value }))} className="input-field" placeholder="Ej: CABA" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Calle</label>
                        <input type="text" value={formData.calle || ""} onChange={(e) => setFormData((prev) => ({ ...prev, calle: e.target.value }))} className="input-field" placeholder="Ej: Av. Libertador" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Altura</label>
                          <input type="text" value={formData.altura || ""} onChange={(e) => setFormData((prev) => ({ ...prev, altura: e.target.value }))} className="input-field" placeholder="Ej: 1234" />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Piso/Depto</label>
                          <input type="text" value={formData.pisoDepto || ""} onChange={(e) => setFormData((prev) => ({ ...prev, pisoDepto: e.target.value }))} className="input-field" placeholder="Ej: 4B" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Código Postal</label>
                        <input type="text" value={formData.codigoPostal || ""} onChange={(e) => setFormData((prev) => ({ ...prev, codigoPostal: e.target.value }))} className="input-field" placeholder="Ej: 1425" />
                      </div>
                      <div className="flex items-center pt-4">
                        <label className="flex items-center space-x-3 cursor-pointer group">
                          <div className={`w-10 h-6 flex items-center bg-gray-300 dark:bg-gray-700 rounded-full p-1 duration-300 ease-in-out ${formData.visa ? "bg-blue-500 dark:bg-blue-600" : ""}`}>
                            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${formData.visa ? "translate-x-4" : ""}`}></div>
                          </div>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Visa / Permiso de Trabajo</span>
                          <input type="checkbox" className="hidden" checked={formData.visa} onChange={(e) => setFormData((prev) => ({ ...prev, visa: e.target.checked }))} />
                        </label>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono</label>
                        <input type="text" value={formData.telefono || ""} onChange={(e) => setFormData((prev) => ({ ...prev, telefono: e.target.value }))} className="input-field" placeholder="Ej: 11 1234-5678" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono de Emergencia</label>
                        <input type="text" value={formData.telefono2 || ""} onChange={(e) => setFormData((prev) => ({ ...prev, telefono2: e.target.value }))} className="input-field" placeholder="Ej: 11 8765-4321" />
                      </div>
                    </div>
                  </div>
                )}

                {modalActiveTab === "bancarios" && (
                  <div className="space-y-6 animate-fadeIn">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Banco</label>
                        <select value={formData.bancoId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, bancoId: parseInt(e.target.value) || undefined }))} className="input-field">
                          <option value="">Seleccionar...</option>
                          {banks.map((it) => (
                            <option key={it._id} value={it.data.id}>
                              {it.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">CBU / CVU</label>
                        <input type="text" value={formData.cbu || ""} onChange={(e) => setFormData((prev) => ({ ...prev, cbu: e.target.value }))} className="input-field" placeholder="22 dígitos" minLength={22} maxLength={22} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo de Cuenta</label>
                        <select value={formData.tipoDeCuentaBancaria || ""} onChange={(e) => setFormData((prev) => ({ ...prev, tipoDeCuentaBancaria: e.target.value }))} className="input-field">
                          <option value="">Seleccionar...</option>
                          <option value="Caja de ahorro $">Caja de ahorro $</option>
                          <option value="Cuenta Corriente $">Cuenta Corriente $</option>
                          <option value="Caja de ahorro u$s">Caja de ahorro u$s</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Número de Cuenta</label>
                        <input type="text" value={formData.nroDeCuentaBancaria || ""} onChange={(e) => setFormData((prev) => ({ ...prev, nroDeCuentaBancaria: e.target.value }))} className="input-field" placeholder="Ej: 347-333020/7" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Alias Bancario</label>
                      <input type="text" value={formData.aliasBancario || ""} onChange={(e) => setFormData((prev) => ({ ...prev, aliasBancario: e.target.value }))} className="input-field" placeholder="Ej: LUNES.MALETA.CUNA" />
                    </div>
                  </div>
                )}
              </div>
            </form>
          ),
      }}
    >
      {initialLoading || !hasLoaded ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando usuarios..." />
        </div>
      ) : (
        <>
          <div className="relative">
            {isFetching && (
              <div className="absolute inset-0 z-10 bg-white/50 dark:bg-gray-900/50 rounded-xl backdrop-blur-[1px]">
                <div className="sticky top-[40vh] flex justify-center w-full">
                  <LoadingSpinner message="Actualizando..." />
                </div>
              </div>
            )}
            {users.length === 0 && !isFetching ? (
              <EmptyState
                icon={faUser}
                title="No se encontraron usuarios"
                description="Ajusta los filtros."
                action={{
                  label: "Limpiar",
                  onClick: () => {
                    setSearchTerm("");
                    setStartDate("");
                    setEndDate("");
                  },
                }}
              />
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mx-0.5 lg:mx-0">
                {users.map((user) => (
                  <UserCard
                    key={user._id}
                    user={user}
                    allProjects={allProjects}
                    allClients={allClients}
                    vacations={allVacations}
                    onClick={() => openView(user)}
                    userLookup={userLookup}
                    allRoleFrames={allRoleFrames}
                    actions={
                      canManage
                        ? [
                            ...(user.metadata?.isSolicitud
                              ? [
                                  {
                                    icon: faPlus,
                                    onClick: (e: any) => {
                                      e.stopPropagation();
                                      openEdit(user);
                                    },
                                    title: "Aprobar",
                                    className: "text-green-500",
                                  },
                                ]
                              : []),
                            {
                              icon: faEdit,
                              onClick: (e) => {
                                e.stopPropagation();
                                openEdit(user);
                              },
                              title: "Editar",
                            },
                            {
                              icon: faKey,
                              onClick: (e) => {
                                e.stopPropagation();
                                openPassword(user._id);
                              },
                              title: "Password",
                            },
                            ...(!user.isSystem
                              ? [
                                  {
                                    icon: faTrash,
                                    onClick: (e: any) => {
                                      e.stopPropagation();
                                      handleDelete(user);
                                    },
                                    title: "Eliminar",
                                    className: "text-red-500",
                                  },
                                ]
                              : [
                                  {
                                    icon: faLock,
                                    onClick: (e: any) => e.stopPropagation(),
                                    title: "Protegido",
                                    className: "text-gray-400 cursor-not-allowed",
                                  },
                                ]),
                          ]
                        : undefined
                    }
                  />
                ))}
                {canManage && <Card variant="create" onClick={openCreate} header={{ title: "Nuevo Usuario", subtitle: "Crear un nuevo usuario", icon: faUser }} />}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50 shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-800">
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest">Usuario</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest hidden md:table-cell">Roles</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest hidden md:table-cell text-center">Contratos</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest">Estado</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {users.map((user) => (
                      <tr key={user._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-colors cursor-pointer" onClick={() => openView(user)}>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <FontAwesomeIcon icon={faUser} className="text-blue-600" />
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user.email.split("@")[0]}</p>
                                {(() => {
                                  const activeVac = getUserActiveVacation(user._id);
                                  if (!activeVac) return null;
                                  const dateRangeStr = `Vacaciones: del ${formatDateString(activeVac.startDate)} al ${formatDateString(activeVac.endDate)}`;
                                  const fullName = user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user.email.split("@")[0];
                                  return (
                                    <button 
                                      type="button"
                                      onClick={(e) => showVacationInfo(user._id, fullName, e)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:border-amber-500/30 transition-all shadow-sm cursor-pointer focus:outline-none"
                                      title={dateRangeStr}
                                    >
                                      <FontAwesomeIcon icon={faUmbrellaBeach} className="text-[9px] mr-1" />
                                      <span>VACACIONES</span>
                                      <FontAwesomeIcon icon={faInfoCircle} className="text-[9px] ml-1 opacity-75 hover:opacity-100" />
                                    </button>
                                  );
                                })()}
                              </div>
                              <p className="text-xs text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((r) => {
                              const lower = r.name.toLowerCase();
                              const isCoord = lower.includes("coordinador");

                              let classes = "bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300";
                              if (isCoord) {
                                classes = "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
                              }

                              return (
                                <span key={r._id} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${classes}`}>
                                  {r.name}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-4 px-6 hidden md:table-cell text-center">
                          <span className="text-xs text-gray-500">{(user.metadata?.projects || []).reduce((acc: number, p: any) => acc + (p.contracts?.length || 0), 0)}</span>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase ${user.metadata?.activo ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"}`}>{user.metadata?.activo ? "Activo" : "Inactivo"}</span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex justify-end gap-1">
                            {canManage && (
                              user.isSystem ? (
                                <div className="p-2 text-gray-400 cursor-not-allowed" title="Usuario del sistema protegido">
                                  <FontAwesomeIcon icon={faLock} />
                                </div>
                              ) : (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(user);
                                  }}
                                  className="p-2 text-gray-400 hover:text-red-500"
                                  title="Eliminar usuario"
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {totalPages > 1 && (
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-6 pb-8 gap-4">
              <div className="flex-1 flex justify-between sm:hidden w-full">
                <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md bg-white disabled:opacity-50">
                  Anterior
                </button>
                <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md bg-white disabled:opacity-50">
                  Siguiente
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between w-full">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Mostrando <span className="font-semibold text-primary-600">{users.length}</span> de <span className="font-semibold text-primary-600">{totalUsers}</span>
                </p>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                    <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const p = i + 1;
                    if (p === 1 || p === totalPages || (p >= currentPage - 2 && p <= currentPage + 2)) {
                      return (
                        <button key={p} onClick={() => setCurrentPage(p)} className={`relative inline-flex items-center px-4 py-2 border text-sm font-semibold ${currentPage === p ? "bg-primary-600 border-primary-600 text-white z-10" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}>
                          {p}
                        </button>
                      );
                    }
                    if ((p === 2 && currentPage > 4) || (p === totalPages - 1 && currentPage < totalPages - 3))
                      return (
                        <span key={`dots-${p}`} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-gray-700">
                          ...
                        </span>
                      );
                    return null;
                  })}
                  <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50">
                    <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
                  </button>
                </nav>
              </div>
            </div>
          )}
        </>
      )}
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
                      del {formatDateString(activeVac.startDate)} al {formatDateString(activeVac.endDate)}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        </InfoModal>
      )}
    </PageLayout>
  );
};
