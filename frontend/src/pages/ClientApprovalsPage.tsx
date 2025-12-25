import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { useClientContextStore } from "../stores/clientContextStore";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardCheck, faThumbsUp, faThumbsDown, faEye, faCalendar, faImage, faHeart, faClock, faPlus } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";

interface Post {
  _id: string;
  title: string;
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
  };
  analytics: {
    impressions: number;
    engagement: number;
    clicks: number;
    shares: number;
  };
  projectId: string;
  createdAt: string;
  favorite?: boolean;
}

const getStatusText = (status: Post["status"]) => {
  switch (status) {
    case "approved":
      return "Aprobado";
    case "published":
      return "Publicado";
    case "pending_approval":
      return "Pendiente";
    case "rejected":
      return "Rechazado";
    case "scheduled":
      return "Programado";
    case "draft":
      return "Borrador";
    default:
      return status;
  }
};

export const ClientApprovalsPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, tenantId } = useAuthStore();
  const { selectedClient } = useClientContextStore();

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("pending");

  // Modal para feedback
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [feedbackAction, setFeedbackAction] = useState<"approved" | "rejected">("approved");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      setLoading(true);

      let url = `${import.meta.env.VITE_API_URL}/posts`;
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
        setPosts(data);
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
      sweetAlert.error("Error", "No se pudieron cargar los posts");
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (post: Post, status: "approved" | "rejected", feedbackText?: string) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/posts/${post._id}/approve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify({
          status,
          feedback: feedbackText,
        }),
      });

      if (response.ok) {
        const action = status === "approved" ? "aprobado" : "rechazado";
        sweetAlert.success(`Post ${action}`, `El post "${post.title}" ha sido ${action} correctamente`);
        fetchPosts();
      } else {
        const errorData = await response.json();
        sweetAlert.error("Error", errorData.error || `No se pudo ${status === "approved" ? "aprobar" : "rechazar"} el post`);
      }
    } catch (error) {
      console.error("Error updating post approval:", error);
      sweetAlert.error("Error", `No se pudo ${status === "approved" ? "aprobar" : "rechazar"} el post`);
    }
  };

  const openFeedbackModal = (post: Post, action: "approved" | "rejected") => {
    setSelectedPost(post);
    setFeedbackAction(action);
    setFeedback("");
    setShowFeedbackModal(true);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPost) return;

    await handleApproval(selectedPost, feedbackAction, feedback);
    setShowFeedbackModal(false);
    setSelectedPost(null);
    setFeedback("");
  };

  const filteredPosts = posts.filter((post) => {
    const matchesSearch = post.title.toLowerCase().includes(searchTerm.toLowerCase()) || post.content.copy.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesStatus = true;
    if (filterStatus === "pending") {
      matchesStatus = post.status === "pending_approval";
    } else if (filterStatus === "review") {
      matchesStatus = post.status === "pending_approval" || post.status === "approved" || post.status === "rejected";
    } else if (filterStatus !== "all") {
      matchesStatus = post.status === filterStatus;
    }

    return matchesSearch && matchesStatus;
  });

  if (loading) return <LoadingSpinner message="Cargando posts para aprobación..." />;

  return (
    <PageLayout
      title="Aprobaciones"
      subtitle="Revisa y aprueba el contenido pendiente"
      faIcon={{ icon: faClipboardCheck }}
      clientMiniAvatar={
        selectedClient
          ? {
              src: selectedClient.brandKit?.logo,
              alt: `${selectedClient.name} logo`,
              fallback: selectedClient.name?.charAt(0)?.toUpperCase() || "?",
              label: selectedClient.name,
            }
          : undefined
      }
      faIconSecondary={{ icon: faImage }}
      preSearchTitle="Posts"
      preSearchActions={
        <button onClick={() => navigate("/client/posts")} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
          <span className="hidden lg:block">Nuevo Publicación</span>
        </button>
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar posts por título o contenido..."
          filters={[
            {
              value: filterStatus,
              onChange: setFilterStatus,
              options: [
                { value: "pending", label: "Pendientes" },
                { value: "review", label: "En Revisión" },
                { value: "approved", label: "Aprobados" },
                { value: "rejected", label: "Rechazados" },
                { value: "all", label: "Todos" },
              ],
            },
          ]}
        />
      }
      modal={
        showFeedbackModal
          ? {
              isOpen: true,
              onClose: () => setShowFeedbackModal(false),
              title: feedbackAction === "approved" ? "Aprobar Post" : "Rechazar Post",
              subtitle: `${feedbackAction === "approved" ? "Aprobar" : "Rechazar"} "${selectedPost?.title}"`,
              size: "md",
              actions: [
                {
                  label: feedbackAction === "approved" ? "Aprobar" : "Rechazar",
                  onClick: () => {
                    const form = document.querySelector<HTMLFormElement>("#feedback-form");
                    form?.requestSubmit();
                  },
                  variant: feedbackAction === "approved" ? "success" : "blue",
                },
                {
                  label: "Cancelar",
                  onClick: () => setShowFeedbackModal(false),
                  variant: "ghost",
                },
              ],
              content: (
                <form id="feedback-form" onSubmit={handleFeedbackSubmit}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Comentarios {feedbackAction === "rejected" ? "(requerido)" : "(opcional)"}</label>
                      <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4} className="input-field resize-none" placeholder={feedbackAction === "approved" ? "Comentarios adicionales sobre la aprobación..." : "Explica por qué se rechaza el post y qué cambios se necesitan..."} required={feedbackAction === "rejected"} />
                    </div>
                  </div>
                </form>
              ),
            }
          : undefined
      }
    >
      <div className="grid grid-cols-1 gap-6">
        {filteredPosts.map((post) => (
          <Card
            key={post._id}
            onClick={() => sweetAlert.info("Ver Post", `Próximamente: vista detallada de "${post.title}"`)}
            className="hover:scale-[1.01] hover:shadow-lg transition-all duration-200"
            header={{
              title: post.title,
              subtitle: post.content.copy.substring(0, 100) + (post.content.copy.length > 100 ? "..." : ""),
              icon: faImage,
              badges: [],
            }}
            footer={{
              leftContent: (
                <div className="space-y-1">
                  <div className="text-xs text-gray-500 dark:text-gray-500">{new Date(post.createdAt).toLocaleDateString()}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-500">
                    {post.platforms.length} plataforma{post.platforms.length !== 1 ? "s" : ""}
                  </div>
                </div>
              ),
              actions: [
                {
                  icon: faEye,
                  onClick: (e) => {
                    e.stopPropagation();
                    sweetAlert.info("Ver Post", `Próximamente: vista detallada de "${post.title}"`);
                  },
                  title: "Ver post",
                  variant: "default",
                },
                ...(post.status === "pending_approval"
                  ? [
                      {
                        icon: faThumbsUp,
                        onClick: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          openFeedbackModal(post, "approved");
                        },
                        title: "Aprobar",
                        variant: "success" as const,
                      },
                      {
                        icon: faThumbsDown,
                        onClick: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          openFeedbackModal(post, "rejected");
                        },
                        title: "Rechazar",
                        variant: "default" as const,
                      },
                    ]
                  : []),
              ],
            }}
          >
            <div className="space-y-3">
              {/* Hashtags */}
              {post.content.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {post.content.hashtags.slice(0, 4).map((hashtag, index) => (
                    <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300">
                      #{hashtag}
                    </span>
                  ))}
                  {post.content.hashtags.length > 4 && <span className="text-xs text-gray-500 dark:text-gray-500">+{post.content.hashtags.length - 4}</span>}
                </div>
              )}

              {/* Scheduling info */}
              {post.scheduling.isScheduled && post.scheduling.publishAt && (
                <div className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
                  <FontAwesomeIcon icon={faCalendar} className="h-3 w-3" />
                  <span>Programado: {new Date(post.scheduling.publishAt).toLocaleDateString()}</span>
                </div>
              )}

              {/* Analytics para posts publicados */}
              {post.status === "published" && (
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-500">
                  <div className="flex items-center space-x-1">
                    <FontAwesomeIcon icon={faEye} className="h-3 w-3" />
                    <span>{post.analytics.impressions.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <FontAwesomeIcon icon={faHeart} className="h-3 w-3" />
                    <span>{post.analytics.engagement.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {filteredPosts.length === 0 && (
        <EmptyState
          icon={faClock}
          title="No hay posts para revisar"
          description={filterStatus === "pending" ? "No tienes posts pendientes de aprobación en este momento." : "No hay posts en el estado seleccionado."}
          action={{
            label: "Ver Todos los Proyectos",
            onClick: () => navigate("/client/proyectos"),
          }}
        />
      )}
    </PageLayout>
  );
};
