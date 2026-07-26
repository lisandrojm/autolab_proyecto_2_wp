import React, { useState, useEffect } from "react";
import { fuzzyMatch } from "../utils/searchHelpers";
import { useAuthStore } from "../stores/authStore";
import { holidaysAPI, Holiday } from "../api/holidays";
import { PageLayout } from "../components/ui/PageLayout";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { EmptyState } from "../components/ui/EmptyState";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Card } from "../components/ui/Card";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faEdit, faTrash, faPlus, faFileExcel, faDownload, faUpload, faTable, faGrip, faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";

interface HolidayFormData {
  date: string;
  name: string;
  type: string;
  description: string;
}

export const HolidaysPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuthStore();

  const HELP_KEY = "holidays" as const;
  const helpEntry = getHelp(HELP_KEY);
  const [showInfo, setShowInfo] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros y búsquedas
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());

  // ABM Modal
  const [showModal, setShowModal] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);
  const [formData, setFormData] = useState<HolidayFormData>({
    date: "",
    name: "",
    type: "Nacional",
    description: "",
  });

  // Bulk Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Vista (Tabla vs Tarjetas)
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
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
      const saved = localStorage.getItem("holidaysViewMode");
      if (saved === "table" || saved === "cards") {
        setViewMode(saved as "table" | "cards");
      }
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isLarge) {
      localStorage.setItem("holidaysViewMode", viewMode);
    }
  }, [viewMode, isLarge]);

  const canManage = hasPermission("config_holidays:view");

  useEffect(() => {
    fetchHolidays();
  }, [selectedYear]);

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      const response = await holidaysAPI.list({ year: selectedYear });
      setHolidays(response);
    } catch (error) {
      console.error("Error fetching holidays:", error);
      sweetAlert.error("Error", "No se pudieron cargar los feriados");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingHoliday(null);
    setFormData({
      date: "",
      name: "",
      type: "Nacional",
      description: "",
    });
    setShowModal(true);
  };

  const openEdit = (holiday: Holiday) => {
    setEditingHoliday(holiday);
    
    // Convert Date object/string to YYYY-MM-DD
    const dateObj = new Date(holiday.date);
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    
    setFormData({
      date: `${yyyy}-${mm}-${dd}`,
      name: holiday.name,
      type: holiday.type || "Nacional",
      description: holiday.description || "",
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingHoliday(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingHoliday) {
        await holidaysAPI.update(editingHoliday._id, formData);
        sweetAlert.success("Feriado actualizado", "Los cambios se han guardado correctamente");
      } else {
        await holidaysAPI.create(formData);
        sweetAlert.success("Feriado creado", "El feriado se ha creado correctamente");
      }
      closeModal();
      fetchHolidays();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar el feriado";
      sweetAlert.error("Error", message);
    }
  };

  const handleDelete = async (holiday: Holiday) => {
    const formattedDate = new Date(holiday.date).toLocaleDateString();
    const result = await sweetAlert.confirm(
      "¿Eliminar feriado?",
      `¿Estás seguro de que quieres eliminar el feriado "${holiday.name}" del ${formattedDate}?`
    );
    if (result.isConfirmed) {
      try {
        await holidaysAPI.remove(holiday._id);
        sweetAlert.success("Feriado eliminado", "El feriado ha sido eliminado correctamente");
        fetchHolidays();
      } catch (error: any) {
        const message = error.response?.data?.error || "Error al eliminar el feriado";
        sweetAlert.error("Error", message);
      }
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await holidaysAPI.downloadTemplate();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "plantilla_feriados.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      sweetAlert.success("Descarga exitosa", "La plantilla de Excel se ha descargado correctamente");
    } catch (error) {
      console.error("Error downloading template:", error);
      sweetAlert.error("Error", "No se pudo descargar la plantilla");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setImportFile(e.target.files[0]);
      setImportErrors([]);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    try {
      setImporting(true);
      setImportErrors([]);
      const res = await holidaysAPI.importExcel(importFile);
      sweetAlert.success(
        "Importación completada",
        `Se han procesado correctamente ${res.count} feriados.`
      );
      setShowImportModal(false);
      setImportFile(null);
      fetchHolidays();
    } catch (error: any) {
      console.error("Import error:", error);
      const resErrors = error.response?.data?.details;
      const resMsg = error.response?.data?.error || "Error al importar el archivo Excel";
      
      if (Array.isArray(resErrors)) {
        setImportErrors(resErrors);
      } else {
        sweetAlert.error("Error de importación", resMsg);
      }
    } finally {
      setImporting(false);
    }
  };

  const yearsList = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear - 2; y <= currentYear + 3; y++) {
    yearsList.push(y.toString());
  }

  const filteredHolidays = holidays.filter((h) => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch =
      q.length === 0 ||
      fuzzyMatch(h.name, q) ||
      fuzzyMatch(h.description || "", q) ||
      fuzzyMatch(h.type || "", q);

    const matchesType = selectedType === "all" || h.type === selectedType;

    let matchesDate = true;
    if (startDate || endDate) {
      const hDate = new Date(h.date).getTime();
      if (startDate) {
        const start = new Date(startDate).getTime();
        matchesDate = matchesDate && hDate >= start;
      }
      if (endDate) {
        const end = new Date(endDate).setHours(23, 59, 59, 999);
        matchesDate = matchesDate && hDate <= end;
      }
    }

    return matchesSearch && matchesType && matchesDate;
  });

  return (
    <PageLayout
      title="Feriados"
      itemCount={filteredHolidays.length}
      subtitle={`Gestiona el calendario de días feriados para la organización`}
      faIcon={{ icon: faCalendar }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}
      headerActions={
        <div className="flex items-center gap-3">
          {canManage && (
            <>
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                title="Nuevo feriado"
                aria-label="Nuevo feriado"
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
              <button
                onClick={handleDownloadTemplate}
                className="px-3 py-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center gap-2 text-sm font-semibold active:scale-95"
                title="Descargar Plantilla"
              >
                <FontAwesomeIcon icon={faDownload} className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="hidden md:block">Descargar Plantilla</span>
              </button>
              <button
                onClick={() => {
                  setImportFile(null);
                  setImportErrors([]);
                  setShowImportModal(true);
                }}
                className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition-all flex items-center gap-2 text-sm font-semibold shadow-md shadow-green-500/20 active:scale-95"
                title="Carga Masiva (Excel)"
              >
                <FontAwesomeIcon icon={faUpload} className="h-4 w-4" />
                <span className="hidden md:block">Carga Masiva</span>
              </button>
            </>
          )}
        </div>
      }
      searchAndFilters={
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
            <div className="flex-1 w-full">
              <SearchAndFilters
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                searchPlaceholder="Buscar feriados..."
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
                <button
                  onClick={() => setViewMode("cards")}
                  className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                  title="Vista de tarjetas"
                >
                  <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}
                  title="Vista de tabla"
                >
                  <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-4 items-center bg-gray-50 dark:bg-gray-900/30 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Año:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {yearsList.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Tipo:</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="all">Todos los Tipos</option>
                <option value="Nacional">Nacional</option>
                <option value="Provincial">Provincial</option>
                <option value="Feriado Puente">Feriado Puente</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>
        </div>
      }
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: editingHoliday ? "Editar Feriado" : "Nuevo Feriado",
        subtitle: editingHoliday ? "Modifica los datos del feriado" : "Agrega un feriado individual al calendario",
        size: "md",
        actions: [
          {
            label: editingHoliday ? "Actualizar" : "Crear",
            onClick: () => {
              const form = document.querySelector<HTMLFormElement>("#holiday-form");
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
          <form id="holiday-form" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha *</label>
                <input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  className="input-field"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="input-field"
                  placeholder="Ej: Año Nuevo"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value }))}
                  className="input-field"
                >
                  <option value="Nacional">Nacional</option>
                  <option value="Provincial">Provincial</option>
                  <option value="Feriado Puente">Feriado Puente</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="input-field resize-none"
                  placeholder="Opcional: Detalles o ley aplicable"
                />
              </div>
            </div>
          </form>
        ),
      }}
    >
      {/* Loading state */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <LoadingSpinner message="Cargando feriados..." />
        </div>
      ) : (
        <>
          {viewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mx-0.5 lg:mx-0">
              {filteredHolidays.map((holiday) => {
                const dateStr = new Date(holiday.date).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "long",
                  year: "numeric",
                  timeZone: "UTC",
                });
                return (
                  <Card
                    key={holiday._id}
                    onClick={canManage ? () => openEdit(holiday) : undefined}
                    className="cursor-pointer hover:scale-[1.03] hover:shadow-lg transition-all duration-200"
                    header={{
                      title: holiday.name,
                      subtitle: dateStr,
                      icon: faCalendar,
                      badges: [
                        {
                          text: holiday.type || "Nacional",
                          variant: holiday.type === "Nacional"
                            ? "blue"
                            : holiday.type === "Feriado Puente"
                            ? "warning"
                            : "default",
                        },
                      ],
                    }}
                    footer={
                      canManage
                        ? {
                            leftContent: <span className="text-xs text-gray-500 dark:text-gray-500">{holiday.description || "Sin descripción"}</span>,
                            actions: [
                              {
                                icon: faEdit,
                                onClick: (e) => {
                                  e.stopPropagation();
                                  openEdit(holiday);
                                },
                                title: "Editar",
                                variant: "default",
                              },
                              {
                                icon: faTrash,
                                onClick: (e) => {
                                  e.stopPropagation();
                                  handleDelete(holiday);
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
                    title: "Nuevo Feriado",
                    subtitle: "Agregar feriado individual al calendario",
                    icon: faCalendar,
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
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nombre</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                      {canManage && <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {filteredHolidays.map((holiday) => {
                      const dateObj = new Date(holiday.date);
                      const formattedDate = dateObj.toLocaleDateString(undefined, {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        timeZone: "UTC",
                      });
                      return (
                        <tr key={holiday._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <FontAwesomeIcon icon={faCalendar} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formattedDate}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{holiday.name}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${
                              holiday.type === "Nacional"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                : holiday.type === "Feriado Puente"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                : holiday.type === "Provincial"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300"
                            }`}>
                              {holiday.type || "Nacional"}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">{holiday.description || "—"}</span>
                          </td>
                          {canManage && (
                            <td className="px-6 py-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openEdit(holiday)}
                                  className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
                                  title="Editar"
                                >
                                  <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(holiday)}
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

          {!loading && filteredHolidays.length === 0 && (
            <EmptyState
              icon={faCalendar}
              title="No hay feriados"
              description="Aún no hay feriados registrados para este filtro. Crea uno de forma individual o utiliza la carga masiva mediante un archivo Excel."
              action={
                canManage
                  ? {
                      label: "Nuevo Feriado",
                      onClick: openCreate,
                      icon: faPlus,
                    }
                  : undefined
              }
            />
          )}
        </>
      )}

      {/* Bulk Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="bg-white dark:bg-gray-800 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faFileExcel} className="text-green-600 dark:text-green-400 h-5 w-5" />
                <h3 className="font-bold text-lg text-gray-900 dark:text-white">Carga Masiva de Feriados</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="p-5 space-y-4">
              <div className="text-sm text-gray-600 dark:text-gray-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                <p className="font-semibold mb-1">Instrucciones de Carga:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Descarga la plantilla de Excel provista.</li>
                  <li>Completa las columnas obligatorias: <strong>Fecha</strong> y <strong>Nombre</strong>.</li>
                  <li>Sube tu archivo completado en esta ventana.</li>
                  <li>Si una fecha ya está registrada, la carga masiva actualizará sus datos automáticamente (upsert).</li>
                </ol>
              </div>

              <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900/20 hover:border-blue-500 dark:hover:border-blue-500 transition-all cursor-pointer relative group">
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  required
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <FontAwesomeIcon icon={faFileExcel} className="h-10 w-10 text-green-500 dark:text-green-400 mb-3 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {importFile ? importFile.name : "Selecciona o arrastra tu archivo Excel"}
                </span>
                <span className="text-xs text-gray-500 mt-1">Soporta archivos .xlsx y .xls</span>
              </div>

              {importErrors.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 rounded-lg text-xs text-red-600 dark:text-red-400 space-y-1">
                  <p className="font-bold mb-1">Se encontraron los siguientes errores:</p>
                  {importErrors.map((err, idx) => (
                    <p key={idx}>{err}</p>
                  ))}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="flex-1 rounded-lg h-10 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-semibold bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={importing || !importFile}
                  className="flex-1 rounded-lg h-10 bg-green-600 hover:bg-green-700 text-white font-semibold shadow-md shadow-green-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {importing ? "Importando..." : "Subir e Importar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
