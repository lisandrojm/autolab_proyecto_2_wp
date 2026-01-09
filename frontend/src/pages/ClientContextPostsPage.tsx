import React, { useEffect, useState, useMemo } from "react";
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
import { emitPostsChanged } from "../utils/navbarEvents";
import { prepareSavePayload, initializeFormDataFromPost } from "../utils/postDataMigration";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImage, faPlus, faPaperPlane, faBriefcase } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { PostFormModal } from "../components/ui/PostFormModal";
import { PostCard } from "../components/PostCard";

const HELP_KEY = "clientContextPosts" as const;

interface Project {
  _id: string;
  name: string;
  description?: string;
}

interface Post {
  _id: string;
  title: string;
  postType?: "social" | "email" | "push";
  contentFormat?: string;
  channel?: string;
  channels?: string[];
  channelConfig?: any;
  projectId?:
    | {
        _id: string;
        name: string;
      }
    | string;
  clientId: {
    _id: string;
    name: string;
  };
  content: {
    copy: string;
    hashtags: string[];
    mentions: string[];
  };
  media: {
    type: "image" | "video" | "carousel";
    urls: string[];
    alt?: string;
  }[];
  platforms: string[];
  status: "draft" | "pending_approval" | "approved" | "rejected" | "scheduled" | "published";
  scheduling: {
    publishAt?: string;
    timezone: string;
    isScheduled: boolean;
    recurrence?: {
      enabled: boolean;
      frequency: "daily" | "weekly" | "monthly" | "yearly";
      interval: number;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      endDate?: string;
      endAfterOccurrences?: number;
    };
  };
  analytics: {
    impressions: number;
    engagement: number;
    clicks: number;
    shares: number;
  };
  createdAt: string;
  favorite?: boolean;
}

export const ClientContextPostsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { selectedClient, setSelectedClient } = useClientContextStore();
  const { token, tenantId } = useAuthStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editInitialData, setEditInitialData] = useState<any>(null);

  // rango de fechas (createdAt)
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD
  const hasActiveDate = !!startDate || !!endDate;

  // info modal
  const [openInfo, setOpenInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    if (!id) return;
    fetchClientAndProjects();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchPosts();
  }, [id, filterProject]);

  const fetchClientAndProjects = async () => {
    if (!id) return;

    try {
      // Obtener cliente si no está en contexto
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

      // Obtener todos los proyectos del cliente
      const projectsResponse = await projectsAPI.getClientProjects(id, { limit: 100 });
      setProjects(projectsResponse.projects);
    } catch (error) {
      console.error("Error fetching client data:", error);
      sweetAlert.error("Error", "No se pudieron cargar los datos del cliente");
    }
  };

  const fetchPosts = async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      let url = `${import.meta.env.VITE_API_URL}/posts?clientId=${id}`;

      if (filterProject !== "all") {
        url += `&projectId=${filterProject}`;
      }

      const postsResponse = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (postsResponse.ok) {
        const postsData = await postsResponse.json();

        if (!Array.isArray(postsData)) {
          setPosts([]);
        } else {
          setPosts(postsData);
        }
      } else {
        console.warn("Posts response not ok:", postsResponse.status);
        setPosts([]);
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePost = async (post: Post) => {
    const result = await sweetAlert.confirm("¿Eliminar post?", `¿Estás seguro de que quieres eliminar "${post.title}"?`);
    if (result.isConfirmed) {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/posts/${post._id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Tenant-Id": tenantId,
          },
        });

        if (response.ok) {
          sweetAlert.success("Post eliminado", "El post se eliminó correctamente");
          emitPostsChanged("delete", post._id, selectedClient?._id);
          fetchPosts();
        } else {
          const error = await response.json();
          sweetAlert.error("Error", error.error || "No se pudo eliminar el post");
        }
      } catch (error) {
        console.error("Error deleting post:", error);
        sweetAlert.error("Error", "No se pudo eliminar el post");
      }
    }
  };

  const handleCreatePost = () => {
    setEditingPost(null);
    setEditInitialData(null);
    setShowPostModal(true);
  };

  const handleEditPost = (post: Post) => {
    setEditingPost(post);

    const initialData = initializeFormDataFromPost({
      title: post.title || "",
      postType: post.postType || "social",
      contentFormat: post.contentFormat,
      channel: post.channel,
      channels: post.channels || [],
      channelConfig: post.channelConfig || {},
      content: {
        copy: post.content.copy || "",
        hashtags: post.content.hashtags || [],
        mentions: post.content.mentions || [],
      },
      platforms: post.platforms || [],
      status: post.status || "draft",
      scheduling: {
        publishAt: post.scheduling.publishAt ? new Date(post.scheduling.publishAt).toISOString().slice(0, 16) : "",
        timezone: post.scheduling.timezone || "UTC",
        isScheduled: post.scheduling.isScheduled || false,
        recurrence: post.scheduling.recurrence,
      },
      media: post.media || [],
      dynamicFields: (post as any).dynamicFields || {},
      usedAssets: (post as any).usedAssets || [],
    });

    setEditInitialData(initialData);
    setShowPostModal(true);
  };

  const handleSavePost = async (postData: any) => {
    try {
      let newImageUrls: string[] = [];
      const selectedAssetIds = postData.selectedAssetIds || [];
      let galleryImageUrls: string[] = [];

      if (postData.imageFiles && postData.imageFiles.length > 0) {
        const uploadedImages = [];

        for (const file of postData.imageFiles) {
          const formData = new FormData();
          formData.append("file", file);

          const uploadResponse = await fetch(`${import.meta.env.VITE_API_URL}/client-assets/posts/upload?clientId=${postData.clientId || id}`, {
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
          const assetsResponse = await fetch(`${import.meta.env.VITE_API_URL}/client-assets/query?clientId=${postData.clientId || id}&limit=1000`, {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Tenant-Id": tenantId,
            },
          });

          if (assetsResponse.ok) {
            const assetsData = await assetsResponse.json();
            const selectedAssets = assetsData.assets?.filter((asset: any) => selectedAssetIds.includes(asset._id)) || [];
            galleryImageUrls = selectedAssets.map((asset: any) => asset.url);
          }
        } catch (error) {
          console.error("Error fetching gallery image URLs:", error);
        }
      }

      if (editingPost) {
        const existingUrls = postData.existingImageUrls || [];
        const allImageUrls = [...existingUrls, ...newImageUrls, ...galleryImageUrls];

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
          emitPostsChanged("update", editingPost._id, selectedClient?._id);
          setShowPostModal(false);
          setEditingPost(null);
          setEditInitialData(null);
          fetchPosts();
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
          emitPostsChanged("create", newPost._id, selectedClient?._id);
          setShowPostModal(false);
          fetchPosts();
        } else {
          sweetAlert.error("Error", "No se pudo crear el post");
        }
      }
    } catch (error) {
      console.error("Error saving post:", error);
      sweetAlert.error("Error", "No se pudo guardar el post");
    }
  };

  const filteredPosts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const hasDates = !!startDate || !!endDate;
    const startTs = startDate ? new Date(startDate).getTime() : null;
    const endTs = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return posts.filter((post) => {
      const matchesText = !q || post.title.toLowerCase().includes(q) || post.content.copy.toLowerCase().includes(q);

      if (!hasDates) return matchesText;

      const created = post.createdAt ? new Date(post.createdAt).getTime() : NaN;
      if (Number.isNaN(created)) return false;
      if (startTs !== null && created < startTs) return false;
      if (endTs !== null && created > endTs) return false;

      return matchesText;
    });
  }, [posts, searchTerm, startDate, endDate]);

  const projectFilterOptions = [{ value: "all", label: "Todos los proyectos" }, ...projects.map((project) => ({ value: project._id, label: project.name }))];

  const getEmptyStateMessage = () => {
    const clientName = selectedClient?.name || "Este cliente";

    if (hasActiveDate) {
      return `No se encontraron posts ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}`;
    }

    if (filterProject !== "all") {
      const selectedProjectName = projects.find((p) => p._id === filterProject)?.name || "este proyecto";
      return `${clientName} aún no tiene posts creados en el proyecto "${selectedProjectName}".`;
    }

    return `${clientName} aún no tiene posts creados.`;
  };

  const getEmptyStateAction = () => {
    if (filterProject !== "all") {
      const selectedProject = projects.find((p) => p._id === filterProject);
      if (selectedProject) {
        return {
          label: "Ir al Proyecto",
          onClick: () => navigate(`/projects/${selectedProject._id}`),
          icon: faBriefcase,
        };
      }
    }
    return {
      label: "Ir a Proyectos",
      onClick: () => navigate(`/cliente/${id}/proyectos`),
      icon: faBriefcase,
    };
  };

  if (!id) {
    return <EmptyState icon={faImage} title="Cliente no válido" description="Selecciona un cliente para ver sus posts." action={{ label: "Ir a Clientes", onClick: () => navigate("/clients") }} />;
  }

  if (loading) return <LoadingSpinner message="Cargando posts del cliente..." />;

  return (
    <PageLayout
      title="Publicaciones"
      faIcon={{ icon: faPaperPlane }}
      subtitle={`Todos los posts de ${selectedClient?.name || "este cliente"}`}
      clientMiniAvatar={{
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
        <button onClick={handleCreatePost} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
        </button>
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar posts por título, contenido o proyecto..."
          filters={[
            {
              value: filterProject,
              onChange: (value) => setFilterProject(value),
              options: projectFilterOptions,
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-6 mt-4mt-2">
        {filteredPosts.map((post) => (
          <PostCard key={post._id} post={post as any} onEdit={handleEditPost as any} onDelete={handleDeletePost as any} showBreadcrumbs={true} />
        ))}
        <Card
          variant="create"
          onClick={handleCreatePost}
          header={{
            title: "Nueva Publicación",
            subtitle: "Crear una nueva publicación para este cliente",
            icon: faPaperPlane,
          }}
        />
      </div>

      {filteredPosts.length === 0 && <EmptyState icon={faImage} title={hasActiveDate ? "Sin posts en este rango" : "No hay posts"} description={getEmptyStateMessage()} action={getEmptyStateAction()} />}

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
          clientId={id}
          availableProjects={projects}
          projectContext={
            editingPost
              ? {
                  projectId: typeof editingPost.projectId === "object" ? editingPost.projectId._id : (editingPost.projectId as string),
                  projectName: typeof editingPost.projectId === "object" ? editingPost.projectId.name : "Proyecto",
                  clientId: typeof editingPost.clientId === "object" ? editingPost.clientId._id : (editingPost.clientId as string),
                }
              : undefined
          }
        />
      )}
    </PageLayout>
  );
};
