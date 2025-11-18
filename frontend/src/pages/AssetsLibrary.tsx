import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { assetsAPI, Asset } from "../api/assets";
import { Upload, Search, Filter, Image, Video, FileText, File, Download, Trash2, Copy, Eye, MoreVertical, X } from "lucide-react";

export const AssetsLibrary: React.FC = () => {
  const { t } = useTranslation();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchAssets = useCallback(async () => {
    try {
      setLoading(true);
      const filters: any = { page, limit: 20 };

      if (filterKind !== "all") {
        filters.kind = filterKind;
      }

      const response = await assetsAPI.listAssets(filters);
      setAssets(response.assets);
      setTotalPages(response.pagination.pages);
    } catch (error) {
      console.error("Error fetching assets:", error);
    } finally {
      setLoading(false);
    }
  }, [page, filterKind]);

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const handleFileUpload = async (files: FileList) => {
    if (!files.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        // Generate upload URL
        const uploadData = await assetsAPI.generateUploadUrl({
          filename: file.name,
          mimeType: file.type,
          bytes: file.size,
          tags: [],
        });

        // Upload file
        await assetsAPI.uploadFile(uploadData.uploadUrl, file);

        // Complete upload
        await assetsAPI.completeUpload(uploadData.assetId);
      }

      // Refresh assets list
      await fetchAssets();
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    handleFileUpload(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const copyAssetUrl = async (asset: Asset) => {
    try {
      const response = await assetsAPI.getAssetUrl(asset._id);
      await navigator.clipboard.writeText(response.url);
      // Show success message
    } catch (error) {
      console.error("Error copying URL:", error);
    }
  };

  const deleteAsset = async (assetId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este asset?")) return;

    try {
      await assetsAPI.deleteAsset(assetId);
      await fetchAssets();
    } catch (error) {
      console.error("Error deleting asset:", error);
    }
  };

  const getKindIcon = (kind: string) => {
    switch (kind) {
      case "image":
        return <Image className="h-5 w-5" />;
      case "video":
        return <Video className="h-5 w-5" />;
      case "pdf":
        return <FileText className="h-5 w-5" />;
      default:
        return <File className="h-5 w-5" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "text-blue-600 dark:text-blue-400";
      case "processing":
        return "text-blue-600 dark:text-blue-400";
      case "failed":
        return "text-red-600 dark:text-red-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const filteredAssets = assets.filter((asset) => asset.filename.toLowerCase().includes(searchTerm.toLowerCase()) || asset.tags.some((tag) => tag.toLowerCase().includes(searchTerm.toLowerCase())));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Biblioteca de Assets</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Gestiona archivos, imágenes y documentos de tus campañas</p>
              </div>
              <label className="btn-primary flex items-center space-x-2 cursor-pointer">
                <Upload className="h-5 w-5" />
                <span>{uploading ? "Subiendo..." : "Subir Archivos"}</span>
                <input type="file" multiple className="hidden" onChange={(e) => e.target.files && handleFileUpload(e.target.files)} disabled={uploading} />
              </label>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input type="text" placeholder="Buscar assets..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
              </div>
              <div className="flex items-center space-x-2">
                <Filter className="h-5 w-5 text-gray-400" />
                <select value={filterKind} onChange={(e) => setFilterKind(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white">
                  <option value="all">Todos los tipos</option>
                  <option value="image">Imágenes</option>
                  <option value="video">Videos</option>
                  <option value="audio">Audio</option>
                  <option value="pdf">PDF</option>
                  <option value="doc">Documentos</option>
                  <option value="other">Otros</option>
                </select>
              </div>
            </div>
          </div>

          {/* Upload Drop Zone */}
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 mb-6 text-center hover:border-primary-500 transition-colors" onDrop={handleDrop} onDragOver={handleDragOver}>
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">Arrastra archivos aquí o haz clic para subir</p>
            <p className="text-gray-600 dark:text-gray-400">Soporta imágenes, videos, PDFs y documentos</p>
          </div>

          {/* Assets Grid */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Cargando assets...</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6 mt-4mt-2">
                {filteredAssets.map((asset) => (
                  <div key={asset._id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
                    {/* Asset Preview */}
                    <div className="aspect-square bg-gray-100 dark:bg-gray-700 flex items-center justify-center relative">
                      {asset.kind === "image" && asset.status === "ready" ? <img src={`/api/v1/assets/serve/${encodeURIComponent(asset.path)}`} alt={asset.filename} className="w-full h-full object-cover" /> : <div className="text-gray-400">{getKindIcon(asset.kind)}</div>}

                      {/* Status indicator */}
                      <div className={`absolute top-2 right-2 w-3 h-3 rounded-full ${asset.status === "ready" ? "bg-blue-500" : asset.status === "processing" ? "bg-blue-500" : "bg-red-500"}`} />
                    </div>

                    {/* Asset Info */}
                    <div className="p-4">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate mb-1">{asset.filename}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        {formatFileSize(asset.bytes)} • {asset.kind}
                      </p>
                      <p className={`text-xs font-medium mb-3 ${getStatusColor(asset.status)}`}>{asset.status}</p>

                      {/* Tags */}
                      {asset.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {asset.tags.slice(0, 2).map((tag, index) => (
                            <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                              {tag}
                            </span>
                          ))}
                          {asset.tags.length > 2 && <span className="text-xs text-gray-500">+{asset.tags.length - 2}</span>}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between">
                        <button onClick={() => setSelectedAsset(asset)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Ver detalles">
                          <Eye className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button onClick={() => copyAssetUrl(asset)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Copiar URL">
                          <Copy className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button onClick={() => deleteAsset(asset._id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Eliminar">
                          <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center space-x-2 mt-8">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50">
                    Anterior
                  </button>
                  <span className="px-4 py-2 text-gray-600 dark:text-gray-400">
                    Página {page} de {totalPages}
                  </span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50">
                    Siguiente
                  </button>
                </div>
              )}
            </>
          )}

          {/* Asset Detail Modal */}
          {selectedAsset && (
            <div className="fixed inset-0 z-50 overflow-y-auto">
              <div className="flex min-h-screen items-center justify-center p-4">
                <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setSelectedAsset(null)} />

                <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl">
                  <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalles del Asset</h2>
                    <button onClick={() => setSelectedAsset(null)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">Información General</h3>
                        <dl className="space-y-2 text-sm">
                          <div>
                            <dt className="text-gray-600 dark:text-gray-400">Nombre:</dt>
                            <dd className="text-gray-900 dark:text-white">{selectedAsset.filename}</dd>
                          </div>
                          <div>
                            <dt className="text-gray-600 dark:text-gray-400">Tipo:</dt>
                            <dd className="text-gray-900 dark:text-white">{selectedAsset.kind}</dd>
                          </div>
                          <div>
                            <dt className="text-gray-600 dark:text-gray-400">Tamaño:</dt>
                            <dd className="text-gray-900 dark:text-white">{formatFileSize(selectedAsset.bytes)}</dd>
                          </div>
                          <div>
                            <dt className="text-gray-600 dark:text-gray-400">Estado:</dt>
                            <dd className={getStatusColor(selectedAsset.status)}>{selectedAsset.status}</dd>
                          </div>
                        </dl>
                      </div>

                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-2">Variantes</h3>
                        {selectedAsset.variants.length > 0 ? (
                          <div className="space-y-2 text-sm">
                            {selectedAsset.variants.map((variant, index) => (
                              <div key={index} className="flex justify-between">
                                <span className="text-gray-600 dark:text-gray-400">{variant.name}:</span>
                                <span className="text-gray-900 dark:text-white">{formatFileSize(variant.bytes)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 dark:text-gray-500 text-sm">No hay variantes disponibles</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
