import React, { useState, useEffect } from "react";
import { Upload, X, ChevronLeft, ChevronRight, Save, Calendar, Eye, FileText, Image as ImageIcon } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faClock, faLayerGroup, faPaperPlane, faXmark, faLightbulb } from "@fortawesome/free-solid-svg-icons";
import { useAuthStore } from "../../stores/authStore";
import { sweetAlert } from "../../utils/sweetAlert";
import { CreativeGalleryPanel } from "./CreativeGalleryPanel";
import { PlatformPreviewGrid } from "./PlatformPreview";
import { ChannelSelector } from "./ChannelSelector";
import { EmailPreview } from "./EmailPreview";
import { PushNotificationPreview } from "./PushNotificationPreview";
import { useAssetGallery } from "../../hooks/useAssetGallery";
import { EmailConfigForm } from "../forms/EmailConfigForm";
import { PushConfigForm } from "../forms/PushConfigForm";
import { DynamicContentFields } from "../forms/DynamicContentFields";
import { Channel, PostType, EmailConfig, PushConfig, ContentFormat, Platform, getPostTypeFromChannel } from "../../types/post";
import { convertLegacyToDynamic } from "../../utils/postDataMigration";
import { validateDynamicFieldsForFormat, hasRequiredDynamicFields } from "../../utils/postValidation";

type PostStatus = "draft" | "pending_approval" | "approved" | "rejected" | "scheduled" | "published";

interface RecurrenceConfig {
  enabled: boolean;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endDate?: string;
  endAfterOccurrences?: number;
}

type PublicationType = "immediate" | "scheduled" | "draft";

interface PostFormData {
  title: string;
  content: {
    copy: string;
    hashtags: string[];
    mentions: string[];
  };
  platforms: Platform[];
  channel?: Channel;
  channels?: Channel[];
  contentFormat?: ContentFormat;
  postType?: PostType;
  channelConfig?: EmailConfig | PushConfig | Record<string, any>;
  status: PostStatus;
  scheduling: {
    isScheduled: boolean;
    publishAt?: string;
    timezone: string;
    recurrence?: RecurrenceConfig;
  };
  publicationType?: PublicationType;
  media?: { type: string; urls: string[] }[];
  dynamicFields?: Record<string, any>;
}

interface Project {
  _id: string;
  name: string;
  description?: string;
}

interface PostFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: PostFormData) => void;
  initialData?: Partial<PostFormData>;
  mode: "create" | "edit";
  projectContext?: {
    projectId: string;
    projectName: string;
    clientId: string;
  };
  clientId?: string;
  availableProjects?: Project[];
}

type TabType = "context" | "content" | "media" | "scheduling" | "preview";

const tabSequence: TabType[] = ["context", "content", "media", "scheduling", "preview"];

export const PostFormModal: React.FC<PostFormModalProps> = ({ isOpen, onClose, onSave, initialData, mode, projectContext, clientId, availableProjects = [] }) => {
  const { token, tenantId } = useAuthStore();
  const needsContextSelection = !projectContext && mode === "create";
  const initialTab = mode === "edit" || projectContext ? "content" : needsContextSelection ? "context" : "content";
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [completedTabs, setCompletedTabs] = useState<Set<TabType>>(new Set());

  const [formData, setFormData] = useState<PostFormData>({
    title: "",
    content: {
      copy: "",
      hashtags: [],
      mentions: [],
    },
    platforms: [],
    channels: [],
    contentFormat: undefined,
    channel: undefined,
    postType: "social",
    channelConfig: {},
    status: "draft",
    scheduling: {
      isScheduled: false,
      publishAt: "",
      timezone: "UTC",
    },
    publicationType: "draft",
    dynamicFields: {},
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [selectedProjectId, setSelectedProjectId] = useState("");

  // Image upload and gallery
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [selectedGalleryImages, setSelectedGalleryImages] = useState<string[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Asset Gallery Hook
  const currentClientId = projectContext?.clientId || clientId;
  const { images: galleryImages, loading: galleryLoading, total: totalAssets, pendingIncludeUserAssets, setPendingIncludeUserAssets, applyFilters, activeFilters, removeFilter } = useAssetGallery(currentClientId, selectedProjectId);

  useEffect(() => {
    if (isOpen && !projectContext && availableProjects.length === 0) {
      fetchProjects();
    }

    if (isOpen && (projectContext || mode === "edit")) {
      if (projectContext) {
        setSelectedProjectId(projectContext.projectId);
      }
      setCompletedTabs(new Set(["context", "content", "media", "scheduling"]));
      setActiveTab("content");
    }

    if (initialData) {
      const publicationType: PublicationType = initialData.scheduling?.isScheduled ? "scheduled" : initialData.status === "published" ? "immediate" : "draft";

      let dynamicFields = (initialData as any).dynamicFields || {};

      if (initialData.postType === "social" && initialData.contentFormat) {
        if (!dynamicFields || Object.keys(dynamicFields).length === 0) {
          dynamicFields = convertLegacyToDynamic(initialData);
        }
      }

      setFormData({
        title: initialData.title || "",
        content: {
          copy: initialData.content?.copy || "",
          hashtags: initialData.content?.hashtags || [],
          mentions: initialData.content?.mentions || [],
        },
        platforms: initialData.platforms || [],
        channels: initialData.channels || [],
        contentFormat: initialData.contentFormat,
        channel: initialData.channel || "instagram_post",
        postType: initialData.postType || "social",
        channelConfig: initialData.channelConfig || {},
        status: initialData.status || "draft",
        scheduling: {
          isScheduled: initialData.scheduling?.isScheduled || false,
          publishAt: initialData.scheduling?.publishAt || "",
          timezone: initialData.scheduling?.timezone || "UTC",
          recurrence: initialData.scheduling?.recurrence || {
            enabled: false,
            frequency: "daily",
            interval: 1,
          },
        },
        publicationType,
        media: initialData.media,
        dynamicFields,
      });

      if (initialData.media && initialData.media.length > 0 && initialData.media[0].urls) {
        setExistingImageUrls(initialData.media[0].urls);
      } else {
        setExistingImageUrls([]);
      }

      // Restore selectedAssetIds from usedAssets when editing a post
      if ((initialData as any).usedAssets && Array.isArray((initialData as any).usedAssets)) {
        const assetIds = (initialData as any).usedAssets.map((asset: any) => (typeof asset === "string" ? asset : asset._id || asset));
        setSelectedAssetIds(assetIds);
        setSelectedGalleryImages(assetIds);

        // Mark these images for tracking so we know they're from the gallery
        console.log("[PostFormModal] Loaded usedAssets:", assetIds);
      }
    }

    if (!isOpen) {
      setImageFiles([]);
      setImagePreviews([]);
      setExistingImageUrls([]);
      setSelectedAssetIds([]);
      setSelectedGalleryImages([]);
    }
  }, [initialData, isOpen, projectContext, availableProjects]);

  useEffect(() => {
    // Gallery is now scoped to project via useAssetGallery
  }, [selectedProjectId]);

  // Sync gallery images when assets are loaded in edit mode
  useEffect(() => {
    if (mode === "edit" && galleryImages.length > 0 && selectedAssetIds.length > 0 && !galleryLoading) {
      // Find gallery images that match the selectedAssetIds
      const matchingImages = galleryImages.filter((img) => selectedAssetIds.includes(img.id));

      // For existing images, we need to check if they are already in existingImageUrls
      // If they are, don't add them to imagePreviews to avoid duplication
      const newPreviews = matchingImages.map((img) => img.url).filter((url) => !imagePreviews.includes(url) && !existingImageUrls.includes(url));

      if (newPreviews.length > 0) {
        console.log("[PostFormModal] Adding gallery image previews:", newPreviews.length);
        setImagePreviews((prev) => [...prev, ...newPreviews]);
      }
    }
  }, [galleryImages, galleryLoading, mode, selectedAssetIds, imagePreviews, existingImageUrls]);

  const fetchProjects = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/clients?limit=1000`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (response.ok) {
        const clientsData = await response.json();
        const allProjects: any[] = [];

        for (const client of clientsData.clients || clientsData) {
          try {
            const projResponse = await fetch(`${import.meta.env.VITE_API_URL}/clients/${client._id}/projects`, {
              headers: {
                Authorization: `Bearer ${token}`,
                "X-Tenant-Id": tenantId,
              },
            });

            if (projResponse.ok) {
              const projData = await projResponse.json();
              const projectsList = projData.projects || projData.items || projData;
              allProjects.push(
                ...projectsList.map((p: any) => ({
                  ...p,
                  clientName: client.name,
                }))
              );
            }
          } catch (e) {
            console.error("Error fetching projects for client:", client._id, e);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching projects:", error);
    }
  };

  const handleInputChange = (field: keyof PostFormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleContentChange = (field: keyof PostFormData["content"], value: any) => {
    setFormData((prev) => ({
      ...prev,
      content: { ...prev.content, [field]: value },
    }));
  };

  const handleSchedulingChange = (field: keyof PostFormData["scheduling"], value: any) => {
    setFormData((prev) => ({
      ...prev,
      scheduling: { ...prev.scheduling, [field]: value },
    }));
  };

  const handleHashtagsChange = (value: string) => {
    setHashtagsInput(value);
    const hashtags = value
      .split(",")
      .map((h) => h.trim().replace(/^#/, ""))
      .filter(Boolean);
    handleContentChange("hashtags", hashtags);
  };

  const handleMentionsChange = (value: string) => {
    setMentionsInput(value);
    const mentions = value
      .split(",")
      .map((m) => m.trim().replace(/^@/, ""))
      .filter(Boolean);
    handleContentChange("mentions", mentions);
  };

  const handleChannelSelect = (channel: Channel) => {
    const newPostType = getPostTypeFromChannel(channel);
    setFormData((prev) => ({
      ...prev,
      channel,
      postType: newPostType,
      platforms: [],
    }));
  };

  const handleMultiChannelSelect = (channels: Channel[]) => {
    setFormData((prev) => ({
      ...prev,
      channels,
    }));
  };

  const handleFormatSelect = (format: ContentFormat | null) => {
    setFormData((prev) => ({
      ...prev,
      contentFormat: format || undefined,
      platforms: [],
      channels: [],
      dynamicFields: {},
    }));
    setFieldErrors({});
  };

  const handlePlatformsSelect = (platforms: Platform[]) => {
    setFormData((prev) => ({
      ...prev,
      platforms,
    }));
  };

  const isTabEnabled = (tab: TabType): boolean => {
    if (tab === "context" && needsContextSelection) return true;
    if (tab === "content") return needsContextSelection ? completedTabs.has("context") : true;

    let hasContentFormat = false;

    if (formData.postType === "social") {
      const hasPlatformsAndFormat = !!(formData.contentFormat && formData.platforms.length > 0);
      const hasRequiredFields = hasRequiredDynamicFields(formData.contentFormat, formData.dynamicFields || {});
      hasContentFormat = hasPlatformsAndFormat && hasRequiredFields;
    } else if (formData.postType === "email") {
      hasContentFormat = !!(formData.channelConfig as EmailConfig)?.subject;
    } else if (formData.postType === "push") {
      hasContentFormat = !!(formData.channelConfig as PushConfig)?.title;
    }

    if (tab === "media") return hasContentFormat && completedTabs.has("content");
    if (tab === "scheduling") return hasContentFormat && completedTabs.has("media");
    if (tab === "preview") return hasContentFormat && completedTabs.has("scheduling");
    return false;
  };

  const handleTabChange = (tab: TabType) => {
    if (isTabEnabled(tab)) {
      setActiveTab(tab);
    }
  };

  const handleContinueToNextTab = () => {
    setCompletedTabs((prev) => new Set(prev).add(activeTab));
    const currentIndex = tabSequence.indexOf(activeTab);
    if (currentIndex < tabSequence.length - 1) {
      const nextTab = tabSequence[currentIndex + 1];
      if (needsContextSelection || nextTab !== "context") {
        setActiveTab(nextTab);
      }
    }
  };

  const canContinueFromCurrentTab = (): boolean => {
    if (activeTab === "context") {
      return !!selectedProjectId;
    }
    if (activeTab === "content") {
      if (formData.postType === "social") {
        const hasFormat = !!formData.contentFormat;
        const hasPlatforms = formData.platforms.length > 0;
        const hasRequiredFields = hasRequiredDynamicFields(formData.contentFormat, formData.dynamicFields || {});
        return !!(hasFormat && hasPlatforms && hasRequiredFields);
      }

      if (formData.postType === "email") {
        const emailConfig = formData.channelConfig as EmailConfig;
        return !!(emailConfig?.subject && emailConfig?.body && emailConfig?.recipients?.length > 0);
      }

      if (formData.postType === "push") {
        const pushConfig = formData.channelConfig as PushConfig;
        return !!(pushConfig?.title && pushConfig?.body);
      }

      return true;
    }
    if (activeTab === "scheduling") {
      if (formData.publicationType === "scheduled") {
        return !!(formData.scheduling.publishAt && formData.scheduling.publishAt.trim());
      }
      return true;
    }
    return true;
  };

  const handleImageUpload = (files: FileList | null) => {
    if (!files) return;

    const newFiles = Array.from(files);
    const validFiles = newFiles.filter((file) => file.type.startsWith("image/"));

    if (validFiles.length !== newFiles.length) {
      sweetAlert.error("Archivos no válidos", "Solo se permiten imágenes");
    }

    setImageFiles((prev) => [...prev, ...validFiles]);

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveImage = (index: number) => {
    const removedPreview = imagePreviews[index];
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));

    const galleryImage = galleryImages.find((img) => img.url === removedPreview);
    if (galleryImage) {
      setSelectedGalleryImages((prev) => prev.filter((id) => id !== galleryImage.id));
      setSelectedAssetIds((prev) => prev.filter((id) => id !== galleryImage.id));
    }
  };

  const handleRemoveExistingImage = (index: number) => {
    const removedUrl = existingImageUrls[index];
    setExistingImageUrls((prev) => prev.filter((_, i) => i !== index));

    // Check if this URL corresponds to a gallery asset and update selectedAssetIds
    const galleryImage = galleryImages.find((img) => img.url === removedUrl);
    if (galleryImage) {
      setSelectedGalleryImages((prev) => prev.filter((id) => id !== galleryImage.id));
      setSelectedAssetIds((prev) => prev.filter((id) => id !== galleryImage.id));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleImageUpload(e.dataTransfer.files);
  };

  const handleGalleryImageSelect = (imageId: string) => {
    const image = galleryImages.find((img) => img.id === imageId);
    if (!image) return;

    const isCurrentlySelected = selectedGalleryImages.includes(imageId);

    if (isCurrentlySelected) {
      // Deselecting: remove from all tracking arrays
      setSelectedGalleryImages((prev) => prev.filter((id) => id !== imageId));
      setSelectedAssetIds((prev) => prev.filter((id) => id !== imageId));

      // Remove from imagePreviews
      setImagePreviews((prev) => prev.filter((url) => url !== image.url));

      // Also remove from existingImageUrls if it's there (for edit mode)
      setExistingImageUrls((prev) => prev.filter((url) => url !== image.url));

      console.log("[PostFormModal] Deselected gallery image:", imageId);
    } else {
      // Selecting: add to all tracking arrays
      setSelectedGalleryImages((prev) => [...prev, imageId]);
      setSelectedAssetIds((prev) => [...prev, imageId]);

      // Add to previews only if not already there
      if (!imagePreviews.includes(image.url) && !existingImageUrls.includes(image.url)) {
        setImagePreviews((prev) => [...prev, image.url]);
      }

      console.log("[PostFormModal] Selected gallery image:", imageId);
    }
  };

  const handleOpenCreativeSuite = () => {
    const creativeSuiteUrl = import.meta.env.VITE_CREATIVE_SUITE_URL || "https://autolab.fun/cs/";

    window.location.href = creativeSuiteUrl;

    sweetAlert.success("Creative Suite abierto", "Las imágenes generadas aparecerán aquí automáticamente");
  };

  const handleSave = async () => {
    if (isSaving) return;

    if (formData.postType === "social") {
      if (formData.platforms.length === 0) {
        sweetAlert.error("Error", "Debes seleccionar al menos una plataforma");
        return;
      }
      if (!formData.contentFormat) {
        sweetAlert.error("Error", "Debes seleccionar un formato de contenido");
        return;
      }

      const validation = validateDynamicFieldsForFormat(formData.contentFormat, formData.dynamicFields || {});

      if (!validation.isValid) {
        setFieldErrors(validation.errors);
        sweetAlert.error("Error", "Por favor completa todos los campos requeridos correctamente");
        setActiveTab("content");
        return;
      }
    }

    if (formData.postType === "email") {
      const emailConfig = formData.channelConfig as EmailConfig;
      if (!emailConfig?.subject?.trim()) {
        sweetAlert.error("Error", "El asunto del email es obligatorio");
        return;
      }
      if (!emailConfig?.body?.trim()) {
        sweetAlert.error("Error", "El cuerpo del email es obligatorio");
        return;
      }
      if (!emailConfig?.recipients || emailConfig.recipients.length === 0) {
        sweetAlert.error("Error", "Debes especificar al menos un destinatario");
        return;
      }
    }

    if (formData.postType === "push") {
      const pushConfig = formData.channelConfig as PushConfig;
      if (!pushConfig?.title?.trim()) {
        sweetAlert.error("Error", "El título de la notificación es obligatorio");
        return;
      }
      if (!pushConfig?.body?.trim()) {
        sweetAlert.error("Error", "El cuerpo de la notificación es obligatorio");
        return;
      }

      // Sincronizar la imagen con channelConfig.imageUrl si existe
      if (!pushConfig.imageUrl && existingImageUrls.length > 0) {
        formData.channelConfig = {
          ...pushConfig,
          imageUrl: existingImageUrls[0],
        };
      }
    }

    if (mode === "create" && !projectContext && !selectedProjectId) {
      sweetAlert.error("Error", "Debes seleccionar un proyecto");
      setActiveTab("context");
      return;
    }

    if (formData.publicationType === "scheduled" && !formData.scheduling.publishAt) {
      sweetAlert.error("Error", "Debes seleccionar una fecha y hora de publicación");
      setActiveTab("scheduling");
      return;
    }

    const finalData = {
      ...formData,
      imageFiles,
      existingImageUrls,
      selectedAssetIds,
      projectId: projectContext?.projectId || selectedProjectId,
      clientId: projectContext?.clientId || clientId,
      publishImmediately: formData.publicationType === "immediate",
    };

    setIsSaving(true);
    try {
      await onSave(finalData);
      // Don't call handleCancel() here - the parent component handles closing the modal
    } catch (error) {
      console.error("Error saving post:", error);
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    onClose();
    setFormData({
      title: "",
      content: {
        copy: "",
        hashtags: [],
        mentions: [],
      },
      platforms: [],
      channels: [],
      contentFormat: undefined,
      channel: undefined,
      postType: "social",
      channelConfig: {},
      status: "draft",
      scheduling: {
        isScheduled: false,
        publishAt: "",
        timezone: "UTC",
      },
      publicationType: "draft",
      dynamicFields: {},
    });
    setFieldErrors({});
    setImageFiles([]);
    setImagePreviews([]);
    setSelectedGalleryImages([]);
    setSelectedAssetIds([]);
    setSelectedProjectId("");
    setActiveTab(initialTab);
    setCompletedTabs(new Set());
  };

  const getCompletionPercentage = () => {
    let completed = 0;
    let total = 6;

    if (formData.title.trim()) completed++;
    if (formData.content.copy.trim()) completed++;
    if (formData.platforms.length > 0) completed++;
    if (existingImageUrls.length > 0 || imagePreviews.length > 0) completed++;
    if (formData.content.hashtags.length > 0) completed++;
    if (formData.status) completed++;

    return Math.round((completed / total) * 100);
  };

  const completionPercentage = getCompletionPercentage();

  if (!isOpen) return null;

  const customHeader = (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-900">
      <div className="flex items-center gap-4">
        <div className="relative">
          <svg className="w-14 h-14 transform -rotate-90">
            <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="none" className="text-gray-200 dark:text-gray-700" />
            <circle cx="28" cy="28" r="24" stroke="currentColor" strokeWidth="4" fill="none" strokeDasharray={`${2 * Math.PI * 24}`} strokeDashoffset={`${2 * Math.PI * 24 * (1 - completionPercentage / 100)}`} className="text-primary-600 transition-all duration-500" strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{completionPercentage}%</span>
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{mode === "create" ? "Crear Nueva Publicación" : "Editar publicación"}</h2>
          {projectContext && (
            <div className="flex items-center space-x-2 mt-1 text-sm text-gray-600 dark:text-gray-400">
              <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5" />
              <span>{projectContext.projectName}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={handleCancel} disabled={isSaving} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" title={isSaving ? "Guardando..." : "Cerrar"}>
          <FontAwesomeIcon icon={faXmark} className="h-6 w-6 text-gray-500" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="flex min-h-screen items-center justify-center p-2">
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition duration-200 h-vh" onClick={isSaving ? undefined : handleCancel} />

        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-[80vw] h-[85vh] overflow-hidden flex flex-col">
          {customHeader}

          <div className="flex-1 flex overflow-hidden relative">
            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden transition-all duration-300 w-full">
              {/* Tabs */}
              <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6">
                {needsContextSelection && (
                  <button onClick={() => handleTabChange("context")} disabled={!isTabEnabled("context")} className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === "context" ? "border-primary-600 text-primary-600 dark:text-primary-400" : isTabEnabled("context") ? "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 cursor-pointer" : "border-transparent text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"}`}>
                    <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4" />
                    Contexto
                    {completedTabs.has("context") && <span className="ml-1 text-blue-500">✓</span>}
                  </button>
                )}
                <button onClick={() => handleTabChange("content")} disabled={!isTabEnabled("content")} className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === "content" ? "border-primary-600 text-primary-600 dark:text-primary-400" : isTabEnabled("content") ? "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 cursor-pointer" : "border-transparent text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"}`}>
                  <FileText className="h-4 w-4" />
                  Contenido
                  {completedTabs.has("content") && <span className="ml-1 text-blue-500">✓</span>}
                </button>
                <button onClick={() => handleTabChange("media")} disabled={!isTabEnabled("media")} className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === "media" ? "border-primary-600 text-primary-600 dark:text-primary-400" : isTabEnabled("media") ? "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 cursor-pointer" : "border-transparent text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"}`}>
                  <ImageIcon className="h-4 w-4" />
                  Multimedia
                  {completedTabs.has("media") && <span className="ml-1 text-blue-500">✓</span>}
                </button>
                <button onClick={() => handleTabChange("scheduling")} disabled={!isTabEnabled("scheduling")} className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === "scheduling" ? "border-primary-600 text-primary-600 dark:text-primary-400" : isTabEnabled("scheduling") ? "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 cursor-pointer" : "border-transparent text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"}`}>
                  <Calendar className="h-4 w-4" />
                  Programación
                  {completedTabs.has("scheduling") && <span className="ml-1 text-blue-500">✓</span>}
                </button>
                <button onClick={() => handleTabChange("preview")} disabled={!isTabEnabled("preview")} className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${activeTab === "preview" ? "border-primary-600 text-primary-600 dark:text-primary-400" : isTabEnabled("preview") ? "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 cursor-pointer" : "border-transparent text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"}`}>
                  <Eye className="h-4 w-4" />
                  Vista Previa
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === "context" && needsContextSelection && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    {/*          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                      <p className="text-sm text-blue-800 dark:text-blue-300">Selecciona el proyecto y la campaña donde se publicará este post</p>
                    </div> */}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        <FontAwesomeIcon icon={faLayerGroup} className="h-4 w-4 mr-2" />
                        Proyecto *
                      </label>
                      <select
                        value={selectedProjectId}
                        onChange={(e) => {
                          setSelectedProjectId(e.target.value);
                        }}
                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
                      >
                        <option value="">Selecciona un proyecto</option>
                        {availableProjects.map((project) => (
                          <option key={project._id} value={project._id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      {availableProjects.length === 0 && <p className="text-xs text-gray-500 mt-1">No hay proyectos disponibles</p>}
                    </div>
                  </div>
                )}

                {activeTab === "content" && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
                      <ChannelSelector selectedChannel={formData.channel || null} selectedChannels={formData.channels} onChannelSelect={handleChannelSelect} onMultiChannelSelect={handleMultiChannelSelect} postType={formData.postType} selectedFormat={formData.contentFormat} onFormatSelect={handleFormatSelect} selectedPlatforms={formData.platforms} onPlatformsSelect={handlePlatformsSelect} />
                    </div>

                    {formData.postType === "email" && <EmailConfigForm config={formData.channelConfig as EmailConfig} onChange={(config) => handleInputChange("channelConfig", config)} />}

                    {formData.postType === "push" && <PushConfigForm config={formData.channelConfig as PushConfig} onChange={(config) => handleInputChange("channelConfig", config)} existingImages={existingImageUrls} />}

                    {formData.postType === "social" && formData.contentFormat && formData.platforms && formData.platforms.length > 0 && (
                      <DynamicContentFields
                        format={formData.contentFormat}
                        platforms={formData.platforms}
                        values={formData.dynamicFields || {}}
                        onChange={(fieldName, value) => {
                          setFormData((prev) => ({
                            ...prev,
                            dynamicFields: {
                              ...prev.dynamicFields,
                              [fieldName]: value,
                            },
                          }));
                        }}
                        errors={fieldErrors}
                      />
                    )}

                    {/*                     {(formData.postType === "email" || formData.postType === "push" || (formData.postType === "social" && formData.contentFormat && formData.platforms && formData.platforms.length > 0)) && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                        <select value={formData.status} onChange={(e) => handleInputChange("status", e.target.value as PostStatus)} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white">
                          <option value="draft">Borrador</option>
                          <option value="pending_approval">Pendiente de aprobación</option>
                          <option value="approved">Aprobado</option>
                          <option value="rejected">Rechazado</option>
                          <option value="scheduled">Programado</option>
                          <option value="published">Publicado</option>
                        </select>
                      </div>
                    )} */}
                  </div>
                )}

                {activeTab === "media" && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Imágenes Seleccionadas</h3>

                      {existingImageUrls.length > 0 || imagePreviews.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
                          {existingImageUrls.map((url, index) => (
                            <div key={`existing-${index}`} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                              <img src={url} alt={`Existing ${index + 1}`} className="w-full h-full object-cover" />
                              <button type="button" onClick={() => handleRemoveExistingImage(index)} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600">
                                <X className="h-4 w-4" />
                              </button>
                              {index === 0 && existingImageUrls.length > 0 && imagePreviews.length === 0 && <div className="absolute top-2 left-2 px-2 py-1 bg-primary-600 text-white text-xs font-medium rounded shadow">Principal</div>}
                            </div>
                          ))}
                          {imagePreviews.map((preview, index) => (
                            <div key={`new-${index}`} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                              <img src={preview} alt={`Preview ${index + 1}`} className="w-full h-full object-cover" />
                              <button type="button" onClick={() => handleRemoveImage(index)} className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600">
                                <X className="h-4 w-4" />
                              </button>
                              {index === 0 && existingImageUrls.length === 0 && <div className="absolute top-2 left-2 px-2 py-1 bg-primary-600 text-white text-xs font-medium rounded shadow">Principal</div>}
                              <div className="absolute bottom-2 left-2 px-2 py-1 bg-blue-600 text-white text-xs font-medium rounded shadow">Nueva</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 mb-6">
                          <ImageIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                          <p className="text-gray-500 dark:text-gray-400 mb-2">No hay imágenes seleccionadas</p>
                          <p className="text-sm text-gray-400 dark:text-gray-500">Arrastra imágenes aquí o selecciónalas desde la galería lateral</p>
                        </div>
                      )}
                    </div>

                    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${isDragging ? "border-primary-500 bg-primary-50 dark:bg-primary-900/10 scale-105" : "border-gray-300 dark:border-gray-600 hover:border-primary-400"}`}>
                      <Upload className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                      <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">Subir imágenes desde tu computadora</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        Arrastra imágenes aquí o{" "}
                        <label className="text-primary-600 hover:text-primary-700 cursor-pointer font-medium">
                          explora
                          <input type="file" multiple accept="image/*" onChange={(e) => handleImageUpload(e.target.files)} className="hidden" />
                        </label>
                      </p>
                      <p className="text-xs text-gray-500">PNG, JPG, GIF hasta 10MB</p>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        <FontAwesomeIcon icon={faLightbulb} className="h-3.5 w-3.5" /> También puedes seleccionar imágenes generadas con IA desde el panel lateral de la galería
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "scheduling" && (
                  <div className="max-w-4xl mx-auto space-y-6">
                    <div className="space-y-3">
                      <label className={`relative flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${formData.publicationType === "immediate" ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 shadow-lg ring-2 ring-blue-300 dark:ring-blue-700" : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md"}`}>
                        {formData.publicationType === "immediate" && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-800 z-10">
                            <span className="text-white text-xs font-bold">✓</span>
                          </div>
                        )}
                        <input
                          type="radio"
                          name="publicationType"
                          checked={formData.publicationType === "immediate"}
                          onChange={() => {
                            setFormData((prev) => ({
                              ...prev,
                              publicationType: "immediate",
                              scheduling: { ...prev.scheduling, isScheduled: false, publishAt: "" },
                            }));
                          }}
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <span className={`text-base font-semibold flex items-center gap-2 ${formData.publicationType === "immediate" ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}`}>
                            <FontAwesomeIcon icon={faPaperPlane} className="h-5 w-5" />
                            Publicación inmediata
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">El post se publicará inmediatamente al guardar</p>
                        </div>
                      </label>

                      <label className={`relative flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${formData.publicationType === "scheduled" ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 shadow-lg ring-2 ring-blue-300 dark:ring-blue-700" : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md"}`}>
                        {formData.publicationType === "scheduled" && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-800 z-10">
                            <span className="text-white text-xs font-bold">✓</span>
                          </div>
                        )}
                        <input
                          type="radio"
                          name="publicationType"
                          checked={formData.publicationType === "scheduled"}
                          onChange={() => {
                            setFormData((prev) => ({
                              ...prev,
                              publicationType: "scheduled",
                              scheduling: { ...prev.scheduling, isScheduled: true },
                            }));
                          }}
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <span className={`text-base font-semibold flex items-center gap-2 ${formData.publicationType === "scheduled" ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}`}>
                            <FontAwesomeIcon icon={faClock} className="h-5 w-5" />
                            Programar publicación
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Programa este post para publicarse automáticamente en una fecha y hora específica</p>
                        </div>
                      </label>

                      <label className={`relative flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all ${formData.publicationType === "draft" ? "border-blue-600 bg-blue-50 dark:bg-blue-900/30 shadow-lg ring-2 ring-blue-300 dark:ring-blue-700" : "border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md"}`}>
                        {formData.publicationType === "draft" && (
                          <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-blue-600 dark:bg-blue-500 flex items-center justify-center shadow-lg ring-2 ring-white dark:ring-gray-800 z-10">
                            <span className="text-white text-xs font-bold">✓</span>
                          </div>
                        )}
                        <input
                          type="radio"
                          name="publicationType"
                          checked={formData.publicationType === "draft"}
                          onChange={() => {
                            setFormData((prev) => ({
                              ...prev,
                              publicationType: "draft",
                              scheduling: { ...prev.scheduling, isScheduled: false, publishAt: "" },
                            }));
                          }}
                          className="w-5 h-5 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <span className={`text-base font-semibold flex items-center gap-2 ${formData.publicationType === "draft" ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}`}>
                            <Save className="h-5 w-5" />
                            Guardar
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Guarda el post sin fecha de publicación. Podrás publicarlo o programarlo más tarde</p>
                        </div>
                      </label>
                    </div>

                    {formData.scheduling.isScheduled && (
                      <div className="space-y-6 pl-6 border-l-4 border-primary-500">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            <FontAwesomeIcon icon={faCalendar} className="h-4 w-4 mr-2" />
                            Fecha y hora de publicación *
                          </label>
                          <input type="datetime-local" value={formData.scheduling.publishAt} onChange={(e) => handleSchedulingChange("publishAt", e.target.value)} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Zona horaria</label>
                          <select value={formData.scheduling.timezone} onChange={(e) => handleSchedulingChange("timezone", e.target.value)} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white">
                            <option value="UTC">UTC</option>
                            <option value="America/New_York">America/New_York (EST)</option>
                            <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                            <option value="Europe/Madrid">Europe/Madrid (CET)</option>
                            <option value="America/Mexico_City">America/Mexico_City (CST)</option>
                            <option value="America/Bogota">America/Bogota (COT)</option>
                            <option value="America/Buenos_Aires">America/Buenos_Aires (ART)</option>
                          </select>
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.scheduling.recurrence?.enabled || false}
                              onChange={(e) => {
                                const newRecurrence = { ...formData.scheduling.recurrence, enabled: e.target.checked };
                                if (!newRecurrence.frequency) newRecurrence.frequency = "daily";
                                if (!newRecurrence.interval) newRecurrence.interval = 1;
                                handleSchedulingChange("recurrence", newRecurrence);
                              }}
                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 w-5 h-5"
                            />
                            <span className="text-base font-medium text-gray-900 dark:text-white">Repetir publicación</span>
                          </label>

                          {formData.scheduling.recurrence?.enabled && (
                            <div className="mt-4 ml-8 space-y-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Frecuencia</label>
                                  <select
                                    value={formData.scheduling.recurrence.frequency}
                                    onChange={(e) => {
                                      const newRecurrence = { ...formData.scheduling.recurrence, frequency: e.target.value as any };
                                      handleSchedulingChange("recurrence", newRecurrence);
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white"
                                  >
                                    <option value="daily">Diariamente</option>
                                    <option value="weekly">Semanalmente</option>
                                    <option value="monthly">Mensualmente</option>
                                    <option value="yearly">Anualmente</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cada</label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      min="1"
                                      value={formData.scheduling.recurrence.interval || 1}
                                      onChange={(e) => {
                                        const newRecurrence = { ...formData.scheduling.recurrence, interval: parseInt(e.target.value) || 1 };
                                        handleSchedulingChange("recurrence", newRecurrence);
                                      }}
                                      className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white"
                                    />
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {formData.scheduling.recurrence.frequency === "daily" && (formData.scheduling.recurrence.interval === 1 ? "día" : "días")}
                                      {formData.scheduling.recurrence.frequency === "weekly" && (formData.scheduling.recurrence.interval === 1 ? "semana" : "semanas")}
                                      {formData.scheduling.recurrence.frequency === "monthly" && (formData.scheduling.recurrence.interval === 1 ? "mes" : "meses")}
                                      {formData.scheduling.recurrence.frequency === "yearly" && (formData.scheduling.recurrence.interval === 1 ? "año" : "años")}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {formData.scheduling.recurrence.frequency === "weekly" && (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Repetir en</label>
                                  <div className="flex flex-wrap gap-2">
                                    {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((day, index) => {
                                      const isSelected = formData.scheduling.recurrence?.daysOfWeek?.includes(index) || false;
                                      return (
                                        <button
                                          key={index}
                                          type="button"
                                          onClick={() => {
                                            const currentDays = formData.scheduling.recurrence?.daysOfWeek || [];
                                            const newDays = isSelected ? currentDays.filter((d) => d !== index) : [...currentDays, index];
                                            const newRecurrence = { ...formData.scheduling.recurrence, daysOfWeek: newDays };
                                            handleSchedulingChange("recurrence", newRecurrence);
                                          }}
                                          className={`px-3 py-2 rounded-lg font-medium text-sm transition-colors ${isSelected ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"}`}
                                        >
                                          {day}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {formData.scheduling.recurrence.frequency === "monthly" && (
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Día del mes</label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={formData.scheduling.recurrence.dayOfMonth || 1}
                                    onChange={(e) => {
                                      const newRecurrence = { ...formData.scheduling.recurrence, dayOfMonth: parseInt(e.target.value) || 1 };
                                      handleSchedulingChange("recurrence", newRecurrence);
                                    }}
                                    className="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white"
                                  />
                                </div>
                              )}

                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Finaliza</label>
                                <div className="space-y-2">
                                  <label className="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name="recurrence-end"
                                      checked={!formData.scheduling.recurrence.endDate && !formData.scheduling.recurrence.endAfterOccurrences}
                                      onChange={() => {
                                        const newRecurrence = { ...formData.scheduling.recurrence };
                                        delete newRecurrence.endDate;
                                        delete newRecurrence.endAfterOccurrences;
                                        handleSchedulingChange("recurrence", newRecurrence);
                                      }}
                                      className="text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Nunca</span>
                                  </label>

                                  <label className="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name="recurrence-end"
                                      checked={!!formData.scheduling.recurrence.endDate}
                                      onChange={() => {
                                        const newRecurrence = { ...formData.scheduling.recurrence, endDate: "" };
                                        delete newRecurrence.endAfterOccurrences;
                                        handleSchedulingChange("recurrence", newRecurrence);
                                      }}
                                      className="text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">En fecha</span>
                                    {formData.scheduling.recurrence.endDate !== undefined && (
                                      <input
                                        type="date"
                                        value={formData.scheduling.recurrence.endDate}
                                        onChange={(e) => {
                                          const newRecurrence = { ...formData.scheduling.recurrence, endDate: e.target.value };
                                          handleSchedulingChange("recurrence", newRecurrence);
                                        }}
                                        className="ml-2 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white text-sm"
                                      />
                                    )}
                                  </label>

                                  <label className="flex items-center gap-2">
                                    <input
                                      type="radio"
                                      name="recurrence-end"
                                      checked={formData.scheduling.recurrence.endAfterOccurrences !== undefined}
                                      onChange={() => {
                                        const newRecurrence = { ...formData.scheduling.recurrence, endAfterOccurrences: 1 };
                                        delete newRecurrence.endDate;
                                        handleSchedulingChange("recurrence", newRecurrence);
                                      }}
                                      className="text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">Después de</span>
                                    {formData.scheduling.recurrence.endAfterOccurrences !== undefined && (
                                      <>
                                        <input
                                          type="number"
                                          min="1"
                                          value={formData.scheduling.recurrence.endAfterOccurrences}
                                          onChange={(e) => {
                                            const newRecurrence = { ...formData.scheduling.recurrence, endAfterOccurrences: parseInt(e.target.value) || 1 };
                                            handleSchedulingChange("recurrence", newRecurrence);
                                          }}
                                          className="ml-2 w-20 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-white text-sm"
                                        />
                                        <span className="text-sm text-gray-600 dark:text-gray-400">ocurrencias</span>
                                      </>
                                    )}
                                  </label>
                                </div>
                              </div>

                              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                <p className="text-xs text-blue-800 dark:text-blue-300">
                                  💡 <strong>Resumen:</strong> Este post se publicará {formData.scheduling.recurrence.frequency === "daily" && `cada ${formData.scheduling.recurrence.interval === 1 ? "" : formData.scheduling.recurrence.interval} ${formData.scheduling.recurrence.interval === 1 ? "día" : "días"}`}
                                  {formData.scheduling.recurrence.frequency === "weekly" && `cada ${formData.scheduling.recurrence.interval === 1 ? "" : formData.scheduling.recurrence.interval} ${formData.scheduling.recurrence.interval === 1 ? "semana" : "semanas"}`}
                                  {formData.scheduling.recurrence.frequency === "monthly" && `el día ${formData.scheduling.recurrence.dayOfMonth || 1} de cada ${formData.scheduling.recurrence.interval === 1 ? "mes" : `${formData.scheduling.recurrence.interval} meses`}`}
                                  {formData.scheduling.recurrence.frequency === "yearly" && `cada ${formData.scheduling.recurrence.interval === 1 ? "" : formData.scheduling.recurrence.interval} ${formData.scheduling.recurrence.interval === 1 ? "año" : "años"}`}
                                  {formData.scheduling.recurrence.endDate ? ` hasta el ${new Date(formData.scheduling.recurrence.endDate).toLocaleDateString()}` : formData.scheduling.recurrence.endAfterOccurrences ? ` durante ${formData.scheduling.recurrence.endAfterOccurrences} ocurrencias` : ""}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                          <p className="text-sm text-blue-800 dark:text-blue-300">
                            ⚠️ <strong>Importante:</strong> El post se publicará automáticamente en la fecha y hora seleccionada. Asegúrate de revisar todo antes de programar.
                          </p>
                        </div>
                      </div>
                    )}

                    {formData.publicationType === "immediate" && (
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 text-center">
                        <FontAwesomeIcon icon={faPaperPlane} className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400 mb-2">Publicación inmediata</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">Este post se publicará inmediatamente al guardar</p>
                      </div>
                    )}

                    {formData.publicationType === "draft" && (
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-8 text-center">
                        <Save className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-500 dark:text-gray-400 mb-2">Guardar </p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">Este post se guardará sin programación. Podrás publicarlo o programarlo cuando lo decidas</p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "preview" && (
                  <div className="max-w-6xl mx-auto">
                    {formData.postType === "social" && (
                      <>
                        <div className="mb-6">
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Vista previa en diferentes plataformas</h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">Verifica cómo se verá tu post en cada red social antes de publicar</p>
                        </div>
                        <PlatformPreviewGrid platforms={formData.platforms} content={formData.content} images={[...existingImageUrls, ...imagePreviews]} title={formData.title} />
                      </>
                    )}

                    {formData.postType === "email" && <EmailPreview config={formData.channelConfig as EmailConfig} images={[...existingImageUrls, ...imagePreviews]} />}

                    {formData.postType === "push" && <PushNotificationPreview config={formData.channelConfig as PushConfig} images={[...existingImageUrls, ...imagePreviews]} />}
                  </div>
                )}
              </div>

              {/* Footer - Fixed dentro del contenido principal */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                <div className="flex items-center gap-4">
                  <p className="text-xs text-gray-500 dark:text-gray-500">* Campos obligatorios</p>
                  {(existingImageUrls.length > 0 || imagePreviews.length > 0) && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                      <ImageIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                      <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
                        {existingImageUrls.length + imagePreviews.length} {existingImageUrls.length + imagePreviews.length === 1 ? "imagen" : "imágenes"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const currentIndex = tabSequence.indexOf(activeTab);
                    const firstAvailableTab = needsContextSelection ? "context" : "content";
                    const canGoBack = currentIndex > 0 && activeTab !== firstAvailableTab;

                    return canGoBack ? (
                      <button
                        onClick={() => {
                          let previousTab = tabSequence[currentIndex - 1];
                          if (!needsContextSelection && previousTab === "context") {
                            return;
                          }
                          setActiveTab(previousTab);
                        }}
                        className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Volver
                      </button>
                    ) : null;
                  })()}

                  <button onClick={handleCancel} disabled={isSaving} className="px-6 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    Cancelar
                  </button>

                  {mode === "edit" && activeTab !== "preview" && (
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Guardando...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Guardar Cambios
                        </>
                      )}
                    </button>
                  )}

                  {activeTab !== "preview" ? (
                    <button onClick={handleContinueToNextTab} disabled={!canContinueFromCurrentTab() || isSaving} className="px-6 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:text-gray-200 disabled:cursor-not-allowed disabled:opacity-60 transition-colors flex items-center gap-2" title={activeTab === "scheduling" && formData.publicationType === "scheduled" && !formData.scheduling.publishAt ? "Debes seleccionar una fecha y hora de publicación" : ""}>
                      Continuar
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2">
                      {isSaving ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Guardando...
                        </>
                      ) : (
                        <>
                          {formData.publicationType === "immediate" && (
                            <>
                              <FontAwesomeIcon icon={faPaperPlane} className="h-4 w-4" />
                              {mode === "create" ? "Publicar Ahora" : "Actualizar y Publicar"}
                            </>
                          )}
                          {formData.publicationType === "scheduled" && (
                            <>
                              <FontAwesomeIcon icon={faClock} className="h-4 w-4" />
                              {mode === "create" ? "Programar Post" : "Actualizar Programación"}
                            </>
                          )}
                          {formData.publicationType === "draft" && (
                            <>
                              <Save className="h-4 w-4" />
                              {mode === "create" ? "Guardar " : "Guardar Cambios"}
                            </>
                          )}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Creative Gallery Panel - Solo visible en el paso de Multimedia */}
            {activeTab === "media" && (
              <div className="w-96 flex-shrink-0 transition-all duration-300">
                <CreativeGalleryPanel images={galleryImages} selectedImages={selectedGalleryImages} onImageSelect={handleGalleryImageSelect} onOpenCreativeSuite={handleOpenCreativeSuite} loading={galleryLoading} totalCount={totalAssets} pendingIncludeUserAssets={pendingIncludeUserAssets} onTogglePendingUserAssets={setPendingIncludeUserAssets} onApplyFilters={applyFilters} activeFilters={activeFilters} onRemoveFilter={removeFilter} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
