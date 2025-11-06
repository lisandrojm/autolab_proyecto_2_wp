import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useClientContextStore } from "../stores/clientContextStore";
import { useAuthStore } from "../stores/authStore";
import { projectsAPI } from "../api/projects";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { emitCampaignsChanged } from "../utils/navbarEvents";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullhorn, faLayerGroup, faEdit, faTrash, faPlus } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { getImageUrl } from "../utils/imageHelpers";

const HELP_KEY = "clientContextCampaigns" as const;

interface Project {
  _id: string;
  name: string;
  description?: string;
}

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
  projectName?: string;
  createdAt: string;
  favorite?: boolean;
}

const getStatusText = (status: Campaign["status"]) => {
  switch (status) {
    case "active":
      return "Activa";
    case "completed":
      return "Completada";
    case "paused":
      return "Pausada";
    case "cancelled":
      return "Cancelada";
    case "draft":
      return "Borrador";
    default:
      return status;
  }
};

export const ClientContextCampaignsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedClient, setSelectedClient } = useClientContextStore();
  const { token, tenantId } = useAuthStore();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // filtros / búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD

  // info modal (ayuda)
  const [openInfo, setOpenInfo] = useState(false);

  // MODAL CREAR CAMPAÑA
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    description: "",
    objectives: [""],
    targetAudience: "",
    status: "draft" as Campaign["status"],
    budget: { total: 0, allocated: 0, spent: 0 },
    timeline: {
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    platforms: [] as string[],
    projectId: "",
  });

  // MODAL EDITAR CAMPAÑA
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    status: "draft" as Campaign["status"],
    timeline: {
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    objectives: [""],
    targetAudience: "",
    budget: { total: 0, allocated: 0, spent: 0 },
    platforms: [] as string[],
  });

  const helpEntry = getHelp(HELP_KEY);

  // cargar cliente + proyectos
  useEffect(() => {
    if (!id) return;
    fetchClientAndProjects();
  }, [id]);

  // cargar campañas
  useEffect(() => {
    if (!id) return;
    fetchCampaigns();
  }, [id, filterProject, projects]);

  const fetchClientAndProjects = async () => {
    if (!id) return;

    try {
      // cliente a contexto si falta
      if (!selectedClient || selectedClient._id !== id) {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/clients/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId,
          },
        });
        if (response.ok) {
          const clientData = await response.json();
          setSelectedClient(clientData);
        }
      }

      // proyectos del cliente
      const projectsResponse = await projectsAPI.getClientProjects(id, {
        limit: 100,
      });
      setProjects(projectsResponse.projects);
    } catch (error) {
      console.error("Error fetching client data:", error);
      sweetAlert.error("Error", "No se pudieron cargar los datos del cliente");
    }
  };

  const fetchCampaigns = async () => {
    if (!id) return;

    try {
      setLoading(true);

      // construir URL con filtros
      let url = `${import.meta.env.VITE_API_URL}/campaigns?clientId=${id}`;
      if (filterProject !== "all") {
        url += `&projectId=${filterProject}`;
      }

      const campaignsResponse = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (campaignsResponse.ok) {
        const campaignsData = await campaignsResponse.json();

        // enriquecer con nombre de proyecto
        const enrichedCampaigns = await Promise.all(
          campaignsData.map(async (campaign: any) => {
            try {
              const project = projects.find((p) => p._id === campaign.projectId);
              if (project) {
                return { ...campaign, projectName: project.name };
              }

              const projectResponse = await fetch(`${import.meta.env.VITE_API_URL}/projects/${campaign.projectId}`, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "X-Tenant-Id": tenantId,
                },
              });

              if (projectResponse.ok) {
                const projectData = await projectResponse.json();
                return { ...campaign, projectName: projectData.name };
              }
            } catch (error) {
              console.error("Error fetching project for campaign:", campaign._id, error);
            }

            return { ...campaign, projectName: "Proyecto desconocido" };
          })
        );

        setCampaigns(enrichedCampaigns);
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      sweetAlert.error("Error", "No se pudieron cargar las campañas");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCampaign = async (campaign: Campaign) => {
    const result = await sweetAlert.confirm("¿Eliminar campaña?", `¿Estás seguro de que quieres eliminar "${campaign.name}"?`);

    if (result.isConfirmed) {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/campaigns/${campaign._id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId,
          },
        });

        if (response.ok) {
          setCampaigns((prev) => prev.filter((c) => c._id !== campaign._id));
          emitCampaignsChanged("delete", campaign._id, selectedClient?._id);
          sweetAlert.success("Campaña eliminada", "La campaña ha sido eliminada correctamente");
        } else {
          const errorData = await response.json();
          sweetAlert.error("Error", errorData.error || "No se pudo eliminar la campaña");
        }
      } catch (error) {
        console.error("Error deleting campaign:", error);
        sweetAlert.error("Error", "No se pudo eliminar la campaña");
      }
    }
  };

  // ---------- CREAR CAMPAÑA ----------

  const openCreateCampaignModal = () => {
    setCampaignForm({
      name: "",
      description: "",
      objectives: [""],
      targetAudience: "",
      status: "draft",
      budget: { total: 0, allocated: 0, spent: 0 },
      timeline: {
        startDate: new Date().toISOString().split("T")[0],
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
      platforms: [],
      projectId: filterProject !== "all" ? filterProject : "",
    });
    setShowCampaignModal(true);
    setShowEditModal(false);
  };

  const closeCreateCampaignModal = () => {
    setShowCampaignModal(false);
  };

  const submitCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!campaignForm.projectId) {
      sweetAlert.error("Error", "Debes seleccionar un proyecto para la campaña");
      return;
    }

    try {
      const payload = {
        name: campaignForm.name.trim(),
        description: campaignForm.description?.trim() || undefined,
        objectives: campaignForm.objectives.map((o) => o.trim()).filter(Boolean),
        targetAudience: campaignForm.targetAudience.trim(),
        status: campaignForm.status || "draft",
        timeline: {
          startDate: new Date(campaignForm.timeline.startDate).toISOString(),
          endDate: new Date(campaignForm.timeline.endDate).toISOString(),
        },
        budget: {
          total: Number(campaignForm.budget.total) || 0,
          allocated: Number(campaignForm.budget.allocated) || 0,
          spent: Number(campaignForm.budget.spent) || 0,
        },
        platforms: Array.isArray(campaignForm.platforms) ? campaignForm.platforms : [],
        projectId: campaignForm.projectId,
        clientId: id,
      };

      const response = await fetch(`${import.meta.env.VITE_API_URL}/campaigns`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "No se pudo crear la campaña");
      }

      const newCampaign = await response.json();
      sweetAlert.success("Campaña creada", "La campaña se ha creado correctamente");
      emitCampaignsChanged("create", newCampaign._id, id);
      closeCreateCampaignModal();
      await fetchCampaigns();
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      sweetAlert.error("Error", error?.message || "No se pudo crear la campaña");
    }
  };

  // ---------- EDITAR CAMPAÑA ----------

  const openEditCampaignModal = (campaign: Campaign) => {
    setEditingCampaign(campaign);

    setEditForm({
      name: campaign.name || "",
      description: campaign.description || "",
      status: campaign.status || "draft",
      timeline: {
        startDate: new Date(campaign.timeline?.startDate ?? Date.now()).toISOString().split("T")[0],
        endDate: new Date(campaign.timeline?.endDate ?? Date.now()).toISOString().split("T")[0],
      },
      objectives: campaign.objectives?.length ? campaign.objectives : [""],
      targetAudience: campaign.targetAudience || "",
      budget: {
        total: campaign.budget?.total ?? 0,
        allocated: campaign.budget?.allocated ?? 0,
        spent: campaign.budget?.spent ?? 0,
      },
      platforms: Array.isArray(campaign.platforms) ? campaign.platforms : [],
    });

    setShowEditModal(true);
    setShowCampaignModal(false);
  };

  const closeEditCampaignModal = () => {
    setShowEditModal(false);
    setEditingCampaign(null);
  };

  const submitEditCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCampaign) return;

    const payload = {
      ...editForm,
      objectives: editForm.objectives.filter((o) => o.trim()),
      timeline: {
        startDate: new Date(editForm.timeline.startDate).toISOString(),
        endDate: new Date(editForm.timeline.endDate).toISOString(),
      },
    };

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/campaigns/${editingCampaign._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updatedCampaign = await res.json();
        sweetAlert.success("Campaña actualizada", "Los cambios se han guardado correctamente");

        // Sincronizar la lista en memoria
        setCampaigns((prev) => prev.map((c) => (c._id === updatedCampaign._id ? { ...c, ...updatedCampaign } : c)));

        emitCampaignsChanged("update", updatedCampaign._id, selectedClient?._id);

        closeEditCampaignModal();
      } else {
        const errorData = await res.json().catch(() => ({}));
        console.error("Error updating campaign:", errorData);
        sweetAlert.error("Error", errorData.error || "No se pudo actualizar la campaña");
      }
    } catch (error) {
      console.error("Error updating campaign:", error);
      sweetAlert.error("Error", "No se pudo actualizar la campaña");
    }
  };

  // ---------- FILTROS Y EMPTY STATE ----------

  const handleProjectFilterChange = (value: string) => {
    setFilterProject(value);
  };

  const projectFilterOptions = [
    { value: "all", label: "Todos los proyectos" },
    ...projects.map((project) => ({
      value: project._id,
      label: project.name,
    })),
  ];

  const hasActiveDate = !!startDate || !!endDate;

  const getEmptyStateMessage = () => {
    const clientName = selectedClient?.name || "este cliente";

    if (hasActiveDate) {
      return `No se encontraron campañas ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}`;
    }

    if (filterProject !== "all") {
      const selectedProjectName = projects.find((p) => p._id === filterProject)?.name || "este proyecto";
      return `${clientName} aún no tiene campañas creadas en el proyecto "${selectedProjectName}".`;
    }

    return `${clientName} aún no tiene campañas creadas.`;
  };

  const getEmptyStateAction = () => {
    if (filterProject !== "all") {
      const selectedProject = projects.find((p) => p._id === filterProject);
      if (selectedProject) {
        return {
          label: "Ir al Proyecto",
          onClick: () => navigate(`/projects/${selectedProject._id}`),
          icon: faLayerGroup,
        };
      }
    }

    return {
      label: "Ver Proyectos",
      onClick: () => navigate(`/clients/${id}/projects`),
      icon: faLayerGroup,
    };
  };

  const filteredCampaigns = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const hasDates = !!startDate || !!endDate;
    const startTs = startDate ? new Date(startDate).getTime() : null;
    const endTs = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return campaigns.filter((campaign) => {
      const matchesSearch = q.length === 0 || campaign.name.toLowerCase().includes(q) || (campaign.description || "").toLowerCase().includes(q);

      const matchesStatus = filterStatus === "all" || campaign.status === filterStatus;

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

  // ---------- MODAL DINÁMICO PARA PageLayout ----------

  // Si estoy creando -> modal de creación
  // Si estoy editando -> modal de edición
  // Si ninguno -> undefined
  const activeModal = showCampaignModal
    ? {
        isOpen: true,
        onClose: closeCreateCampaignModal,
        title: "Nueva Campaña",
        subtitle: "Completa los datos para crear la campaña",
        size: "lg",
        actions: [
          {
            label: "Crear",
            onClick: () => document.querySelector<HTMLFormElement>("#campaign-form")?.requestSubmit(),
            variant: "primary" as const,
          },
          {
            label: "Cancelar",
            onClick: closeCreateCampaignModal,
            variant: "ghost" as const,
          },
        ],
        content: (
          <form id="campaign-form" onSubmit={submitCreateCampaign}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Proyecto *</label>
                  <select
                    required
                    value={campaignForm.projectId}
                    onChange={(e) =>
                      setCampaignForm((p) => ({
                        ...p,
                        projectId: e.target.value,
                      }))
                    }
                    className="input-field"
                  >
                    <option value="">Selecciona un proyecto</option>
                    {projects.map((project) => (
                      <option key={project._id} value={project._id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre de la Campaña *</label>
                  <input
                    type="text"
                    required
                    value={campaignForm.name}
                    onChange={(e) =>
                      setCampaignForm((p) => ({
                        ...p,
                        name: e.target.value,
                      }))
                    }
                    className="input-field"
                    placeholder="Ej: Campaña Black Friday 2024"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                  <textarea
                    value={campaignForm.description}
                    onChange={(e) =>
                      setCampaignForm((p) => ({
                        ...p,
                        description: e.target.value,
                      }))
                    }
                    rows={3}
                    className="input-field resize-none"
                    placeholder="Descripción de la campaña..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timeline *</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Inicio</label>
                      <input
                        type="date"
                        required
                        value={campaignForm.timeline.startDate}
                        onChange={(e) =>
                          setCampaignForm((p) => ({
                            ...p,
                            timeline: {
                              ...p.timeline,
                              startDate: e.target.value,
                            },
                          }))
                        }
                        className="input-field"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fin</label>
                      <input
                        type="date"
                        required
                        value={campaignForm.timeline.endDate}
                        onChange={(e) =>
                          setCampaignForm((p) => ({
                            ...p,
                            timeline: {
                              ...p.timeline,
                              endDate: e.target.value,
                            },
                          }))
                        }
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Objetivos</label>
                  <div className="space-y-2">
                    {campaignForm.objectives.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={o}
                          onChange={(e) =>
                            setCampaignForm((p) => ({
                              ...p,
                              objectives: p.objectives.map((x, idx) => (idx === i ? e.target.value : x)),
                            }))
                          }
                          className="input-field flex-1"
                          placeholder="Ej: Aumentar awareness de marca"
                        />
                        {campaignForm.objectives.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setCampaignForm((p) => ({
                                ...p,
                                objectives: p.objectives.filter((_, idx) => idx !== i),
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
                        setCampaignForm((p) => ({
                          ...p,
                          objectives: [...p.objectives, ""],
                        }))
                      }
                      className="text-primary-600 dark:text-primary-400 text-sm hover:text-primary-700 dark:hover:text-primary-300"
                    >
                      + Agregar objetivo
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Audiencia objetivo *</label>
                  <textarea
                    required
                    value={campaignForm.targetAudience}
                    onChange={(e) =>
                      setCampaignForm((p) => ({
                        ...p,
                        targetAudience: e.target.value,
                      }))
                    }
                    rows={2}
                    className="input-field resize-none"
                    placeholder="Describe el público objetivo..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Presupuesto (USD)</label>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Total</label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={campaignForm.budget.total}
                        onChange={(e) =>
                          setCampaignForm((p) => ({
                            ...p,
                            budget: {
                              ...p.budget,
                              total: Number(e.target.value),
                            },
                          }))
                        }
                        className="input-field"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Asignado</label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={campaignForm.budget.allocated}
                        onChange={(e) =>
                          setCampaignForm((p) => ({
                            ...p,
                            budget: {
                              ...p.budget,
                              allocated: Number(e.target.value),
                            },
                          }))
                        }
                        className="input-field"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Gastado</label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={campaignForm.budget.spent}
                        onChange={(e) =>
                          setCampaignForm((p) => ({
                            ...p,
                            budget: {
                              ...p.budget,
                              spent: Number(e.target.value),
                            },
                          }))
                        }
                        className="input-field"
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        ),
      }
    : showEditModal && editingCampaign
      ? {
          isOpen: true,
          onClose: closeEditCampaignModal,
          title: "Editar Campaña",
          subtitle: "Modifica los datos de la campaña",
          size: "lg",
          actions: [
            {
              label: "Actualizar",
              onClick: () => {
                const formEl = document.querySelector<HTMLFormElement>("#campaign-edit-form");
                formEl?.requestSubmit();
              },
              variant: "primary" as const,
            },
            {
              label: "Cancelar",
              onClick: closeEditCampaignModal,
              variant: "ghost" as const,
            },
          ],
          content: (
            <form id="campaign-edit-form" onSubmit={submitEditCampaign}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Nombre *</label>
                    <input className="input-field" required value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Descripción</label>
                    <textarea className="input-field resize-none" rows={3} value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Timeline *</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs mb-1">Inicio</label>
                        <input
                          type="date"
                          className="input-field"
                          required
                          value={editForm.timeline.startDate}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              timeline: {
                                ...p.timeline,
                                startDate: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Fin</label>
                        <input
                          type="date"
                          className="input-field"
                          required
                          value={editForm.timeline.endDate}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              timeline: {
                                ...p.timeline,
                                endDate: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Objetivos</label>
                    <div className="space-y-2">
                      {editForm.objectives.map((o, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            className="input-field flex-1"
                            value={o}
                            onChange={(e) =>
                              setEditForm((p) => ({
                                ...p,
                                objectives: p.objectives.map((x, idx) => (idx === i ? e.target.value : x)),
                              }))
                            }
                          />
                          {editForm.objectives.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditForm((p) => ({
                                  ...p,
                                  objectives: p.objectives.filter((_, idx) => idx !== i),
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
                          setEditForm((p) => ({
                            ...p,
                            objectives: [...p.objectives, ""],
                          }))
                        }
                        className="text-primary-600 dark:text-primary-400 text-sm"
                      >
                        + Agregar objetivo
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Audiencia objetivo *</label>
                    <textarea
                      className="input-field resize-none"
                      rows={2}
                      value={editForm.targetAudience}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          targetAudience: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Presupuesto (USD)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs mb-1">Total</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          className="input-field"
                          value={editForm.budget.total}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              budget: {
                                ...p.budget,
                                total: Number(e.target.value),
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Asignado</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          className="input-field"
                          value={editForm.budget.allocated}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              budget: {
                                ...p.budget,
                                allocated: Number(e.target.value),
                              },
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-xs mb-1">Gastado</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          className="input-field"
                          value={editForm.budget.spent}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              budget: {
                                ...p.budget,
                                spent: Number(e.target.value),
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          ),
        }
      : undefined;

  // ---------- RENDER ----------

  if (!id) {
    return (
      <EmptyState
        icon={faBullhorn}
        title="Cliente no válido"
        description="Selecciona un cliente para ver sus campañas."
        action={{
          label: "Ir a Clientes",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  if (loading) return <LoadingSpinner message="Cargando campañas del cliente..." />;

  const displayLogo = selectedClient?.brandKit?.logos?.[0]?.url || selectedClient?.brandKit?.logo;

  return (
    <PageLayout
      title="Campañas"
      faIcon={{ icon: faBullhorn }}
      subtitle={`Todas las campañas de ${selectedClient?.name || "este cliente"}`}
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
        <button onClick={openCreateCampaignModal} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
        </button>
      }
      modal={activeModal}
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar campañas por nombre o descripción..."
          filters={[
            {
              value: filterProject,
              onChange: handleProjectFilterChange,
              options: projectFilterOptions,
            },
            /*
            {
              value: filterStatus,
              onChange: setFilterStatus,
              options: [
                { value: "all", label: "Todos los estados" },
                { value: "draft", label: "Borrador" },
                { value: "active", label: "Activa" },
                { value: "paused", label: "Pausada" },
                { value: "completed", label: "Completada" },
                { value: "cancelled", label: "Cancelada" },
              ],
            },
            */
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
        {filteredCampaigns.map((campaign) => (
          <Card
            key={campaign._id}
            onClick={() => navigate(`/projects/${campaign.projectId}/campaigns/${campaign._id}`)}
            className="hover:scale-105 hover:shadow-lg transition-all duration-200"
            header={{
              title: `Campaña | ${campaign.name}`,
              subtitle: campaign.description,
              icon: faBullhorn,
              badges: [],
              breadcrumbs: {
                first: {
                  icon: faLayerGroup,
                  text: `Proyecto | ${campaign.projectName}`,
                  variant: "gray",
                },
              },
            }}
            footer={{
              leftContent: (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-500">{new Date(campaign.createdAt).toLocaleDateString()}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    {campaign.platforms.length} plataforma
                    {campaign.platforms.length !== 1 ? "s" : ""}
                  </div>
                </div>
              ),
              actions: [
                {
                  icon: faEdit,
                  onClick: (e) => {
                    e.stopPropagation();
                    openEditCampaignModal(campaign);
                  },
                  title: "Editar campaña",
                  variant: "default",
                },
                {
                  icon: faTrash,
                  onClick: (e) => {
                    e.stopPropagation();
                    handleDeleteCampaign(campaign);
                  },
                  title: "Eliminar campaña",
                  variant: "default",
                },
              ],
            }}
          >
            <div className="space-y-3">
              <div className="space-y-2">
                {campaign.objectives && campaign.objectives.length > 0 && (
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    {campaign.objectives.length} objetivo
                    {campaign.objectives.length !== 1 ? "s" : ""}
                  </div>
                )}

                {/*                 <div className="text-xs text-gray-500 dark:text-gray-500">Presupuesto: USD{(campaign.budget?.total ?? 0).toLocaleString()}</div> */}

                {campaign.timeline && (
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    {new Date(campaign.timeline.startDate).toLocaleDateString()} - {new Date(campaign.timeline.endDate).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
        <Card
          variant="create"
          onClick={openCreateCampaignModal}
          header={{
            title: "Nueva Campaña",
            subtitle: "Crear una nueva campaña para este cliente",
            icon: faBullhorn,
          }}
        />
      </div>

      {filteredCampaigns.length === 0 && <EmptyState icon={faBullhorn} title={hasActiveDate ? "Sin campañas en este rango" : "No hay campañas"} description={getEmptyStateMessage()} action={getEmptyStateAction()} />}
    </PageLayout>
  );
};
