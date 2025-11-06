import { useState, useEffect, useCallback } from "react";
import { clientAssetsAPI, AssetFilters, ClientAsset } from "../api/clientAssets";
import { getImageUrl } from "../utils/imageHelpers";

export interface GalleryImage {
  id: string;
  url: string;
  thumbnail?: string;
  name: string;
  isAiGenerated?: boolean;
  isUsed?: boolean;
  isNew?: boolean;
  createdAt?: string;
  tags?: string[];
  scope?: string;
  assetData?: ClientAsset;
}

export interface ActiveFilter {
  id: string;
  label: string;
  value: any;
}

interface UseAssetGalleryResult {
  images: GalleryImage[];
  loading: boolean;
  error: string | null;
  total: number;
  hasMore: boolean;
  newImagesCount: number;
  fetchAssets: (filters?: AssetFilters) => Promise<void>;
  refreshGallery: () => Promise<void>;
  includeUserAssets: boolean;
  setIncludeUserAssets: (include: boolean) => void;
  pendingIncludeUserAssets: boolean;
  setPendingIncludeUserAssets: (include: boolean) => void;
  applyFilters: () => void;
  activeFilters: ActiveFilter[];
  removeFilter: (filterId: string) => void;
  sortBy: "createdAt" | "nombre";
  setSortBy: (sortBy: "createdAt" | "nombre") => void;
  sortOrder: "asc" | "desc";
  setSortOrder: (sortOrder: "asc" | "desc") => void;
}

const LAST_VISIT_KEY_PREFIX = "lastGalleryVisit_";
const INCLUDE_USER_ASSETS_KEY = "galleryIncludeUserAssets";

const getStoredIncludeUserAssets = (): boolean => {
  try {
    const stored = localStorage.getItem(INCLUDE_USER_ASSETS_KEY);
    return stored === "true";
  } catch {
    return false;
  }
};

const setStoredIncludeUserAssets = (value: boolean): void => {
  try {
    localStorage.setItem(INCLUDE_USER_ASSETS_KEY, String(value));
  } catch (error) {
    console.error("Error guardando preferencia de filtro:", error);
  }
};

export const useAssetGallery = (clientId: string | undefined, campaignId?: string): UseAssetGalleryResult => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [newImagesCount, setNewImagesCount] = useState(0);
  const [currentFilters, setCurrentFilters] = useState<AssetFilters>({});
  const [includeUserAssets, setIncludeUserAssets] = useState(getStoredIncludeUserAssets);
  const [pendingIncludeUserAssets, setPendingIncludeUserAssets] = useState(getStoredIncludeUserAssets);
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [sortBy, setSortBy] = useState<"createdAt" | "nombre">("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const getLastVisitTimestamp = useCallback(() => {
    if (!clientId) return null;
    const key = `${LAST_VISIT_KEY_PREFIX}${clientId}`;
    const timestamp = localStorage.getItem(key);
    return timestamp ? new Date(timestamp) : null;
  }, [clientId]);

  const updateLastVisitTimestamp = useCallback(() => {
    if (!clientId) return;
    const key = `${LAST_VISIT_KEY_PREFIX}${clientId}`;
    localStorage.setItem(key, new Date().toISOString());
  }, [clientId]);

  const transformAssetToGalleryImage = useCallback((asset: ClientAsset, lastVisit: Date | null): GalleryImage => {
    const isNew = lastVisit ? new Date(asset.createdAt) > lastVisit : false;
    const isUsed = asset.usedInPosts && asset.usedInPosts.length > 0;

    // Procesar URL usando el helper para asegurar URL completa y válida
    const processedUrl = getImageUrl(asset.url);
    console.log("[useAssetGallery] Transform asset:", {
      assetId: asset._id,
      originalUrl: asset.url,
      processedUrl,
      scope: asset.scope,
    });

    return {
      id: asset._id,
      url: processedUrl || asset.url,
      thumbnail: processedUrl || asset.url,
      name: asset.metadata?.name || asset.nombre,
      isAiGenerated: asset.isAiGenerated || false,
      isUsed,
      isNew,
      createdAt: asset.createdAt,
      tags: asset.tags,
      scope: asset.scope,
      assetData: asset,
    };
  }, []);

  const fetchAssets = useCallback(
    async (filters: AssetFilters = {}) => {
      if (!clientId) {
        setImages([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const userId = localStorage.getItem("userId");

        // Enviar userId solo cuando includeUserAssets está activado
        const mergedFilters: AssetFilters = {
          clientId,
          includeUserAssets,
          userId: includeUserAssets && userId ? userId : undefined,
          limit: 100,
          sortBy,
          sortOrder,
          ...filters,
        };

        console.log("[useAssetGallery] Fetching assets with filters:", {
          clientId,
          includeUserAssets,
          hasUserId: !!userId,
          willSendUserId: includeUserAssets && !!userId,
        });

        setCurrentFilters(mergedFilters);

        const response = await clientAssetsAPI.queryAssets(mergedFilters);
        const lastVisit = getLastVisitTimestamp();

        const transformedImages = response.assets.map((asset) => transformAssetToGalleryImage(asset, lastVisit));

        setImages(transformedImages);
        setTotal(response.total);
        setHasMore(response.hasMore);

        const newCount = transformedImages.filter((img) => img.isNew).length;
        setNewImagesCount(newCount);
      } catch (err: any) {
        console.error("Error fetching assets:", err);
        setError(err?.message || "Error al cargar las imágenes");
        setImages([]);
      } finally {
        setLoading(false);
      }
    },
    [clientId, includeUserAssets, sortBy, sortOrder, getLastVisitTimestamp, transformAssetToGalleryImage]
  );

  const refreshGallery = useCallback(async () => {
    updateLastVisitTimestamp();
    await fetchAssets(currentFilters);
  }, [currentFilters, fetchAssets, updateLastVisitTimestamp]);

  const handleSetIncludeUserAssets = useCallback((value: boolean) => {
    setIncludeUserAssets(value);
    setStoredIncludeUserAssets(value);
  }, []);

  const applyFilters = useCallback(() => {
    setIncludeUserAssets(pendingIncludeUserAssets);
    setStoredIncludeUserAssets(pendingIncludeUserAssets);

    const newActiveFilters: ActiveFilter[] = [];

    if (pendingIncludeUserAssets) {
      newActiveFilters.push({
        id: "includeUserAssets",
        label: "Incluye imágenes personales",
        value: true,
      });
    }

    setActiveFilters(newActiveFilters);
  }, [pendingIncludeUserAssets]);

  const removeFilter = useCallback((filterId: string) => {
    if (filterId === "includeUserAssets") {
      setIncludeUserAssets(false);
      setPendingIncludeUserAssets(false);
      setStoredIncludeUserAssets(false);
    }

    setActiveFilters((prev) => prev.filter((f) => f.id !== filterId));
  }, []);

  useEffect(() => {
    if (clientId) {
      fetchAssets();
    }
  }, [clientId, includeUserAssets, sortBy, sortOrder]);

  useEffect(() => {
    const newActiveFilters: ActiveFilter[] = [];

    if (includeUserAssets) {
      newActiveFilters.push({
        id: "includeUserAssets",
        label: "Incluye imágenes personales",
        value: true,
      });
    }

    setActiveFilters(newActiveFilters);
  }, [includeUserAssets]);

  return {
    images,
    loading,
    error,
    total,
    hasMore,
    newImagesCount,
    fetchAssets,
    refreshGallery,
    includeUserAssets,
    setIncludeUserAssets: handleSetIncludeUserAssets,
    pendingIncludeUserAssets,
    setPendingIncludeUserAssets,
    applyFilters,
    activeFilters,
    removeFilter,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
  };
};
