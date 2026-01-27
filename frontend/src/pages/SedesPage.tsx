import React, { useEffect, useState, useMemo } from "react";
import { infoAPI, InfoItem } from "../api/info";
import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { faBuilding, faTable, faGrip } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Modal } from "../components/ui/Modal";

import { getHelp, hasHelp } from "../data/help/helpContent";

export const SedesPage: React.FC = () => {
  const [sedes, setSedes] = useState<InfoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSede, setSelectedSede] = useState<InfoItem | null>(null);
  const [openInfo, setOpenInfo] = useState(false);

  const HELP_KEY = "sedes";
  const helpEntry = getHelp(HELP_KEY);

  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);

  useEffect(() => {
    const handleResize = () => {
      const isNowXXL = window.innerWidth >= 1200;
      setIsXXL(isNowXXL);
      if (!isNowXXL) setViewMode("cards");
    };

    const saved = localStorage.getItem("sedesViewMode");
    if (saved === "table" || saved === "cards") {
      if (window.innerWidth >= 1200) setViewMode(saved as "table" | "cards");
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isXXL) {
      localStorage.setItem("sedesViewMode", viewMode);
    }
  }, [viewMode, isXXL]);

  useEffect(() => {
    const fetchSedes = async () => {
      try {
        setLoading(true);
        const data = await infoAPI.listByType("sede");
        setSedes(data);
      } catch (error) {
        console.error("Error fetching sedes:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchSedes();
  }, []);

  const filteredSedes = useMemo(() => {
    if (!searchTerm) return sedes;
    const lowerSearch = searchTerm.toLowerCase();
    return sedes.filter((s) => s.name.toLowerCase().includes(lowerSearch) || s.externalId.toLowerCase().includes(lowerSearch));
  }, [sedes, searchTerm]);

  return (
    <PageLayout
      title="Sedes"
      subtitle="Listado de todas las sedes del sistema"
      itemCount={filteredSedes.length}
      faIcon={{ icon: faBuilding }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Ayuda",
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o ID externo..." />
          </div>
          {isXXL && (
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      }
    >
      {loading ? (
        <LoadingSpinner message="Cargando sedes..." />
      ) : filteredSedes.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faBuilding} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron sedes</h3>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredSedes.map((sede) => (
            <Card
              key={sede._id}
              onClick={() => setSelectedSede(sede)}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
              header={{
                title: sede.name,
                subtitle: `ID Externo: ${sede.externalId}`,
                icon: faBuilding,
                iconClassName: "text-primary-600 dark:text-primary-400",
              }}
              footer={{
                leftContent: <div className="text-xs text-gray-500 dark:text-gray-500">ID Interno: {sede.data?.id || "N/A"}</div>,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mt-6 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sede</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Externo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Interno</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filteredSedes.map((sede) => (
                  <tr key={sede._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => setSelectedSede(sede)}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={faBuilding} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sede.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">{sede.externalId}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{sede.data?.id || "-"}</span>
                    </td>
                    <td className="px-6 py-4 text-right">{/* Actions */}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedSede && (
        <Modal isOpen={!!selectedSede} onClose={() => setSelectedSede(null)} title={selectedSede.name} subtitle="Información detallada de la sede" size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Nombre</label>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedSede.name}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">ID Externo</label>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedSede.externalId}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">ID Interno</label>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedSede.data?.id || "N/A"}</p>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Tipo</label>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedSede.type}</p>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </PageLayout>
  );
};
