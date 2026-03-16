import React, { useState, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { shiftsAPI, Shift } from "../api/shifts";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faClock, faUserTie, faUserGraduate, faUserGear, faLayerGroup, faTable, faGrip, faUserShield } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";

interface ShiftFormData {
  name: string;
  startTime: string;
  endTime: string;
  description: string;
}

export const ShiftsPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [formData, setFormData] = useState<ShiftFormData>({
    name: "",
    startTime: "09:00",
    endTime: "18:00",
    description: "",
  });

  const [viewOpen, setViewOpen] = useState(false);
  const [viewShift, setViewShift] = useState<Shift | null>(null);

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
      const saved = localStorage.getItem("shiftsViewMode");
      if (saved === "table" || saved === "cards") {
        setViewMode(saved as "table" | "cards");
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) {
      localStorage.setItem("shiftsViewMode", viewMode);
    }
  }, [viewMode, isLarge]);

  const canManage = hasPermission("admin_users:view");

  useEffect(() => {
    fetchShifts();
  }, []);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const response = await shiftsAPI.list({});
      setShifts(response.shifts);
    } catch (error) {
      console.error("Error fetching shifts:", error);
      sweetAlert.error("Error", "No se pudieron cargar los turnos");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingShift(null);
    setFormData({
      name: "",
      startTime: "09:00",
      endTime: "18:00",
      description: "",
    });
    setShowModal(true);
  };

  const openEdit = (shift: Shift) => {
    setEditingShift(shift);
    setFormData({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      description: shift.description || "",
    });
    setShowModal(true);
  };

  const openView = (shift: Shift) => {
    setViewShift(shift);
    setViewOpen(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingShift(null);
  };

  const closeView = () => {
    setViewOpen(false);
    setViewShift(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingShift) {
        await shiftsAPI.update(editingShift._id, formData);
        sweetAlert.success("Turno actualizado", "Los cambios se han guardado correctamente");
      } else {
        await shiftsAPI.create(formData);
        sweetAlert.success("Turno creado", "El turno se ha creado correctamente");
      }
      closeModal();
      fetchShifts();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar el turno";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (shift: Shift) => {
    const result = await sweetAlert.confirm("¿Eliminar turno?", `¿Estás seguro de que quieres eliminar el turno "${shift.name}"?`);
    if (result.isConfirmed) {
      try {
        await shiftsAPI.remove(shift._id);
        sweetAlert.success("Turno eliminado", "El turno ha sido eliminado correctamente");
        fetchShifts();
      } catch (error: any) {
        const message = error.response?.data?.error || "Error al eliminar el turno";
        sweetAlert.error("Error", message);
      }
    }
  };

  const filteredShifts = shifts.filter((s) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = q.length === 0 || s.name.toLowerCase().includes(q) || (s.description || "").toLowerCase().includes(q);

    let matchesDate = true;
    if (startDate || endDate) {
      const createdAt = s.createdAt ? new Date(s.createdAt).getTime() : 0;
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
      title="Turnos"
      itemCount={filteredShifts.length}
      subtitle="Gestiona los turnos de la organización"
      faIcon={{ icon: faClock }}
      shouldShowInfo={false}
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
          <button onClick={() => navigate("/areas")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Áreas</span>
          </button>
          <button onClick={() => navigate("/positions")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserTie} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Cargos</span>
          </button>
          <button onClick={() => navigate("/levels")} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faUserGraduate} className="h-3 w-3 lg:h-4 lg:w-4" />
            <span className="hidden lg:block">Niveles</span>
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
              searchPlaceholder="Buscar turnos..."
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
        title: viewShift ? viewShift.name : "Turno",
        subtitle: viewShift?.description,
        size: "md",
        actions: [
          ...(canManage
            ? [
                {
                  label: "Editar turno",
                  onClick: () => {
                    if (viewShift) openEdit(viewShift);
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
        content: viewShift ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Entrada</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">{viewShift.startTime} hs</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-1">Salida</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">{viewShift.endTime} hs</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300">{viewShift.description || "—"}</p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">Detalles</h4>
              <p className="text-xs text-gray-500">Creado el: {viewShift.createdAt ? new Date(viewShift.createdAt).toLocaleDateString() : "-"}</p>
            </div>
          </div>
        ) : null,
      }}
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingShift ? "Editar Turno" : "Nuevo Turno",
        subtitle: "Define nombre, horarios y descripción",
        size: "md",
        actions: [
          {
            label: editingShift ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#shift-form");
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
          <form id="shift-form" onSubmit={handleSubmit}>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="input-field" placeholder="Ej: Mañana, Tarde, Noche" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hora Entrada *</label>
                  <input type="time" required value={formData.startTime} onChange={(e) => setFormData((prev) => ({ ...prev, startTime: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hora Salida *</label>
                  <input type="time" required value={formData.endTime} onChange={(e) => setFormData((prev) => ({ ...prev, endTime: e.target.value }))} className="input-field" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del turno" />
              </div>
            </div>
          </form>
        ),
      }}
    >
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando turnos..." />
        </div>
      ) : (
        <>
          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
              {filteredShifts.map((shift) => {
                return (
                  <Card
                    key={shift._id}
                    onClick={() => openView(shift)}
                    className="hover:scale-105 hover:shadow-lg transition-all duration-200"
                    header={{
                      title: shift.name,
                      subtitle: `${shift.startTime} - ${shift.endTime}`,
                      icon: faClock,
                    }}
                    footer={
                      canManage
                        ? {
                            leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{shift.createdAt ? new Date(shift.createdAt).toLocaleDateString() : ""}</span>,
                            actions: [
                              {
                                icon: faEdit,
                                onClick: (e) => {
                                  e.stopPropagation();
                                  openEdit(shift);
                                },
                                title: "Editar",
                                variant: "default",
                              },
                              {
                                icon: faTrash,
                                onClick: (e) => {
                                  e.stopPropagation();
                                  handleDelete(shift);
                                },
                                title: "Eliminar",
                                variant: "default",
                              },
                            ],
                          }
                        : undefined
                    }
                  />
                );
              })}
              {canManage && (
                <Card
                  variant="create"
                  onClick={openCreate}
                  header={{
                    title: "Nuevo Turno",
                    subtitle: "Crear un nuevo turno para la organización",
                    icon: faClock,
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
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Entrada</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Salida</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creado</th>
                      {canManage && <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredShifts.map((shift) => (
                      <tr key={shift._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => openView(shift)}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center shrink-0">
                              <FontAwesomeIcon icon={faClock} className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{shift.name}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{shift.startTime} hs</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{shift.endTime} hs</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-gray-600 dark:text-gray-400">{shift.createdAt ? new Date(shift.createdAt).toLocaleDateString() : "—"}</span>
                        </td>
                        {canManage && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(shift);
                                }}
                                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                title="Editar"
                              >
                                <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(shift);
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!loading && filteredShifts.length === 0 && (
            <EmptyState
              icon={faClock}
              title={startDate || endDate ? "No hay turnos en este rango de fechas" : "No hay turnos"}
              description={startDate || endDate ? "No se encontraron turnos para los criterios seleccionados." : "Crea tu primer turno para comenzar."}
              action={
                canManage
                  ? {
                      label: "Nuevo Turno",
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
