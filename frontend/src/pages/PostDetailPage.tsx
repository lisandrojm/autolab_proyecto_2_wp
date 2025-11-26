import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { PageLayout } from "../components/ui/PageLayout";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faCalendar, faChartLine, faEye, faHeart, faShare, faClock, faPaperPlane, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { PostFormModal } from "../components/ui/PostFormModal";
import { PlatformPreview } from "../components/ui/PlatformPreview";
import { EmailPreview } from "../components/ui/EmailPreview";
import { PushNotificationPreview } from "../components/ui/PushNotificationPreview";
import { Channel, ContentFormat, Platform, PostType, getFormatFromChannel, getPlatformFromChannel } from "../types/post";

const HELP_KEY = "postDetail" as const;

type PostStatus = "draft" | "pending_approval" | "approved" | "rejected" | "scheduled" | "published";

interface Post {
  _id: string;
  title: string;
  campaignId: { _id: string; name: string; projectId?: string };
  clientId: { _id: string; name: string; brandKit?: { logos?: { url: string; name?: string }[] } };
  content: { copy: string; hashtags: string[]; mentions: string[] };
  media: { type: "image" | "video" | "carousel"; urls: string[]; alt?: string }[];
  platforms: Platform[];
  channel?: Channel;
  channels?: Channel[];
  postType?: PostType;
  contentFormat?: ContentFormat;
  channelConfig?: any;
  status: PostStatus;
  scheduling: { publishAt?: string; timezone: string; isScheduled: boolean };
  analytics: { impressions: number; engagement: number; clicks: number; shares: number };
  createdAt: string;
  updatedAt?: string;
}

interface Campaign {
  _id: string;
  name: string;
  projectId: string;
}

interface Project {
  _id: string;
  name: string;
}

const resolveAssetUrl = (input?: string) => {
  if (!input) return undefined;
  if (/^(https?:)?\/\//i.test(input) || input.startsWith("data:")) return input;
  const base = (import.meta.env.VITE_ASSETS_URL ?? "").replace(/\/+$/g, "");
  const path = String(input).replace(/^\/+/g, "");
  return base ? `${base}/${path}` : `/${path}`;
};

const getStatusText = (status: PostStatus) => {
  switch (status) {
    case "published":
      return "Publicado";
    case "scheduled":
      return "Programado";
    case "approved":
      return "Aprobado";
    case "pending_approval":
      return "Pendiente";
    case "rejected":
      return "Rechazado";
    case "draft":
      return "Borrador";
    default:
      return status;
  }
};

const getPlatformFromChannelName = (channel: Channel): string => {
  const channelStr = String(channel);
  if (channelStr.startsWith("instagram")) return "instagram";
  if (channelStr.startsWith("facebook")) return "facebook";
  if (channelStr.startsWith("twitter")) return "twitter";
  if (channelStr.startsWith("linkedin")) return "linkedin";
  if (channelStr.startsWith("tiktok")) return "tiktok";
  if (channelStr.startsWith("youtube")) return "youtube";
  return "instagram";
};

export const PostDetailPage: React.FC = () => {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { token, tenantId, logout } = useAuthStore();

  const [post, setPost] = useState<Post | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [openInfo, setOpenInfo] = useState(false);
  const [initialFormData, setInitialFormData] = useState<any>(null);

  const helpEntry = getHelp(HELP_KEY);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!token) {
      setPost(null);
      setCampaign(null);
      setProject(null);
      setLoading(false);
      navigate("/login", { replace: true });
    }
  }, [token, navigate]);

  const handle401 = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handle403 = async () => {
    await sweetAlert.error("Sin permiso", "No tenés acceso a este post.");
    navigate("/calendar", { replace: true });
  };

  const handleStatus = (status: number) => {
    if (status === 401) {
      handle401();
      return true;
    }
    if (status === 403) {
      handle403();
      return true;
    }
    return false;
  };

  const fetchPost = async () => {
    if (!postId || !token) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/posts/${postId}`, {
        headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenantId },
        signal: controller.signal,
      });

      if (handleStatus(res.status)) return;
      if (!res.ok) throw new Error("No se pudo cargar el post");

      const data: Post = await res.json();
      setPost(data);

      if (data.campaignId?._id) {
        const campaignRes = await fetch(`${import.meta.env.VITE_API_URL}/campaigns/${data.campaignId._id}`, {
          headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenantId },
          signal: controller.signal,
        });
        if (handleStatus(campaignRes.status)) return;
        if (campaignRes.ok) {
          const campaignData = await campaignRes.json();
          setCampaign(campaignData);

          if (campaignData.projectId) {
            const projectRes = await fetch(`${import.meta.env.VITE_API_URL}/projects/${campaignData.projectId}`, {
              headers: { Authorization: `Bearer ${token}`, "X-Tenant-Id": tenantId },
              signal: controller.signal,
            });
            if (handleStatus(projectRes.status)) return;
            if (projectRes.ok) {
              const projectData = await projectRes.json();
              setProject(projectData);
            }
          }
        }
      }

      const derivedPostType: PostType = data.postType || (data.channel === "email" ? "email" : data.channel === "push_notification" ? "push" : "social");

      let derivedContentFormat: ContentFormat | undefined = data.contentFormat;
      if (!derivedContentFormat && data.channel && derivedPostType === "social") {
        derivedContentFormat = getFormatFromChannel(data.channel) || undefined;
      }

      const derivedChannels: Channel[] = data.channels || (data.channel ? [data.channel] : []);

      // Clean title by removing any "Publicación |" prefix that may have been saved incorrectly
      const cleanTitle = (data.title || "").replace(/^Publicación\s*\|\s*/i, "");

      setInitialFormData({
        title: cleanTitle,
        content: {
          copy: data.content.copy || "",
          hashtags: data.content.hashtags || [],
          mentions: data.content.mentions || [],
        },
        platforms: data.platforms || [],
        channel: data.channel,
        channels: derivedChannels,
        postType: derivedPostType,
        contentFormat: derivedContentFormat,
        channelConfig: data.channelConfig || {},
        status: data.status || "draft",
        scheduling: {
          publishAt: data.scheduling.publishAt ? new Date(data.scheduling.publishAt).toISOString().slice(0, 16) : "",
          timezone: data.scheduling.timezone || "UTC",
          isScheduled: data.scheduling.isScheduled || false,
        },
        media: data.media || [],
      });
    } catch (error: any) {
      if (error?.name === "AbortError") return;
      console.error("Error fetching post:", error);
      sweetAlert.error("Error", "No se pudo cargar el post");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!postId || !token) return;
    fetchPost();
    return () => abortRef.current?.abort();
  }, [postId, token]);

  const handleOpenEdit = () => setShowModal(true);
  const openAnalyticsModal = () => setShowAnalyticsModal(true);
  const closeAnalyticsModal = () => setShowAnalyticsModal(false);

  const handleSavePost = async (formData: any) => {
    if (!post) return;

    try {
      let newImageUrls: string[] = [];
      const selectedAssetIds = formData.selectedAssetIds || [];
      let galleryImageUrls: string[] = [];

      // Handle new image uploads
      if (formData.imageFiles && formData.imageFiles.length > 0) {
        const uploadedImages = [];

        for (const file of formData.imageFiles) {
          const uploadFormData = new FormData();
          uploadFormData.append("file", file);

          const uploadResponse = await fetch(`${import.meta.env.VITE_API_URL}/client-assets/posts/upload?clientId=${formData.clientId || post.clientId}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Tenant-Id": tenantId,
            },
            body: uploadFormData,
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

      // Fetch gallery image URLs for selected assets
      if (selectedAssetIds.length > 0) {
        try {
          const assetsResponse = await fetch(`${import.meta.env.VITE_API_URL}/client-assets/query?clientId=${formData.clientId || post.clientId}&limit=1000`, {
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

      // existingImageUrls represents images that should remain
      const existingUrls = formData.existingImageUrls || [];
      const allImageUrls = [...existingUrls, ...newImageUrls, ...galleryImageUrls];

      console.log("[PostDetail] Update - Existing URLs:", existingUrls.length);
      console.log("[PostDetail] Update - New uploaded:", newImageUrls.length);
      console.log("[PostDetail] Update - Gallery images:", galleryImageUrls.length);
      console.log("[PostDetail] Update - Total images:", allImageUrls.length);

      // Clean title by removing any "Publicación |" prefix before saving
      const cleanTitle = (formData.title || "").replace(/^Publicación\s*\|\s*/i, "");

      const payload = {
        ...formData,
        title: cleanTitle,
        scheduling: formData.scheduling.isScheduled ? { ...formData.scheduling, publishAt: new Date(formData.scheduling.publishAt).toISOString() } : { timezone: formData.scheduling.timezone, isScheduled: false },
        media: allImageUrls.length > 0 ? [{ type: "image", urls: allImageUrls }] : [],
        usedAssets: selectedAssetIds,
      };

      delete payload.imageFiles;
      delete payload.existingImageUrls;
      delete payload.campaignId;
      delete payload.clientId;
      delete payload.publishImmediately;
      delete payload.selectedAssetIds;

      const res = await fetch(`${import.meta.env.VITE_API_URL}/posts/${post._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
        body: JSON.stringify(payload),
      });

      if (handleStatus(res.status)) return;

      if (res.ok) {
        sweetAlert.success("Post actualizado", "Los cambios se han guardado correctamente");
        setShowModal(false);
        await fetchPost();
      } else {
        sweetAlert.error("Error", "No se pudo actualizar el post");
      }
    } catch (error) {
      console.error("Error updating post:", error);
      sweetAlert.error("Error", "No se pudo actualizar el post");
    }
  };

  if (!postId) {
    return (
      <PageLayout title="Post no válido">
        <div className="text-center">
          <button onClick={() => navigate(-1)} className="btn-primary">
            Volver
          </button>
        </div>
      </PageLayout>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando post...</p>
        </div>
      </div>
    );
  }

  const logoSrc = resolveAssetUrl(post?.clientId?.brandKit?.logos?.[0]?.url);

  const postType: PostType = post?.postType || (post?.channel === "email" ? "email" : post?.channel === "push_notification" ? "push" : "social");
  const channels = post?.channels || (post?.channel ? [post.channel] : []);
  const imageUrls = post?.media?.[0]?.urls || [];

  return (
    <PageLayout
      title={`Publicación | ${post?.title}`}
      badge={{ text: project?.name ?? "Proyecto", variant: "default" }}
      badgeSecondary={{ text: campaign?.name ?? "Campaña", variant: "default" }}
      badgeTertiary={{ text: "Post", variant: "default" }}
      faIcon={{ icon: faPaperPlane }}
      clientMiniAvatar={{
        src: logoSrc,
        alt: post?.clientId?.name ? `${post.clientId.name} logo` : undefined,
        fallback: post?.clientId?.name?.charAt(0)?.toUpperCase?.() || "?",
        label: post?.clientId?.name,
      }}
      subtitle={post?.content.copy.substring(0, 100) + (post?.content.copy.length > 100 ? "..." : "") || "Detalle del post"}
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
        post ? (
          <div className="flex gap-2">
            <button onClick={openAnalyticsModal} className="btn-secondary flex items-center gap-2 text-sm px-3">
              <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
            </button>
            <button onClick={handleOpenEdit} className="btn-primary flex items-center gap-2 text-sm px-3">
              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
            </button>
          </div>
        ) : undefined
      }
    >
      {post && (
        <>
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <FontAwesomeIcon icon={faPaperPlane} className="h-5 w-5" />
              Vista Previa
            </h2>

            {postType === "social" && channels.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {channels.map((channel) => {
                  const platform = getPlatformFromChannelName(channel);
                  return <PlatformPreview key={channel} platform={platform} content={post.content} images={imageUrls} title={post.title} />;
                })}
              </div>
            )}

            {postType === "email" && <EmailPreview config={post.channelConfig || {}} images={imageUrls} />}

            {postType === "push" && <PushNotificationPreview config={post.channelConfig || {}} images={imageUrls} />}
          </div>

          {post.updatedAt && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
              <h3 className="text-sm font-semibold mb-3">Información adicional</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Creado:</span>
                  <span className="ml-2">{new Date(post.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">Actualizado:</span>
                  <span className="ml-2">{new Date(post.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <PostFormModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleSavePost}
        initialData={initialFormData}
        mode="edit"
        campaignContext={
          post && campaign && project
            ? {
                campaignId: campaign._id,
                campaignName: campaign.name,
                projectId: project._id,
                projectName: project.name,
                clientId: typeof post.clientId === "object" ? post.clientId._id : (post.clientId as unknown as string),
              }
            : undefined
        }
      />

      {showAnalyticsModal && post && (
        <div className="fixed inset-0 overflow-y-auto" style={{ zIndex: 60 }}>
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition duration-200 h-vh" onClick={closeAnalyticsModal} />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 sticky top-0 z-10">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalle del Post</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Información completa y analíticas</p>
                </div>
                <button onClick={closeAnalyticsModal} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Cerrar">
                  <svg className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faChartLine} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Analíticas</h3>
                  </div>
                  {post.status === "published" ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                        <FontAwesomeIcon icon={faEye} className="h-6 w-6 text-gray-500 mb-2" />
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{post.analytics.impressions.toLocaleString()}</div>
                        <div className="text-xs text-gray-500 mt-1">Impresiones</div>
                      </div>
                      <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                        <FontAwesomeIcon icon={faHeart} className="h-6 w-6 text-gray-500 mb-2" />
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{post.analytics.engagement.toLocaleString()}</div>
                        <div className="text-xs text-gray-500 mt-1">Engagement</div>
                      </div>
                      <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                        <FontAwesomeIcon icon={faEye} className="h-6 w-6 text-gray-500 mb-2" />
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{post.analytics.clicks.toLocaleString()}</div>
                        <div className="text-xs text-gray-500 mt-1">Clics</div>
                      </div>
                      <div className="text-center p-4 bg-white dark:bg-gray-800 rounded-lg">
                        <FontAwesomeIcon icon={faShare} className="h-6 w-6 text-gray-500 mb-2" />
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{post.analytics.shares.toLocaleString()}</div>
                        <div className="text-xs text-gray-500 mt-1">Compartidos</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <FontAwesomeIcon icon={faEye} className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">Las analíticas estarán disponibles una vez que el post sea publicado</p>
                    </div>
                  )}
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faCalendar} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Programación</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Estado</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{getStatusText(post.status)}</p>
                    </div>
                    {post.scheduling.isScheduled && post.scheduling.publishAt ? (
                      <>
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fecha de Publicación</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{new Date(post.scheduling.publishAt).toLocaleString()}</p>
                        </div>
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Zona Horaria</p>
                          <p className="text-sm font-bold text-gray-900 dark:text-white">{post.scheduling.timezone}</p>
                        </div>
                      </>
                    ) : (
                      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Programación</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">No programado</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faPaperPlane} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Plataformas</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {post.platforms?.length ? (
                      post.platforms.map((p) => (
                        <span key={p} className="px-3 py-1.5 rounded-lg bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300 text-sm font-medium capitalize">
                          {p}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500 dark:text-gray-500">No definidas</span>
                    )}
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                      <FontAwesomeIcon icon={faClock} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Fechas</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Creado</p>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">{new Date(post.createdAt).toLocaleString()}</p>
                    </div>
                    {post.updatedAt && (
                      <div className="p-3 bg-white dark:bg-gray-800 rounded-lg">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Actualizado</p>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">{new Date(post.updatedAt).toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 sticky bottom-0">
                <button onClick={closeAnalyticsModal} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
