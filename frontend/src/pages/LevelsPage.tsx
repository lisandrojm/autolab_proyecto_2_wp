import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { levelsAPI, Level } from "../api/levels";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faEdit, faTrash, faPlus, faShieldHalved, faUserGraduate } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";

const HELP_KEY = "levels" as const;

interface LevelFormData {
  name: string;
  description: string;
}

export const LevelsPage: React.FC = () => {
  const { hasPermission } = useAuthStore();

  const [levels, setLevels] = useState<Level[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [formData, setFormData] = useState<LevelFormData>({
    name: "",
    description: "",
  });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewLevel, setViewLevel] = useState<Level | null>(null);

  const [openInfo, setOpenInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  const canManage = hasPermission("users:view");

  useEffect(() => {
    fetchLevels();
  }, []);

  const fetchLevels = async () => {
    try {
      setLoading(true);
      const response = await levelsAPI.list({});
      setLevels(response.levels);
    } catch (error) {
      console.error("Error fetching levels:", error);
      sweetAlert.error("Error", "No se pudieron cargar los niveles");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingLevel(null);
    setFormData({
      name: "",
      description: "",
    });
    setShowModal(true);
  };

  const openEdit = (level: Level) => {
    setEditingLevel(level);
    setFormData({
      name: level.name,
      description: level.description || "",
    });
    setShowModal(true);
  };

  const openView = (level: Level) => {
    setViewLevel(level);
    setViewOpen(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingLevel(null);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewLevel(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingLevel) {
        await levelsAPI.update(editingLevel._id, formData);
        sweetAlert.success("Nivel actualizado", "Los cambios se han guardado correctamente");
      } else {
        await levelsAPI.create(formData);
        sweetAlert.success("Nivel creado", "El nivel se ha creado correctamente");
      }
      closeModal();
      fetchLevels();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar el nivel";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (level: Level) => {
    const result = await sweetAlert.confirm("¿Eliminar nivel?", `¿Estás seguro de que quieres eliminar el nivel "${level.name}"?`);
    if (result.isConfirmed) {
      try {
        await levelsAPI.remove(level._id);
        sweetAlert.success("Nivel eliminado", "El nivel ha sido eliminado correctamente");
        fetchLevels();
      } catch (error: any) {
        const message = error.response?.data?.error || "Error al eliminar el nivel";
        sweetAlert.error("Error", message);
      }
    }
  };

  const filteredLevels = levels.filter((l) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = q.length === 0 || l.name.toLowerCase().includes(q) || (l.description || "").toLowerCase().includes(q);

    let matchesDate = true;
    if (startDate || endDate) {
      const createdAt = l.createdAt ? new Date(l.createdAt).getTime() : 0;
      if (startDate) {
        const start = new Date(startDate).getTime();
        matchesDate = matchesDate && createdAt >= start;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        matchesDate = matchesDate && createdAt <= end;
      }
    }

    return matchesSearch && matchesDate;
  });

  if (loading) return <LoadingSpinner message="Cargando niveles..." />;

  return (
    <PageLayout
      title="Niveles"
      subtitle="Gestiona los niveles de experiencia de la organización"
      faIcon={{ icon: faUserGraduate }}
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
        canManage ? (
          <button onClick={openCreate} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
        ) : undefined
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar niveles..."
          dateFilter={{
            startDate,
            endDate,
            onStartDateChange: setStartDate,
            onEndDateChange: setEndDate,
          }}
        />
      }
      viewModal={{
        isOpen: viewOpen,
        onClose: closeView,
        title: viewLevel ? viewLevel.name : "Nivel",
        subtitle: viewLevel?.description,
        size: "md",
        actions: [
          ...(canManage
            ? [
                {
                  label: "Editar nivel",
                  onClick: () => {
                    if (viewLevel) openEdit(viewLevel);
                    closeView();
                  },
                  variant: "secondary",
                } as const,
              ]
            : []),
          {
            label: "Cancelar",
            onClick: closeView,
            variant: "ghost",
          },
        ],
        content: viewLevel ? (
          <div className="space-y-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewLevel.description || "—"}</p>
            </div>
          </div>
        ) : null,
      }}
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingLevel ? "Editar Nivel" : "Nuevo Nivel",
        subtitle: "Define nombre y descripción",
        size: "md",
        actions: [
          {
            label: editingLevel ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#level-form");
              form?.requestSubmit();
            },
            variant: "primary",
          },
          {
            label: "Cancelar",
            onClick: closeModal,
            variant: "ghost",
          },
        ],
        content: (
          <form id="level-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="input-field" placeholder="Nombre del nivel" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del nivel" />
              </div>
            </div>
          </form>
        ),
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
        {filteredLevels.map((level) => (
          <Card
            key={level._id}
            onClick={() => openView(level)}
            className="hover:scale-105 hover:shadow-lg transition-all duration-200"
            header={{
              title: level.name,
              subtitle: level.description,
              icon: faUserGraduate,
            }}
            footer={
              canManage
                ? {
                    leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{level.createdAt ? new Date(level.createdAt).toLocaleDateString() : ""}</span>,
                    actions: [
                      {
                        icon: faEdit,
                        onClick: (e) => {
                          e.stopPropagation();
                          openEdit(level);
                        },
                        title: "Editar",
                        variant: "default",
                      },
                      {
                        icon: faTrash,
                        onClick: (e) => {
                          e.stopPropagation();
                          handleDelete(level);
                        },
                        title: "Eliminar",
                        variant: "default",
                      },
                    ],
                  }
                : undefined
            }
          />
        ))}
        {canManage && (
          <Card
            variant="create"
            onClick={openCreate}
            header={{
              title: "Nuevo Nivel",
              subtitle: "Crear un nuevo nivel de experiencia",
              icon: faChartLine,
            }}
          />
        )}
      </div>

      {filteredLevels.length === 0 && (
        <EmptyState
          icon={faShieldHalved}
          title={startDate || endDate ? "No hay niveles en este rango de fechas" : "No hay niveles"}
          description={startDate || endDate ? `No se encontraron niveles ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : "Crea tu primer nivel para comenzar."}
          action={
            canManage
              ? {
                  label: "Nuevo Nivel",
                  onClick: openCreate,
                  icon: faPlus,
                }
              : undefined
          }
        />
      )}
    </PageLayout>
  );
};
