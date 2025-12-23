import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useClientContextStore } from "../stores/clientContextStore";
import { briefsAPI, Brief } from "../api/briefs";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileText, faPlus, faEdit, faTrash, faEye, faCalendar, faDollarSign } from "@fortawesome/free-solid-svg-icons";

export const ClientRequestsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { selectedClient } = useClientContextStore();

  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  // Modal para nueva solicitud
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    objectives: [""],
    targetAudience: "",
    budget: { total: 0 },
    timeline: {
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    deliverables: [
      {
        type: "post" as const,
        quantity: 1,
        format: ["Digital"],
        platforms: ["instagram"],
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
    ],
    priority: "medium" as Brief["priority"],
  });

  useEffect(() => {
    fetchBriefs();

    // Auto-abrir modal si viene ?new=1
    if (searchParams.get("new") === "1") {
      setShowCreateModal(true);
    }
  }, [searchParams]);

  const fetchBriefs = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 100 };

      if (selectedClient) {
        params.clientId = selectedClient._id;
      }

      const data = await briefsAPI.list(params);
      setBriefs(data.briefs || []);
    } catch (error) {
      console.error("Error fetching briefs:", error);
      sweetAlert.error("Error", "No se pudieron cargar las solicitudes");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const payload = {
        ...formData,
        objectives: formData.objectives.filter((o) => o.trim()),
        clientId: selectedClient?._id,
        timeline: {
          startDate: formData.timeline.startDate,
          endDate: formData.timeline.endDate,
        },
        deliverables: formData.deliverables.map((d) => ({
          ...d,
          deadline: d.deadline,
        })),
      };

      await briefsAPI.create(payload);
      sweetAlert.success("Solicitud creada", "Tu solicitud ha sido enviada correctamente");
      setShowCreateModal(false);

      // Reset form
      setFormData({
        title: "",
        description: "",
        objectives: [""],
        targetAudience: "",
        budget: { total: 0 },
        timeline: {
          startDate: new Date().toISOString().split("T")[0],
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        },
        deliverables: [
          {
            type: "post",
            quantity: 1,
            format: ["Digital"],
            platforms: ["instagram"],
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          },
        ],
        priority: "medium",
      });

      fetchBriefs();
    } catch (error: any) {
      const message = error?.response?.data?.error || "No se pudo crear la solicitud";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (brief: Brief) => {
    const result = await sweetAlert.confirm("¿Eliminar solicitud?", `¿Estás seguro de que quieres eliminar "${brief.title}"?`);

    if (result.isConfirmed) {
      try {
        await briefsAPI.remove(brief._id);
        setBriefs((prev) => prev.filter((b) => b._id !== brief._id));
        sweetAlert.success("Solicitud eliminada", "La solicitud ha sido eliminada correctamente");
      } catch (error: any) {
        const message = error?.response?.data?.error || "No se pudo eliminar la solicitud";
        sweetAlert.error("Error", message);
      }
    }
  };

  const filteredBriefs = briefs.filter((brief) => {
    const matchesSearch = brief.title.toLowerCase().includes(searchTerm.toLowerCase()) || (brief.description || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = filterStatus === "all" || brief.status === filterStatus;
    const matchesPriority = filterPriority === "all" || brief.priority === filterPriority;

    return matchesSearch && matchesStatus && matchesPriority;
  });

  if (loading) return <LoadingSpinner message="Cargando solicitudes..." />;

  return (
    <PageLayout
      title="Solicitudes"
      subtitle="Gestiona tus briefs y solicitudes de trabajo"
      faIcon={{ icon: faFileText }}
      clientMiniAvatar={
        selectedClient
          ? {
              alt: `${selectedClient.name} logo`,
              fallback: selectedClient.name?.charAt(0)?.toUpperCase() || "?",
              label: selectedClient.name,
            }
          : undefined
      }
      headerActions={
        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
          <span className="hidden lg:block">Nueva Solicitud</span>
        </button>
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar solicitudes..."
          filters={[
            {
              value: filterStatus,
              onChange: setFilterStatus,
              options: [
                { value: "all", label: "Todos los estados" },
                { value: "draft", label: "Borrador" },
                { value: "pending_review", label: "En Revisión" },
                { value: "approved", label: "Aprobado" },
                { value: "in_progress", label: "En Progreso" },
                { value: "completed", label: "Completado" },
                { value: "cancelled", label: "Cancelado" },
              ],
            },
            {
              value: filterPriority,
              onChange: setFilterPriority,
              options: [
                { value: "all", label: "Todas las prioridades" },
                { value: "urgent", label: "Urgente" },
                { value: "high", label: "Alta" },
                { value: "medium", label: "Media" },
                { value: "low", label: "Baja" },
              ],
            },
          ]}
        />
      }
      modal={
        showCreateModal
          ? {
              isOpen: true,
              onClose: () => setShowCreateModal(false),
              title: "Nueva Solicitud",
              subtitle: "Crea una nueva solicitud de trabajo",
              size: "lg",
              actions: [
                {
                  label: "Crear Solicitud",
                  onClick: () => {
                    const form = document.querySelector<HTMLFormElement>("#brief-form");
                    form?.requestSubmit();
                  },
                  variant: "primary",
                },
                {
                  label: "Cancelar",
                  onClick: () => setShowCreateModal(false),
                  variant: "ghost",
                },
              ],
              content: (
                <form id="brief-form" onSubmit={handleCreateSubmit}>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Título *</label>
                      <input type="text" required value={formData.title} onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))} className="input-field" placeholder="Ej: Campaña para lanzamiento de producto" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                      <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Describe los detalles de tu solicitud..." />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Objetivos *</label>
                      <div className="space-y-2">
                        {formData.objectives.map((objective, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={objective}
                              onChange={(e) =>
                                setFormData((prev) => ({
                                  ...prev,
                                  objectives: prev.objectives.map((o, i) => (i === index ? e.target.value : o)),
                                }))
                              }
                              className="input-field flex-1"
                              placeholder="Ej: Aumentar awareness de marca"
                            />
                            {formData.objectives.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setFormData((prev) => ({
                                    ...prev,
                                    objectives: prev.objectives.filter((_, i) => i !== index),
                                  }))
                                }
                                className="px-2 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((prev) => ({
                              ...prev,
                              objectives: [...prev.objectives, ""],
                            }))
                          }
                          className="text-primary-600 dark:text-primary-400 text-sm hover:text-primary-700"
                        >
                          + Agregar objetivo
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Audiencia Objetivo</label>
                      <textarea value={formData.targetAudience} onChange={(e) => setFormData((prev) => ({ ...prev, targetAudience: e.target.value }))} rows={2} className="input-field resize-none" placeholder="Describe tu público objetivo..." />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Presupuesto (USD)</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={formData.budget.total}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              budget: { total: Number(e.target.value) },
                            }))
                          }
                          className="input-field"
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prioridad</label>
                        <select
                          value={formData.priority}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              priority: e.target.value as Brief["priority"],
                            }))
                          }
                          className="input-field"
                        >
                          <option value="low">Baja</option>
                          <option value="medium">Media</option>
                          <option value="high">Alta</option>
                          <option value="urgent">Urgente</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timeline</label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Inicio</label>
                          <input
                            type="date"
                            value={formData.timeline.startDate}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                timeline: { ...prev.timeline, startDate: e.target.value },
                              }))
                            }
                            className="input-field"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fin</label>
                          <input
                            type="date"
                            value={formData.timeline.endDate}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                timeline: { ...prev.timeline, endDate: e.target.value },
                              }))
                            }
                            className="input-field"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </form>
              ),
            }
          : undefined
      }
    >
      <div className="grid grid-cols-1 gap-6">
        {/* Nueva Solicitud Card */}
        <Card
          variant="create"
          onClick={() => setShowCreateModal(true)}
          header={{
            title: "Nueva Solicitud",
            subtitle: "Crear una nueva solicitud de trabajo",
            icon: faPlus,
          }}
        />

        {/* Briefs List */}
        {filteredBriefs.map((brief) => (
          <Card
            key={brief._id}
            onClick={() => sweetAlert.info("Ver Brief", `Próximamente: vista detallada de "${brief.title}"`)}
            className="hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
            header={{
              title: brief.title,
              subtitle: brief.description,
              icon: faFileText,
              badges: [],
            }}
            footer={{
              leftContent: (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-500">{new Date(brief.createdAt).toLocaleDateString()}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    {brief.objectives.length} objetivo{brief.objectives.length !== 1 ? "s" : ""}
                  </div>
                </div>
              ),
              actions: [
                {
                  icon: faEye,
                  onClick: (e) => {
                    e.stopPropagation();
                    sweetAlert.info("Ver Brief", `Próximamente: vista detallada de "${brief.title}"`);
                  },
                  title: "Ver solicitud",
                  variant: "default",
                },
                {
                  icon: faEdit,
                  onClick: (e) => {
                    e.stopPropagation();
                    sweetAlert.info("Editar Brief", `Próximamente: editar "${brief.title}"`);
                  },
                  title: "Editar solicitud",
                  variant: "default",
                },
                {
                  icon: faTrash,
                  onClick: (e) => {
                    e.stopPropagation();
                    handleDelete(brief);
                  },
                  title: "Eliminar solicitud",
                  variant: "blue",
                },
              ],
            }}
          >
            <div className="space-y-3">
              {/* Objetivos */}
              {brief.objectives.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 block">Objetivos</label>
                  <ul className="space-y-1">
                    {brief.objectives.slice(0, 2).map((objective, index) => (
                      <li key={index} className="text-sm text-gray-900 dark:text-white flex items-start">
                        <span className="w-1.5 h-1.5 bg-primary-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                        {objective}
                      </li>
                    ))}
                    {brief.objectives.length > 2 && <li className="text-xs text-gray-500 dark:text-gray-500">+{brief.objectives.length - 2} más</li>}
                  </ul>
                </div>
              )}

              {/* Budget y Timeline */}
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 dark:text-gray-500">
                {brief.budget?.total > 0 && (
                  <div className="flex items-center space-x-1">
                    <FontAwesomeIcon icon={faDollarSign} className="h-3 w-3" />
                    <span>USD{brief.budget.total.toLocaleString()}</span>
                  </div>
                )}
                {brief.timeline && (
                  <div className="flex items-center space-x-1">
                    <FontAwesomeIcon icon={faCalendar} className="h-3 w-3" />
                    <span>
                      {new Date(brief.timeline.startDate).toLocaleDateString()} -{new Date(brief.timeline.endDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredBriefs.length === 0 && (
        <EmptyState
          icon={faFileText}
          title="No hay solicitudes"
          description="Crea tu primera solicitud para comenzar a trabajar con el equipo."
          action={{
            label: "Nueva Solicitud",
            onClick: () => setShowCreateModal(true),
            icon: faPlus,
          }}
        />
      )}
    </PageLayout>
  );
};
