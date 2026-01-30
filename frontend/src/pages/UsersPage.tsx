import React, { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../stores/authStore";
import { usersAPI, User } from "../api/users";
import { rolesAPI, Role } from "../api/roles";
import { positionsAPI, Position } from "../api/positions";
import { levelsAPI, Level } from "../api/levels";
import { areasAPI, Area } from "../api/areas";
import { clientsAPI, Client } from "../api/clients";
import { projectsAPI, Project } from "../api/projects";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faUserShield, faUserTie, faUserGraduate, faEdit, faTrash, faKey, faPlus, faShieldHalved, faEye, faEyeSlash, faLayerGroup, faHourglassHalf, faCalendar, faToggleOn, faToggleOff, faBriefcase, faChevronLeft, faChevronRight, faBuilding, faIdCard, faTable, faGrip, faClock, faFileContract, faChevronDown, faChevronUp, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { useNavigate, useParams } from "react-router-dom";
import { getImageUrl } from "../utils/imageHelpers";

const HELP_KEY = "users" as const;

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: string[];
  positionId?: string;
  levelId?: string;
  areaId?: string;
  hireDate: string;
  extraVacationDays: number;
  clientIds: string[];
  projectIds: string[];
}

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
  const [initialLoading, setInitialLoading] = useState(true); // solo primer render
  const [isFetching, setIsFetching] = useState(false); // búsquedas/filtrado
  const [totalUsers, setTotalUsers] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Specific client context
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // búsqueda/filters (server-side)
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(25);
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);
  const [showSeniorityDetail, setShowSeniorityDetail] = useState(false);

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
    positionId: undefined,
    levelId: undefined,
    areaId: undefined,
    hireDate: new Date().toISOString().split("T")[0],
    extraVacationDays: 0,
    clientIds: [],
    projectIds: [],
  });

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

  const canManage = hasPermission("admin_users:view");

  // Para descartar respuestas viejas
  const requestIdRef = useRef(0);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

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
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce para refrescar la lista cuando cambian searchTerm / filterActive / fechas
  useEffect(() => {
    const h = setTimeout(() => {
      setCurrentPage(1); // Reset to first page on search/filter change
      fetchUsers({ silent: false, page: 1 });
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, startDate, endDate, clientId, allProjects.length]);

  // Refrescar cuando cambia la página
  useEffect(() => {
    if (!initialLoading) {
      fetchUsers({ silent: false, page: currentPage });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, limit]);

  const fetchUsers = async ({ silent = false, page = currentPage }: { silent?: boolean; page?: number } = {}) => {
    try {
      if (!silent) setIsFetching(true);
      const currentId = ++requestIdRef.current;

      // If filtering by client, fetch ALL users to filter client-side (backend filter might be unreliable)
      const isClientFilter = !!clientId;
      const effectiveLimit = isClientFilter ? 10000 : limit;
      const effectivePage = isClientFilter ? 1 : page;

      const params: any = {
        page: effectivePage,
        limit: effectiveLimit,
      };
      if (searchTerm) params.email = searchTerm;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (clientId) params.clientId = clientId;

      // Reset client context if we're not filtering by client anymore (though normally we stay in the route)
      if (!clientId && selectedClient) setSelectedClient(null);

      const response = await usersAPI.list(params);

      // Solo aplico si esta respuesta es la más reciente
      if (currentId === requestIdRef.current) {
        let finalUsers = response.users;
        let finalTotal = response.pagination.total;
        let finalPages = response.pagination.pages;

        // CLIENT-SIDE FILTERING ENFORCEMENT
        if (isClientFilter && clientId) {
          // Create efficient lookup map from allProjects (state) to ensure we can check project->client
          const localProjMap = new Map(allProjects.map((p: any) => [p._id, p]));

          const filtered = response.users.filter((u) => {
            // 1. Direct match
            if (
              u.clientIds?.some((c: any) => {
                const cId = typeof c === "string" ? c : c._id;
                return cId === clientId;
              })
            )
              return true;

            // 2. Project match
            if (
              u.projectIds?.some((p: any) => {
                const pId = typeof p === "string" ? p : p._id;
                // Look up in global list if available, fallback to user's data
                const pFull = localProjMap.get(pId);
                const pData = pFull || p;

                let pClientId = null;
                if (typeof pData === "object" && pData.clientId) {
                  pClientId = typeof pData.clientId === "object" ? pData.clientId._id : pData.clientId;
                }
                return pClientId === clientId;
              })
            )
              return true;

            return false;
          });

          finalTotal = filtered.length;
          // Manual pagination
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          finalUsers = filtered.slice(startIndex, endIndex);
          finalPages = Math.ceil(finalTotal / limit) || 1;

          console.log(`🔒 Client-Side Filtering applied (with projects lookup). ${response.users.length} -> ${filtered.length} users.`);
        }

        setUsers(finalUsers);
        setTotalUsers(finalTotal);
        setTotalPages(finalPages);
        setHasLoaded(true);
        console.log("📋 Usuarios cargados:", finalUsers.length, "de un total de:", finalTotal);
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
      positionId: undefined,
      levelId: undefined,
      areaId: undefined,
      hireDate: new Date().toISOString().split("T")[0],
      extraVacationDays: 0,
      clientIds: [],
      projectIds: [],
    });
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
    const positionId = typeof user.positionId === "string" ? user.positionId : typeof user.positionId === "object" && user.positionId?._id ? user.positionId._id : undefined;

    // Extraer levelId correctamente (puede ser string u objeto)
    // Extraer levelId correctamente (puede ser string u objeto)
    const levelId = typeof user.levelId === "string" ? user.levelId : typeof user.levelId === "object" && user.levelId?._id ? user.levelId._id : undefined;

    // Extraer areaId correctamente
    const areaId = typeof user.areaId === "string" ? user.areaId : typeof user.areaId === "object" && user.areaId?._id ? user.areaId._id : undefined;

    setFormData({
      email: user.email,
      password: "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      isActive: user.isActive,
      roles: user.roles.map((r) => r._id),
      positionId,
      levelId,
      areaId,
      hireDate: user.hireDate ? new Date(user.hireDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      extraVacationDays: user.extraVacationDays || 0,
      clientIds: user.clientIds ? user.clientIds.map((c) => c._id) : [],
      projectIds: user.projectIds ? user.projectIds.map((p) => p._id) : [],
    });
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
  };

  const openView = (user: User) => {
    setViewUser(user);
    setViewOpen(true);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewUser(null);
  };

  // Submit create/edit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData: any = { ...formData };

      // Enviar null explícitamente cuando se selecciona "Sin cargo" o "Sin nivel"
      // Esto permite que el backend elimine el campo de la DB
      if (!submitData.positionId || submitData.positionId === "") {
        submitData.positionId = null;
        // Si no hay cargo, no puede haber nivel
        submitData.levelId = null;
      } else if (!submitData.levelId || submitData.levelId === "") {
        submitData.levelId = null;
      }

      // Validación adicional: no permitir levelId sin positionId
      if (submitData.levelId && !submitData.positionId) {
        submitData.levelId = null;
      }

      if (editingUser) {
        // no enviar password vacío al editar
        delete submitData.password;
        await usersAPI.update(editingUser._id, submitData);
        sweetAlert.success("Usuario actualizado", "Los cambios se han guardado correctamente");
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

  // Submit password
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

  const getActiveSedes = (user: User): string[] => {
    const activeSedes = new Set<string>();
    if (user.metadata?.projects) {
      user.metadata.projects.forEach((p: any) => {
        if (p.contracts) {
          p.contracts.forEach((c: any) => {
            const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
            const isActive = !endDate || endDate >= new Date();
            if (isActive && c.nombre_sede) {
              activeSedes.add(c.nombre_sede);
            }
          });
        }
      });
    }
    if (activeSedes.size === 0 && user.externalInfo?.sedes) {
      return user.externalInfo.sedes;
    }
    return Array.from(activeSedes);
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

    // Fallback similar to Profile.tsx
    if (!contractType && user.externalInfo && (user.externalInfo as any).contracts && (user.externalInfo as any).contracts.length > 0) {
      contractType = (user.externalInfo as any).contracts[0];
    }

    return contractType;
  };

  // Memoizar mapas para búsquedas O(1) en el renderizado de cards
  const projectMap = React.useMemo(() => new Map(allProjects.map((p) => [p._id, p])), [allProjects]);
  const clientMap = React.useMemo(() => new Map(allClients.map((c) => [c._id, c])), [allClients]);

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
        </div>
      }
      // Igual que RolesPage: SearchAndFilters directo (sin botón Buscar)
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center">
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
      // Ver (solo lectura)
      viewModal={{
        isOpen: viewOpen,
        onClose: closeView,
        title: "Detalle de Usuario",
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
              ]
            : []),
          ...(canManage
            ? [
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
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{viewUser.firstName || viewUser.lastName ? `${viewUser.firstName || ""} ${viewUser.lastName || ""}`.trim() : viewUser.email.split("@")[0]}</h3>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${viewUser.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"}`}>{viewUser.isActive ? "Activo" : "Inactivo"}</span>
                {viewUser.primaryRole && <span className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 uppercase tracking-wider">{viewUser.primaryRole}</span>}
                {viewUser.tenant && viewUser.tenant.name && <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{viewUser.tenant.name}</span>}
              </div>
            </div>

            {/* Roles */}
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                <FontAwesomeIcon icon={faUserShield} className="h-3 w-3 text-gray-400" />
                Rol/es
              </label>
              {viewUser.roles.length === 0 ? (
                <span className="text-xs text-gray-500 dark:text-gray-500">Sin roles</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {viewUser.roles.map((role) => {
                    const isCoord = role.name.toLowerCase().includes("coordinador");
                    return (
                      <span key={role._id} className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${isCoord ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800" : "bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300"}`}>
                        {role.name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-4">
              {/* Área */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 text-gray-400" />
                  Área
                </label>
                {typeof viewUser.areaId === "object" && viewUser.areaId?.name ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300 w-fit">{viewUser.areaId.name}</span> : <span className="text-xs text-gray-500">Sin área</span>}
              </div>

              {/* Cargo */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faUserTie} className="h-3 w-3 text-gray-400" />
                  Cargo
                </label>
                {typeof viewUser.positionId === "object" && viewUser.positionId?.name ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 w-fit">{viewUser.positionId.name}</span> : <span className="text-xs text-gray-500">Sin cargo</span>}
              </div>

              {/* Nivel */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3 text-gray-400" />
                  Nivel
                </label>
                {typeof viewUser.levelId === "object" && viewUser.levelId?.name ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 w-fit">{viewUser.levelId.name}</span> : <span className="text-xs text-gray-500">Sin nivel</span>}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              {/* Sede */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 text-gray-400" />
                  Sede
                </label>
                {(() => {
                  const activeSedes = new Set<string>();
                  if (viewUser.metadata?.projects) {
                    viewUser.metadata.projects.forEach((p: any) => {
                      if (p.contracts) {
                        p.contracts.forEach((c: any) => {
                          const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
                          const isActive = !endDate || endDate >= new Date();

                          if (isActive && c.nombre_sede) {
                            activeSedes.add(c.nombre_sede);
                          }
                        });
                      }
                    });
                  }

                  const sedesList = Array.from(activeSedes);

                  if (sedesList.length > 0) {
                    return (
                      <div className="flex flex-wrap gap-1">
                        {sedesList.map((sede, idx) => (
                          <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 w-fit">
                            {sede}
                          </span>
                        ))}
                      </div>
                    );
                  }

                  if (viewUser.externalInfo?.sedes && viewUser.externalInfo.sedes.length > 0) {
                    return (
                      <div className="flex flex-wrap gap-1">
                        {viewUser.externalInfo.sedes.map((sede, idx) => (
                          <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 w-fit">
                            {sede}
                          </span>
                        ))}
                      </div>
                    );
                  }

                  return <span className="text-xs text-gray-500">Sin sede</span>;
                })()}
              </div>

              {/* Rol Frame */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faIdCard} className="h-3 w-3 text-gray-400" />
                  Rol Frame
                </label>
                {viewUser.externalInfo?.rolFrames && viewUser.externalInfo.rolFrames.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {viewUser.externalInfo.rolFrames.map((rf, idx) => (
                      <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300 w-fit">
                        {rf}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">Sin rol frame</span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              {/* Clientes */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 text-gray-400" />
                  Cliente/s
                </label>
                {(() => {
                  const clientSet = new Set<string>();
                  // 1. From direct clientIds
                  if (viewUser.clientIds && viewUser.clientIds.length > 0) {
                    viewUser.clientIds.forEach((c) => {
                      const cId = typeof c === "string" ? c : c._id;
                      clientSet.add(cId);
                    });
                  }
                  // 2. From projects
                  if (viewUser.projectIds && viewUser.projectIds.length > 0) {
                    viewUser.projectIds.forEach((p) => {
                      const pId = typeof p === "string" ? p : p._id;
                      const fullProject = allProjects.find((proj) => proj._id === pId);
                      if (fullProject) {
                        const cid = typeof fullProject.clientId === "object" ? fullProject.clientId._id : fullProject.clientId;
                        if (cid) clientSet.add(cid);
                      }
                    });
                  }

                  const uniqueClients = Array.from(clientSet)
                    .map((cid) => {
                      // Try to find in allClients/clientMap
                      // Note: allClients is available in scope
                      const client = allClients.find((c) => c._id === cid);
                      return client ? client.name : null;
                    })
                    .filter(Boolean);

                  if (uniqueClients.length > 0) {
                    return (
                      <div className="flex flex-wrap gap-1">
                        {uniqueClients.map((name, idx) => (
                          <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-300 w-fit border border-cyan-200 dark:border-cyan-800">
                            {name}
                          </span>
                        ))}
                      </div>
                    );
                  }
                  return <span className="text-xs text-gray-500">Sin clientes</span>;
                })()}
              </div>

              {/* Proyectos */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faBriefcase} className="h-3 w-3 text-gray-400" />
                  Proyecto/s Actual/es
                </label>
                {viewUser.projectIds && viewUser.projectIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {viewUser.projectIds.map((project) => {
                      const projectId = typeof project === "string" ? project : project._id;
                      const projectName = typeof project === "object" && "name" in project ? project.name : null;
                      const fullProject = allProjects.find((p) => p._id === projectId);
                      const displayName = projectName || fullProject?.name || "Proyecto desconocido";

                      let clientName = "";
                      if (fullProject) {
                        if (typeof fullProject.clientId === "object" && fullProject.clientId.name) {
                          clientName = fullProject.clientId.name;
                        } else if (typeof fullProject.clientId === "string") {
                          const client = allClients.find((c) => c._id === fullProject.clientId);
                          if (client) clientName = client.name;
                        }
                      }

                      return (
                        <span key={projectId} className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary-600 text-white dark:bg-primary-900 dark:text-primary-300 shadow-sm">
                          {displayName}
                          {clientName && <span className="ml-1 text-[10px] opacity-90 font-normal">({clientName})</span>}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <span className="text-xs text-gray-500">Sin proyectos</span>
                )}
              </div>
            </div>

            {/* Employment Info */}
            <div className="space-y-4">
              {/* Fecha de ingreso */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faCalendar} className="h-3 w-3 text-gray-400" />
                  Ingreso
                </label>
                {viewUser.hireDate ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 w-fit">{new Date(viewUser.hireDate).toLocaleDateString()}</span> : <span className="text-xs text-gray-500">—</span>}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faFileContract} className="h-3 w-3 text-gray-400" />
                  Tipo de Contrato
                </label>
                {getActiveContractType(viewUser) ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 w-fit">{getActiveContractType(viewUser)}</span> : <span className="text-xs text-gray-500">Sin contrato activo</span>}
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faUser} className="h-3 w-3 text-gray-400" />
                  Email
                </label>
                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 w-fit">{viewUser.email}</span>
              </div>

              {/* Documento */}
              {viewUser.metadata?.documento && (
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                    <FontAwesomeIcon icon={faIdCard} className="h-3 w-3 text-gray-400" />
                    Documento
                  </label>
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 w-fit">{viewUser.metadata.documento}</span>
                </div>
              )}

              {/* Antigüedad Total */}
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                  <FontAwesomeIcon icon={faHourglassHalf} className="h-3 w-3 text-gray-400" />
                  Antigüedad Total
                </label>
                {(() => {
                  const totalDays = (viewUser.metadata?.projects || []).reduce(
                    (acc, p) =>
                      acc +
                      (p.contracts || []).reduce((cAcc, c) => {
                        const start = new Date(c.fecha_alta_contrato);
                        const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
                        return cAcc + Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                      }, 0),
                    0,
                  );

                  if (totalDays === 0) return <span className="text-xs text-gray-500">—</span>;

                  // Calcular años, meses y días
                  const years = Math.floor(totalDays / 365);
                  const remainingAfterYears = totalDays % 365;
                  const months = Math.floor(remainingAfterYears / 30);
                  const remainingDays = remainingAfterYears % 30;

                  const parts = [];
                  if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
                  if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
                  if (remainingDays > 0) parts.push(`${remainingDays} ${remainingDays === 1 ? "día" : "días"}`);

                  const formattedSeniority = parts.length === 0 ? "0 días" : parts.length === 1 ? parts[0] : parts.length === 2 ? `${parts[0]} y ${parts[1]}` : `${parts[0]}, ${parts[1]} y ${parts[2]}`;

                  return (
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-primary-600 text-white dark:bg-primary-900 dark:text-primary-300 w-fit shadow-sm">{formattedSeniority}</span>
                      <span className="text-[10px] text-gray-400 ml-1">({totalDays} días en total)</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Historial y Antigüedad Unificados */}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <button onClick={() => setIsHistoryExpanded(!isHistoryExpanded)} className="flex items-center justify-between w-full text-xs font-medium text-gray-500 dark:text-gray-400 group hover:text-gray-800 dark:hover:text-gray-200 transition-colors" aria-expanded={isHistoryExpanded}>
                <div className="flex gap-1 items-center">
                  <FontAwesomeIcon icon={faFileContract} className="h-3 w-3 text-gray-400 group-hover:text-primary-500 transition-colors" />
                  Historial y Antigüedad Detallada
                </div>
                <FontAwesomeIcon icon={isHistoryExpanded ? faChevronUp : faChevronDown} className={`h-3 w-3 transition-transform duration-300`} />
              </button>

              <div className={`mt-3 overflow-hidden transition-all duration-300 ease-in-out ${isHistoryExpanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}>
                {(() => {
                  const allRecords = (viewUser.metadata?.projects || []).flatMap((p) =>
                    (p.contracts || []).map((c) => {
                      const start = new Date(c.fecha_alta_contrato);
                      const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
                      const days = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
                      return {
                        ...c,
                        projectName: p.nombre_proyecto || c.nombre_proyecto,
                        days,
                      };
                    }),
                  );

                  if (allRecords.length === 0) {
                    return <span className="text-xs text-gray-500 italic block mt-2">No hay registros disponibles.</span>;
                  }

                  // Sort by start date (descending)
                  allRecords.sort((a, b) => new Date(b.fecha_alta_contrato).getTime() - new Date(a.fecha_alta_contrato).getTime());

                  return (
                    <div className="mt-2 overflow-x-auto overflow-y-auto max-h-[400px] custom-scrollbar border border-gray-100 dark:border-gray-800 rounded-lg">
                      <table className="w-full text-left border-collapse min-w-[700px]">
                        <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-900 shadow-sm">
                          <tr className="border-b border-gray-100 dark:border-gray-800">
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Proyecto / Contrato</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sede / Rol</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Periodo</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-center">Días</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Monto / Jorn.</th>
                            <th className="px-3 py-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Estado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {allRecords.map((record, idx) => (
                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group">
                              <td className="px-3 py-2.5">
                                <div className="text-[11px] font-bold text-gray-900 dark:text-gray-100">{record.projectName}</div>
                                <div className="text-[9px] text-gray-400 mt-0.5">{record.nombre_contrato}</div>
                              </td>
                              <td className="px-3 py-2.5 text-[10px] text-gray-600 dark:text-gray-400">
                                <div className="font-medium">{record.nombre_sede}</div>
                                <div className="text-[9px] opacity-70">{record.nombre_rol_frame}</div>
                              </td>
                              <td className="px-3 py-2.5 text-[10px] text-gray-500 dark:text-gray-500">
                                <div>{new Date(record.fecha_alta_contrato).toLocaleDateString()}</div>
                                <div className="text-[9px]">{record.fecha_baja_contrato ? new Date(record.fecha_baja_contrato).toLocaleDateString() : "Presente"}</div>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">{record.days}</span>
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <div className="text-[10px] font-bold text-primary-600 dark:text-primary-400">${record.sueldo_mano?.toLocaleString()}</div>
                                {record.cantidad_jornadas_laborales && <div className="text-[9px] text-gray-400">{record.cantidad_jornadas_laborales} jor.</div>}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter ${record.nombre_estado_empleado === "DISPONIBLE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>{record.nombre_estado_empleado}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : null,
      }}
      // Crear/Editar o Cambiar contraseña
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: modalMode === "password" ? "Cambiar Contraseña" : editingUser ? "Editar Usuario" : "Nuevo Usuario",
        subtitle: modalMode === "password" ? undefined : "Define datos básicos y roles",
        size: modalMode === "password" ? "sm" : "lg",
        actions:
          modalMode === "password"
            ? [
                {
                  label: "Actualizar",
                  onClick: () => {
                    const form = document.querySelector<HTMLFormElement>("#password-form");
                    form?.requestSubmit();
                  },
                  variant: "primary",
                },
                {
                  label: "Cancelar",
                  onClick: closeModal,
                  variant: "ghost",
                },
              ]
            : [
                {
                  label: editingUser ? "Actualizar" : "Crear",
                  onClick: () => {
                    const form = document.querySelector<HTMLFormElement>("#user-form");
                    form?.requestSubmit();
                  },
                  variant: "primary",
                },
                {
                  label: "Cancelar",
                  onClick: closeModal,
                  variant: "ghost",
                },
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
                      <FontAwesomeIcon icon={showNewPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                    </button>
                  </div>
                </div>
              </div>
            </form>
          ) : (
            <form id="user-form" onSubmit={handleSubmit}>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                  <input type="email" required value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} className="input-field" placeholder="usuario@ejemplo.com" />
                </div>

                {!editingUser && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contraseña *</label>
                    <div className="relative">
                      <input type={showPassword ? "text" : "password"} required value={formData.password} onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))} className="input-field pr-10" placeholder="••••••••" minLength={6} />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                        <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre</label>
                    <input type="text" value={formData.firstName} onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))} className="input-field" placeholder="Nombre" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Apellido</label>
                    <input type="text" value={formData.lastName} onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))} className="input-field" placeholder="Apellido" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* AREA (antes de cargo) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Area</label>

                    {areas.length === 0 ? (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        No has creado ninguna area aún.{" "}
                        <a href="/areas" className="text-primary-600 dark:text-primary-400 hover:underline">
                          Crear area →
                        </a>
                      </p>
                    ) : (
                      <select
                        value={formData.areaId || ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            areaId: e.target.value || undefined,
                          }))
                        }
                        className="input-field"
                      >
                        <option value="">Sin area</option>
                        {areas.map((area) => (
                          <option key={area._id} value={area._id}>
                            {area.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* CARGO */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cargo</label>

                    {positions.length === 0 ? (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        No has creado ningún cargo aún.{" "}
                        <a href="/positions" className="text-primary-600 dark:text-primary-400 hover:underline">
                          Crear cargo →
                        </a>
                      </p>
                    ) : (
                      <>
                        <select
                          value={formData.positionId || ""}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              positionId: e.target.value || undefined,
                              levelId: undefined, // resetea nivel cuando cambia cargo
                            }))
                          }
                          className="input-field"
                        >
                          <option value="">Sin cargo</option>
                          {positions.map((position) => (
                            <option key={position._id} value={position._id}>
                              {position.name}
                            </option>
                          ))}
                        </select>

                        {!formData.positionId && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Selecciona un cargo para poder asignar un nivel</p>}
                      </>
                    )}
                  </div>

                  {/* NIVEL – SOLO SI HAY CARGO */}
                  {formData.positionId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nivel</label>

                      {levels.length === 0 ? (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          No hay niveles disponibles para este cargo.{" "}
                          <a href="/levels" className="text-primary-600 dark:text-primary-400 hover:underline">
                            Crear nivel →
                          </a>
                        </p>
                      ) : (
                        <>
                          <select
                            value={formData.levelId || ""}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                levelId: e.target.value || undefined,
                              }))
                            }
                            className="input-field"
                          >
                            <option value="">Sin nivel</option>

                            {/* Generales */}
                            {levels.filter((l) => l.type === "general").length > 0 && (
                              <optgroup label="Niveles Generales">
                                {levels
                                  .filter((l) => l.type === "general")
                                  .map((level) => (
                                    <option key={level._id} value={level._id}>
                                      {level.name}
                                    </option>
                                  ))}
                              </optgroup>
                            )}

                            {/* Específicos */}
                            {levels.filter((l) => l.type === "position-specific").length > 0 && (
                              <optgroup label="Niveles Específicos del Cargo">
                                {levels
                                  .filter((l) => l.type === "position-specific")
                                  .map((level) => (
                                    <option key={level._id} value={level._id}>
                                      {level.name}
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                          </select>

                          {!formData.levelId && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Selecciona un nivel para completar el perfil</p>}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha de Ingreso *</label>
                    <input type="date" required value={formData.hireDate} onChange={(e) => setFormData((prev) => ({ ...prev, hireDate: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Vacaciones (Días Extra Individuales)</label>
                    <input type="number" min="0" value={formData.extraVacationDays} onChange={(e) => setFormData((prev) => ({ ...prev, extraVacationDays: parseInt(e.target.value) || 0 }))} className="input-field" placeholder="0" />
                  </div>
                </div>

                {/* ROLES */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Roles</label>
                  <div className="border border-gray-300 dark:border-gray-600 rounded p-3 max-h-64 overflow-y-auto space-y-4">
                    {/* System Roles */}
                    <div>
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Sistema</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {roles
                          .filter((role) => role.name.toLowerCase() !== "superadmin" && !role.name.toLowerCase().includes("mobile"))
                          .map((role) => (
                            <label key={role._id} className="flex items-start space-x-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                              <input
                                type="checkbox"
                                checked={formData.roles.includes(role._id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    let newRoles = [...formData.roles, role._id];
                                    const roleName = role.name.toLowerCase();

                                    // Regla: User y Admin son mutuamente excluyentes
                                    if (roleName === "admin") {
                                      const conflictRole = roles.find((r) => r.name.toLowerCase() === "user");
                                      if (conflictRole) newRoles = newRoles.filter((id) => id !== conflictRole._id);
                                    } else if (roleName === "user") {
                                      const conflictRole = roles.find((r) => r.name.toLowerCase() === "admin");
                                      if (conflictRole) newRoles = newRoles.filter((id) => id !== conflictRole._id);
                                    }

                                    setFormData((prev) => ({ ...prev, roles: newRoles }));
                                  } else {
                                    setFormData((prev) => ({ ...prev, roles: prev.roles.filter((r) => r !== role._id) }));
                                  }
                                }}
                                className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">{role.name}</span>
                                {role.description && <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1">{role.description}</p>}
                              </div>
                            </label>
                          ))}
                      </div>
                    </div>

                    {/* Mobile Roles */}
                    {roles.some((r) => r.name.toLowerCase().includes("mobile")) && (
                      <div>
                        <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">Mobile (App)</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {roles
                            .filter((role) => role.name.toLowerCase().includes("mobile"))
                            .map((role) => (
                              <label key={role._id} className="flex items-start space-x-3 p-2 rounded bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 cursor-pointer transition-colors border border-indigo-100 dark:border-indigo-800/30">
                                <input
                                  type="checkbox"
                                  checked={formData.roles.includes(role._id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      let newRoles = [...formData.roles, role._id];
                                      const roleName = role.name.toLowerCase();
                                      // Regla: Mobile-Coordinador y Mobile-Colaborador son mutuamente excluyentes
                                      if (roleName.includes("mobile-coordinador")) {
                                        const conflictRole = roles.find((r) => r.name.toLowerCase().includes("mobile-colaborador"));
                                        if (conflictRole) newRoles = newRoles.filter((id) => id !== conflictRole._id);
                                      } else if (roleName.includes("mobile-colaborador")) {
                                        const conflictRole = roles.find((r) => r.name.toLowerCase().includes("mobile-coordinador"));
                                        if (conflictRole) newRoles = newRoles.filter((id) => id !== conflictRole._id);
                                      }
                                      setFormData((prev) => ({ ...prev, roles: newRoles }));
                                    } else {
                                      // Validar que no se quede sin rol mobile
                                      const remainingRoles = formData.roles.filter((r) => r !== role._id);
                                      const hasMobile = remainingRoles.some((rId) => {
                                        const r = roles.find((item) => item._id === rId);
                                        return r && r.name.toLowerCase().includes("mobile");
                                      });

                                      if (!hasMobile) {
                                        sweetAlert.warningAlert("Atención", "El usuario debe tener al menos un rol Mobile asignado (Colaborador o Coordinador).");
                                        return;
                                      }
                                      setFormData((prev) => ({ ...prev, roles: remainingRoles }));
                                    }
                                  }}
                                  className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 block">{role.name}</span>
                                  {role.description && <p className="text-xs text-gray-500 dark:text-gray-500 line-clamp-1">{role.description}</p>}
                                </div>
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* PROYECTOS */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Proyectos</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border border-gray-300 dark:border-gray-600 rounded p-3 max-h-48 overflow-y-auto">
                    {allProjects.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 p-2">No hay proyectos disponibles.</p>
                    ) : (
                      allProjects.map((project) => {
                        let clientName = "";
                        if (typeof project.clientId === "object" && (project.clientId as any).name) {
                          clientName = (project.clientId as any).name;
                        } else if (typeof project.clientId === "string") {
                          const c = allClients.find((client) => client._id === project.clientId);
                          if (c) clientName = c.name;
                        }

                        const isSelected = formData.projectIds.includes(project._id);

                        return (
                          <div key={project._id} className="p-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setFormData((prev) => ({ ...prev, projectIds: prev.projectIds.filter((id) => id !== project._id) }));
                                } else {
                                  setFormData((prev) => ({ ...prev, projectIds: [...prev.projectIds, project._id] }));
                                }
                              }}
                              className={`w-full flex flex-col items-start px-3 py-2 rounded text-sm font-medium transition-colors shadow-sm text-left ${isSelected ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-300 ring-1 ring-blue-300 dark:ring-blue-700" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                            >
                              <div className="flex items-center w-full">
                                <FontAwesomeIcon icon={isSelected ? faToggleOn : faToggleOff} className={`mr-2.5 text-lg ${isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-400"}`} />
                                <span className="flex-1 truncate">
                                  {project.name} {clientName && <span className="ml-1 opacity-70 font-normal text-xs">({clientName})</span>}
                                </span>
                              </div>
                              <span className={`text-xs ml-8 mt-1 block truncate max-w-full ${isSelected ? "text-blue-800/70 dark:text-blue-300/70" : "text-gray-500 font-normal"}`}>{isSelected ? "Asignado" : "No asignado"}</span>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                  <button type="button" onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))} className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center ${formData.isActive ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"}`}>
                    <FontAwesomeIcon icon={formData.isActive ? faToggleOn : faToggleOff} className="mr-1" />
                    {formData.isActive ? "Activo" : "Inactivo"}
                  </button>
                </div>
              </div>
            </form>
          ),
      }}
    >
      {/* Loading state */}
      {initialLoading || !hasLoaded ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando usuarios..." />
        </div>
      ) : (
        <>
          {/* Contenedor de lista */}
          <div className="relative">
            {/* Overlay de carga cuando se pagina o busca */}
            {isFetching && (
              <div className="absolute inset-0 z-10 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center rounded-xl backdrop-blur-[1px]">
                <LoadingSpinner message="Actualizando lista..." />
              </div>
            )}

            {users.length === 0 && !isFetching ? (
              <EmptyState
                icon={faUser}
                title="No se encontraron usuarios"
                description="Intenta ajustar tus filtros de búsqueda."
                action={{
                  label: "Limpiar filtros",
                  onClick: () => {
                    setSearchTerm("");
                    setStartDate("");
                    setEndDate("");
                  },
                }}
              />
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
                {users.map((user) => (
                  <Card
                    key={user._id}
                    onClick={() => openView(user)}
                    className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                    header={{
                      title: user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user.email.split("@")[0],
                      subtitle: user.email,
                      icon: faUser,
                      iconClassName: "text-blue-600", // Added this line
                      badges: [
                        ...(user.tenant && user.tenant.name
                          ? [
                              {
                                text: user.tenant.name,
                                variant: "default" as const,
                                className: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800",
                              },
                            ]
                          : []),
                        {
                          text: user.isActive ? "Activo" : "Inactivo",
                          variant: user.isActive ? "green" : "destructive",
                        },
                      ],
                      badgesPosition: "top",
                    }}
                    footer={
                      canManage
                        ? {
                            actions: [
                              {
                                icon: faEdit,
                                onClick: (e) => {
                                  e.stopPropagation();
                                  openEdit(user);
                                },
                                title: "Editar",
                                variant: "default",
                              },
                              {
                                icon: faKey,
                                onClick: (e) => {
                                  e.stopPropagation();
                                  openPassword(user._id);
                                },
                                title: "Cambiar contraseña",
                                variant: "default",
                              },
                              {
                                icon: faTrash,
                                onClick: (e) => {
                                  e.stopPropagation();
                                  handleDelete(user);
                                },
                                title: "Eliminar",
                                variant: "default",
                              },
                            ],
                          }
                        : undefined
                    }
                  >
                    {/* Roles */}
                    <div className="mb-3">
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                        <FontAwesomeIcon icon={faUserShield} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                        Rol/es
                      </label>
                      {user.roles.length === 0 ? (
                        <span className="text-xs text-gray-500 dark:text-gray-500">Sin roles</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.slice(0, 3).map((role) => {
                            const isCoord = role.name.toLowerCase().includes("coordinador");
                            return (
                              <span key={role._id} className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${isCoord ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800" : "bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300"}`}>
                                {role.name}
                              </span>
                            );
                          })}
                          {user.roles.length > 3 && <span className="text-xs text-gray-500 dark:text-gray-500">+{user.roles.length - 3} más</span>}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {/* Área */}
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faLayerGroup} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                          Área
                        </label>
                        {typeof user.areaId === "object" && user.areaId?.name ? (
                          <div className="flex flex-wrap gap-1">
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300">{user.areaId.name}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-500">Sin área asignada</span>
                        )}
                      </div>

                      {/* Cargo - Separado e independiente */}
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faUserTie} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                          Cargo
                        </label>
                        {typeof user.positionId === "object" && user.positionId?.name ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">{user.positionId.name}</span> : <span className="text-xs text-gray-500 dark:text-gray-500">Sin cargo asignado</span>}
                      </div>

                      {/* Nivel - Separado e independiente */}
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faUserGraduate} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                          Nivel
                        </label>
                        {typeof user.levelId === "object" && user.levelId?.name ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">{user.levelId.name}</span> : <span className="text-xs text-gray-500 dark:text-gray-500">Sin nivel asignado</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 mt-3">
                      {/* Sede */}
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faBuilding} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                          Sede
                        </label>
                        {(() => {
                          const sedes = getActiveSedes(user);
                          return sedes.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {sedes.map((sede, idx) => (
                                <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                                  {sede}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-gray-500 dark:text-gray-500">Sin sede</span>
                          );
                        })()}
                      </div>

                      {/* Rol Frame */}
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faIdCard} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                          Rol Frame
                        </label>
                        {user.externalInfo?.rolFrames && user.externalInfo.rolFrames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.externalInfo.rolFrames.map((rf, idx) => (
                              <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-300">
                                {rf}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-500">Sin rol frame</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3">
                      {/* Clientes */}
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faBriefcase} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                          Clientes
                        </label>
                        {(() => {
                          const uniqueClients = new Set<string>();

                          // 1. Direct assignments
                          if (user.clientIds && user.clientIds.length > 0) {
                            user.clientIds.forEach((c: any) => {
                              const cId = typeof c === "string" ? c : c._id;
                              if (cId) uniqueClients.add(cId);
                            });
                          }

                          // 2. Inferred from projects (using projectMap for better data)
                          if (user.projectIds && user.projectIds.length > 0) {
                            user.projectIds.forEach((p: any) => {
                              const pId = typeof p === "string" ? p : p._id;
                              // Try to get full project from map (likely has populated clientId)
                              const pFull = projectMap.get(pId) || (typeof p === "object" ? p : null);

                              if (pFull) {
                                const c = pFull.clientId;
                                if (c) {
                                  const cId = typeof c === "object" ? c._id : c;
                                  if (cId) uniqueClients.add(cId);
                                }
                              }
                            });
                          }

                          const clientList = Array.from(uniqueClients)
                            .map((cid) => {
                              const client = clientMap.get(cid);
                              return client ? client.name : null;
                            })
                            .filter(Boolean);

                          if (clientList.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {clientList.map((name, idx) => (
                                  <span key={idx} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-cyan-100 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                                    {name}
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          return <span className="text-xs text-gray-500 dark:text-gray-500">Sin clientes</span>;
                        })()}
                      </div>
                      {/* Proyectos */}
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faBriefcase} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                          Proyectos
                        </label>
                        {user.projectIds && user.projectIds.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.projectIds.map((p: any) => {
                              const pName = p.name;
                              const clientName = p.clientId?.name;

                              if (!pName) return null;

                              return (
                                <span key={p._id || p} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300">
                                  {pName}
                                  {clientName && <span className="ml-1 text-[10px] opacity-70">({clientName})</span>}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-500">Sin proyectos</span>
                        )}
                      </div>
                      {/* Tipo de Contrato */}
                      <div className="flex flex-col">
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                          <FontAwesomeIcon icon={faFileContract} className="h-2 w-2 lg:h-3 lg:w-3 text-gray-400" />
                          Tipo Contrato
                        </label>
                        {getActiveContractType(user) ? <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300 w-fit">{getActiveContractType(user)}</span> : <span className="text-xs text-gray-500 dark:text-gray-500">Sin contrato activo</span>}
                      </div>
                    </div>
                  </Card>
                ))}
                {canManage && (
                  <Card
                    variant="create"
                    onClick={openCreate}
                    header={{
                      title: "Nuevo Usuario",
                      subtitle: "Crear un nuevo usuario del sistema",
                      icon: faUser,
                    }}
                  />
                )}
              </div>
            ) : (
              /* Vista de Tabla */
              <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800/50 shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 dark:bg-gray-900/30 border-b border-gray-100 dark:border-gray-800">
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Usuario</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest hidden md:table-cell">Roles</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest hidden md:table-cell text-center">Contratos</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest hidden md:table-cell">Proyectos</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest hidden lg:table-cell">Rol frame</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Estado</th>
                      <th className="py-4 px-6 text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {users.map((user) => (
                      <tr key={user._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-colors group cursor-pointer" onClick={() => openView(user)}>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center shrink-0">
                              <FontAwesomeIcon icon={faUser} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user.email.split("@")[0]}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {user.roles?.map((role) => {
                              const isCoord = role.name.toLowerCase().includes("coordinador");
                              return (
                                <span key={role._id} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${isCoord ? "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-100 dark:border-amber-800" : "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-100 dark:border-blue-800"}`}>
                                  {role.name}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-4 px-6 hidden md:table-cell text-center">
                          <span className="text-xs font-bold bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-1 rounded">{(user.metadata?.projects || []).reduce((acc: number, p: any) => acc + (p.contracts?.length || 0), 0)}</span>
                        </td>
                        <td className="py-4 px-6 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {user.projectIds && user.projectIds.length > 0 ? (
                              user.projectIds.map((p: any) => {
                                const pId = typeof p === "string" ? p : p._id;
                                const pName = typeof p !== "string" && p.name ? p.name : allProjects.find((proj) => proj._id === pId)?.name || "P";
                                return (
                                  <span key={pId} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 truncate max-w-full">
                                    {pName}
                                  </span>
                                );
                              })
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 hidden lg:table-cell">
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[150px]">{user.externalInfo?.rolFrames?.[0] || "—"}</span>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${user.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"}`}>{user.isActive ? "Activo" : "Inactivo"}</span>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex justify-end gap-1 transition-opacity">
                            {canManage && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(user);
                                }}
                                className="p-2 text-gray-500 hover:text-gray-300 dark:text-gray-400 dark:hover:text-gray-300 hover:text-gray-800 dark:hover:text-gray-300 rounded"
                                title="Eliminar"
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
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

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-6 pb-8 gap-4">
              <div className="flex-1 flex justify-between sm:hidden w-full">
                <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  Anterior
                </button>
                <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  Siguiente
                </button>
              </div>
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between w-full">
                <div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Mostrando <span className="font-semibold text-primary-600 dark:text-primary-400">{users.length}</span> usuarios (
                    <span className="font-semibold text-primary-600 dark:text-primary-400">
                      {(currentPage - 1) * limit + 1} - {Math.min(currentPage * limit, totalUsers)}
                    </span>
                    ) de <span className="font-semibold text-primary-600 dark:text-primary-400">{totalUsers}</span>
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
                      <span className="sr-only">Anterior</span>
                      <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4" />
                    </button>

                    {/* Page Numbers */}
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const pageNum = i + 1;
                      // Only show first, last, and pages around current
                      if (pageNum === 1 || pageNum === totalPages || (pageNum >= currentPage - 2 && pageNum <= currentPage + 2)) {
                        return (
                          <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`relative inline-flex items-center px-4 py-2 border text-sm font-semibold transition-all ${currentPage === pageNum ? "bg-primary-600 border-primary-600 text-white z-10" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                            {pageNum}
                          </button>
                        );
                      }
                      if ((pageNum === 2 && currentPage > 4) || (pageNum === totalPages - 1 && currentPage < totalPages - 3)) {
                        return (
                          <span key={`dots-${pageNum}`} className="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300">
                            ...
                          </span>
                        );
                      }
                      return null;
                    })}

                    <button onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
                      <span className="sr-only">Siguiente</span>
                      <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </PageLayout>
  );
};
