import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { projectsAPI, Project } from "../api/projects";
import { Card } from "../components/ui/Card";
import { PageLayout } from "../components/ui/PageLayout";
import { sweetAlert } from "../utils/sweetAlert";
import { emitPostsChanged } from "../utils/navbarEvents";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullhorn, faEdit, faCalendar, faDollarSign, faList, faPaperPlane, faPlus, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { CampaignLaunchBoard } from "../components/CampaignLaunchBoard";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { PostFormModal } from "../components/ui/PostFormModal";
import { prepareSavePayload } from "../utils/postDataMigration";

const HELP_KEY = "campaignDetail" as const;

type CampaignStatus = "draft" | "active" | "paused" | "completed" | "cancelled";

interface Campaign {
  _id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  budget: { total: number; allocated: number; spent: number };
  timeline: { startDate: string; endDate: string };
  platforms: string[];
  objectives?: string[];
  targetAudience?: string;
  kpis?: { name: string; target: number; current: number; unit: string }[];
  createdAt: string;
  projectId?: string | { _id: string };
  clientId?: string | { _id: string; name?: string; brandKit?: { logo?: string } } | null;
}

const formatEUR = (n: number) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(n ?? 0);

const durationDays = (a?: string, b?: string) => {
  if (!a || !b) return "—";
  const s = new Date(a).getTime();
  const e = new Date(b).getTime();
  const d = Math.max(0, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
  return `${d} días`;
};

const getStatusText = (status: CampaignStatus): string => {
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

// Resuelve http(s), data URLs y rutas relativas contra VITE_ASSETS_URL (con/sin barra final/inicial)
const resolveAssetUrl = (input?: string) => {
  if (!input) return undefined;
  if (/^(https?:)?\/\//i.test(input) || input.startsWith("data:")) return input;
  const base = (import.meta.env.VITE_ASSETS_URL ?? "").replace(/\/+$/g, "");
  const path = String(input).replace(/^\/+/g, "");
  return base ? `${base}/${path}` : `/${path}`;
};

export const CampaignDetailPage: React.FC = () => {
  const { projectId, campaignId } = useParams<{
    projectId: string;
    campaignId: string;
  }>();
  const navigate = useNavigate();
  const { token, tenantId } = useAuthStore();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [openInfo, setOpenInfo] = useState(false);

  // campaign details modal
  const [showCampaignDetails, setShowCampaignDetails] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  // Posts states
  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [editInitialData, setEditInitialData] = useState<any>(null);

  // modal editar campaña
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "draft" as CampaignStatus,
    timeline: {
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    },
    objectives: [""],
    targetAudience: "",
    budget: { total: 0, allocated: 0, spent: 0 },
    platforms: [] as string[],
  });

  const fetchCampaign = async () => {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/campaigns/${campaignId}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenantId },
    });
    if (!res.ok) throw new Error("No se pudo cargar la campaña");
    const data: Campaign = await res.json();
    setCampaign(data);

    // Si la campaña trae clientId (objeto o string), setear cliente o pedirlo
    const rawClient = data.clientId ?? null;
    if (rawClient && typeof rawClient === "object") {
      setClient(rawClient);
    } else if (typeof rawClient === "string") {
      try {
        const fullClient = await projectsAPI.getClient(rawClient);
        setClient(fullClient);
      } catch {
        // no bloquea la vista
      }
    }

    setForm({
      name: data.name || "",
      description: data.description || "",
      status: (data.status as CampaignStatus) || "draft",
      timeline: {
        startDate: new Date(data.timeline?.startDate ?? Date.now()).toISOString().split("T")[0],
        endDate: new Date(data.timeline?.endDate ?? Date.now()).toISOString().split("T")[0],
      },
      objectives: data.objectives?.length ? data.objectives : [""],
      targetAudience: data.targetAudience || "",
      budget: {
        total: data.budget?.total ?? 0,
        allocated: data.budget?.allocated ?? 0,
        spent: data.budget?.spent ?? 0,
      },
      platforms: Array.isArray(data.platforms) ? data.platforms : [],
    });
  };

  const fetchProjectAndClient = async () => {
    if (!projectId) return;

    const p = await projectsAPI.getProject(projectId);
    setProject(p);

    const rawClient = (p as any).client ?? (p as any).clientId;
    if (rawClient && typeof rawClient === "object") {
      setClient(rawClient);
    } else if (typeof rawClient === "string") {
      try {
        const fullClient = await projectsAPI.getClient(rawClient);
        setClient(fullClient);
      } catch {
        // si falla, no rompemos la página
      }
    }
  };

  useEffect(() => {
    if (!campaignId || !token) return;
    (async () => {
      try {
        setLoading(true);
        await Promise.all([fetchCampaign(), fetchProjectAndClient()]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, projectId, token]);

  const handleOpenEdit = () => setShowModal(true);

  const openCampaignDetails = () => {
    setShowCampaignDetails(true);
  };

  const closeCampaignDetails = () => {
    setShowCampaignDetails(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaign) return;

    const payload = {
      ...form,
      objectives: form.objectives.filter((o) => o.trim()),
      timeline: {
        startDate: new Date(form.timeline.startDate).toISOString(),
        endDate: new Date(form.timeline.endDate).toISOString(),
      },
    };

    console.log("Updating campaign with payload:", payload);

    const res = await fetch(`${import.meta.env.VITE_API_URL}/campaigns/${campaign._id}`, {
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
      console.log("Campaign updated successfully:", updatedCampaign);
      sweetAlert.success("Campaña actualizada", "Los cambios se han guardado correctamente");
      setShowModal(false);
      await fetchCampaign();
    } else {
      const errorData = await res.json().catch(() => ({}));
      console.error("Error updating campaign:", errorData);
      sweetAlert.error("Error", errorData.error || "No se pudo actualizar la campaña");
    }
  };

  const handleCreatePost = () => {
    setEditingPost(null);
    setEditInitialData(null);
    setShowPostModal(true);
  };

  const handleEditPost = (post: any) => {
    setEditingPost(post);
    setEditInitialData({
      title: post.title || "",
      postType: post.postType || "social",
      contentFormat: post.contentFormat,
      channel: post.channel,
      channels: post.channels || [],
      channelConfig: post.channelConfig || {},
      content: {
        copy: post.content?.copy || "",
        hashtags: post.content?.hashtags || [],
        mentions: post.content?.mentions || [],
      },
      platforms: post.platforms || [],
      status: post.status || "draft",
      scheduling: {
        publishAt: post.scheduling?.publishAt ? new Date(post.scheduling.publishAt).toISOString().slice(0, 16) : "",
        timezone: post.scheduling?.timezone || "UTC",
        isScheduled: post.scheduling?.isScheduled || false,
        recurrence: post.scheduling?.recurrence,
      },
      media: post.media || [],
      usedAssets: post.usedAssets || [],
    });
    setShowPostModal(true);
  };

  const handleSavePost = async (postData: any) => {
    if (!campaign) return;

    try {
      let newImageUrls: string[] = [];
      const selectedAssetIds = postData.selectedAssetIds || [];
      let galleryImageUrls: string[] = [];

      if (postData.imageFiles && postData.imageFiles.length > 0) {
        const uploadedImages = [];

        for (const file of postData.imageFiles) {
          const formData = new FormData();
          formData.append("file", file);

          const uploadResponse = await fetch(`${import.meta.env.VITE_API_URL}/client-assets/posts/upload?clientId=${postData.clientId || campaign.clientId}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Tenant-Id": tenantId,
            },
            body: formData,
          });

          if (!uploadResponse.ok) {
            sweetAlert.error("Error", "No se pudo subir una de las imágenes");
            return;
          }

          const uploadResult = await uploadResponse.json();
          uploadedImages.push(uploadResult);
        }

        newImageUrls = uploadedImages.map((img: any) => img.url);
      }

      if (selectedAssetIds.length > 0) {
        try {
          const assetsResponse = await fetch(`${import.meta.env.VITE_API_URL}/client-assets/query?clientId=${postData.clientId || campaign.clientId}&limit=1000`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Tenant-Id": tenantId,
            },
          });

          if (assetsResponse.ok) {
            const assetsData = await assetsResponse.json();
            const selectedAssets = assetsData.assets?.filter((asset: any) => selectedAssetIds.includes(asset._id)) || [];
            galleryImageUrls = selectedAssets.map((asset: any) => asset.url);
            console.log(`Assets de galería encontrados: ${galleryImageUrls.length}`);
          }
        } catch (error) {
          console.error("Error fetching gallery image URLs:", error);
        }
      }

      if (editingPost) {
        // existingImageUrls now represents the images that should remain (user didn't delete them)
        const existingUrls = postData.existingImageUrls || [];
        const allImageUrls = [...existingUrls, ...newImageUrls, ...galleryImageUrls];

        console.log("[CampaignDetail] Update - Existing URLs:", existingUrls.length);
        console.log("[CampaignDetail] Update - New uploaded:", newImageUrls.length);
        console.log("[CampaignDetail] Update - Gallery images:", galleryImageUrls.length);
        console.log("[CampaignDetail] Update - Total images:", allImageUrls.length);
        console.log("[CampaignDetail] Update - Asset IDs:", selectedAssetIds);

        const preparedData = prepareSavePayload(postData);

        const payload = {
          ...preparedData,
          scheduling: postData.scheduling.isScheduled
            ? {
                ...postData.scheduling,
                publishAt: new Date(postData.scheduling.publishAt).toISOString(),
              }
            : {
                timezone: postData.scheduling.timezone,
                isScheduled: false,
              },
          media: allImageUrls.length > 0 ? [{ type: "image", urls: allImageUrls }] : [],
          usedAssets: selectedAssetIds,
        };

        delete payload.imageFiles;
        delete payload.existingImageUrls;
        delete payload.campaignId;
        delete payload.clientId;
        delete payload.publishImmediately;
        delete payload.selectedAssetIds;

        const response = await fetch(`${import.meta.env.VITE_API_URL}/posts/${editingPost._id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          sweetAlert.success("Post actualizado", "Los cambios se han guardado correctamente");
          emitPostsChanged("update", editingPost._id, campaign?.clientId);
          setShowPostModal(false);
          setEditingPost(null);
          setEditInitialData(null);
          window.location.reload();
        } else {
          sweetAlert.error("Error", "No se pudo actualizar el post");
        }
      } else {
        const allImageUrls = [...newImageUrls, ...galleryImageUrls];

        const preparedData = prepareSavePayload(postData);

        const payload = {
          ...preparedData,
          media: allImageUrls.length > 0 ? [{ type: "image", urls: allImageUrls }] : [],
          selectedAssetIds,
        };

        delete payload.imageFiles;
        delete payload.existingImageUrls;

        const response = await fetch(`${import.meta.env.VITE_API_URL}/posts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const newPost = await response.json();
          sweetAlert.success("Post creado", "El post ha sido creado correctamente");
          emitPostsChanged("create", newPost._id, campaign?.clientId);
          setShowPostModal(false);
          window.location.reload();
        } else {
          sweetAlert.error("Error", "No se pudo crear el post");
        }
      }
    } catch (error) {
      console.error("Error saving post:", error);
      sweetAlert.error("Error", "No se pudo guardar el post");
    }
  };

  if (!campaignId) {
    return (
      <PageLayout title="Campaña no válida">
        <div className="text-center">
          <button onClick={() => navigate("/clients")} className="btn-primary">
            Volver
          </button>
        </div>
      </PageLayout>
    );
  }

  // Intentamos logo en brandKit.logos[0].url o logo "plano"
  const logoSrc = resolveAssetUrl(client?.brandKit?.logos?.[0]?.url ?? client?.logo);

  return (
    <PageLayout
      title={`Campaña | ${campaign?.name}`}
      badge={{ text: project?.name ?? "", variant: "default" }}
      badgeSecondary={{ text: "Campaña", variant: "default" }}
      /* badgeState={campaign ? { text: getStatusText(campaign.status), variant: "default" } : undefined} */
      faIcon={{ icon: faBullhorn }}
      clientMiniAvatar={{
        src: logoSrc,
        alt: client?.name ? `${client.name} logo` : undefined,
        fallback: client?.name?.charAt(0)?.toUpperCase?.() || "?",
        label: client?.name,
      }}
      subtitle={campaign?.description || "Detalle de campaña"}
      onBack={() => navigate(-1)}
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
        campaign ? (
          <div className="flex gap-2">
            <button onClick={openCampaignDetails} className="btn-secondary flex items-center gap-2 text-sm px-3">
              <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
            </button>
            <button onClick={handleOpenEdit} className="btn-primary flex items-center gap-2 text-sm px-3">
              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
            </button>
          </div>
        ) : undefined
      }
      preSearchContent={null}
      faIconSecondary={{ icon: faPaperPlane }}
      preSearchTitle="Publicaciones"
      preSearchActions={
        <button onClick={handleCreatePost} className="btn-primary flex items-center justify-center text-sm p-2 gap-2 ">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
        </button>
      }
      searchAndFilters={
        posts.length > 0 ? (
          <>
            {/* <div className="hidden md:block text-xs text-gray-500 dark:text-gray-500 mb-2">Posts: {posts.length}</div> */}
            <SearchAndFilters
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Buscar posts por título o contenido..."
              /* filters={[
                {
                  value: filterStatus,
                  onChange: setFilterStatus,
                  options: [
                    { value: "all", label: "Todos los estados" },
                    { value: "draft", label: "Borrador" },
                    { value: "pending_approval", label: "Pendiente" },
                    { value: "approved", label: "Aprobado" },
                    { value: "scheduled", label: "Programado" },
                    { value: "published", label: "Publicado" },
                    { value: "rejected", label: "Rechazado" },
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
          </>
        ) : undefined
      }
      modal={
        showModal
          ? {
              isOpen: true,
              onClose: () => setShowModal(false),
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
                  variant: "primary",
                },
                {
                  label: "Cancelar",
                  onClick: () => setShowModal(false),
                  variant: "ghost",
                },
              ],
              content: (
                <form id="campaign-edit-form" onSubmit={handleSubmit}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-medium mb-2">Nombre *</label>
                        <input
                          className="input-field"
                          required
                          value={form.name}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              name: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Descripción</label>
                        <textarea
                          className="input-field resize-none"
                          rows={3}
                          value={form.description}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              description: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Estado</label>
                        <select
                          className="input-field"
                          value={form.status}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              status: e.target.value as CampaignStatus,
                            }))
                          }
                        >
                          <option value="draft">Borrador</option>
                          <option value="active">Activa</option>
                          <option value="paused">Pausada</option>
                          <option value="completed">Completada</option>
                          <option value="cancelled">Cancelada</option>
                        </select>
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
                              value={form.timeline.startDate}
                              onChange={(e) =>
                                setForm((p) => ({
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
                              value={form.timeline.endDate}
                              onChange={(e) =>
                                setForm((p) => ({
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
                          {form.objectives.map((o, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <input
                                className="input-field flex-1"
                                value={o}
                                onChange={(e) =>
                                  setForm((p) => ({
                                    ...p,
                                    objectives: p.objectives.map((x, idx) => (idx === i ? e.target.value : x)),
                                  }))
                                }
                              />
                              {form.objectives.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setForm((p) => ({
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
                              setForm((p) => ({
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
                          value={form.targetAudience}
                          onChange={(e) =>
                            setForm((p) => ({
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
                              value={form.budget.total}
                              onChange={(e) =>
                                setForm((p) => ({
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
                              value={form.budget.allocated}
                              onChange={(e) =>
                                setForm((p) => ({
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
                              value={form.budget.spent}
                              onChange={(e) =>
                                setForm((p) => ({
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

                      <div>
                        <label className="block text-sm font-medium mb-2">Plataformas</label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube", "google-ads"].map((platform) => (
                            <label key={platform} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={form.platforms.includes(platform)}
                                onChange={() =>
                                  setForm((p) => ({
                                    ...p,
                                    platforms: p.platforms.includes(platform) ? p.platforms.filter((x) => x !== platform) : [...p.platforms, platform],
                                  }))
                                }
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-sm capitalize">{platform}</span>
                            </label>
                          ))}
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
      <CampaignLaunchBoard
        campaignId={campaign?._id}
        onOpenDeliverable={(id) => {
          // si mañana querés navegar a un detalle de entregable:
          // navigate(`/projects/${projectId}/campaigns/${campaignId}/deliverables/${id}`);
          console.log("open deliverable", id);
        }}
        posts={posts}
        setPosts={setPosts}
        loading={postsLoading}
        setLoading={setPostsLoading}
        searchTerm={searchTerm}
        filterStatus={filterStatus}
        startDate={startDate}
        endDate={endDate}
        onCreatePost={handleCreatePost}
        onEditPost={handleEditPost}
      />

      {showPostModal && (
        <PostFormModal
          isOpen={showPostModal}
          onClose={() => {
            setShowPostModal(false);
            setEditingPost(null);
            setEditInitialData(null);
          }}
          onSave={handleSavePost}
          initialData={editInitialData}
          mode={editingPost ? "edit" : "create"}
          campaignContext={
            campaign && project
              ? {
                  campaignId: campaign._id,
                  campaignName: campaign.name,
                  projectId: project._id,
                  projectName: project.name,
                  clientId: typeof campaign.clientId === "string" ? campaign.clientId : campaign.clientId?._id || "",
                }
              : undefined
          }
        />
      )}

      {/* Campaign Details Modal */}
      {showCampaignDetails && campaign && (
        <div className="fixed inset-0 overflow-y-auto" style={{ zIndex: 60 }}>
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition duration-200 h-vh" onClick={closeCampaignDetails} />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 sticky top-0 z-10">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalle de la Campaña</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Información completa de {campaign.name}</p>
                </div>
                <button onClick={closeCampaignDetails} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar">
                  <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-6">
                {/* Timeline */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faCalendar} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Timeline</h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Inicio</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{new Date(campaign.timeline.startDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fin</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{new Date(campaign.timeline.endDate).toLocaleDateString()}</p>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Duración</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{durationDays(campaign.timeline.startDate, campaign.timeline.endDate)}</p>
                    </div>
                    <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Estado</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{getStatusText(campaign.status)}</p>
                    </div>
                  </div>
                </div>

                {/* Presupuesto */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faDollarSign} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Presupuesto</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Total</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatEUR(campaign.budget.total)}</p>
                    </div>
                    <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Asignado</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatEUR(campaign.budget.allocated)}</p>
                    </div>
                    <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Gastado</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatEUR(campaign.budget.spent)}</p>
                    </div>
                  </div>
                </div>

                {/* Contenido */}
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faList} className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Contenido</h3>
                  </div>

                  <div className="space-y-4">
                    {/* Objetivos */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Objetivos</label>
                      {campaign.objectives?.length ? (
                        <ul className="mt-2 space-y-2">
                          {campaign.objectives.map((o, i) => (
                            <li key={i} className="text-sm text-gray-900 dark:text-white flex items-start">
                              <span className="w-1.5 h-1.5 bg-primary-600 rounded-full mt-2 mr-3 flex-shrink-0"></span>
                              {o}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">No definido</p>
                      )}
                    </div>

                    {/* Audiencia */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Audiencia</label>
                      <p className="text-sm text-gray-900 dark:text-white mt-2 leading-relaxed">{campaign.targetAudience || "No definida"}</p>
                    </div>

                    {/* Plataformas */}
                    <div>
                      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Plataformas</label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {campaign.platforms?.length ? (
                          campaign.platforms.map((p, i) => (
                            <span key={p + i} className="px-3 py-1.5 rounded-lg bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300 text-sm font-medium capitalize">
                              {p}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-gray-500 dark:text-gray-500">No definidas</span>
                        )}
                      </div>
                    </div>

                    {/* KPIs */}
                    {campaign.kpis?.length ? (
                      <div>
                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 block">KPIs</label>
                        <div className="space-y-3">
                          {campaign.kpis.map((k, i) => {
                            const pct = k.target > 0 ? Math.min(100, (k.current / k.target) * 100) : 0;
                            return (
                              <div key={i} className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                                <div className="flex justify-between text-sm mb-2">
                                  <span className="font-medium text-gray-900 dark:text-white">{k.name}</span>
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {k.current}/{k.target} {k.unit}
                                  </span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                                  <div
                                    className="h-2 rounded-full bg-primary-500 transition-all duration-300"
                                    style={{
                                      width: `${pct}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 sticky bottom-0">
                <button onClick={closeCampaignDetails} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cerrar
                </button>
                <button
                  onClick={() => {
                    closeCampaignDetails();
                    handleOpenEdit();
                  }}
                  className="btn-primary flex items-center gap-2 text-sm px-4 py-2"
                >
                  <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                  Editar Campaña
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
