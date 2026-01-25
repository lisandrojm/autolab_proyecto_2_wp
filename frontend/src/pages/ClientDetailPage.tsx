import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

import { useClientContextStore } from "../stores/clientContextStore";
import { clientsAPI, Client } from "../api/clients";
import { projectsAPI } from "../api/projects";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";

import { faUsers, faEdit, faBriefcase } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { getClientStatusLabel } from "../utils/clientStatus";

const HELP_KEY = "clientDetail" as const;

export const ClientDetailPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { setSelectedClient } = useClientContextStore();

  // Data
  const [client, setClient] = useState<Client | null>(null);
  const [projectsCount, setProjectsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);

  // Edit Modal State
  const [openEdit, setOpenEdit] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    industry: "",
    website: "",
    status: "active" as Client["status"],
  });

  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    if (!clientId) return;
    fetchClientData();
    fetchProjectsCount();
    setIsEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    if (client) {
      setFormData({
        name: client.name || "",
        email: client.email || "",
        phone: client.phone || "",
        company: client.company || "",
        industry: client.industry || "",
        website: client.website || "",
        status: client.status || "active",
      });
    }
  }, [client]);

  const fetchClientData = async () => {
    try {
      setLoading(true);
      const data = await clientsAPI.get(clientId!);
      setClient(data);
      setSelectedClient(data);
    } catch (error) {
      console.error("Error fetching client:", error);
      sweetAlert.error("Error", "No se pudo cargar el cliente");
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

  const submitEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!client) return;

    try {
      const payload: any = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone?.trim() || undefined,
        company: formData.company?.trim() || undefined,
        industry: formData.industry?.trim() || undefined,
        website: formData.website?.trim() || undefined,
        status: formData.status,
      };

      await clientsAPI.update(client._id, payload);
      const refreshed = await clientsAPI.get(client._id);
      setClient(refreshed);
      setSelectedClient(refreshed);
      sweetAlert.success("Cliente actualizado", "Los cambios se han guardado correctamente");
      setOpenEdit(false);
    } catch (error: any) {
      const message = error?.response?.data?.error || "No se pudo actualizar el cliente";
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

  if (!loading && !client) {
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
      title={client?.name || "Cargando..."}
      subtitle={client ? `${client.company || client.email} • ${getClientStatusLabel(client.status)}` : ""}
      faIcon={{ icon: faUsers }}
      clientMiniAvatar={
        client
          ? {
              alt: `${client.name} logo`,
              fallback: client.name?.charAt(0)?.toUpperCase() || "?",
              label: client.name,
            }
          : undefined
      }
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
      modal={{
        isOpen: openEdit,
        onClose: () => setOpenEdit(false),
        title: isEditing ? "Editar Información" : "Información del Cliente",
        subtitle: isEditing ? "Actualiza los datos del cliente" : "Detalles generales",
        size: "lg",
        actions: isEditing
          ? [
              {
                label: "Guardar",
                onClick: () => {
                  const form = document.querySelector<HTMLFormElement>("#client-edit-form");
                  form?.requestSubmit();
                },
                variant: "primary",
              },
              { label: "Cancelar", onClick: () => setIsEditing(false), variant: "ghost" },
            ]
          : [
              {
                label: "Editar",
                onClick: () => setIsEditing(true),
                variant: "primary",
              },
              { label: "Cerrar", onClick: () => setOpenEdit(false), variant: "ghost" },
            ],
        content: isEditing ? (
          <form id="client-edit-form" onSubmit={submitEdit}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Nombre del cliente" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email *</label>
                <input type="email" required value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))} className="input-field" placeholder="cliente@ejemplo.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Teléfono</label>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))} className="input-field" placeholder="+34 600 000 000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Empresa</label>
                <input type="text" value={formData.company} onChange={(e) => setFormData((p) => ({ ...p, company: e.target.value }))} className="input-field" placeholder="Nombre de la empresa" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Industria</label>
                <input type="text" value={formData.industry} onChange={(e) => setFormData((p) => ({ ...p, industry: e.target.value }))} className="input-field" placeholder="Ej: Tecnología" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sitio web</label>
                <input type="url" value={formData.website} onChange={(e) => setFormData((p) => ({ ...p, website: e.target.value }))} className="input-field" placeholder="https://ejemplo.com" />
              </div>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-1">
            <div className="sm:col-span-2">
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Nombre</span>
              <div className="text-base font-medium text-gray-900 dark:text-white">{client?.name}</div>
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Email</span>
              <div className="text-sm text-gray-900 dark:text-white">{client?.email}</div>
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Teléfono</span>
              <div className="text-sm text-gray-900 dark:text-white">{client?.phone || "—"}</div>
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Empresa</span>
              <div className="text-sm text-gray-900 dark:text-white">{client?.company || "—"}</div>
            </div>
            <div>
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Industria</span>
              <div className="text-sm text-gray-900 dark:text-white">{client?.industry || "—"}</div>
            </div>
            <div className="sm:col-span-2">
              <span className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Sitio web</span>
              <div className="text-sm text-primary-600 dark:text-primary-400">
                {client?.website ? (
                  <a href={client.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {client.website}
                  </a>
                ) : (
                  <span className="text-gray-500 dark:text-gray-500">—</span>
                )}
              </div>
            </div>
          </div>
        ),
      }}
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando cliente..." />
        </div>
      ) : (
        client && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Información */}
            <Card
              header={{
                title: "Información General",
                icon: faUsers,
                badges: [],
              }}
              footer={{
                leftContent: (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500 dark:text-gray-500">{client.createdAt ? new Date(client.createdAt as any).toLocaleDateString() : "—"}</div>
                  </div>
                ),
                actions: [
                  {
                    icon: faEdit,
                    onClick: (e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                      setOpenEdit(true);
                    },
                    title: "Editar Información",
                    variant: "default",
                  },
                ],
              }}
              onClick={() => {
                setIsEditing(false);
                setOpenEdit(true);
              }}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <div className="space-y-4">
                <div className="text-sm">
                  <span className="text-gray-500 dark:text-gray-400 block mb-1">Email de contacto:</span>
                  <div className="font-medium text-gray-900 dark:text-white">{client.email}</div>
                </div>
                {client.phone && (
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400 block mb-1">Teléfono:</span>
                    <div className="font-medium text-gray-900 dark:text-white">{client.phone}</div>
                  </div>
                )}
              </div>
            </Card>

            {/* Proyectos */}
            <Card
              header={{
                title: "Proyectos",
                subtitle: "Gestión de proyectos",
                icon: faBriefcase,
              }}
              footer={{
                leftContent: (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {projectsCount} proyecto{projectsCount !== 1 ? "s" : ""} activo{projectsCount !== 1 ? "s" : ""}
                  </span>
                ),
              }}
              onClick={() => navigate(`/clients/${clientId}/projects`)}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              {/* Body content removed as requested */}
            </Card>
          </div>
        )
      )}
    </PageLayout>
  );
};
