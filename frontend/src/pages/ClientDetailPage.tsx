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
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUsers, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
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

  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    if (!clientId) return;
    fetchClientData();
    fetchProjectsCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Información */}
        <Card
          header={{
            title: "Información General",
            icon: faUsers,
            badges: [],
          }}
          onClick={() => navigate(`/cliente/${clientId}/info-basica`)}
          className="hover:scale-105 hover:shadow-lg transition-all duration-200"
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
            {client.website && (
              <div className="text-sm">
                <span className="text-gray-500 dark:text-gray-400 block mb-1">Sitio Web:</span>
                <div className="font-medium text-gray-900 dark:text-white truncate">{client.website}</div>
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
              <div className="flex flex-col items-center justify-center py-4">
                <div className="text-3xl font-bold text-primary-600 mb-1">{projectsCount}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  proyecto{projectsCount !== 1 ? "s" : ""} activo{projectsCount !== 1 ? "s" : ""}
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <FontAwesomeIcon icon={faLayerGroup} className="h-8 w-8 text-gray-300 dark:text-gray-600 mb-3" />
                <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">No hay proyectos creados</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/clients/${clientId}/projects`);
                  }}
                  className="btn-primary text-xs px-4 py-2"
                >
                  Crear Primer Proyecto
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};
