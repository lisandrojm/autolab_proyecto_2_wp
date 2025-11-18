import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { ragAPI, SearchResult } from "../api/rag";
import { Search, Filter, FileText, Zap, BarChart3, Copy, ExternalLink } from "lucide-react";

export const RagPlayground: React.FC = () => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{
    vector: SearchResult[];
    text: SearchResult[];
    hybrid: SearchResult[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"hybrid" | "vector" | "text">("hybrid");
  const [filters, setFilters] = useState({
    clientId: "",
    campaignId: "",
    labels: "",
    language: "es",
  });
  const [topK, setTopK] = useState(10);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const searchFilters: any = {};

      if (filters.clientId) searchFilters.clientId = filters.clientId;
      if (filters.campaignId) searchFilters.campaignId = filters.campaignId;
      if (filters.language) searchFilters.language = filters.language;
      if (filters.labels) {
        searchFilters.labels = filters.labels
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean);
      }

      const response = await ragAPI.queryDocuments({
        query,
        topK,
        filters: searchFilters,
      });

      setResults(response);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getScoreColor = (score: number) => {
    if (score > 0.8) return "text-blue-600 dark:text-blue-400";
    if (score > 0.6) return "text-blue-600 dark:text-blue-400";
    return "text-red-600 dark:text-red-400";
  };

  const formatScore = (score: number) => {
    return (score * 100).toFixed(1) + "%";
  };

  const getCurrentResults = () => {
    if (!results) return [];
    return results[activeTab] || [];
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">RAG Playground</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Prueba búsquedas inteligentes en tu corpus de documentos</p>
          </div>

          {/* Search Interface */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 mb-6">
            <div className="space-y-4">
              {/* Query Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Consulta</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <textarea value={query} onChange={(e) => setQuery(e.target.value)} onKeyPress={handleKeyPress} rows={3} className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white resize-none" placeholder="Escribe tu consulta aquí... (Presiona Enter para buscar)" />
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Cliente ID</label>
                  <input type="text" value={filters.clientId} onChange={(e) => setFilters((prev) => ({ ...prev, clientId: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" placeholder="client-123" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Campaña ID</label>
                  <input type="text" value={filters.campaignId} onChange={(e) => setFilters((prev) => ({ ...prev, campaignId: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" placeholder="campaign-456" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Etiquetas</label>
                  <input type="text" value={filters.labels} onChange={(e) => setFilters((prev) => ({ ...prev, labels: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" placeholder="brief, guía" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Top K</label>
                  <select value={topK} onChange={(e) => setTopK(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white">
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              {/* Search Button */}
              <div className="flex justify-end">
                <button onClick={handleSearch} disabled={loading || !query.trim()} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2">
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Buscando...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      <span>Buscar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          {results && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
              {/* Results Tabs */}
              <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="flex space-x-8 px-6">
                  {[
                    { key: "hybrid", label: "Híbrido", icon: Zap, count: results.hybrid.length },
                    { key: "vector", label: "Vector", icon: BarChart3, count: results.vector.length },
                    { key: "text", label: "Texto", icon: FileText, count: results.text.length },
                  ].map((tab) => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${activeTab === tab.key ? "border-primary-500 text-primary-600 dark:text-primary-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
                      <tab.icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                      <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 py-0.5 px-2 rounded-full text-xs">{tab.count}</span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Results List */}
              <div className="p-6">
                {getCurrentResults().length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-500 dark:text-gray-400">No se encontraron resultados para esta consulta</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {getCurrentResults().map((result, index) => (
                      <div key={result.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center space-x-3">
                            <span className="flex items-center justify-center w-6 h-6 bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400 rounded-full text-sm font-medium">{index + 1}</span>
                            <div>
                              <h3 className="font-medium text-gray-900 dark:text-white">{result.document?.title || "Documento sin título"}</h3>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                {result.document?.source} • Chunk {result.chunk?.order || 0}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className={`text-sm font-medium ${getScoreColor(result.hybridScore || result.score)}`}>{formatScore(result.hybridScore || result.score)}</span>
                            <button onClick={() => copyToClipboard(result.text)} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" title="Copiar texto">
                              <Copy className="h-4 w-4 text-gray-500" />
                            </button>
                          </div>
                        </div>

                        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed mb-3">{result.text}</p>

                        {result.document?.labels && result.document.labels.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {result.document.labels.map((label, labelIndex) => (
                              <span key={labelIndex} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                                {label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Help Section */}
          <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
            <h3 className="text-lg font-medium text-blue-900 dark:text-blue-100 mb-3">💡 Consejos de búsqueda</h3>
            <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
              <li>
                • <strong>Híbrido:</strong> Combina búsqueda semántica (vector) y por palabras clave (texto)
              </li>
              <li>
                • <strong>Vector:</strong> Búsqueda semántica basada en el significado del contenido
              </li>
              <li>
                • <strong>Texto:</strong> Búsqueda tradicional por palabras clave y términos exactos
              </li>
              <li>• Usa filtros para limitar los resultados a clientes o campañas específicas</li>
              <li>• Las etiquetas te ayudan a encontrar documentos categorizados</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
