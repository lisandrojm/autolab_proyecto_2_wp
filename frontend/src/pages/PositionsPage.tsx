import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { positionsAPI, Position } from "../api/positions";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faUserShield, faUserTie, faUserGraduate, faEdit, faTrash, faKey, faPlus, faShieldHalved, faEye, faEyeSlash, faGlobe, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { useNavigate } from "react-router-dom";

const HELP_KEY = "positions" as const;

interface PositionFormData {
  name: string;
  description: string;
}

export const PositionsPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [formData, setFormData] = useState<PositionFormData>({
    name: "",
    description: "",
  });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewPosition, setViewPosition] = useState<Position | null>(null);

  const [openInfo, setOpenInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  const canManage = hasPermission("users:view");

  useEffect(() => {
    fetchPositions();
  }, []);

  const fetchPositions = async () => {
    try {
      setLoading(true);
      const response = await positionsAPI.list({});
      setPositions(response.positions);
    } catch (error) {
      console.error("Error fetching positions:", error);
      sweetAlert.error("Error", "No se pudieron cargar los cargos");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingPosition(null);
    setFormData({
      name: "",
      description: "",
    });
    setShowModal(true);
  };

  const openEdit = (position: Position) => {
    setEditingPosition(position);
    setFormData({
      name: position.name,
      description: position.description || "",
    });
    setShowModal(true);
  };

  const openView = async (position: Position) => {
    try {
      const fullPosition = await positionsAPI.getById(position._id);
      setViewPosition(fullPosition);
      setViewOpen(true);
    } catch (error) {
      console.error("Error fetching position details:", error);
      setViewPosition(position);
      setViewOpen(true);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingPosition(null);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewPosition(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPosition) {
        await positionsAPI.update(editingPosition._id, formData);
        sweetAlert.success("Cargo actualizado", "Los cambios se han guardado correctamente");
      } else {
        await positionsAPI.create(formData);
        sweetAlert.success("Cargo creado", "El cargo se ha creado correctamente");
      }
      closeModal();
      fetchPositions();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar el cargo";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (position: Position) => {
    const result = await sweetAlert.confirm("¿Eliminar cargo?", `¿Estás seguro de que quieres eliminar el cargo "${position.name}"?`);
    if (result.isConfirmed) {
      try {
        await positionsAPI.remove(position._id);
        sweetAlert.success("Cargo eliminado", "El cargo ha sido eliminado correctamente");
        fetchPositions();
      } catch (error: any) {
        const message = error.response?.data?.error || "Error al eliminar el cargo";
        sweetAlert.error("Error", message);
      }
    }
  };

  const filteredPositions = positions.filter((p) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = q.length === 0 || p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q);

    let matchesDate = true;
    if (startDate || endDate) {
      const createdAt = p.createdAt ? new Date(p.createdAt).getTime() : 0;
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

  if (loading) return <LoadingSpinner message="Cargando cargos..." />;

  return (
    <PageLayout
      title="Cargos"
      subtitle="Gestiona los cargos de la organización"
      faIcon={{ icon: faUserTie }}
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
        <div className="flex gap-2">
          {canManage && (
            <button onClick={openCreate} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
            </button>
          )}
          <button onClick={() => navigate("/users")} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserShield} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span>Usuarios</span>
          </button>
          <button onClick={() => navigate("/levels")} className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span>Niveles</span>
          </button>
        </div>
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar cargos..."
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
        title: viewPosition ? viewPosition.name : "Cargo",
        subtitle: viewPosition?.description,
        size: "md",
        actions: [
          ...(canManage
            ? [
                {
                  label: "Editar cargo",
                  onClick: () => {
                    if (viewPosition) openEdit(viewPosition);
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
        content: viewPosition ? (
          <div className="space-y-6">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewPosition.description || "—"}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <FontAwesomeIcon icon={faLayerGroup} className="text-blue-600 dark:text-blue-400" />
                  Niveles Disponibles
                </h4>
                <button
                  onClick={() => navigate("/levels")}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Administrar niveles
                </button>
              </div>

              {viewPosition.levels && viewPosition.levels.length > 0 ? (
                <div className="space-y-2">
                  {viewPosition.levels.map((level) => (
                    <div
                      key={level._id}
                      className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700"
                    >
                      <FontAwesomeIcon
                        icon={level.type === "general" ? faGlobe : faUserTie}
                        className={`mt-0.5 ${level.type === "general" ? "text-blue-600 dark:text-blue-400" : "text-purple-600 dark:text-purple-400"}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {level.name}
                          </p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            level.type === "general"
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                              : "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                          }`}>
                            {level.type === "general" ? "General" : "Específico"}
                          </span>
                        </div>
                        {level.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {level.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 italic">
                    Los niveles "Generales" están disponibles para todos los cargos, mientras que los "Específicos" son exclusivos de este cargo.
                  </p>
                </div>
              ) : (
                <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <FontAwesomeIcon icon={faLayerGroup} className="text-gray-400 dark:text-gray-600 text-2xl mb-2" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No hay niveles disponibles para este cargo
                  </p>
                  <button
                    onClick={() => {
                      closeView();
                      navigate("/levels");
                    }}
                    className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Crear nivel
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null,
      }}
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingPosition ? "Editar Cargo" : "Nuevo Cargo",
        subtitle: "Define nombre y descripción",
        size: "md",
        actions: [
          {
            label: editingPosition ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#position-form");
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
          <form id="position-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="input-field" placeholder="Nombre del cargo" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del cargo" />
              </div>
            </div>
          </form>
        ),
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
        {filteredPositions.map((position) => (
          <Card
            key={position._id}
            onClick={() => openView(position)}
            className="hover:scale-105 hover:shadow-lg transition-all duration-200"
            header={{
              title: position.name,
              subtitle: position.description,
              icon: faUserTie,
            }}
            body={
              <div className="space-y-3">
                {position.specificLevelCount !== undefined && position.specificLevelCount > 0 ? (
                  <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                    <FontAwesomeIcon icon={faLayerGroup} className="text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-semibold text-purple-900 dark:text-purple-100">
                      {position.specificLevelCount} {position.specificLevelCount === 1 ? 'nivel específico' : 'niveles específicos'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <FontAwesomeIcon icon={faLayerGroup} className="text-gray-400 dark:text-gray-600" />
                    <span className="text-sm text-gray-500 dark:text-gray-500">
                      Sin niveles específicos
                    </span>
                  </div>
                )}

                {position.levels && position.levels.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-gray-700">
                    {position.levels.slice(0, 3).map((level) => (
                      <div
                        key={level._id}
                        className="flex items-center gap-2 text-xs"
                      >
                        <FontAwesomeIcon
                          icon={level.type === "general" ? faGlobe : faUserTie}
                          className={`text-[10px] ${
                            level.type === "general"
                              ? "text-blue-500 dark:text-blue-400"
                              : "text-purple-500 dark:text-purple-400"
                          }`}
                        />
                        <span className="text-gray-700 dark:text-gray-300 truncate">
                          {level.name}
                        </span>
                        <span
                          className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${
                            level.type === "general"
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                              : "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                          }`}
                        >
                          {level.type === "general" ? "G" : "E"}
                        </span>
                      </div>
                    ))}
                    {position.levelCount && position.levelCount > 3 && (
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 italic pt-1">
                        +{position.levelCount - 3} más...
                      </div>
                    )}
                  </div>
                )}
              </div>
            }
            footer={
              canManage
                ? {
                    leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{position.createdAt ? new Date(position.createdAt).toLocaleDateString() : ""}</span>,
                    actions: [
                      {
                        icon: faEdit,
                        onClick: (e) => {
                          e.stopPropagation();
                          openEdit(position);
                        },
                        title: "Editar",
                        variant: "default",
                      },
                      {
                        icon: faTrash,
                        onClick: (e) => {
                          e.stopPropagation();
                          handleDelete(position);
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
              title: "Nuevo Cargo",
              subtitle: "Crear un nuevo cargo para la organización",
              icon: faUserTie,
            }}
          />
        )}
      </div>

      {filteredPositions.length === 0 && (
        <EmptyState
          icon={faShieldHalved}
          title={startDate || endDate ? "No hay cargos en este rango de fechas" : "No hay cargos"}
          description={startDate || endDate ? `No se encontraron cargos ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : "Crea tu primer cargo para comenzar."}
          action={
            canManage
              ? {
                  label: "Nuevo Cargo",
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
