import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { ragAPI, RagDocument } from "../api/rag";
import { assetsAPI, Asset } from "../api/assets";
import { FileText, Search, Filter, Plus, RefreshCw, Trash2, Upload, CheckCircle, Clock, XCircle, Eye, X } from "lucide-react";

export const RagCorpus: React.FC = () => {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [showIngestModal, setShowIngestModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<RagDocument | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const filters: any = { page, limit: 20 };

      if (filterStatus !== "all") {
        filters.status = filterStatus;
      }

      if (filterSource !== "all") {
        filters.source = filterSource;
      }

      const response = await ragAPI.listDocuments(filters);
      setDocuments(response.documents);
      setTotalPages(response.pagination.pages);
    } catch (error) {
      console.error("Error fetching RAG documents:", error);
    } finally {
      setLoading(false);
    }
  }, [page, filterStatus, filterSource]);

  const fetchAssets = useCallback(async () => {
    try {
      const response = await assetsAPI.listAssets({
        kind: "pdf",
        limit: 100,
      });
      setAssets(response.assets.filter((asset) => ["pdf", "doc"].includes(asset.kind) && asset.status === "ready"));
    } catch (error) {
      console.error("Error fetching assets:", error);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    if (showIngestModal) {
      fetchAssets();
    }
  }, [showIngestModal, fetchAssets]);

  const handleIngestFromAsset = async (assetId: string, title: string) => {
    try {
      await ragAPI.ingestDocument({
        assetId,
        title,
        labels: ["documento"],
        language: "es",
      });

      setShowIngestModal(false);
      await fetchDocuments();
    } catch (error) {
      console.error("Error ingesting document:", error);
    }
  };

  const handleIngestFromText = async (data: { text: string; title: string; labels: string[] }) => {
    try {
      await ragAPI.ingestDocument({
        text: data.text,
        title: data.title,
        labels: data.labels,
        language: "es",
      });

      setShowIngestModal(false);
      await fetchDocuments();
    } catch (error) {
      console.error("Error ingesting text:", error);
    }
  };

  const handleReindex = async (docId: string) => {
    try {
      await ragAPI.reindexDocument(docId);
      await fetchDocuments();
    } catch (error) {
      console.error("Error reindexing document:", error);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este documento?")) return;

    try {
      await ragAPI.deleteDocument(docId);
      await fetchDocuments();
    } catch (error) {
      console.error("Error deleting document:", error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "ready":
        return <CheckCircle className="h-5 w-5 text-blue-600" />;
      case "processing":
        return <Clock className="h-5 w-5 text-blue-600" />;
      case "failed":
        return <XCircle className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ready":
        return "bg-blue-100/20 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "processing":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const filteredDocuments = documents.filter((doc) => doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || doc.labels.some((label) => label.toLowerCase().includes(searchTerm.toLowerCase())));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Corpus RAG</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Gestiona documentos para búsqueda inteligente y generación de contenido</p>
              </div>
              <button onClick={() => setShowIngestModal(true)} className="btn-primary flex items-center space-x-2">
                <Plus className="h-5 w-5" />
                <span>Ingerir Documento</span>
              </button>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input type="text" placeholder="Buscar documentos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
              </div>
              <div className="flex items-center space-x-2">
                <Filter className="h-5 w-5 text-gray-400" />
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white">
                  <option value="all">Todos los estados</option>
                  <option value="processing">Procesando</option>
                  <option value="ready">Listo</option>
                  <option value="failed">Fallido</option>
                </select>
                <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white">
                  <option value="all">Todas las fuentes</option>
                  <option value="upload">Subida</option>
                  <option value="brief">Brief</option>
                  <option value="guideline">Guía</option>
                  <option value="email">Email</option>
                  <option value="post">Post</option>
                </select>
              </div>
            </div>
          </div>

          {/* Documents Table */}
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600 dark:text-gray-400">Cargando documentos...</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              <div className=" rounded border dark:border-slate-800">
                <table className="w-full dark:bg-slate-800/80">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Documento</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Chunks</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Etiquetas</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredDocuments.map((doc) => (
                      <tr key={doc._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <FileText className="h-5 w-5 text-gray-400 mr-3" />
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">{doc.title}</div>
                              <div className="text-sm text-gray-500 dark:text-gray-400">{doc.source}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {getStatusIcon(doc.status)}
                            <span className={`ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(doc.status)}`}>{doc.status}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{doc.chunkCount}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex flex-wrap gap-1">
                            {doc.labels.slice(0, 2).map((label, index) => (
                              <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                                {label}
                              </span>
                            ))}
                            {doc.labels.length > 2 && <span className="text-xs text-gray-500">+{doc.labels.length - 2}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{new Date(doc.createdAt).toLocaleDateString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <div className="flex items-center justify-end space-x-2">
                            <button onClick={() => setSelectedDocument(doc)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Ver detalles">
                              <Eye className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button onClick={() => handleReindex(doc._id)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Reindexar">
                              <RefreshCw className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button onClick={() => handleDelete(doc._id)} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Eliminar">
                              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center space-x-2 p-4 border-t border-gray-200 dark:border-gray-700">
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
            </div>
          )}

          {/* Ingest Modal */}
          {showIngestModal && <IngestModal assets={assets} onClose={() => setShowIngestModal(false)} onIngestFromAsset={handleIngestFromAsset} onIngestFromText={handleIngestFromText} />}

          {/* Document Detail Modal */}
          {selectedDocument && <DocumentDetailModal document={selectedDocument} onClose={() => setSelectedDocument(null)} />}
        </div>
      </div>
    </div>
  );
};

// Ingest Modal Component
interface IngestModalProps {
  assets: Asset[];
  onClose: () => void;
  onIngestFromAsset: (assetId: string, title: string) => void;
  onIngestFromText: (data: { text: string; title: string; labels: string[] }) => void;
}

const IngestModal: React.FC<IngestModalProps> = ({ assets, onClose, onIngestFromAsset, onIngestFromText }) => {
  const [mode, setMode] = useState<"asset" | "text">("asset");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [labels, setLabels] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "asset" && selectedAsset) {
      const asset = assets.find((a) => a._id === selectedAsset);
      onIngestFromAsset(selectedAsset, title || asset?.filename || "Documento");
    } else if (mode === "text" && text && title) {
      onIngestFromText({
        text,
        title,
        labels: labels
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Ingerir Documento</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            {/* Mode Selection */}
            <div className="mb-6">
              <div className="flex space-x-4">
                <button type="button" onClick={() => setMode("asset")} className={`px-4 py-2 rounded-lg font-medium ${mode === "asset" ? "bg-primary-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}>
                  Desde Asset
                </button>
                <button type="button" onClick={() => setMode("text")} className={`px-4 py-2 rounded-lg font-medium ${mode === "text" ? "bg-primary-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}>
                  Texto Directo
                </button>
              </div>
            </div>

            {mode === "asset" ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Seleccionar Asset</label>
                  <select value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" required>
                    <option value="">Seleccionar documento...</option>
                    {assets.map((asset) => (
                      <option key={asset._id} value={asset._id}>
                        {asset.filename} ({asset.kind})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Título (opcional)</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" placeholder="Se usará el nombre del archivo si está vacío" />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Título *</label>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Texto *</label>
                  <textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white resize-none" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Etiquetas (separadas por comas)</label>
                  <input type="text" value={labels} onChange={(e) => setLabels(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" placeholder="brief, guía, marketing" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 mt-6">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                Cancelar
              </button>
              <button type="submit" className="btn-primary">
                Ingerir Documento
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Document Detail Modal Component
interface DocumentDetailModalProps {
  document: RagDocument;
  onClose: () => void;
}

const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({ document, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl">
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Detalles del Documento</h2>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="p-6">
            <dl className="space-y-4">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Título</dt>
                <dd className="text-lg font-medium text-gray-900 dark:text-white">{document.title}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Fuente</dt>
                <dd className="text-gray-900 dark:text-white">{document.source}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Estado</dt>
                <dd className="text-gray-900 dark:text-white">{document.status}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Chunks</dt>
                <dd className="text-gray-900 dark:text-white">{document.chunkCount}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Idioma</dt>
                <dd className="text-gray-900 dark:text-white">{document.language}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Etiquetas</dt>
                <dd className="flex flex-wrap gap-2 mt-1">
                  {document.labels.map((label, index) => (
                    <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                      {label}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Creado</dt>
                <dd className="text-gray-900 dark:text-white">{new Date(document.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};
