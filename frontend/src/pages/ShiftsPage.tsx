import React, { useState, useEffect } from "react";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { shiftConfigsAPI, ShiftConfig } from "../api/shiftConfigs";
import { Shift, ShiftFormData } from "../api/shifts";
import { shiftsAPI } from "../api/shifts";
import { useAuthStore } from "../stores/authStore";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faClock, faTable, faGrip } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";

// Helper para días
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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
    type: "",
    days: [1, 2, 3, 4, 5],
    startTime: "09:00",
    endTime: "18:00",
    description: "",
  });

  const [shiftConfigs, setShiftConfigs] = useState<ShiftConfig[]>([]);

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
    fetchShiftConfigs();
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

  const fetchShiftConfigs = async () => {
    try {
      const resp = await shiftConfigsAPI.getAll();
      setShiftConfigs(resp.data);
    } catch (error) {
      console.error("Error fetching configs", error);
    }
  };

  const openCreate = () => {
    setEditingShift(null);
    setFormData({
      name: "",
      type: shiftConfigs.length > 0 ? shiftConfigs[0].name : "",
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
      type: shift.type,
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
              <h4 className="text-white font-medium">Tipos de Turno</h4>
              <p className="text-sm">Utiliza los tipos (como Mañana, Tarde, Noche) para categorizar tus horarios. Puedes configurar más tipos desde el menú de configuración lateral.</p>
            </div>
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
          {isLarge && (
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre del Turno *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))} className="input-field" placeholder="Ej: Mañana 9-18" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de Turno *</label>
                <select required value={formData.type} onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))} className="input-field">
                  {shiftConfigs.length === 0 && <option value="">Cargando tipos...</option>}
                  {shiftConfigs.map((t) => (
                    <option key={t._id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
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
                {DAYS.map((day, index) => (
                  <button key={day} type="button" onClick={() => toggleDay(index)} className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${formData.days.includes(index) ? "bg-blue-600 text-white border-blue-600 shadow-sm" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                    {day}
                  </button>
                ))}
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
        <>
          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {shifts.map((shift) => (
                <Card
                  key={shift._id}
                  header={{
                    title: shift.name,
                    subtitle: shift.type,
                    icon: faClock,
                  }}
                  footer={
                    canManage
                      ? {
                          actions: [
                            { icon: faEdit, onClick: () => openEdit(shift), title: "Editar" },
                            { icon: faTrash, onClick: () => handleDelete(shift), title: "Eliminar" },
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
                      {shift.days.map((d) => (
                        <span key={d} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md font-medium uppercase">
                          {DAYS[d].slice(0, 3)}
                        </span>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
              {canManage && <Card variant="create" onClick={openCreate} header={{ title: "Nuevo Turno", subtitle: "Definir horario", icon: faPlus }} />}
            </div>
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Tipo</th>
                    <th>Horario</th>
                    <th>Días</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((shift) => (
                    <tr key={shift._id}>
                      <td className="font-semibold">{shift.name}</td>
                      <td>
                        <span className="badge badge-primary">{shift.type}</span>
                      </td>
                      <td>
                        <span className="text-sm">
                          {shift.startTime} - {shift.endTime}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1 flex-wrap">
                          {shift.days.map((d) => (
                            <span key={d} className="text-[10px] uppercase font-bold text-gray-400">
                              {DAYS[d].slice(0, 3)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-right space-x-2">
                        <button onClick={() => openEdit(shift)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded">
                          <FontAwesomeIcon icon={faEdit} />
                        </button>
                        <button onClick={() => handleDelete(shift)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded">
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && shifts.length === 0 && <EmptyState icon={faClock} title="No hay turnos" description="No se encontraron turnos. Comienza creando el primero." action={canManage ? { label: "Crear Turno", onClick: openCreate, icon: faPlus } : undefined} />}

          {/* Pagination */}
          {totalShifts > itemsPerPage && (
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
      )}
    </PageLayout>
  );
};
