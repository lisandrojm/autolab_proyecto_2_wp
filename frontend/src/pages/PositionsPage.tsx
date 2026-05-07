import React, { useState, useEffect } from "react";
import { fuzzyMatch } from "../utils/searchHelpers";
import { useAuthStore } from "../stores/authStore";
import { positionsAPI, Position } from "../api/positions";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserTie, faUserGraduate, faEdit, faTrash, faPlus, faShieldHalved, faGlobe, faUserGear, faTable, faGrip, faClock, faUserShield, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
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

  // View Mode Logic
  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) {
        setViewMode("cards");
      }
    };

    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem("positionsViewMode");
      if (saved === "table" || saved === "cards") {
        setViewMode(saved as "table" | "cards");
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) {
      localStorage.setItem("positionsViewMode", viewMode);
    }
  }, [viewMode, isLarge]);

  const [openInfo, setOpenInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  const canManage = hasPermission("admin_positions:view");

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
    const matchesSearch = q.length === 0 || fuzzyMatch(p.name, q) || fuzzyMatch(p.description || "", q);

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

  return (
    <PageLayout
      title="Cargos"
      itemCount={filteredPositions.length}
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
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={openCreate} className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
            </button>
          )}
          <button onClick={() => navigate("/users")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGear} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Usuarios</span>
          </button>
          <button onClick={() => navigate("/levels")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Niveles</span>
          </button>
          <button onClick={() => navigate("/areas")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Áreas</span>
          </button>
          <button onClick={() => navigate("/shifts")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faClock} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Turnos</span>
          </button>
          <button onClick={() => navigate("/roles")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserShield} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Roles</span>
          </button>
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
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
          </div>
          {isLarge && (
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
            {/* Tenant Badge */}
            {viewPosition.tenant?.name && (
              <div>
                <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800">{viewPosition.tenant.name}</span>
              </div>
            )}

            {/* Descripción */}
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewPosition.description || "—"}</p>
            </div>

            {/* Niveles */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                  <FontAwesomeIcon icon={faUserGraduate} className="text-blue-600 dark:text-blue-400" />
                  Niveles Disponibles
                </h4>

                <button onClick={() => navigate("/levels")} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  Administrar niveles
                </button>
              </div>

              {/* Agrupar niveles */}
              {(() => {
                const específicos = (viewPosition.levels || []).filter((lvl) => lvl.type !== "general");
                const generales = (viewPosition.levels || []).filter((lvl) => lvl.type === "general");

                return (
                  <div className="space-y-6">
                    {/* Específicos */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded p-4 bg-gray-50 dark:bg-gray-800/30">
                      <div className="flex items-center gap-2 mb-3">
                        <FontAwesomeIcon icon={faUserTie} className="text-blue-500 dark:text-blue-400" />
                        <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Específicos</h5>
                      </div>

                      {específicos.length > 0 ? (
                        <div className="space-y-2">
                          {específicos.map((level) => (
                            <div key={level._id} className="flex items-start gap-3 bg-white dark:bg-gray-800">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{level.name}</p>
                                </div>
                                {level.description && <p className="text-xs text-gray-600 dark:text-gray-400">{level.description}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">No hay niveles específicos para este cargo.</p>
                      )}
                    </div>

                    {/* Generales */}
                    <div className="border border-gray-200 dark:border-gray-700 rounded p-4 bg-gray-50 dark:bg-gray-800/30">
                      <div className="flex items-center gap-2 mb-3">
                        <FontAwesomeIcon icon={faGlobe} className="text-blue-400 dark:text-blue-300" />
                        <h5 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Generales</h5>
                      </div>

                      {generales.length > 0 ? (
                        <div className="space-y-2">
                          {generales.map((level) => (
                            <div key={level._id} className="flex items-start gap-3 bg-white dark:bg-gray-800">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{level.name}</p>
                                </div>
                                {level.description && <p className="text-xs text-gray-600 dark:text-gray-400">{level.description}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 dark:text-gray-400 italic">No hay niveles generales para este cargo.</p>
                      )}
                    </div>
                  </div>
                );
              })()}
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
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando cargos..." />
        </div>
      ) : (
        <>
          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
              {filteredPositions.map((position) => {
                const specificLevels = position.levels ? position.levels.filter((level) => level.type !== "general") : [];

                return (
                  <Card
                    key={position._id}
                    onClick={() => openView(position)}
                    className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                    header={{
                      title: position.name,
                      subtitle: position.description,
                      icon: faUserTie,
                      badges:
                        position.tenant && position.tenant.name
                          ? [
                              {
                                text: position.tenant.name,
                                variant: "default" as const,
                                className: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800",
                              },
                            ]
                          : [],
                    }}
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
                  >
                    {specificLevels.length > 0 && (
                      <div className="mt-3">
                        <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 tracking-wide mb-1">
                          <FontAwesomeIcon icon={faUserGraduate} className="text-blue-400 dark:text-blue-300 mb-2" />
                          <span>Niveles específicos</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {specificLevels.map((level) => (
                            <span key={level._id} className="inline-flex items-center gap-2 px-3 py-1 rounded bg-blue-500/20 text-xs text-blue-100">
                              <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3 text-blue-200" />
                              <span className="font-medium">{level.name}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
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
          ) : (
            <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm mx-0.5 lg:mx-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Niveles Específicos</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creado</th>
                      {canManage && <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredPositions.map((position) => {
                      const specificLevels = position.levels ? position.levels.filter((level) => level.type !== "general") : [];
                      return (
                        <tr key={position._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => openView(position)}>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center shrink-0">
                                <FontAwesomeIcon icon={faUserTie} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{position.name}</span>
                                {position.tenant && position.tenant.name && <span className="text-[10px] text-gray-500">{position.tenant.name}</span>}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{position.description || "—"}</span>
                          </td>
                          <td className="px-6 py-4">
                            {specificLevels.length > 0 ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20 text-xs font-medium text-blue-700 dark:text-blue-300">
                                <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3" />
                                {specificLevels.length} niveles
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">0 niveles</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400">{position.createdAt ? new Date(position.createdAt).toLocaleDateString() : "—"}</span>
                          </td>
                          {canManage && (
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEdit(position);
                                  }}
                                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                  title="Editar"
                                >
                                  <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(position);
                                  }}
                                  className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                                  title="Eliminar"
                                >
                                  <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && filteredPositions.length === 0 && (
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
        </>
      )}
    </PageLayout>
  );
};
