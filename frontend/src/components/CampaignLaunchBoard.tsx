import React, { useEffect, useState, useMemo } from "react";
import { useAuthStore } from "../stores/authStore";
import { Card } from "./ui/Card";
import { EmptyState } from "./ui/EmptyState";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faPaperPlane } from "@fortawesome/free-solid-svg-icons";
import { PostCard } from "./PostCard";

interface Post {
  _id: string;
  title: string;
  postType?: "social" | "email" | "push";
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
  createdAt: string;
  favorite?: boolean;
}

interface CampaignLaunchBoardProps {
  campaignId?: string;
  onOpenDeliverable?: (id: string) => void;
  posts: Post[];
  setPosts: (posts: Post[]) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  searchTerm: string;
  filterStatus: string;
  startDate: string;
  endDate: string;
  onCreatePost: () => void;
  onEditPost?: (post: Post) => void;
}

export const CampaignLaunchBoard: React.FC<CampaignLaunchBoardProps> = ({ campaignId, onOpenDeliverable, posts, setPosts, loading, setLoading, searchTerm, filterStatus, startDate, endDate, onCreatePost, onEditPost }) => {
  const { token, tenantId } = useAuthStore();

  useEffect(() => {
    if (campaignId) {
      fetchPosts();
    }
  }, [campaignId]);

  const fetchPosts = async () => {
    if (!campaignId) return;

    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/posts?campaignId=${campaignId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setPosts(data);
      } else {
        console.error("Error fetching posts:", response.status);
        setPosts([]);
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEditPost = (post: Post) => {
    if (onEditPost) {
      onEditPost(post);
    } else {
      sweetAlert.info("Editar publicación", `Próximamente: editar "${post.title}"`);
    }
  };

  const handleDeletePost = async (post: Post) => {
    const result = await sweetAlert.confirm("¿Eliminar post?", `¿Estás seguro de que quieres eliminar "${post.title}"?`);
    if (!result.isConfirmed) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/posts/${post._id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (response.ok) {
        sweetAlert.success("Post eliminado", "El post ha sido eliminado correctamente");
        fetchPosts();
      } else {
        const errorData = await response.json().catch(() => ({}));
        sweetAlert.error("Error", errorData.error || "No se pudo eliminar el post");
      }
    } catch (error) {
      console.error("Error deleting post:", error);
      sweetAlert.error("Error", "No se pudo eliminar el post");
    }
  };

  const handleApprovePost = async (post: Post) => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/posts/${post._id}/approve`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify({
          status: "approved",
          feedback: "Aprobado desde tablero de lanzamiento",
        }),
      });

      if (response.ok) {
        sweetAlert.success("Post aprobado", "El post ha sido aprobado correctamente");
        fetchPosts();
      } else {
        sweetAlert.error("Error", "No se pudo aprobar el post");
      }
    } catch (error) {
      console.error("Error approving post:", error);
      sweetAlert.error("Error", "No se pudo aprobar el post");
    }
  };

  // Filtrado local (texto + estado + rango por createdAt)
  const filteredPosts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const hasDates = !!startDate || !!endDate;
    const startTs = startDate ? new Date(startDate).getTime() : null;
    const endTs = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return posts.filter((post) => {
      const matchesSearch = !q || post.title.toLowerCase().includes(q) || post.content.copy.toLowerCase().includes(q);

      const matchesStatus = filterStatus === "all" || post.status === filterStatus;

      let matchesDate = true;
      if (hasDates) {
        const t = post.createdAt ? new Date(post.createdAt).getTime() : NaN;
        if (Number.isNaN(t)) return false;
        if (startTs !== null) matchesDate = matchesDate && t >= startTs;
        if (endTs !== null) matchesDate = matchesDate && t <= endTs;
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [posts, searchTerm, filterStatus, startDate, endDate]);

  const hasActiveDate = !!startDate || !!endDate;

  if (!campaignId) {
    return (
      <div className="mt-8">
        <EmptyState icon={faPaperPlane} title="Campaña no válida" description="No se puede cargar el tablero sin una campaña válida." action={{ label: "Volver", onClick: () => window.history.back() }} />
      </div>
    );
  }

  return (
    <>
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando posts...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-2">
          {/* Post Cards */}
          {filteredPosts.map((post) => (
            <PostCard
              key={post._id}
              post={{
                ...post,
                title: `Publicación | ${post.title}`,
              }}
              onEdit={handleEditPost}
              onDelete={handleDeletePost}
              onApprove={handleApprovePost}
              showBreadcrumbs={false}
            />
          ))}
          {/* Nueva Post Card */}
          <Card
            variant="create"
            onClick={onCreatePost}
            header={{
              title: "Nueva Publicación",
              subtitle: "Crear nuevo contenido para esta campaña",
              icon: faPaperPlane,
            }}
          />
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredPosts.length === 0 && (
        <EmptyState
          icon={faPaperPlane}
          title={hasActiveDate ? "Sin posts en este rango" : "No hay posts"}
          description={hasActiveDate ? `No se encontraron posts ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : "Esta campaña aún no tiene posts creados."}
          action={{
            label: "Crear Post",
            onClick: onCreatePost,
            icon: faPlus,
          }}
        />
      )}
    </>
  );
};
