import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useClientContextStore } from "../stores/clientContextStore";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullhorn, faEye, faCalendar, faDollarSign, faLayerGroup, faPlus, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { sweetAlert } from "../utils/sweetAlert";

interface Campaign {
  _id: string;
  name: string;
  description?: string;
  status: "draft" | "active" | "paused" | "completed" | "cancelled";
  budget: { total: number; allocated: number; spent: number };
  timeline: { startDate: string; endDate: string };
  platforms: string[];
  objectives?: string[];
  targetAudience?: string;
  kpis?: { name: string; target: number; current: number; unit: string }[];
  projectId: string;
  createdAt: string;
  favorite?: boolean;
}

const calcDuration = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return "—";
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const days = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
  return `${days} días`;
};

export const ClientCampaignsPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, tenantId } = useAuthStore();
  const { selectedClient } = useClientContextStore();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  // filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD

  useEffect(() => {
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?._id]);

  const fetchCampaigns = async () => {
    try {
      setLoading(true);

      let url = `${import.meta.env.VITE_API_URL}/campaigns`;
      const params = new URLSearchParams();

      if (selectedClient) {
        params.append("clientId", selectedClient._id);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setCampaigns(data);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrado local (texto + estado + rango de fechas por createdAt)
  const filteredCampaigns = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const hasDates = !!startDate || !!endDate;
    const startTs = startDate ? new Date(startDate).getTime() : null;
    const endTs = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return campaigns.filter((campaign) => {
      const matchesSearch = q.length === 0 || campaign.name.toLowerCase().includes(q) || (campaign.description || "").toLowerCase().includes(q);

      const matchesStatus = filterStatus === "all" || campaign.status === (filterStatus as Campaign["status"]);

      let matchesDate = true;
      if (hasDates) {
        const t = campaign.createdAt ? new Date(campaign.createdAt).getTime() : NaN;
        if (Number.isNaN(t)) return false;
        if (startTs !== null) matchesDate = matchesDate && t >= startTs;
        if (endTs !== null) matchesDate = matchesDate && t <= endTs;
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [campaigns, searchTerm, filterStatus, startDate, endDate]);

  const hasActiveDate = !!startDate || !!endDate;

  const handleUpload = async (file: File, scope: "campaigns" | "assets", clientId: string) => {
    if (!file) return;
    console.log("CLIENT ID: ", clientId);

    sweetAlert.loading("Subiendo archivo...");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", clientId);
      formData.append("scope", scope);

      const res = await fetch(`${import.meta.env.VITE_API_URL}/client-assets/${scope}/upload?clientId=${encodeURIComponent(clientId)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId || "",
        },
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        console.log("Upload response:", data);
        sweetAlert.success("¡Éxito!", `Archivo subido a ${scope} correctamente`);
      } else {
        throw new Error(data.message || "Error al subir el archivo");
      }
    } catch (err) {
      console.error("Upload error:", err);
      sweetAlert.error("Error", err instanceof Error ? err.message : "Error subiendo el archivo");
    }
  };

  if (loading) return <LoadingSpinner message="Cargando campañas..." />;

  return (
    <PageLayout
      title="Campañas"
      subtitle="Tus campañas de marketing activas y pasadas"
      faIcon={{ icon: faBullhorn }}
      clientMiniAvatar={
        selectedClient
          ? {
              alt: `${selectedClient.name} logo`,
              fallback: selectedClient.name?.charAt(0)?.toUpperCase() || "?",
              label: selectedClient.name,
            }
          : undefined
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar campañas..."
          filters={[
            {
              value: filterStatus,
              onChange: setFilterStatus,
              options: [
                { value: "all", label: "Todas" },
                { value: "active", label: "Activas" },
                { value: "draft", label: "Borrador" },
                { value: "paused", label: "Pausadas" },
                { value: "completed", label: "Completadas" },
                { value: "cancelled", label: "Canceladas" },
              ],
            },
          ]}
          dateFilter={{
            startDate,
            endDate,
            onStartDateChange: setStartDate,
            onEndDateChange: setEndDate,
          }}
        />
      }
    >
      <div className="grid grid-cols-1 gap-6">
        {filteredCampaigns.map((campaign) => (
          <Card
            key={campaign._id}
            onClick={() => navigate(`/projects/${campaign.projectId}/campaigns/${campaign._id}`)}
            className="hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
            header={{
              title: `Campaña | ${campaign.name}`,
              subtitle: campaign.description,
              icon: faBullhorn,
              badges: [],
            }}
            footer={{
              leftContent: (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-500">{new Date(campaign.createdAt).toLocaleDateString()}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    {campaign.platforms.length} plataforma{campaign.platforms.length !== 1 ? "s" : ""}
                  </div>
                </div>
              ),
              actions: [
                {
                  icon: faEye,
                  onClick: (e) => {
                    e.stopPropagation();
                    navigate(`/projects/${campaign.projectId}/campaigns/${campaign._id}`);
                  },
                  title: "Ver campaña",
                  variant: "default",
                },
              ],
            }}
          >
            <div className="space-y-3">
              {/* Información de la campaña */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <FontAwesomeIcon icon={faDollarSign} className="h-4 w-4 text-gray-400" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Presupuesto</div>
                    <div className="font-medium text-gray-900 dark:text-white">USD{(campaign.budget?.total ?? 0).toLocaleString()}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <FontAwesomeIcon icon={faCalendar} className="h-4 w-4 text-gray-400" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Duración</div>
                    <div className="font-medium text-gray-900 dark:text-white">{calcDuration(campaign.timeline?.startDate, campaign.timeline?.endDate)}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 text-gray-400" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Objetivos</div>
                    <div className="font-medium text-gray-900 dark:text-white">{campaign.objectives?.length || 0}</div>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              {campaign.timeline && (
                <div className="text-xs text-gray-500 dark:text-gray-500">
                  <FontAwesomeIcon icon={faCalendar} className="h-3 w-3 mr-1" />
                  {new Date(campaign.timeline.startDate).toLocaleDateString()} - {new Date(campaign.timeline.endDate).toLocaleDateString()}
                </div>
              )}

              {/* KPIs Progress */}
              {campaign.kpis && campaign.kpis.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-300">KPIs</div>
                  {campaign.kpis.slice(0, 2).map((kpi, index) => {
                    const progress = kpi.target > 0 ? Math.min(100, (kpi.current / kpi.target) * 100) : 0;
                    return (
                      <div key={index}>
                        <div className="flex justify-between text-xs">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{kpi.name}</span>
                          <span className="text-gray-500 dark:text-gray-500">
                            {kpi.current}/{kpi.target} {kpi.unit}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                          <div className="h-2 rounded-full bg-primary-500" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {campaign.kpis.length > 2 && <div className="text-xs text-gray-500 dark:text-gray-500">+{campaign.kpis.length - 2} KPIs más</div>}
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredCampaigns.length === 0 && (
        <EmptyState
          icon={faBullhorn}
          title={hasActiveDate ? "Sin campañas en este rango" : "No hay campañas"}
          description={hasActiveDate ? `No se encontraron campañas ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : selectedClient ? `${selectedClient.name} aún no tiene campañas asignadas.` : "No tienes campañas asignadas en este momento."}
          action={{
            label: "Contactar Equipo",
            onClick: () => sweetAlert.info("Contactar Equipo", "Contacta con tu equipo de marketing para crear nuevas campañas."),
          }}
        />
      )}

      {/* Botones de prueba para upload de assets */}
      <div className="mt-8">
        {!selectedClient ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 text-center">
            <FontAwesomeIcon icon={faExclamationTriangle} className="h-12 w-12 text-blue-600 dark:text-blue-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-200 mb-2">No hay cliente seleccionado</h3>
            <p className="text-blue-700 dark:text-blue-300">Por favor, selecciona un cliente desde el menú lateral para subir archivos.</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Subir Assets (Prueba)</h3>
            <div className="flex flex-wrap gap-4 justify-center">
              {/* Campaigns */}
              <label className="btn-primary flex items-center px-4 py-2 cursor-pointer">
                <FontAwesomeIcon icon={faPlus} className="h-5 w-5 mr-2" />
                Subir a Campaigns
                <input
                  type="file"
                  className="hidden"
                  onChange={async (e) => {
                    if (e.target.files?.[0] && selectedClient?._id) {
                      const file = e.target.files[0];
                      await handleUpload(file, "campaigns", selectedClient._id);
                    }
                  }}
                />
              </label>

              {/* Client Assets */}
              <label className="btn-primary flex items-center px-4 py-2 cursor-pointer">
                <FontAwesomeIcon icon={faPlus} className="h-5 w-5 mr-2" />
                Subir a Assets
                <input
                  type="file"
                  className="hidden"
                  onChange={async (e) => {
                    if (e.target.files?.[0] && selectedClient?._id) {
                      const file = e.target.files[0];
                      await handleUpload(file, "assets", selectedClient._id);
                    }
                  }}
                />
              </label>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
};
