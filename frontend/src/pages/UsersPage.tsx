import React, { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../stores/authStore";
import { usersAPI, User } from "../api/users";
import { registroLinksAPI, RegistroLink, buildRegistroUrl, registroLinkDaysLeft, isRegistroLinkExpired, registroLinkExpiry } from "../api/registroLinks";
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
import { UserFormModal } from "../components/users/UserFormModal";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faUserShield, faUserTie, faUserGraduate, faEdit, faTrash, faKey, faPlus, faLayerGroup, faHourglassHalf, faCalendar, faBriefcase, faChevronLeft, faChevronRight, faBuilding, faIdCard, faTable, faGrip, faClock, faFileContract, faChevronDown, faChevronUp, faMapMarkerAlt, faUniversity, faPassport, faVenusMars, faGraduationCap, faStethoscope, faCreditCard, faLock, faUmbrellaBeach, faInfoCircle, faLink, faUserPlus, faCopy, faCheck, faBan, faBell } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { useNavigate, useParams } from "react-router-dom";
import { getImageUrl } from "../utils/imageHelpers";
import { cachedFetch, invalidateRefCache } from "../utils/refCache";

const HELP_KEY = "users" as const;

type ModalTab = "general" | "domicilio" | "bancarios" | "proyectos";

type ModalMode = "edit" | "password";

// Invalida el caché compartido (mapa de nombres + proyectos) tras mutar usuarios.
const invalidateUsersPageCache = () => {
  invalidateRefCache("userLookup:all");
  invalidateRefCache("projects:all");
};

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
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [registroLinks, setRegistroLinks] = useState<RegistroLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  // Duración (en días) del link a generar. "custom" habilita el input libre. Default 30.
  const [linkDurationSel, setLinkDurationSel] = useState<string>("30");
  const [linkDurationCustom, setLinkDurationCustom] = useState<string>("30");
  const [, forceLinkTick] = useState(0); // refresca el contador de días de los links
  const [modalMode, setModalMode] = useState<ModalMode>("edit");
  const [editingUser, setEditingUser] = useState<User | null>(null);

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

  // info modal (ⓘ)
  const [openInfo, setOpenInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  // view modal (solo lectura)
  const [viewOpen, setViewOpen] = useState(false);
  const [viewUser, setViewUser] = useState<User | null>(null);
  const [viewActiveTab, setViewActiveTab] = useState<ModalTab>("general");

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
      // Cacheado (compartido): evita traer 1502 usuarios al reentrar a Usuarios.
      // lightweight: solo id/nombre, sin el populate pesado de proyectos/contratos.
      const map = await cachedFetch("userLookup:all", async () => {
        const response = await usersAPI.list({ limit: 10000, page: 1, lightweight: true });
        const m = new Map<number | string, string>();
        response.users.forEach((u) => {
          const metaId = (u.metadata as any)?.id;
          if (metaId) {
            const name = u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : u.email;
            m.set(metaId, name);
          }
        });
        return m;
      });
      setUserLookup(map);
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
      const allAreas = await areasAPI.listAll();
      setAreas(allAreas);
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
      // Cacheado (compartido con Equipo): evita traer hasta 500 proyectos al reentrar.
      const projects = await cachedFetch("projects:all", () => projectsAPI.listAll({ limit: 500 }));
      setAllProjects(projects);
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

  // Abrir modales (el formulario vive en <UserFormModal/>, que se autogestiona)
  const openCreate = () => {
    setEditingUser(null);
    setModalMode("edit");
    setShowModal(true);
  };

  // Cargar la lista de links de registro del tenant
  const loadRegistroLinks = async () => {
    setLinksLoading(true);
    try {
      const links = await registroLinksAPI.list();
      setRegistroLinks(links);
    } catch (error) {
      sweetAlert.error("Error", "No se pudieron cargar los links de registro");
    } finally {
      setLinksLoading(false);
    }
  };

  // Mientras el modal de links está abierto, refrescar los días restantes cada minuto
  useEffect(() => {
    if (!showLinkModal) return;
    const id = setInterval(() => forceLinkTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [showLinkModal]);

  // Abrir el modal de links de registro (carga la lista, no genera automáticamente)
  const handleOpenLinkModal = async () => {
    setCopiedLinkId(null);
    setShowLinkModal(true);
    await loadRegistroLinks();
  };

  // Generar un nuevo link persistente
  const handleGenerateLink = async () => {
    const days = Number(linkDurationSel === "custom" ? linkDurationCustom : linkDurationSel);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      sweetAlert.error("Duración inválida", "La duración debe ser un número entero entre 1 y 365 días.");
      return;
    }
    setGeneratingLink(true);
    try {
      await registroLinksAPI.generate(clientId, days);
      await loadRegistroLinks();
    } catch (error: any) {
      sweetAlert.error("Error", error?.response?.data?.error || "No se pudo generar el link de registro");
    } finally {
      setGeneratingLink(false);
    }
  };

  // Copiar un link al portapapeles
  const copyRegistroLink = async (link: RegistroLink) => {
    try {
      await navigator.clipboard.writeText(buildRegistroUrl(link.token));
      setCopiedLinkId(link._id);
      setTimeout(() => setCopiedLinkId((prev) => (prev === link._id ? null : prev)), 2000);
    } catch {
      /* el usuario puede copiarlo manualmente */
    }
  };

  // Revocar un link (deja de funcionar al instante)
  const handleRevokeLink = async (link: RegistroLink) => {
    const result = await sweetAlert.confirm("¿Revocar link?", "El link dejará de funcionar de inmediato. Las personas que ya se registraron no se ven afectadas.", "Sí, revocar");
    if (!result.isConfirmed) return;
    try {
      await registroLinksAPI.revoke(link._id);
      await loadRegistroLinks();
    } catch (error) {
      sweetAlert.error("Error", "No se pudo revocar el link");
    }
  };

  // Eliminar un link definitivamente
  const handleDeleteLink = async (link: RegistroLink) => {
    const result = await sweetAlert.confirm("¿Eliminar link?", "Se eliminará el link de forma permanente.", "Sí, eliminar");
    if (!result.isConfirmed) return;
    try {
      await registroLinksAPI.remove(link._id);
      await loadRegistroLinks();
    } catch (error) {
      sweetAlert.error("Error", "No se pudo eliminar el link");
    }
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setModalMode("edit");
    setShowModal(true);
  };

  const openPassword = (user: User) => {
    setEditingUser(user);
    setModalMode("password");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setModalMode("edit");
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

  const handleConfirmarCuenta = async (user: User) => {
    const result = await sweetAlert.confirm(
      "¿Confirmar cuenta creada?",
      "Confirmás que la cuenta bancaria fue creada y que los datos están cargados tanto en la plataforma como en el banco.",
      "Sí, confirmar",
    );
    if (!result.isConfirmed) return;
    try {
      const updated = await usersAPI.confirmarCuentaBancaria(user._id);
      setViewUser(updated);
      sweetAlert.success("Cuenta confirmada", "La cuenta bancaria quedó confirmada y los datos cargados.");
      fetchUsers({ silent: true });
    } catch (error: any) {
      const message = error.response?.data?.error || "No se pudo confirmar la cuenta.";
      sweetAlert.error("Error", message);
    }
  };

  const handleConfirmarCambio = async (user: User) => {
    const result = await sweetAlert.confirm(
      "¿Confirmar cambio de datos bancarios?",
      "Confirmás que el cambio de datos bancarios solicitado ya fue aplicado en el banco/FRAME.",
      "Sí, confirmar",
    );
    if (!result.isConfirmed) return;
    try {
      const updated = await usersAPI.confirmarCambioCuenta(user._id);
      setViewUser(updated);
      sweetAlert.success("Cambio confirmado", "El cambio de datos bancarios quedó confirmado.");
      fetchUsers({ silent: true });
    } catch (error: any) {
      const message = error.response?.data?.error || "No se pudo confirmar el cambio.";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (user: User) => {
    const result = await sweetAlert.confirm("¿Eliminar usuario?", `¿Estás seguro de que quieres eliminar al usuario "${user.email}"?`);
    if (result.isConfirmed) {
      try {
        await usersAPI.remove(user._id);
        sweetAlert.success("Usuario eliminado", "El usuario ha sido eliminado correctamente");
        invalidateUsersPageCache(); // el mapa de nombres puede haber cambiado
        fetchUsers({ silent: true });
      } catch (error: any) {
        const message = error.response?.data?.error || "Error al eliminar el usuario";
        sweetAlert.error("Error", message);
      }
    }
  };

  // Unused local helpers commented out to prevent TS6133 compile errors
  /*
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
  */

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
            <button onClick={openCreate} title="Nuevo usuario" aria-label="Nuevo usuario" className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
          {canManage && (
            <button onClick={handleOpenLinkModal} title="Link de registro" className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
              <FontAwesomeIcon icon={faLink} className="h-3 w-3 lg:h-4 lg:w-4" />
              <span className="hidden lg:block">Link</span>
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
                    if (viewUser) openPassword(viewUser);
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
                  {((viewUser.metadata?.solicitaCreacionCuenta && !viewUser.metadata?.cuentaBancariaConfirmada) ||
                    (viewUser.metadata?.solicitaCambioCuenta && !viewUser.metadata?.cambioCuentaConfirmada)) && (
                    <FontAwesomeIcon icon={faBell} className="text-xs text-amber-500 animate-pulse" title="Acción bancaria pendiente" />
                  )}
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
                {viewUser.metadata?.solicitaCreacionCuenta && !viewUser.metadata?.cuentaBancariaConfirmada && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4">
                    <FontAwesomeIcon icon={faBell} className="text-amber-500 mt-0.5 animate-pulse shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Acción pendiente: crear cuenta bancaria</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-0.5">
                        El usuario indicó que <strong>no tiene banco</strong> y solicitó que le creen una cuenta. Cargá sus datos bancarios (Editar) y luego confirmá.
                      </p>
                    </div>
                    {(() => {
                      const tieneDatos = !!(viewUser.metadata?.bancoId || viewUser.metadata?.cbu);
                      return (
                        <button
                          type="button"
                          onClick={() => handleConfirmarCuenta(viewUser)}
                          disabled={!tieneDatos}
                          title={tieneDatos ? "Confirmar que la cuenta fue creada y los datos cargados" : "Cargá primero los datos bancarios (Editar)"}
                          className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <FontAwesomeIcon icon={faCheck} />
                          Confirmar cuenta creada
                        </button>
                      );
                    })()}
                  </div>
                )}

                {viewUser.metadata?.cuentaBancariaConfirmada && (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-900/20 p-4">
                    <FontAwesomeIcon icon={faCheck} className="text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Cuenta bancaria creada y confirmada</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400/90 mt-0.5">
                        Los datos están cargados en la plataforma y en el banco.
                        {viewUser.metadata?.cuentaBancariaConfirmadaAt && (
                          <> Confirmada el {new Date(viewUser.metadata.cuentaBancariaConfirmadaAt).toLocaleDateString("es-AR")}.</>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {viewUser.metadata?.solicitaCambioCuenta && !viewUser.metadata?.cambioCuentaConfirmada && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 p-4">
                    <FontAwesomeIcon icon={faBell} className="text-amber-500 mt-0.5 animate-pulse shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Acción pendiente: cambio de datos bancarios</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400/90 mt-0.5">
                        El usuario <strong>solicitó cambiar sus datos bancarios</strong>. Aplicá el cambio en el banco/FRAME y luego confirmá acá.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleConfirmarCambio(viewUser)}
                      title="Confirmar que el cambio fue aplicado en el banco/FRAME"
                      className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                    >
                      <FontAwesomeIcon icon={faCheck} />
                      Confirmar cambio realizado
                    </button>
                  </div>
                )}

                {viewUser.metadata?.cambioCuentaConfirmada && (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-300 dark:border-emerald-700/60 bg-emerald-50 dark:bg-emerald-900/20 p-4">
                    <FontAwesomeIcon icon={faCheck} className="text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Cambio de datos bancarios confirmado</p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400/90 mt-0.5">
                        El cambio fue aplicado en la plataforma y en el banco/FRAME.
                        {viewUser.metadata?.cambioCuentaConfirmadaAt && (
                          <> Confirmado el {new Date(viewUser.metadata.cambioCuentaConfirmadaAt).toLocaleDateString("es-AR")}.</>
                        )}
                      </p>
                    </div>
                  </div>
                )}
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
                    const populatedProject = typeof up.projectId === "object" ? up.projectId : null;
                    const project = { ...projectMap.get(pId), ...populatedProject };
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
                            up.contracts.map((c: any, cIdx: number) => {
                              // Build standard area data list
                              let standardAreaData: { id: string; name: string }[] = [];

                              // Debug: log shift resolution context (dev only)
                              if (import.meta.env.DEV) {
                                console.log('DEBUG RESOLUTION:', {
                                  pId,
                                  viewUserId: viewUser?._id,
                                  teamConfig: project?.teamConfig?.length,
                                  coordinatorAssignments: project?.coordinatorAssignments?.length,
                                  areasLoaded: areas.length,
                                  shiftsLoaded: allShifts.length,
                                });
                              }

                              const userConfig = project?.teamConfig?.find((tc: any) => {
                                const tcUid = typeof tc.userId === "object" ? tc.userId?._id : tc.userId;
                                return String(tcUid) === String(viewUser?._id);
                              });

                              // 1. Priority: Detailed project team configuration (areaShiftAssignments) on the contract or config
                              if (c.areaShiftAssignments && Array.isArray(c.areaShiftAssignments) && c.areaShiftAssignments.length > 0) {
                                standardAreaData = c.areaShiftAssignments
                                  .map((asa: any) => {
                                    const aId = typeof asa.areaId === "object" ? asa.areaId?._id : asa.areaId;
                                    const aName = typeof asa.areaId === "object" ? asa.areaId?.name : areas.find((a) => String(a._id) === String(aId))?.name;
                                    return aName ? { id: String(aId), name: aName } : null;
                                  })
                                  .filter(Boolean) as { id: string; name: string }[];
                              } else if (userConfig?.areaShiftAssignments && userConfig.areaShiftAssignments.length > 0) {
                                standardAreaData = userConfig.areaShiftAssignments
                                  .map((asa: any) => {
                                    const aId = typeof asa.areaId === "object" ? asa.areaId?._id : asa.areaId;
                                    const aName = typeof asa.areaId === "object" ? asa.areaId?.name : areas.find((a) => String(a._id) === String(aId))?.name;
                                    return aName ? { id: String(aId), name: aName } : null;
                                  })
                                  .filter(Boolean) as { id: string; name: string }[];
                              }

                              // 2. Fallback: If coordinator and no detailed config, check coordinatorAssignments
                              const hasCoordAssignments = project?.coordinatorAssignments?.some((asm: any) => {
                                const uid = typeof asm.userId === "object" ? asm.userId?._id : asm.userId;
                                return String(uid) === String(viewUser?._id);
                              }) || false;

                              const isCoord = hasCoordAssignments ||
                                              (viewUser?.roles && viewUser.roles.some((r) => r.name.toLowerCase().includes("coordinador"))) ||
                                              viewUser?.firstName?.toLowerCase().includes("coordinador") ||
                                              viewUser?.lastName?.toLowerCase().includes("coordinador") ||
                                              (up.nombre_rol_frame && String(up.nombre_rol_frame).toLowerCase().includes("coordinador")) ||
                                              (c.nombre_rol_frame && String(c.nombre_rol_frame).toLowerCase().includes("coordinador")) ||
                                              (viewUser?.externalInfo?.rolFrames && viewUser.externalInfo.rolFrames.some((rf: string) => rf.toLowerCase().includes("coordinador")));

                              if (standardAreaData.length === 0 && isCoord && project?.coordinatorAssignments) {
                                const myAssignments = project.coordinatorAssignments.filter((asm: any) => {
                                  const uid = typeof asm.userId === "object" ? asm.userId?._id : asm.userId;
                                  return String(uid) === String(viewUser?._id);
                                });
                                const areaIds = Array.from(new Set(myAssignments.map((asm: any) => (typeof asm.areaId === "object" ? asm.areaId?._id : asm.areaId))));
                                standardAreaData = areaIds
                                  .map((id) => {
                                    const a = areas.find((area) => String(area._id) === String(id));
                                    return a ? { id: String(a._id), name: a.name } : null;
                                  })
                                  .filter(Boolean) as { id: string; name: string }[];
                              }

                              // 3. Fallback: Global user area (legacy/basic) or contract nombre_area
                              if (standardAreaData.length === 0) {
                                const userAreaId = typeof viewUser?.areaId === "object" ? viewUser?.areaId?._id : viewUser?.areaId;
                                const userAreaName = typeof viewUser?.areaId === "object" ? viewUser?.areaId?.name : areas.find((a) => String(a._id) === String(userAreaId))?.name;
                                const areaName = userAreaName || c.nombre_area;
                                if (areaName) {
                                  standardAreaData = [{ id: String(userAreaId || ""), name: areaName }];
                                }
                              }

                              // Resolve standard assignments list of { areaName, shiftNames }
                              const standardAssignments: { areaName: string; shiftNames: string[] }[] = [];

                              standardAreaData.forEach((ad) => {
                                // Resolve shifts for this area
                                let shiftsForArea: string[] = [];

                                // Find assignments in contract or config (no exclusion of coordinated shifts)
                                const contractAssign = c.areaShiftAssignments?.find((a: any) => String(typeof a.areaId === "object" ? a.areaId?._id : a.areaId) === String(ad.id));
                                const configAssign = userConfig?.areaShiftAssignments?.find((a: any) => String(typeof a.areaId === "object" ? a.areaId?._id : a.areaId) === String(ad.id));
                                const areaAssign = contractAssign || configAssign;

                                if (areaAssign) {
                                  const sids = areaAssign.shiftIds || [];
                                  sids.forEach((sid: any) => {
                                    const actualSid = typeof sid === "object" ? sid?._id : sid;
                                    const shift = allShifts.find((s) => String(s._id) === String(actualSid));
                                    if (shift) {
                                      const timeStr = shift.startTime && shift.endTime ? ` (${shift.startTime} - ${shift.endTime})` : "";
                                      shiftsForArea.push(`${shift.name}${timeStr}`);
                                    }
                                  });
                                }

                                // Fallback: if no areaAssign found, check coordinator assignments for shifts in this area
                                if (shiftsForArea.length === 0 && project?.coordinatorAssignments) {
                                  const coordForArea = project.coordinatorAssignments.filter((asm: any) => {
                                    const uid = typeof asm.userId === "object" ? asm.userId?._id : asm.userId;
                                    const aid = typeof asm.areaId === "object" ? asm.areaId?._id : asm.areaId;
                                    return String(uid) === String(viewUser?._id) && String(aid) === String(ad.id);
                                  });
                                  coordForArea.forEach((asm: any) => {
                                    const sId = typeof asm.shiftId === "object" ? asm.shiftId?._id : asm.shiftId;
                                    const shift = allShifts.find((s) => String(s._id) === String(sId));
                                    if (shift) {
                                      const timeStr = shift.startTime && shift.endTime ? ` (${shift.startTime} - ${shift.endTime})` : "";
                                      shiftsForArea.push(`${shift.name}${timeStr}`);
                                    }
                                  });
                                }

                                // Last resort fallback: single shift fields
                                if (shiftsForArea.length === 0) {
                                  const shiftIdFromUser = viewUser?.turnos && viewUser.turnos.length > 0 ? (typeof viewUser.turnos[0] === "object" ? viewUser.turnos[0]._id : viewUser.turnos[0]) : undefined;
                                  const finalShiftId = c.shiftId || userConfig?.shiftId || shiftIdFromUser;
                                  const shift = allShifts.find((sh) => String(sh._id) === String(finalShiftId));
                                  if (shift) {
                                    const timeStr = shift.startTime && shift.endTime ? ` (${shift.startTime} - ${shift.endTime})` : "";
                                    shiftsForArea.push(`${shift.name}${timeStr}`);
                                  } else if (c.nombre_turno) {
                                    shiftsForArea.push(c.nombre_turno);
                                  }
                                }

                                if (shiftsForArea.length > 0) {
                                  standardAssignments.push({ areaName: ad.name, shiftNames: shiftsForArea });
                                }
                              });

                              if (standardAssignments.length === 0) {
                                standardAssignments.push({
                                  areaName: c.nombre_area || "Área sin especificar",
                                  shiftNames: ["Sin asignar"]
                                });
                              }

                              // Resolve coordinated assignments
                              const coordinatedAssignments: { areaName: string; shiftNames: string[] }[] = [];
                              if (project && project.coordinatorAssignments) {
                                const myCoordinated = project.coordinatorAssignments.filter((asm: any) => {
                                  const uid = typeof asm.userId === "object" ? asm.userId?._id : asm.userId;
                                  return String(uid) === String(viewUser?._id);
                                }) || [];

                                const coordGroups: { [key: string]: { areaName: string; shiftNames: string[] } } = {};
                                myCoordinated.forEach((asm: any) => {
                                  const aId = typeof asm.areaId === "object" ? asm.areaId?._id : asm.areaId;
                                  const aName = typeof asm.areaId === "object" ? asm.areaId?.name : (areas.find((a) => String(a._id) === String(aId))?.name || "Área Coordinada");
                                  const sId = typeof asm.shiftId === "object" ? asm.shiftId?._id : asm.shiftId;
                                  const shift = allShifts.find((s) => String(s._id) === String(sId));
                                  const sName = shift 
                                    ? `${shift.name}${shift.startTime && shift.endTime ? ` (${shift.startTime} - ${shift.endTime})` : ""}`
                                    : (typeof asm.shiftId === "object" ? asm.shiftId?.name : undefined);

                                  if (aId && sName) {
                                    const key = String(aId);
                                    if (!coordGroups[key]) {
                                      coordGroups[key] = { areaName: aName, shiftNames: [] };
                                    }
                                    if (!coordGroups[key].shiftNames.includes(sName)) {
                                      coordGroups[key].shiftNames.push(sName);
                                    }
                                  }
                                });

                                Object.values(coordGroups).forEach((group) => {
                                  coordinatedAssignments.push(group);
                                });
                              }

                              return (
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

                                  <div className="space-y-3 pt-2 mt-2 border-t border-gray-100 dark:border-gray-700/50">
                                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                                      <div className="space-y-0.5">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Periodo</label>
                                        <p className="font-semibold text-gray-600 dark:text-gray-400">
                                          {c.fecha_alta_contrato ? new Date(c.fecha_alta_contrato).toLocaleDateString() : "?"} - {c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato).toLocaleDateString() : "Indef."}
                                        </p>
                                      </div>
                                      <div className="space-y-0.5">
                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">Horario General</label>
                                        <div className="flex items-center gap-1.5 font-semibold text-gray-600 dark:text-gray-400">
                                          <FontAwesomeIcon icon={faClock} className="text-amber-500 text-[10px]" />
                                          {c.hora_inicio && c.hora_fin ? `${c.hora_inicio} - ${c.hora_fin}` : "Sin horario"}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="space-y-2 text-[11px] bg-slate-50/50 dark:bg-slate-900/30 p-2 rounded-lg border border-slate-100 dark:border-slate-800/50">
                                      <div>
                                        <label className="text-[9px] font-black text-blue-500 uppercase tracking-widest block mb-1">Área / Turno</label>
                                        <div className="flex flex-wrap gap-1.5 items-center">
                                          <FontAwesomeIcon icon={faGrip} className="text-blue-500 text-[10px] shrink-0" />
                                          {standardAssignments.map((sa, idx) => (
                                            <span key={idx} className="inline-flex flex-wrap items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-100 dark:border-blue-800/50">
                                              <span className="font-bold mr-1">{sa.areaName}:</span>
                                              <span>{sa.shiftNames.join(", ")}</span>
                                            </span>
                                          ))}
                                        </div>
                                      </div>

                                      {coordinatedAssignments.length > 0 && (
                                        <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800/50">
                                          <label className="text-[9px] font-black text-amber-500 uppercase tracking-widest block mb-1">Área / Turno Coordinado</label>
                                          <div className="flex flex-wrap gap-1.5 items-center">
                                            <FontAwesomeIcon icon={faGrip} className="text-amber-500 text-[10px] shrink-0" />
                                            {coordinatedAssignments.map((ca, idx) => (
                                              <span key={idx} className="inline-flex flex-wrap items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 border border-amber-100 dark:border-amber-800/50">
                                                <span className="font-bold mr-1">{ca.areaName}:</span>
                                                <span>{ca.shiftNames.join(", ")}</span>
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })
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
                                openPassword(user);
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

      <UserFormModal isOpen={showModal} onClose={closeModal} user={editingUser} mode={modalMode} onSaved={() => { invalidateUsersPageCache(); fetchUsers({ silent: true }); }} />

      <InfoModal isOpen={showLinkModal} onClose={() => setShowLinkModal(false)} title="Registrar Usuario" size="lg">
        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-sm text-gray-600 dark:text-gray-300 flex-1">
              Comparta un link con la persona que desee registrar. Elegí cuántos días dura; <strong>la duración no se puede cambiar una vez creado</strong>. También puede revocarlos cuando quiera.
            </p>
            <div className="flex items-end gap-2 shrink-0">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Duración</label>
                <select
                  value={linkDurationSel}
                  onChange={(e) => setLinkDurationSel(e.target.value)}
                  className="px-2 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white text-sm"
                >
                  <option value="7">7 días</option>
                  <option value="15">15 días</option>
                  <option value="30">30 días</option>
                  <option value="60">60 días</option>
                  <option value="90">90 días</option>
                  <option value="custom">Personalizado…</option>
                </select>
              </div>
              {linkDurationSel === "custom" && (
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Días (1-365)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={linkDurationCustom}
                    onChange={(e) => setLinkDurationCustom(e.target.value)}
                    className="w-24 px-2 py-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 dark:text-white text-sm"
                  />
                </div>
              )}
              <button type="button" onClick={handleGenerateLink} disabled={generatingLink} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-60">
                <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                {generatingLink ? "Generando..." : "Generar nuevo link"}
              </button>
            </div>
          </div>

          {linksLoading ? (
            <p className="text-sm text-gray-500 text-center py-6">Cargando links...</p>
          ) : registroLinks.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-3 py-6">
              <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <FontAwesomeIcon icon={faUserPlus} className="text-blue-600 dark:text-blue-400 text-xl" />
              </div>
              <p className="text-sm text-gray-500">Todavía no hay links. Genere uno para empezar.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">
              {registroLinks.map((link) => {
                const expired = isRegistroLinkExpired(link);
                const usable = link.active && !expired;
                const daysLeft = registroLinkDaysLeft(link);
                const expiryMs = registroLinkExpiry(link);
                return (
                <div key={link._id} className={`rounded-lg border px-3 py-2.5 ${usable ? "border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40" : "border-gray-200 dark:border-gray-800 bg-gray-100/60 dark:bg-gray-900/20 opacity-70"}`}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {!link.active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Revocado</span>
                      ) : expired ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">Vencido</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Activo</span>
                      )}
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{link.clientName || "General"}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{link.usageCount} {link.usageCount === 1 ? "registro" : "registros"}</span>
                      {usable && daysLeft !== null && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${daysLeft <= 5 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                          {daysLeft === 0 ? "Vence hoy" : `Vence en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {usable && (
                        <button type="button" onClick={() => copyRegistroLink(link)} title="Copiar link" className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                          <FontAwesomeIcon icon={copiedLinkId === link._id ? faCheck : faCopy} className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {usable && (
                        <button type="button" onClick={() => handleRevokeLink(link)} title="Revocar link" className="p-2 rounded text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors">
                          <FontAwesomeIcon icon={faBan} className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button type="button" onClick={() => handleDeleteLink(link)} title="Eliminar link" className="p-2 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
                        <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {usable && (
                    <div className="mt-2 flex items-center gap-2 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/60 px-2 py-1">
                      <FontAwesomeIcon icon={faLink} className="h-3 w-3 text-gray-400 shrink-0" />
                      <input readOnly value={buildRegistroUrl(link.token)} onFocus={(e) => e.currentTarget.select()} className="flex-1 bg-transparent text-xs text-gray-600 dark:text-gray-300 outline-none truncate" />
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-400">
                    <span>Creado: {new Date(link.createdAt).toLocaleDateString()}</span>
                    {expiryMs !== null && <span>Vence: {new Date(expiryMs).toLocaleDateString()}</span>}
                    {link.lastUsedAt && <span>Último uso: {new Date(link.lastUsedAt).toLocaleDateString()}</span>}
                    {link.createdByName && <span>Por: {link.createdByName}</span>}
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </div>
      </InfoModal>
    </PageLayout>
  );
};
