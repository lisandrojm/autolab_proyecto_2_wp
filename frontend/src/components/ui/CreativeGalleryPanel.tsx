import React, { useState, useMemo } from "react";
import { Search, Image as ImageIcon, Check, Sparkles, Palette, Filter } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { AssetFilterModal } from "./AssetFilterModal";
import { FilterBadges } from "./FilterBadges";
import { ActiveFilter } from "../../hooks/useAssetGallery";

interface GalleryImage {
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
}

interface CreativeGalleryPanelProps {
  images: GalleryImage[];
  selectedImages: string[];
  onImageSelect: (imageId: string) => void;
  onOpenCreativeSuite: () => void;
  loading?: boolean;
  totalCount?: number;
  pendingIncludeUserAssets: boolean;
  onTogglePendingUserAssets: (include: boolean) => void;
  onApplyFilters: () => void;
  activeFilters: ActiveFilter[];
  onRemoveFilter: (filterId: string) => void;
}

export const CreativeGalleryPanel: React.FC<CreativeGalleryPanelProps> = ({ images, selectedImages, onImageSelect, onOpenCreativeSuite, loading = false, totalCount, pendingIncludeUserAssets, onTogglePendingUserAssets, onApplyFilters, activeFilters, onRemoveFilter }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const filteredImages = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return images;

    return images.filter((img) => {
      const matchesName = img.name.toLowerCase().includes(term);
      const matchesTags = img.tags?.some((tag) => tag.toLowerCase().includes(term)) ?? false;
      return matchesName || matchesTags;
    });
  }, [images, searchTerm]);

  const handleImageClick = (imageId: string) => onImageSelect(imageId);

  const handleImageError = (imageId: string, url: string) => {
    console.error("[CreativeGalleryPanel] Image failed to load:", { imageId, url });
    setFailedImages((prev) => new Set(prev).add(imageId));
  };

  const handleImageLoad = (imageId: string) => {
    console.log("[CreativeGalleryPanel] Image loaded successfully:", imageId);
    setFailedImages((prev) => {
      const newSet = new Set(prev);
      newSet.delete(imageId);
      return newSet;
    });
  };

  const getScopeBadgeColor = (scope?: string) => {
    switch (scope) {
      case "brandkit":
        return "bg-blue-500";
      case "posts":
        return "bg-blue-500";
      case "campaigns":
        return "bg-blue-500";
      case "assets":
        return "bg-gray-500";
      default:
        return "bg-gray-400";
    }
  };

  const getScopeLabel = (scope?: string) => {
    switch (scope) {
      case "brandkit":
        return "Brand Kit";
      case "posts":
        return "Posts";
      case "campaigns":
        return "Campañas";
      case "assets":
        return "General";
      default:
        return "General";
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900/50 border-l border-gray-200 dark:border-gray-700">
      {/* Toolbar */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 space-y-3">
        {/* Search and Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Buscar imágenes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
          </div>
          <button onClick={() => setIsFilterModalOpen(true)} className="p-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Filtros">
            <Filter className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Image Counter and Active Filters */}
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {filteredImages.length} imagen{filteredImages.length !== 1 ? "es" : ""}
          </div>
          <FilterBadges filters={activeFilters} onRemoveFilter={onRemoveFilter} />
        </div>
      </div>

      {/* Contenido: 3 columnas fijas */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 dark:bg-gray-700 rounded-md" />
            ))}
          </div>
        ) : filteredImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6">
            <ImageIcon className="h-14 w-14 text-gray-300 dark:text-gray-600 mb-3" />
            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">No hay imágenes</h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">{searchTerm ? "No se encontraron resultados" : "Generá tu primera imagen con IA"}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredImages.map((image) => {
              const isSelected = selectedImages.includes(image.id);
              const hasFailed = failedImages.has(image.id);
              return (
                <div key={image.id} onClick={() => handleImageClick(image.id)} className={"relative group aspect-square rounded-md overflow-hidden cursor-pointer transition-transform hover:scale-[1.015] " + (isSelected ? "ring-4 ring-primary-500 shadow-lg" : "hover:shadow-md")} title={image.name}>
                  {hasFailed ? (
                    <div className="w-full h-full bg-gray-200 dark:bg-gray-700 flex flex-col items-center justify-center">
                      <ImageIcon className="h-10 w-10 text-gray-400 dark:text-gray-500 mb-2" />
                      <p className="text-xs text-gray-500 dark:text-gray-400 text-center px-2">Error al cargar</p>
                    </div>
                  ) : (
                    <img src={image.thumbnail || image.url} alt={image.name} className="w-full h-full object-cover" onError={() => handleImageError(image.id, image.url)} onLoad={() => handleImageLoad(image.id)} loading="lazy" />
                  )}

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                  {/* Badges (solo en hover) */}
                  <div className="absolute top-1.5 left-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {image.isNew && <span className="px-1.5 py-0.5 bg-blue-500 text-white text-[10px] font-medium rounded-full shadow">Nueva</span>}
                    {image.isAiGenerated && (
                      <span className="px-1.5 py-0.5 bg-primary-500 text-white text-[10px] font-medium rounded-full shadow inline-flex items-center gap-1">
                        <Sparkles className="h-2.5 w-2.5" />
                        IA
                      </span>
                    )}
                    {image.isUsed && <span className="px-1.5 py-0.5 bg-gray-500 text-white text-[10px] font-medium rounded-full shadow">Usada</span>}
                    {image.scope && <span className={`px-1.5 py-0.5 ${getScopeBadgeColor(image.scope)} text-white text-[10px] font-medium rounded-full shadow`}>{getScopeLabel(image.scope)}</span>}
                  </div>

                  {/* Selección */}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary-600 rounded-full flex items-center justify-center shadow-lg">
                      <Check className="h-3.5 w-3.5 text-white" />
                    </div>
                  )}

                  {/* Nombre (solo en hover) */}
                  <div className="absolute bottom-0 left-0 right-0 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <p className="text-[11px] font-medium text-white truncate">{image.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer fijo con Creative Suite */}
      <div className="sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-3 py-4">
        <button onClick={onOpenCreativeSuite} className="w-full p-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-md font-medium flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg">
          <Palette className="h-4 w-4" />
          <span className="text-md">Creative Suite</span>
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Modal de Filtros */}
      <AssetFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => setIsFilterModalOpen(false)}
        pendingIncludeUserAssets={pendingIncludeUserAssets}
        onTogglePendingUserAssets={onTogglePendingUserAssets}
        onApply={() => {
          onApplyFilters();
          setIsFilterModalOpen(false);
        }}
      />
    </div>
  );
};
