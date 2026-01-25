import React, { useEffect, useState, useMemo } from "react";
import { infoAPI, InfoItem } from "../api/info";
import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { faBuilding } from "@fortawesome/free-solid-svg-icons";
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
      searchAndFilters={<SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o ID externo..." />}
    >
      {loading ? (
        <LoadingSpinner message="Cargando sedes..." />
      ) : filteredSedes.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faBuilding} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron sedes</h3>
        </div>
      ) : (
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
              }}
              footer={{
                leftContent: <div className="text-xs text-gray-500 dark:text-gray-500">ID Interno: {sede.data?.id || "N/A"}</div>,
              }}
            />
          ))}
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
