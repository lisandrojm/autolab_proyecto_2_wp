import React, { useState, useEffect } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { Shift, ShiftFormData } from "../api/shifts";
import { shiftsAPI } from "../api/shifts";
import { useAuthStore } from "../stores/authStore";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "react-router-dom";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { faEdit, faTrash, faPlus, faClock, faTable, faGrip, faGripVertical, faCheck, faMultiply } from "@fortawesome/free-solid-svg-icons";

// Helper para días
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Lunes a Domingo

export const ShiftsPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();
  const canManage = hasPermission("admin_users:view");

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [totalShifts, setTotalShifts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  const [showModal, setShowModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [formData, setFormData] = useState<ShiftFormData>({
    name: "",
    days: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00",
    description: "",
  });



  const [isReorderMode, setIsReorderMode] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));


  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => {
      const isNowLarge = window.innerWidth >= 1024;
      setIsLarge(isNowLarge);
      if (!isNowLarge) setViewMode("cards");
    };
    if (window.innerWidth >= 1024) {
      const saved = localStorage.getItem("shiftsViewMode");
      if (saved === "table" || saved === "cards") setViewMode(saved);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) localStorage.setItem("shiftsViewMode", viewMode);
  }, [viewMode, isLarge]);

  useEffect(() => {
    fetchShifts();
  }, [currentPage, searchTerm]);

  const fetchShifts = async () => {
    try {
      setLoading(true);
      const resp = await shiftsAPI.list({ page: currentPage, limit: itemsPerPage, name: searchTerm });
      setShifts(resp.shifts);
      setTotalShifts(resp.pagination.total);
    } catch (error) {
      console.error("Error fetching shifts", error);
    } finally {
      setLoading(false);
    }
  };



  const openCreate = () => {
    setEditingShift(null);
    setFormData({
      name: "",
      days: [1, 2, 3, 4, 5],
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
      days: shift.days,
      startTime: shift.startTime,
      endTime: shift.endTime,
      description: shift.description || "",
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.days.length === 0) {
      sweetAlert.error("Error", "Debes seleccionar al menos un día");
      return;
    }
    try {
      if (editingShift) {
        await shiftsAPI.update(editingShift._id, formData);
        sweetAlert.success("Turno actualizado", "Los cambios se guardaron con éxito");
      } else {
        await shiftsAPI.create(formData);
        sweetAlert.success("Turno creado", "El turno se creó con éxito");
      }
      setShowModal(false);
      fetchShifts();
    } catch (error) {
      sweetAlert.error("Error", "Hubo un error al guardar el turno");
    }
  };

  const handleDelete = async (shift: Shift) => {
    const result = await sweetAlert.confirm("¿Eliminar turno?", `¿Estás seguro de que quieres eliminar el turno "${shift.name}"?`);
    if (result.isConfirmed) {
      try {
        await shiftsAPI.remove(shift._id);
        sweetAlert.success("Eliminado", "El turno fue eliminado");
        fetchShifts();
      } catch (error: any) {
        sweetAlert.error("Error", error.response?.data?.error || "Error al eliminar");
      }
    }
  };

  const handleStartReorder = () => {
    setIsReorderMode(true);
  };

  const handleCancelReorder = () => {
    setIsReorderMode(false);
    fetchShifts();
  };

  const handleSaveReorder = async () => {
    const reorderedItems = shifts.map((shift, index) => ({ id: shift._id, order: index + 1 }));
    try {
      await shiftsAPI.reorder(reorderedItems);
      setIsReorderMode(false);
      sweetAlert.success("Orden Guardado", "El nuevo orden ha sido guardado.");
      fetchShifts();
    } catch (error) {
      sweetAlert.error("Error", "No se pudo guardar el orden");
      fetchShifts();
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setShifts((items) => {
        const oldIndex = items.findIndex((item) => item._id === active.id);
        const newIndex = items.findIndex((item) => item._id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleDay = (dayIndex: number) => {
    setFormData((prev) => ({
      ...prev,
      days: prev.days.includes(dayIndex) ? prev.days.filter((d) => d !== dayIndex) : [...prev.days, dayIndex],
    }));
  };

  return (
    <PageLayout
      title="Turnos"
      itemCount={totalShifts}
      subtitle="Gestiona los horarios y días laborales de tu organización"
      faIcon={{ icon: faClock }}
      infoModal={{
        isOpen: showInfoModal,
        onOpen: () => setShowInfoModal(true),
        onClose: () => setShowInfoModal(false),
        title: "Guía de Turnos",
        content: (
          <div className="space-y-4 text-gray-400">
            <p>
              En esta sección puedes gestionar los <strong>horarios laborales</strong> de tu organización. Los turnos permiten definir cuándo debe trabajar cada colaborador.
            </p>

            <div className="space-y-2">
              <h4 className="text-white font-medium">Días Laborales</h4>
              <p className="text-sm">Selecciona los días específicos en los que este turno está activo. Por defecto, los nuevos turnos se crean de Lunes a Viernes.</p>
            </div>
            <div className="space-y-2">
              <h4 className="text-white font-medium">Horarios</h4>
              <p className="text-sm">Define la hora de entrada y salida. Estos horarios se utilizarán para calcular el cumplimiento de la jornada en los reportes de novedades.</p>
            </div>
          </div>
        ),
      }}
      headerActions={
        <div className="flex items-center gap-3">
          {canManage && (
            <button onClick={openCreate} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm shadow-sm">
              <FontAwesomeIcon icon={faPlus} />
              <span>Nuevo Turno</span>
            </button>
          )}
          {/* <button onClick={() => navigate("/shifts/config")} className="px-4 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faCalendarCheck} />
            <span className="hidden md:inline">Configurar Tipos</span>
          </button> */}
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={(val) => setSearchTerm(val)} searchPlaceholder="Buscar por nombre de turno..." />
          </div>
          <div className="flex items-center gap-3">
            {canManage && (
              <>
                {isReorderMode ? (
                  <div className="flex items-center gap-2">
                    <button onClick={handleCancelReorder} className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm flex items-center gap-2">
                      <FontAwesomeIcon icon={faMultiply} />
                      Cancelar
                    </button>
                    <button onClick={handleSaveReorder} className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-all text-sm flex items-center gap-2">
                      <FontAwesomeIcon icon={faCheck} />
                      Guardar Orden
                    </button>
                  </div>
                ) : (
                  <button onClick={handleStartReorder} disabled={shifts.length < 2} className="px-3 py-2 rounded-md border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-sm flex items-center gap-2 shadow-sm">
                    <FontAwesomeIcon icon={faGripVertical} />
                    <span>Ordenar</span>
                  </button>
                )}
              </>
            )}
            {isLarge && !isReorderMode && (
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                  <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                </button>
                <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
                  <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      }
      modal={{
        isOpen: showModal,
        onClose: () => setShowModal(false),
        title: editingShift ? "Editar Turno" : "Nuevo Turno",
        subtitle: "Completa la información del horario laboral",
        size: "lg",
        actions: [
          { label: editingShift ? "Actualizar" : "Crear", onClick: () => document.querySelector<HTMLFormElement>("#shift-form")?.requestSubmit(), variant: "primary" },
          { label: "Cancelar", onClick: () => setShowModal(false), variant: "ghost" },
        ],
        content: (
          <form id="shift-form" onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Nombre del Turno * {editingShift?.isSystem && <span className="text-[10px] bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded ml-2 uppercase font-bold">Sistema</span>}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="input-field"
                  placeholder="Ej: Mañana 9-18"
                />

              </div>




              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hora Entrada *</label>
                  <input type="time" required value={formData.startTime} onChange={(e) => setFormData((prev) => ({ ...prev, startTime: e.target.value }))} className="input-field" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hora Salida *</label>
                  <input type="time" required value={formData.endTime} onChange={(e) => setFormData((prev) => ({ ...prev, endTime: e.target.value }))} className="input-field" />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Días Laborales *</label>
              <div className="flex flex-wrap gap-2">
                {DAY_ORDER.map((index) => {
                  const day = DAYS[index];
                  return (
                    <button key={day} type="button" onClick={() => toggleDay(index)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${formData.days.includes(index) ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
              <textarea value={formData.description} onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))} rows={2} className="input-field resize-none" placeholder="Opcional..." />
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <>
            {viewMode === "cards" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <SortableContext items={shifts.map((s) => s._id)}>
                  {shifts.map((shift) => (
                    <SortableShiftCard key={shift._id} shift={shift} isReorderMode={isReorderMode} canManage={canManage} openEdit={openEdit} handleDelete={handleDelete} />
                  ))}
                </SortableContext>
                {canManage && !isReorderMode && <Card variant="create" onClick={openCreate} header={{ title: "Nuevo Turno", subtitle: "Definir horario", icon: faPlus }} />}
              </div>
            ) : (
              <div className="overflow-x-auto rounded border dark:border-slate-800">
                <table className="w-full dark:bg-slate-800/80 table-auto">
                  <thead>
                    <tr className="border-b dark:border-slate-700">
                      {isReorderMode && <th className="py-3 px-4 text-center font-semibold text-gray-700 dark:text-gray-300 w-16">Ordenar</th>}
                      {isReorderMode && <th className="py-3 px-4 text-center font-semibold text-gray-700 dark:text-gray-300 w-16">Orden</th>}
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Nombre</th>

                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Horario</th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Días</th>
                      <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Acciones</th>
                    </tr>
                  </thead>
                  <SortableContext items={shifts.map((s) => s._id)} strategy={verticalListSortingStrategy}>
                    <tbody>
                      {shifts.map((shift, index) => (
                        <SortableShiftRow key={shift._id} shift={shift} index={index} isReorderMode={isReorderMode} canManage={canManage} openEdit={openEdit} handleDelete={handleDelete} />
                      ))}
                    </tbody>
                  </SortableContext>
                </table>
              </div>
            )}

            {!loading && shifts.length === 0 && <EmptyState icon={faClock} title="No hay turnos" description="No se encontraron turnos. Comienza creando el primero." action={canManage ? { label: "Crear Turno", onClick: openCreate, icon: faPlus } : undefined} />}

            {/* Pagination */}
            {totalShifts > itemsPerPage && !isReorderMode && (
              <div className="flex justify-center mt-10 gap-2">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => p - 1)} className="px-3 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 disabled:opacity-50">
                  Anterior
                </button>
                <button disabled={currentPage * itemsPerPage >= totalShifts} onClick={() => setCurrentPage((p) => p + 1)} className="px-3 py-1 rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 disabled:opacity-50">
                  Siguiente
                </button>
              </div>
            )}
          </>
        </DndContext>
      )}
    </PageLayout>
  );
};

interface SortableShiftRowProps {
  shift: Shift;
  index: number;
  isReorderMode: boolean;
  canManage: boolean;
  openEdit: (shift: Shift) => void;
  handleDelete: (shift: Shift) => void;
}

const SortableShiftRow: React.FC<SortableShiftRowProps> = ({ shift, index, isReorderMode, canManage, openEdit, handleDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shift._id,
    disabled: !isReorderMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <tr ref={setNodeRef} style={style} className={`border-b border-gray-100 dark:border-gray-700 transition-colors ${isReorderMode ? "bg-blue-50/50 dark:bg-blue-900/10 cursor-grab" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}>
      {isReorderMode && (
        <td className="py-3 px-4 text-center">
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-blue-500 hover:text-blue-600">
            <FontAwesomeIcon icon={faGripVertical} />
          </div>
        </td>
      )}
      {isReorderMode && <td className="py-3 px-4 text-center font-bold text-blue-600">{index + 1}</td>}
      <td className="py-3 px-4 font-medium text-gray-900 dark:text-gray-100">
        <div className="flex items-center gap-2">
          {shift.name}
          {shift.isSystem && <span className="text-[9px] bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Sistema</span>}
        </div>
      </td>



      <td className="py-3 px-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {shift.startTime} - {shift.endTime}
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="flex gap-1 flex-wrap">
          {[...shift.days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)).map((d) => (
            <span key={d} className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              {DAYS[d].slice(0, 3)}
            </span>
          ))}
        </div>
      </td>
      <td className="py-3 px-4 text-right space-x-2">
        <div className={`flex items-center justify-end gap-2 ${isReorderMode ? "opacity-20 pointer-events-none" : ""}`}>
          <button onClick={() => openEdit(shift)} className="p-1.5 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors" title="Editar">
            <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
          </button>
          {!shift.isSystem && (
            <button onClick={() => handleDelete(shift)} className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors" title="Eliminar">
              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
            </button>
          )}
        </div>

      </td>
    </tr>
  );
};

interface SortableShiftCardProps {
  shift: Shift;
  isReorderMode: boolean;
  canManage: boolean;
  openEdit: (shift: Shift) => void;
  handleDelete: (shift: Shift) => void;
}

const SortableShiftCard: React.FC<SortableShiftCardProps> = ({ shift, isReorderMode, canManage, openEdit, handleDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: shift._id,
    disabled: !isReorderMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {isReorderMode && (
        <div {...attributes} {...listeners} className="absolute -top-2 -left-2 z-10 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center cursor-grab active:cursor-grabbing shadow-lg">
          <FontAwesomeIcon icon={faGrip} size="sm" />
        </div>
      )}
      <Card
        header={{
          title: (
            <div className="flex items-center gap-2">
              <span>{shift.name}</span>
              {shift.isSystem && <span className="text-[9px] bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">Sistema</span>}
            </div>
          ),

          subtitle: undefined,
          icon: faClock,
        }}

        className={isReorderMode ? "border-2 border-blue-500/50 shadow-blue-500/10" : ""}
        footer={
          canManage && !isReorderMode
            ? {
                actions: [
                  { icon: faEdit, onClick: () => openEdit(shift), title: "Editar" },
                  ...(!shift.isSystem ? [{ icon: faTrash, onClick: () => handleDelete(shift), title: "Eliminar" }] : []),
                ],
              }
            : undefined

        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
            <FontAwesomeIcon icon={faClock} className="text-blue-500 dark:text-blue-400 w-4" />
            <span>
              {shift.startTime} — {shift.endTime} hs
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {[...shift.days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)).map((d) => (
              <span key={d} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md font-medium uppercase">
                {DAYS[d].slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};
