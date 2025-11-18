import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClientContextStore } from "../stores/clientContextStore";
import { useAuthStore } from "../stores/authStore";
import { usersAPI, User } from "../api/users";
import { rolesAPI, Role } from "../api/roles";
import { clientsAPI } from "../api/clients";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faEdit, faTrash, faKey, faPlus, faEye, faEyeSlash, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { getImageUrl } from "../utils/imageHelpers";

const HELP_KEY = "clientContextUsers" as const;

interface ClientUser extends User {
  id?: string;
  type?: "client" | "assigned";
  permiso?: string;
}

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: string[];
}

type ModalMode = "create" | "edit" | "password";

export const ClientContextUsersPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedClient, setSelectedClient } = useClientContextStore();
  const { hasPermission } = useAuthStore();

  // data
  const [clientUsers, setClientUsers] = useState<ClientUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  // búsqueda/filters
  const [searchTerm, setSearchTerm] = useState("");

  // rango de fechas (createdAt)
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD
  const hasActiveDates = !!startDate || !!endDate;

  // modals
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingUser, setEditingUser] = useState<ClientUser | null>(null);

  // info modal
  const [openInfo, setOpenInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  // forms
  const [formData, setFormData] = useState<UserFormData>({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    isActive: true,
    roles: [],
  });

  const [passwordUserId, setPasswordUserId] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // view modal
  const [viewOpen, setViewOpen] = useState(false);
  const [viewUser, setViewUser] = useState<ClientUser | null>(null);

  const canManage = hasPermission("users:manage");

  useEffect(() => {
    if (!id) return;
    fetchClientAndUsers();
    fetchRoles();
  }, [id]);

  const fetchClientAndUsers = async () => {
    if (!id) return;

    try {
      setLoading(true);

      // Obtener cliente usando clientsAPI
      const clientData = await clientsAPI.get(id);
      setSelectedClient(clientData);

      // Procesar usuarios del cliente
      const usuarios = (clientData as any).usuarios || [];
      const assignedUsersResolved = (clientData as any).assignedUsersResolved || [];

      // Crear lista unificada evitando duplicados
      const allClientUsers: any[] = [];
      const seenIds = new Set();

      usuarios.forEach((user: any) => {
        const userId = user._id || user.id;
        if (!seenIds.has(userId)) {
          allClientUsers.push({ ...user, _id: userId, id: userId, type: "client" });
          seenIds.add(userId);
        }
      });

      assignedUsersResolved.forEach((user: any) => {
        const userId = user._id || user.id;
        if (!seenIds.has(userId)) {
          allClientUsers.push({ ...user, _id: userId, id: userId, type: "assigned" });
          seenIds.add(userId);
        }
      });

      setClientUsers(allClientUsers);
    } catch (error) {
      console.error("❌ Error fetching client users:", error);
      sweetAlert.error("Error", "No se pudieron cargar los usuarios del cliente");
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await rolesAPI.list({ limit: 100 });
      const clientRoles = response.roles.filter((role) => role.name.toLowerCase() !== "superadmin" && (role.name.toLowerCase().includes("client") || role.name.toLowerCase().includes("cliente")));
      setRoles(clientRoles);
    } catch (error) {
      console.error("Error fetching roles:", error);
    }
  };

  const openCreate = () => {
    setModalMode("create");
    setEditingUser(null);

    // Pre-seleccionar el rol por defecto (isDefault: true)
    const defaultRole = roles.find((role) => role.isDefault);
    const defaultRoles = defaultRole ? [defaultRole._id] : roles.length > 0 ? [roles[0]._id] : [];

    setFormData({
      email: "",
      password: "",
      firstName: "",
      lastName: "",
      isActive: true,
      roles: defaultRoles,
    });
    setShowPassword(false);
    setShowModal(true);
  };

  const openEdit = (user: ClientUser) => {
    setModalMode("edit");
    setEditingUser(user);
    setFormData({
      email: user.email || "",
      password: "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      isActive: user.isActive ?? true,
      roles: user.roles?.map((r: any) => r._id || r) || [],
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

  const openView = (user: ClientUser) => {
    setViewUser(user);
    setViewOpen(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setPasswordUserId("");
    setNewPassword("");
    setShowPassword(false);
    setShowNewPassword(false);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewUser(null);
  };

  // Submit handlers
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!id) {
      sweetAlert.error("Error", "ID del cliente no encontrado");
      return;
    }

    try {
      if (modalMode === "create") {
        const newUser = await usersAPI.create({ ...formData, roles: formData.roles });
        await clientsAPI.share(id, newUser._id, "editar");
        sweetAlert.success("Usuario cliente creado", "El usuario ha sido creado y vinculado correctamente");
      } else if (modalMode === "edit" && editingUser) {
        const submitData = { ...formData };
        delete (submitData as any).password;
        await usersAPI.update(editingUser._id, submitData);
        sweetAlert.success("Usuario actualizado", "Los cambios se han guardado correctamente");
      }

      closeModal();
      await fetchClientAndUsers();
    } catch (error: any) {
      const message = error.response?.data?.error || error.response?.data?.message || error.message || "Error al guardar el usuario";
      const details = error.response?.data?.message ? `\n\nDetalles: ${error.response.data.message}` : "";
      sweetAlert.error("Error", message + details);
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

  const handleDelete = async (user: ClientUser) => {
    if (!id) return;

    const isClientUser = user.type === "client";
    const actionText = isClientUser ? "eliminar" : "desasignar";
    const confirmText = isClientUser ? `¿Estás seguro de que quieres eliminar al usuario "${user.email}"? Esto eliminará el usuario completamente.` : `¿Estás seguro de que quieres desasignar a "${user.email}" de este cliente?`;

    const result = await sweetAlert.confirm(`¿${actionText.charAt(0).toUpperCase() + actionText.slice(1)} usuario?`, confirmText);

    if (result.isConfirmed) {
      try {
        const userId = user._id || user.id || "";
        if (isClientUser) {
          await clientsAPI.unshare(id, userId);
          await usersAPI.remove(userId);
          sweetAlert.success("Usuario eliminado", "El usuario ha sido eliminado completamente");
        } else {
          await clientsAPI.unshare(id, userId);
          sweetAlert.success("Usuario desasignado", "El usuario ha sido desasignado del cliente");
        }
        await fetchClientAndUsers();
      } catch (error: any) {
        const message = error.response?.data?.error || `Error al ${actionText} el usuario`;
        sweetAlert.error("Error", message);
      }
    }
  };

  // 🔎 Filtrado local por texto + rango de fechas (createdAt)
  const filteredUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const startTs = startDate ? new Date(startDate).getTime() : null;
    const endTs = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return clientUsers.filter((user) => {
      const matchesSearch = !q || (user.email || "").toLowerCase().includes(q) || (user.firstName || "").toLowerCase().includes(q) || (user.lastName || "").toLowerCase().includes(q);

      // fechas: usar createdAt si viene; si no, cae afuera del filtro cuando hay rango activo
      let matchesDate = true;
      if (startTs !== null || endTs !== null) {
        const created = user.createdAt ? new Date(user.createdAt).getTime() : NaN;
        if (Number.isNaN(created)) {
          matchesDate = false;
        } else {
          if (startTs !== null && created < startTs) matchesDate = false;
          if (endTs !== null && created > endTs) matchesDate = false;
        }
      }

      return matchesSearch && matchesDate;
    });
  }, [clientUsers, searchTerm, startDate, endDate]);

  // Mensaje del EmptyState sensible al rango
  const emptyDescription = hasActiveDates ? `No se encontraron usuarios ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}.` : `${selectedClient?.name || "Este cliente"} aún no tiene usuarios asignados.`;

  if (!id) {
    return <EmptyState icon={faUsers} title="Cliente no válido" description="Selecciona un cliente para gestionar sus usuarios." action={{ label: "Ir a Clientes", onClick: () => navigate("/clients") }} />;
  }

  if (loading) return <LoadingSpinner message="Cargando usuarios del cliente..." />;

  const displayLogo = selectedClient?.brandKit?.logos?.[0]?.url || selectedClient?.brandKit?.logo;

  return (
    <PageLayout
      title="Usuarios Cliente"
      faIcon={{ icon: faUsers }}
      subtitle={`Gestiona los usuarios de ${selectedClient?.name || "este cliente"}`}
      clientMiniAvatar={{
        src: getImageUrl(displayLogo),
        alt: selectedClient?.name ? `${selectedClient.name} logo` : undefined,
        fallback: selectedClient?.name?.charAt(0)?.toUpperCase?.() || "?",
        label: selectedClient?.name,
      }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      onBack={() => navigate(-1)}
      headerActions={
        canManage ? (
          <div className="flex gap-2">
            <button onClick={openCreate} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
            </button>
          </div>
        ) : undefined
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por email o nombre..."
          /*   filters={[
            {
              value: filterActive,
              onChange: (v) => setFilterActive(v as "all" | "active" | "inactive"),
              options: [
                { value: "all", label: "Todos" },
                { value: "active", label: "Activos" },
                { value: "inactive", label: "Inactivos" },
              ],
            },
          ]} */
          dateFilter={{
            startDate,
            endDate,
            onStartDateChange: setStartDate,
            onEndDateChange: setEndDate,
          }}
        />
      }
      // Modal Ver (solo lectura)
      viewModal={{
        isOpen: viewOpen,
        onClose: closeView,
        title: viewUser ? (viewUser.firstName || viewUser.lastName ? `${viewUser.firstName || ""} ${viewUser.lastName || ""}`.trim() : viewUser.email?.split("@")[0] || "Usuario") : "Usuario",
        subtitle: viewUser?.email,
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
                  variant: "secondary" as const,
                },
                {
                  label: "Cambiar contraseña",
                  onClick: () => {
                    if (viewUser) openPassword(viewUser._id);
                    closeView();
                  },
                  variant: "ghost" as const,
                },
              ]
            : []),
          { label: "Cerrar", onClick: closeView, variant: "ghost" as const },
        ],
        content: viewUser ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${viewUser.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" : "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300"}`}>{viewUser.isActive ? "Activo" : "Inactivo"}</span>
              {viewUser.type && <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${viewUser.type === "client" ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" : "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"}`}>{viewUser.type === "client" ? "Usuario Cliente" : "Usuario Asignado"}</span>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Nombre</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">{viewUser.firstName || "—"}</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Apellido</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">{viewUser.lastName || "—"}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Email</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewUser?.email || "Sin email"}</p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Rol</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewUser?.primaryRole || "Sin rol"}</p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Tipo de Acceso</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewUser.type === "client" ? `Acceso completo como cliente (${viewUser.permiso || "ver"})` : viewUser.type === "assigned" ? "Usuario interno asignado" : "Usuario"}</p>
            </div>
          </div>
        ) : null,
      }}
      // Modal Crear/Editar/Password
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: modalMode === "password" ? "Cambiar Contraseña" : modalMode === "edit" ? "Editar Usuario Cliente" : "Nuevo Usuario Cliente",
        subtitle: modalMode === "password" ? undefined : "Usuario con acceso específico a este cliente",
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
                { label: "Cancelar", onClick: closeModal, variant: "ghost" },
              ]
            : [
                {
                  label: modalMode === "edit" ? "Actualizar" : "Crear",
                  onClick: () => {
                    const form = document.querySelector<HTMLFormElement>("#user-form");
                    form?.requestSubmit();
                  },
                  variant: "primary",
                },
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
                  <input type="email" required value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} className="input-field" placeholder="usuario@cliente.com" />
                </div>

                {modalMode === "create" && (
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

                {/*                 <div>
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Usuario activo</span>
                  </label>
                </div> */}

                {roles.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Roles de Cliente</label>
                    <div className="space-y-2 border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                      {roles.map((role) => (
                        <label key={role._id} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            checked={formData.roles.includes(role._id)}
                            onChange={(e) => {
                              if (e.target.checked) setFormData((prev) => ({ ...prev, roles: [...prev.roles, role._id] }));
                              else setFormData((prev) => ({ ...prev, roles: prev.roles.filter((r) => r !== role._id) }));
                            }}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{role.name}</span>
                            {role.description && <p className="text-xs text-gray-500 dark:text-gray-500">{role.description}</p>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Nota:</strong> Este usuario tendrá acceso específico a este cliente y sus datos.
                  </p>
                </div>
              </div>
            </form>
          ),
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredUsers.map((user) => (
          <Card
            key={user._id || user.id}
            onClick={() => openView(user)}
            className="hover:scale-105 hover:shadow-lg transition-all duration-200"
            header={{
              title: user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : user.email ? user.email.split("@")[0] : "Usuario",
              subtitle: user.email && user.email !== "Sin email" ? user.email : "Sin email configurado",
              icon: faUsers,
              badges: [],
            }}
            footer={
              canManage
                ? {
                    leftContent: <span className="text-xs text-gray-500 dark:text-gray-500 capitalize">{user.permiso || user.primaryRole || "Ver"}</span>,
                    actions: [
                      ...(user.type === "client"
                        ? [
                            {
                              icon: faEdit,
                              onClick: (e: React.MouseEvent) => {
                                e.stopPropagation();
                                openEdit(user);
                              },
                              title: "Editar",
                              variant: "default" as const,
                            },
                            {
                              icon: faKey,
                              onClick: (e: React.MouseEvent) => {
                                e.stopPropagation();
                                openPassword(user._id);
                              },
                              title: "Cambiar contraseña",
                              variant: "default" as const,
                            },
                          ]
                        : []),
                      {
                        icon: faTrash,
                        onClick: (e) => {
                          e.stopPropagation();
                          handleDelete(user);
                        },
                        title: user.type === "client" ? "Eliminar usuario" : "Desasignar del cliente",
                        variant: "default",
                      },
                    ],
                  }
                : undefined
            }
          >
            {/*             <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">Tipo de Acceso</label>
              <div className="text-sm text-gray-900 dark:text-white">{user.type === "client" ? "Acceso completo como cliente" : user.type === "assigned" ? "Usuario interno asignado" : "Usuario"}</div>
              <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">Permiso: {user.permiso || "Ver"}</div>
            </div> */}
          </Card>
        ))}
        {canManage && (
          <Card
            variant="create"
            onClick={openCreate}
            header={{
              title: "Nuevo Usuario",
              subtitle: "Crear un nuevo usuario para este cliente",
              icon: faUserPlus,
            }}
          />
        )}
      </div>

      {filteredUsers.length === 0 && (
        <EmptyState
          icon={faUsers}
          title={hasActiveDates ? "Sin usuarios en este rango" : "No hay usuarios"}
          description={emptyDescription}
          action={
            canManage
              ? {
                  label: "Crear Usuario Cliente",
                  onClick: openCreate,
                  icon: faUserPlus,
                }
              : undefined
          }
        />
      )}
    </PageLayout>
  );
};
