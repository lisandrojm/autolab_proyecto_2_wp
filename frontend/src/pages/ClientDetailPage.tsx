import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { useClientContextStore } from "../stores/clientContextStore";
import { clientsAPI, Client } from "../api/clients";
import { usersAPI } from "../api/users";
import { projectsAPI } from "../api/projects";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faLayerGroup, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { getClientStatusLabel } from "../utils/clientStatus";

const HELP_KEY = "clientDetail" as const;

interface ClientUser {
  id: string;
  email: string;
  permiso: "ver" | "editar";
}

export const ClientDetailPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { setSelectedClient } = useClientContextStore();

  // Data
  const [client, setClient] = useState<Client | null>(null);
  const [clientUsers, setClientUsers] = useState<ClientUser[]>([]);
  const [projectsCount, setProjectsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modals
  const [showModal, setShowModal] = useState(false);
  const [openInfo, setOpenInfo] = useState(false);

  // Forms
  const [createUserForm, setCreateUserForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
  });
  const [showPassword, setShowPassword] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    if (!clientId) return;
    fetchClientAndUsers();
    fetchProjectsCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const fetchClientAndUsers = async () => {
    try {
      setLoading(true);

      // Cargar cliente (ahora viene con usuarios resueltos del backend)
      const data = await clientsAPI.get(clientId!);

      setClient(data);
      setSelectedClient(data);

      // Usuarios del cliente (ya resueltos del backend)
      setClientUsers((data as any).usuarios || []);

      console.log("✅ Client usuarios from backend:", (data as any).usuarios);
    } catch (error) {
      console.error("Error fetching client/users:", error);
      sweetAlert.error("Error", "No se pudo cargar el cliente o los usuarios");
      setClientUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectsCount = async () => {
    try {
      const response = await projectsAPI.getProjectsCount(clientId!);
      setProjectsCount(response.count);
    } catch (error) {
      console.error("Error fetching projects count:", error);
      setProjectsCount(0);
    }
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const handleCreateClientUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newUser = await usersAPI.create({
        ...createUserForm,
        isActive: true,
        roles: [],
      });

      await fetch(`${import.meta.env.VITE_API_URL}/clients/${clientId}/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
          "X-Tenant-Id": localStorage.getItem("tenantId") || "",
        },
        body: JSON.stringify({
          id: (newUser as any)._id || (newUser as any).id,
          email: (newUser as any).email,
          permiso: "editar",
        }),
      });

      sweetAlert.success("Usuario cliente creado", "El usuario ha sido creado y vinculado correctamente");
      closeModal();
      fetchClientAndUsers();
    } catch (error: any) {
      const message = error?.response?.data?.error || "No se pudo crear el usuario";
      sweetAlert.error("Error", message);
    }
  };

  if (!clientId) {
    return (
      <EmptyState
        icon={faUsers}
        title="Cliente no válido"
        description="El ID del cliente no es válido."
        action={{
          label: "Volver a Clientes",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  if (loading) return <LoadingSpinner message="Cargando cliente..." />;

  if (!client) {
    return (
      <EmptyState
        icon={faUsers}
        title="Cliente no encontrado"
        description="No se pudo encontrar el cliente solicitado."
        action={{
          label: "Volver a Clientes",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  return (
    <PageLayout
      title={client.name}
      subtitle={`${client.company || client.email} • ${getClientStatusLabel(client.status)}`}
      faIcon={{ icon: faUsers }}
      clientMiniAvatar={{
        alt: `${client.name} logo`,
        fallback: client.name?.charAt(0)?.toUpperCase() || "?",
        label: client.name,
      }}
      onBack={() => navigate("/clients")}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      /*       headerActions={
        canManage ? (
          <button onClick={() => navigate(`/cliente/${clientId}/info-basica`)} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
            <FontAwesomeIcon icon={faEdit} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
        ) : undefined
      } */
      modal={
        showModal
          ? {
              isOpen: true,
              onClose: closeModal,
              title: "Crear Usuario Cliente",
              subtitle: "Crear nuevo usuario con rol cliente",
              size: "md",
              actions: [
                {
                  label: "Crear Usuario",
                  onClick: () => {
                    const form = document.querySelector<HTMLFormElement>("#create-user-form");
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
              content: (
                <form id="create-user-form" onSubmit={handleCreateClientUser}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                      <input type="email" required value={createUserForm.email} onChange={(e) => setCreateUserForm((prev) => ({ ...prev, email: e.target.value }))} className="input-field" placeholder="usuario@cliente.com" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Contraseña *</label>
                      <div className="relative">
                        <input type={showPassword ? "text" : "password"} required value={createUserForm.password} onChange={(e) => setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))} className="input-field pr-10" placeholder="••••••••" minLength={6} />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                          <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre</label>
                        <input type="text" value={createUserForm.firstName} onChange={(e) => setCreateUserForm((prev) => ({ ...prev, firstName: e.target.value }))} className="input-field" placeholder="Juan" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Apellido</label>
                        <input type="text" value={createUserForm.lastName} onChange={(e) => setCreateUserForm((prev) => ({ ...prev, lastName: e.target.value }))} className="input-field" placeholder="Pérez" />
                      </div>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>Nota:</strong> Este usuario tendrá rol "cliente" y acceso exclusivo a este cliente.
                      </p>
                    </div>
                  </div>
                </form>
              ),
            }
          : undefined
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Información */}
        <Card
          header={{
            title: "Información",
            icon: faUsers,
            badges: [],
          }}
          onClick={() => navigate(`/cliente/${clientId}/info-basica`)}
          className="hover:scale-105 hover:shadow-lg transition-all duration-200"
        >
          <div className="space-y-2">
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400">Email:</span>
              <div className="font-medium text-gray-900 dark:text-white">{client.email}</div>
            </div>
            {client.website && (
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">Sitio:</span>
                <div className="font-medium text-gray-900 dark:text-white truncate">{client.website}</div>
              </div>
            )}
          </div>
        </Card>

        {/* Gestión de Usuarios */}
        <Card
          header={{
            title: "Gestión de Usuarios",
            icon: faUsers,
            badges: [],
          }}
          onClick={() => navigate(`/cliente/${clientId}/usuarios`)}
          className="hover:scale-105 hover:shadow-lg transition-all duration-200"
        >
          <div className="space-y-2">
            {clientUsers.length > 0 ? (
              <div className="space-y-1">
                {clientUsers.slice(0, 3).map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <div className="flex items-center space-x-2 min-w-0 flex-1">
                      <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">{(user.email || user.id || "?").charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-gray-900 dark:text-white truncate">{user.email || `Usuario ${user.id.slice(-4)}`}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{user.permiso || "ver"}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {clientUsers.length > 3 && <div className="text-xs text-gray-500 dark:text-gray-500 text-center">+{clientUsers.length - 3} más</div>}
              </div>
            ) : (
              <div className="text-center py-4">
                <FontAwesomeIcon icon={faUsers} className="h-4 w-4 text-gray-500 dark:text-gray-500 " />
                <div className="text-xs text-gray-500 dark:text-gray-500 text-center py-2">Sin usuarios cliente</div>
              </div>
            )}
          </div>
        </Card>

        {/* Proyectos */}
        <Card
          header={{
            title: "Proyectos",
            icon: faLayerGroup,
            badges: [],
          }}
          onClick={() => navigate(`/clients/${clientId}/projects`)}
          className="hover:scale-105 hover:shadow-lg transition-all duration-200"
        >
          <div className="space-y-2">
            {projectsCount > 0 ? (
              <div className="text-sm text-gray-900 dark:text-white">
                {projectsCount} proyecto{projectsCount !== 1 ? "s" : ""} creado{projectsCount !== 1 ? "s" : ""}
              </div>
            ) : (
              <div className="text-center py-4">
                <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-gray-500 dark:text-gray-500 " />
                <div className="text-sm text-gray-500 dark:text-gray-500 mb-3">No hay proyectos creados</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/clients/${clientId}/projects`);
                  }}
                  className="btn-primary text-xs px-3 py-1"
                >
                  Crear Proyecto
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};
