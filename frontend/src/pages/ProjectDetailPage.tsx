import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { projectsAPI, Project, Client } from "../api/projects";
import { useAuthStore } from "../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";
import { emitCampaignsChanged } from "../utils/navbarEvents";

import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup, faBullseye, faDollarSign, faBullhorn, faPlus, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";

const HELP_KEY = "clientProjects" as const;

/* -------------------------------- Types / Helpers -------------------------------- */

// helper para resolver el clientId aunque venga populado
const getClientIdFromProject = (p: any): string | undefined => {
  if (typeof p?.clientId === "string") return p.clientId;
  if (typeof p?.clientId === "object" && p?.clientId?._id) return p.clientId._id;
  if (typeof p?.client === "string") return p.client;
  if (typeof p?.client === "object" && p?.client?._id) return p.client._id;
  return undefined;
};

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
  createdAt: string;
}

type ModalMode = "editProject" | "createCampaign" | "editCampaign" | null;

const statusText = (status: string) => {
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

const calcDuration = (startDate?: string, endDate?: string) => {
  if (!startDate || !endDate) return "—";
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return `${diffDays} días`;
};

/* -------------------------------- Component -------------------------------- */

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { token, tenantId } = useAuthStore();

  // data
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  const [loading, setLoading] = useState(true);

  // search + date filter (Campañas)
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD

  // info modal (ⓘ)
  const [openInfo, setOpenInfo] = useState(false);

  // project details modal
  const [showProjectDetails, setShowProjectDetails] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  // action modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);

  // form states
  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    objectives: [""],
    targetAudience: "",
    budget: { total: 0 },
  });

  const [campaignForm, setCampaignForm] = useState({
    _id: "" as string | "",
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
  });

  /* ------------------------------ Fetchers ------------------------------- */

  const fetchClientById = async (id: string) => {
    try {
      const data = await projectsAPI.getClient(id);
      setClient(data);
    } catch (error) {
      console.error("Error fetching client:", error);
      setClient(null);
    }
  };

  const fetchProject = async () => {
    const data = await projectsAPI.getProject(projectId!);
    setProject(data);
    setProjectForm({
      name: data.name,
      description: data.description || "",
      objectives: data.objectives?.length ? data.objectives : [""],
      targetAudience: data.targetAudience || "",
      budget: { total: data.budget?.total || 0 },
    });

    // si viene populado, evitamos otra request
    if (data && typeof (data as any).client === "object") {
      setClient((data as any).client);
    } else if (data && typeof (data as any).clientId === "object") {
      setClient((data as any).clientId);
    }

    // resolvemos el id string para llamadas adicionales
    const clientIdStr = getClientIdFromProject(data);
    if (clientIdStr) {
      if (!client) await fetchClientById(clientIdStr);
    }
  };

  const fetchCampaigns = async () => {
    const data = await projectsAPI.getProjectCampaigns(projectId!);
    setCampaigns(data);
  };

  /* ------------------------------- Effects ------------------------------- */

  useEffect(() => {
    if (!projectId || !token) return; // evita 401 mientras se hidrata auth
    (async () => {
      try {
        await Promise.all([fetchProject(), fetchCampaigns()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, token]);

  /* ------------------------------ Derived UI ----------------------------- */

  const filteredCampaigns = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const hasDates = !!startDate || !!endDate;
    const startTs = startDate ? new Date(startDate).getTime() : null;
    const endTs = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return campaigns.filter((c) => {
      // texto
      const textOk = !q || c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q);

      // fecha (por createdAt)
      let dateOk = true;
      if (hasDates) {
        const t = c.createdAt ? new Date(c.createdAt).getTime() : NaN;
        if (Number.isNaN(t)) return false;
        if (startTs !== null) dateOk = dateOk && t >= startTs;
        if (endTs !== null) dateOk = dateOk && t <= endTs;
      }

      return textOk && dateOk;
    });
  }, [campaigns, searchTerm, startDate, endDate]);

  const hasActiveDate = !!startDate || !!endDate;

  /* ------------------------------- Actions -------------------------------- */

  const openEditProject = () => {
    if (!project) return;
    setModalMode("editProject");
    setShowModal(true);
  };

  const openProjectDetails = () => {
    setShowProjectDetails(true);
  };

  const closeProjectDetails = () => {
    setShowProjectDetails(false);
  };

  const openCreateCampaign = () => {
    setCampaignForm({
      _id: "",
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
    });
    setModalMode("createCampaign");
    setShowModal(true);
  };

  const openEditCampaign = (c: Campaign) => {
    setCampaignForm({
      _id: c._id,
      name: c.name,
      description: c.description || "",
      objectives: c.objectives?.length ? c.objectives : [""],
      targetAudience: c.targetAudience || "",
      status: c.status,
      budget: {
        total: c.budget?.total ?? 0,
        allocated: c.budget?.allocated ?? 0,
        spent: c.budget?.spent ?? 0,
      },
      timeline: {
        startDate: new Date(c.timeline.startDate).toISOString().split("T")[0],
        endDate: new Date(c.timeline.endDate).toISOString().split("T")[0],
      },
      platforms: c.platforms || [],
    });
    setModalMode("editCampaign");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMode(null);
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    const result = await sweetAlert.confirm("¿Eliminar campaña?", "Esta acción no se puede deshacer.");
    if (!result.isConfirmed) return;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/campaigns/${campaignId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenantId },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "No se pudo eliminar la campaña");
      }

      sweetAlert.success("Campaña eliminada", "La campaña fue eliminada correctamente");
      emitCampaignsChanged("delete", campaignId);
      fetchCampaigns();
    } catch (error: any) {
      console.error("Error deleting campaign:", error);
      sweetAlert.error("Error", error?.message || "No se pudo eliminar la campaña");
    }
  };

  /* ------------------------------- Submitters ----------------------------- */

  const submitEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    try {
      const payload = {
        ...projectForm,
        objectives: projectForm.objectives.filter((o) => o.trim()),
        budget: projectForm.budget.total > 0 ? projectForm.budget : undefined,
      };

      await projectsAPI.updateProject(project._id, payload);
      sweetAlert.success("Proyecto actualizado", "Los cambios se han guardado correctamente");
      closeModal();
      await fetchProject(); // refresca también cliente y briefs
    } catch (error) {
      console.error("Error updating project:", error);
      sweetAlert.error("Error", "No se pudo actualizar el proyecto");
    }
  };

  const submitCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const clientIdResolved = getClientIdFromProject(project || {});
      // ⚠️ armamos payload whitelisted (sin _id ni campos vacíos)
      const payload = {
        name: campaignForm.name.trim(),
        description: campaignForm.description?.trim() || undefined,
        objectives: campaignForm.objectives.map((o) => o.trim()).filter(Boolean),
        targetAudience: campaignForm.targetAudience.trim(),
        status: campaignForm.status || "draft",
        // timeline en ISO
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
        projectId,
        ...(clientIdResolved ? { clientId: clientIdResolved } : {}),
      };

      await projectsAPI.createProjectCampaign(projectId!, payload);
      sweetAlert.success("Campaña creada", "La campaña se ha creado correctamente");
      closeModal();
      await Promise.all([fetchCampaigns(), fetchProject()]);
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      const msg = error?.response?.data?.error || error?.response?.data?.message || error?.message || "No se pudo crear la campaña";
      sweetAlert.error("Error", msg);
    }
  };

  const submitEditCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...campaignForm,
        objectives: campaignForm.objectives.filter((o) => o.trim()),
        timeline: {
          startDate: new Date(campaignForm.timeline.startDate).toISOString(),
          endDate: new Date(campaignForm.timeline.endDate).toISOString(),
        },
      };

      const response = await fetch(`${import.meta.env.VITE_API_URL}/campaigns/${campaignForm._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Error al actualizar campaña");

      sweetAlert.success("Campaña actualizada", "Los cambios se han guardado correctamente");
      closeModal();
      fetchCampaigns();
    } catch (error) {
      console.error("Error updating campaign:", error);
      sweetAlert.error("Error", "No se pudo actualizar la campaña");
    }
  };

  /* --------------------------------- UI ---------------------------------- */

  if (!projectId) {
    return (
      <EmptyState
        icon={faLayerGroup}
        title="Proyecto no válido"
        description="Parece que el enlace no es correcto."
        action={{
          label: "Volver a Clientes",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  if (loading) return <LoadingSpinner message="Cargando proyecto..." />;

  if (!project) {
    return (
      <EmptyState
        icon={faLayerGroup}
        title="Proyecto no encontrado"
        description="No pudimos encontrar el proyecto solicitado."
        action={{
          label: "Volver a Clientes",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  const modalTitle = modalMode === "editProject" ? "Editar Proyecto" : modalMode === "editCampaign" ? "Editar Campaña" : "Nueva Campaña";
  const modalPrimary = modalMode === "editProject" ? "Actualizar" : modalMode === "editCampaign" ? "Actualizar" : "Crear";
  const modalSubtitle = modalMode === "editProject" ? "Actualiza los datos del proyecto" : modalMode === "editCampaign" ? "Modifica los datos de la campaña" : "Completa los datos para crear la campaña";

  const handleModalPrimary = () => {
    const form = document.querySelector<HTMLFormElement>("#pd-modal-form");
    form?.requestSubmit();
  };

  return (
    <PageLayout
      title={`Proyecto | ${project.name}`}
      badge={{ text: "Proyecto", variant: "default" }}
      faIcon={{ icon: faLayerGroup }}
      clientMiniAvatar={{
        src: undefined,
        alt: client?.name ? `${client.name} logo` : undefined,
        fallback: client?.name?.charAt(0)?.toUpperCase?.() || "?",
        label: client?.name,
      }}
      subtitle={project.description || "Detalle del proyecto"}
      onBack={() => navigate(-1)}
      showInfoIcon
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
        <div className="flex items-center gap-2">
          <button onClick={openProjectDetails} className="btn-secondary flex items-center justify-center text-sm px-3 gap-2">
            <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
          <button onClick={openEditProject} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
            <FontAwesomeIcon icon={faEdit} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
        </div>
      }
      preSearchContent={null}
      faIconSecondary={{ icon: faBullhorn }}
      preSearchTitle={`Campañas`}
      preSearchActions={
        <button onClick={openCreateCampaign} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
        </button>
      }
      searchAndFilters={
        campaigns.length > 0 ? (
          <>
            {/*             <div className="hidden md:block text-xs text-gray-500 dark:text-gray-500 mb-2">Campañas: {filteredCampaigns.length}</div> */}
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar campañas del proyecto..."
              filters={[]}
              dateFilter={{
                startDate,
                endDate,
                onStartDateChange: setStartDate,
                onEndDateChange: setEndDate,
              }}
            />
          </>
        ) : undefined
      }
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: modalTitle,
        subtitle: modalSubtitle,
        size: "lg",
        actions: [
          { label: modalPrimary, onClick: handleModalPrimary, variant: "primary" as const },
          { label: "Cancelar", onClick: closeModal, variant: "ghost" as const },
        ],
        content: (
          <form id="pd-modal-form" onSubmit={modalMode === "editProject" ? submitEditProject : modalMode === "createCampaign" ? submitCreateCampaign : submitEditCampaign}>
            {modalMode === "editProject" && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                  <input type="text" required value={projectForm.name} onChange={(e) => setProjectForm((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Nombre del proyecto" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                  <textarea value={projectForm.description} onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del proyecto..." />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Objetivos</label>
                  <div className="space-y-2">
                    {projectForm.objectives.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={o}
                          onChange={(e) =>
                            setProjectForm((p) => ({
                              ...p,
                              objectives: p.objectives.map((x, idx) => (idx === i ? e.target.value : x)),
                            }))
                          }
                          className="input-field flex-1"
                          placeholder="Ej: Aumentar awareness de marca"
                        />
                        {projectForm.objectives.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setProjectForm((p) => ({
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
                    <button type="button" onClick={() => setProjectForm((p) => ({ ...p, objectives: [...p.objectives, ""] }))} className="text-primary-600 dark:text-primary-400 text-sm hover:text-primary-700 dark:hover:text-primary-300">
                      + Agregar objetivo
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Audiencia objetivo</label>
                  <textarea value={projectForm.targetAudience} onChange={(e) => setProjectForm((p) => ({ ...p, targetAudience: e.target.value }))} rows={2} className="input-field resize-none" placeholder="Describe el público objetivo..." />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Presupuesto total (USD)</label>
                  <input type="number" min="0" step="100" value={projectForm.budget.total} onChange={(e) => setProjectForm((p) => ({ ...p, budget: { total: Number(e.target.value) } }))} className="input-field" placeholder="0" />
                </div>
              </div>
            )}

            {(modalMode === "createCampaign" || modalMode === "editCampaign") && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Columna izquierda */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre de la Campaña *</label>
                    <input type="text" required value={campaignForm.name} onChange={(e) => setCampaignForm((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Ej: Campaña Black Friday 2024" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                    <textarea value={campaignForm.description} onChange={(e) => setCampaignForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción de la campaña..." />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timeline *</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Inicio</label>
                        <input type="date" required value={campaignForm.timeline.startDate} onChange={(e) => setCampaignForm((p) => ({ ...p, timeline: { ...p.timeline, startDate: e.target.value } }))} className="input-field" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Fin</label>
                        <input type="date" required value={campaignForm.timeline.endDate} onChange={(e) => setCampaignForm((p) => ({ ...p, timeline: { ...p.timeline, endDate: e.target.value } }))} className="input-field" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Columna derecha */}
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
                      <button type="button" onClick={() => setCampaignForm((p) => ({ ...p, objectives: [...p.objectives, ""] }))} className="text-primary-600 dark:text-primary-400 text-sm hover:text-primary-700 dark:hover:text-primary-300">
                        + Agregar objetivo
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Audiencia objetivo *</label>
                    <textarea required value={campaignForm.targetAudience} onChange={(e) => setCampaignForm((p) => ({ ...p, targetAudience: e.target.value }))} rows={2} className="input-field resize-none" placeholder="Describe el público objetivo..." />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Presupuesto (USD)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Total</label>
                        <input type="number" min="0" step="100" value={campaignForm.budget.total} onChange={(e) => setCampaignForm((p) => ({ ...p, budget: { ...p.budget, total: Number(e.target.value) } }))} className="input-field" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Asignado</label>
                        <input type="number" min="0" step="100" value={campaignForm.budget.allocated} onChange={(e) => setCampaignForm((p) => ({ ...p, budget: { ...p.budget, allocated: Number(e.target.value) } }))} className="input-field" placeholder="0" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Gastado</label>
                        <input type="number" min="0" step="100" value={campaignForm.budget.spent} onChange={(e) => setCampaignForm((p) => ({ ...p, budget: { ...p.budget, spent: Number(e.target.value) } }))} className="input-field" placeholder="0" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>
        ),
      }}
    >
      {/* --------------------------- Campaigns Grid --------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-4mt-2 mt-3">
        {/* Nueva Campaña */}

        {filteredCampaigns.map((c) => (
          <Card
            key={c._id}
            onClick={() => navigate(`/projects/${projectId}/campaigns/${c._id}`)}
            className="hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
            header={{
              title: `Campaña | ${c.name}`,
              subtitle: c.description,
              icon: faBullhorn,
              badges: [],
            }}
            footer={{
              leftContent: (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    {c.platforms.length} plataforma{c.platforms.length !== 1 ? "s" : ""}
                  </div>
                </div>
              ),
              actions: [
                {
                  icon: faEdit,
                  onClick: (e) => {
                    e.stopPropagation();
                    openEditCampaign(c);
                  },
                  title: "Editar campaña",
                  variant: "default" as const,
                },
                {
                  icon: faTrash,
                  onClick: (e) => {
                    e.stopPropagation();
                    handleDeleteCampaign(c._id);
                  },
                  title: "Eliminar campaña",
                  variant: "default" as const,
                },
              ],
            }}
          >
            <div className="space-y-2">
              {!!c.objectives?.length && (
                <div className="text-xs text-gray-500 dark:text-gray-500">
                  {c.objectives.length} objetivo{c.objectives.length !== 1 ? "s" : ""}
                </div>
              )}
              {/*               <div className="text-xs text-gray-500 dark:text-gray-500">Presupuesto: USD{(c.budget?.total ?? 0).toLocaleString()}</div> */}
              <div className="text-xs text-gray-500 dark:text-gray-500">Duración: {calcDuration(c.timeline?.startDate, c.timeline?.endDate)}</div>
            </div>
          </Card>
        ))}
        <Card
          variant="create"
          onClick={openCreateCampaign}
          header={{
            title: "Nueva Campaña",
            subtitle: "Crear una nueva campaña para este proyecto",
            icon: faPlus,
          }}
        />
      </div>

      {/* Empty states */}
      {campaigns.length === 0 && <EmptyState icon={faBullhorn} title="No hay campañas" description='Usa la card "Nueva Campaña" para crear tu primera campaña.' action={{ label: "Nueva Campaña", onClick: openCreateCampaign, icon: faPlus }} />}

      {campaigns.length > 0 && filteredCampaigns.length === 0 && <EmptyState icon={faBullhorn} title={hasActiveDate ? "Sin campañas en este rango" : "Sin coincidencias"} description={hasActiveDate ? `No se encontraron campañas ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : "Ajustá el texto de búsqueda para ver resultados."} />}

      {/* Project Details Modal */}
      {showProjectDetails && (
        <div className="fixed inset-0 overflow-y-auto" style={{ zIndex: 60 }}>
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition duration-200 h-vh" onClick={closeProjectDetails} />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 sticky top-0 z-10">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalle del Proyecto</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Información completa de {project.name}</p>
                </div>
                <button onClick={closeProjectDetails} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar">
                  <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Objetivos / Público */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faBullseye} className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Objetivos / Público</h3>
                  </div>
                  {project.objectives?.length ? (
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Objetivos</label>
                        <ul className="mt-2 space-y-2">
                          {project.objectives?.map((o, i) => (
                            <li key={i} className="text-sm text-gray-900 dark:text-white flex items-start">
                              <span className="w-1.5 h-1.5 bg-primary-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                              {o}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {project.targetAudience && (
                        <div>
                          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Audiencia</label>
                          <p className="text-sm text-gray-900 dark:text-white mt-2 leading-relaxed">{project.targetAudience}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-500">No hay objetivos definidos</p>
                  )}
                </div>

                {/* Presupuesto */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faDollarSign} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Presupuesto</h3>
                  </div>
                  {project.budget?.total ? (
                    <div className="text-center py-4">
                      <p className="text-4xl font-bold text-gray-900 dark:text-white">USD{(project.budget.total ?? 0).toLocaleString()}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Total del proyecto</p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-500">Presupuesto no definido</p>
                  )}
                </div>

                {/* Estadísticas */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Estadísticas</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{campaigns.length}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Campañas</p>
                    </div>

                    <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{new Date(project.createdAt).toLocaleDateString()}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Creado</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 sticky bottom-0">
                <button onClick={closeProjectDetails} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cerrar
                </button>
                <button
                  onClick={() => {
                    closeProjectDetails();
                    openEditProject();
                  }}
                  className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
                >
                  <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                  Editar Proyecto
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
