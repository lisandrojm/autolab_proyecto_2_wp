import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// Si necesitás i18n, usá: import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/authStore";
import { projectsAPI, Project } from "../api/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { sweetAlert } from "../utils/sweetAlert";
import { emitProjectsChanged } from "../utils/navbarEvents";
import { faPlus, faEdit, faTrash, faBriefcase, faBuilding } from "@fortawesome/free-solid-svg-icons";
import { Card } from "../components/ui/Card";
import { PageLayout } from "../components/ui/PageLayout";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { getImageUrl } from "../utils/imageHelpers";

const HELP_KEY = "clientProjects" as const;

type ModalMode = "create" | "edit" | null;

export const ClientProjectsPage: React.FC = () => {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  // const { t } = useTranslation(); // si lo necesitás, descomentá y usalo
  const [projects, setProjects] = useState<Project[]>([]);
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // búsqueda, fechas y paginación
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState(""); // YYYY-MM-DD
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // modal unificado
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    status: "active" as "active" | "completed" | "on_hold" | "archived",
    startDate: "",
    endDate: "",
    objectives: [] as string[],
    targetAudience: "",
    workSchedule: {
      mode: "weekdays" as "weekdays" | "all_week" | "per_day",
      weekdays: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
      weekend: { startTime: "", endTime: "", isWorkDay: false },
      days: {
        monday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
        tuesday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
        wednesday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
        thursday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
        friday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
        saturday: { startTime: "", endTime: "", isWorkDay: false },
        sunday: { startTime: "", endTime: "", isWorkDay: false },
      },
    },
  });

  // ⓘ estado del modal de información
  const [openInfo, setOpenInfo] = useState(false);
  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    if (!clientId) return;
    fetchClient();
  }, [clientId]);

  // Reset de página cuando cambian filtros
  useEffect(() => {
    setPage(1);
  }, [searchTerm, startDate, endDate]);

  useEffect(() => {
    if (!clientId) return;
    fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, page, searchTerm, startDate, endDate]);

  const fetchClient = async () => {
    try {
      const { token, tenantId } = useAuthStore.getState();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/clients/${clientId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setClient(data);
      }
    } catch (error) {
      console.error("Error fetching client:", error);
    }
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const options: any = {
        q: searchTerm || undefined,
        page,
        limit: 12,
        // Si tu API ya soporta estos, viajarán:
        dateFrom: startDate || undefined,
        dateTo: endDate || undefined,
      };
      const response = await projectsAPI.getClientProjects(clientId!, options);
      setProjects(response.projects);
      setTotalPages(response.pagination.pages);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  // ---- Filtrado local por fechas (fallback si el backend todavía no filtra) ----
  const visibleProjects = useMemo(() => {
    if (!startDate && !endDate) return projects;

    const startTs = startDate ? new Date(startDate).getTime() : null;
    const endTs = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return projects.filter((p) => {
      // Usamos startDate del proyecto si existe, o createdAt
      const d = p.startDate ? p.startDate : p.createdAt;
      const t = d ? new Date(d).getTime() : NaN;
      if (Number.isNaN(t)) return false;
      let ok = true;
      if (startTs !== null) ok = ok && t >= startTs;
      if (endTs !== null) ok = ok && t <= endTs;
      return ok;
    });
  }, [projects, startDate, endDate]);

  const defaultWorkSchedule = {
    mode: "weekdays" as "weekdays" | "all_week" | "per_day",
    weekdays: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
    weekend: { startTime: "", endTime: "", isWorkDay: false },
    days: {
      monday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
      tuesday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
      wednesday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
      thursday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
      friday: { startTime: "09:00", endTime: "18:00", isWorkDay: true },
      saturday: { startTime: "", endTime: "", isWorkDay: false },
      sunday: { startTime: "", endTime: "", isWorkDay: false },
    },
  };

  const handleOpenCreate = () => {
    setModalMode("create");
    setEditingProject(null);
    setFormData({
      name: "",
      description: "",
      status: "active",
      startDate: "",
      endDate: "",
      objectives: [],
      targetAudience: "",
      workSchedule: defaultWorkSchedule,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (project: Project) => {
    setModalMode("edit");
    setEditingProject(project);
    setFormData({
      name: project.name || "",
      description: project.description || "",
      status: project.status || "active",
      startDate: project.startDate ? project.startDate.split("T")[0] : "",
      endDate: project.endDate ? project.endDate.split("T")[0] : "",
      objectives: project.objectives || [],
      targetAudience: project.targetAudience || "",
      workSchedule: {
        ...defaultWorkSchedule,
        ...project.workSchedule,
        weekdays: { ...defaultWorkSchedule.weekdays, ...project.workSchedule?.weekdays },
        weekend: { ...defaultWorkSchedule.weekend, ...project.workSchedule?.weekend },
        days: { ...defaultWorkSchedule.days, ...project.workSchedule?.days },
      },
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
      };

      if (modalMode === "create") {
        await projectsAPI.createProject(clientId!, data);
        sweetAlert.success("Proyecto creado", "El proyecto se ha creado correctamente");
      } else if (modalMode === "edit" && editingProject) {
        await projectsAPI.updateProject(editingProject._id, data);
        sweetAlert.success("Proyecto actualizado", "Los cambios se han guardado correctamente");
      }

      setShowModal(false);
      setModalMode(null);
      setEditingProject(null);
      // refrescar lista
      fetchProjects();
    } catch (error) {
      console.error("Error saving project:", error);
      sweetAlert.error("Error", modalMode === "create" ? "No se pudo crear el proyecto" : "No se pudo actualizar el proyecto");
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    const result = await sweetAlert.confirm("¿Eliminar proyecto?", "Esta acción no se puede deshacer.");
    if (!result.isConfirmed) return;

    try {
      const { token, tenantId } = useAuthStore.getState();
      const response = await fetch(`${import.meta.env.VITE_API_URL}/projects/${projectId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      if (response.ok) {
        sweetAlert.success("Proyecto eliminado", "El proyecto fue eliminado correctamente");
        emitProjectsChanged("delete", projectId, clientId);
        fetchProjects();
      } else {
        const errorData = await response.json();
        sweetAlert.error("Error", errorData.error || "No se pudo eliminar el proyecto");
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      sweetAlert.error("Error", "No se pudo eliminar el proyecto");
    }
  };

  if (!clientId) {
    return (
      <PageLayout title="Cliente no válido" subtitle="">
        <div className="text-center">
          <button onClick={() => navigate("/clients")} className="btn-primary">
            Volver a Clientes
          </button>
        </div>
      </PageLayout>
    );
  }

  const displayLogo = client?.attachments?.find((a: any) => a.name?.toLowerCase().includes("logo") || a.fileType?.includes("image"))?.url || client?.brandKit?.logos?.[0]?.url;

  return (
    <PageLayout
      title={client?.name ? `Proyectos` : "Cliente"}
      itemCount={visibleProjects.length}
      faIcon={{ icon: faBriefcase }}
      clientMiniAvatar={{
        src: getImageUrl(displayLogo),
        alt: client?.name ? `${client.name} logo` : undefined,
        fallback: client?.name?.charAt(0)?.toUpperCase?.() || "?",
        label: client?.name,
      }}
      subtitle="Gestiona los proyectos del cliente"
      onBack={() => navigate(-1)}
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
        <button onClick={handleOpenCreate} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3 lg:h-4 lg:w-4" />
        </button>
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar proyectos..."
          filters={[]}
          dateFilter={{
            startDate,
            endDate,
            onStartDateChange: setStartDate,
            onEndDateChange: setEndDate,
          }}
        />
      }
      modal={
        showModal
          ? {
              isOpen: true,
              onClose: () => {
                setShowModal(false);
                setModalMode(null);
                setEditingProject(null);
              },
              title: modalMode === "edit" ? "Editar Proyecto" : "Nuevo Proyecto",
              subtitle: modalMode === "edit" ? "Actualiza los datos del proyecto" : "Completa los datos del proyecto",
              size: "lg",
              actions: [
                {
                  label: modalMode === "edit" ? "Actualizar" : "Crear",
                  onClick: () => {
                    const form = document.querySelector<HTMLFormElement>("#project-form");
                    form?.requestSubmit();
                  },
                  variant: "primary",
                },
                {
                  label: "Cancelar",
                  onClick: () => setShowModal(false),
                  variant: "ghost",
                },
              ],
              content: (
                <form id="project-form" onSubmit={handleSubmit}>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre del Proyecto *</label>
                      <input type="text" required value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Ej: Campaña Verano 2024" />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) =>
                          setFormData((p) => ({
                            ...p,
                            description: e.target.value,
                          }))
                        }
                        rows={3}
                        className="input-field resize-none"
                        placeholder="Descripción del proyecto..."
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Inicio</label>
                        <input type="date" className="input-field" value={formData.startDate} onChange={(e) => setFormData((p) => ({ ...p, startDate: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Fin</label>
                        <input type="date" className="input-field" value={formData.endDate} onChange={(e) => setFormData((p) => ({ ...p, endDate: e.target.value }))} />
                      </div>
                    </div>

                    {/* Horario de Trabajo */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                      <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">Horario de Trabajo</label>

                      {/* Mode Selector - 3 buttons */}
                      <div className="flex gap-2 mb-4">
                        <button type="button" onClick={() => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, mode: "weekdays" as any } }))} className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-all ${(formData.workSchedule.mode as string) === "weekdays" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                          L a V
                        </button>
                        <button type="button" onClick={() => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, mode: "all_week" as any } }))} className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-all ${(formData.workSchedule.mode as string) === "all_week" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                          L a D
                        </button>
                        <button type="button" onClick={() => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, mode: "per_day" } }))} className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-all ${formData.workSchedule.mode === "per_day" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                          Por Día
                        </button>
                      </div>

                      {/* Lunes a Viernes */}
                      {(formData.workSchedule.mode as string) === "weekdays" && (
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                          <div className="text-sm font-medium mb-2 text-center">Lunes a Viernes</div>
                          <div className="flex gap-2 items-center">
                            <input type="time" className="input-field text-sm flex-1" value={formData.workSchedule.weekdays.startTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, weekdays: { ...p.workSchedule.weekdays, startTime: e.target.value } } }))} />
                            <span className="text-gray-400">a</span>
                            <input type="time" className="input-field text-sm flex-1" value={formData.workSchedule.weekdays.endTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, weekdays: { ...p.workSchedule.weekdays, endTime: e.target.value } } }))} />
                          </div>
                          <p className="text-xs text-gray-500 mt-2 text-center">Sábado y Domingo: No laboral</p>
                        </div>
                      )}

                      {/* Lunes a Domingo - 3 horarios separados */}
                      {(formData.workSchedule.mode as string) === "all_week" && (
                        <div className="space-y-3">
                          {/* Lunes a Viernes */}
                          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                            <div className="text-xs font-medium mb-2 text-gray-600 dark:text-gray-400">Lunes a Viernes</div>
                            <div className="flex gap-2 items-center">
                              <input type="time" className="input-field text-sm flex-1" value={formData.workSchedule.weekdays.startTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, weekdays: { ...p.workSchedule.weekdays, startTime: e.target.value } } }))} />
                              <span className="text-gray-400">a</span>
                              <input type="time" className="input-field text-sm flex-1" value={formData.workSchedule.weekdays.endTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, weekdays: { ...p.workSchedule.weekdays, endTime: e.target.value } } }))} />
                            </div>
                          </div>
                          {/* Sábado */}
                          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Sábado</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setFormData((p) => {
                                    const newIsWorkDay = !p.workSchedule.days.saturday.isWorkDay;
                                    const newData = { ...p.workSchedule.days.saturday, isWorkDay: newIsWorkDay };
                                    if (newIsWorkDay && (!newData.startTime || newData.startTime === "")) {
                                      newData.startTime = "09:00";
                                      newData.endTime = "18:00";
                                    }
                                    return { ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, saturday: newData } } };
                                  })
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-medium ${formData.workSchedule.days.saturday.isWorkDay ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}
                              >
                                {formData.workSchedule.days.saturday.isWorkDay ? "Laboral" : "No Laboral"}
                              </button>
                            </div>
                            {formData.workSchedule.days.saturday.isWorkDay && (
                              <div className="flex gap-2 items-center">
                                <input type="time" className="input-field text-sm flex-1" value={formData.workSchedule.days.saturday.startTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, saturday: { ...p.workSchedule.days.saturday, startTime: e.target.value } } } }))} />
                                <span className="text-gray-400">a</span>
                                <input type="time" className="input-field text-sm flex-1" value={formData.workSchedule.days.saturday.endTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, saturday: { ...p.workSchedule.days.saturday, endTime: e.target.value } } } }))} />
                              </div>
                            )}
                          </div>
                          {/* Domingo */}
                          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Domingo</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setFormData((p) => {
                                    const newIsWorkDay = !p.workSchedule.days.sunday.isWorkDay;
                                    const newData = { ...p.workSchedule.days.sunday, isWorkDay: newIsWorkDay };
                                    if (newIsWorkDay && (!newData.startTime || newData.startTime === "")) {
                                      newData.startTime = "09:00";
                                      newData.endTime = "18:00";
                                    }
                                    return { ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, sunday: newData } } };
                                  })
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-medium ${formData.workSchedule.days.sunday.isWorkDay ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}
                              >
                                {formData.workSchedule.days.sunday.isWorkDay ? "Laboral" : "No Laboral"}
                              </button>
                            </div>
                            {formData.workSchedule.days.sunday.isWorkDay && (
                              <div className="flex gap-2 items-center">
                                <input type="time" className="input-field text-sm flex-1" value={formData.workSchedule.days.sunday.startTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, sunday: { ...p.workSchedule.days.sunday, startTime: e.target.value } } } }))} />
                                <span className="text-gray-400">a</span>
                                <input type="time" className="input-field text-sm flex-1" value={formData.workSchedule.days.sunday.endTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, sunday: { ...p.workSchedule.days.sunday, endTime: e.target.value } } } }))} />
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Por Día */}
                      {formData.workSchedule.mode === "per_day" && (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day) => {
                            const dayLabels: Record<string, string> = { monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles", thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo" };
                            const dayData = formData.workSchedule.days[day];
                            return (
                              <div key={day} className="bg-gray-50 dark:bg-gray-800 p-2 rounded flex items-center gap-2">
                                <span className="text-xs font-medium w-20">{dayLabels[day]}</span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setFormData((p) => {
                                      const newIsWorkDay = !p.workSchedule.days[day].isWorkDay;
                                      const newData = { ...p.workSchedule.days[day], isWorkDay: newIsWorkDay };
                                      if (newIsWorkDay && (!newData.startTime || newData.startTime === "")) {
                                        newData.startTime = "09:00";
                                        newData.endTime = "18:00";
                                      }
                                      return { ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, [day]: newData } } };
                                    })
                                  }
                                  className={`px-2 py-1 rounded text-[10px] font-medium ${dayData.isWorkDay ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}
                                >
                                  {dayData.isWorkDay ? "Sí" : "No"}
                                </button>
                                {dayData.isWorkDay && (
                                  <>
                                    <input type="time" className="input-field text-xs flex-1 py-1" value={dayData.startTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, [day]: { ...p.workSchedule.days[day], startTime: e.target.value } } } }))} />
                                    <span className="text-gray-400 text-xs">-</span>
                                    <input type="time" className="input-field text-xs flex-1 py-1" value={dayData.endTime} onChange={(e) => setFormData((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, [day]: { ...p.workSchedule.days[day], endTime: e.target.value } } } }))} />
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Estado - al final */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                        <button
                          type="button"
                          onClick={() =>
                            setFormData((p) => ({
                              ...p,
                              status: p.status === "active" ? "on_hold" : "active",
                            }))
                          }
                          className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${formData.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400"}`}
                        >
                          <svg data-prefix="fas" data-icon={formData.status === "active" ? "toggle-on" : "toggle-off"} className="svg-inline--fa mr-1 h-4 w-4" role="img" viewBox="0 0 576 512" aria-hidden="true">
                            <path fill="currentColor" d={formData.status === "active" ? "M192 64C86 64 0 150 0 256S86 448 192 448l192 0c106 0 192-86 192-192S490 64 384 64L192 64zm192 96a96 96 0 1 1 0 192 96 96 0 1 1 0-192z" : "M384 64l-192 0C86 64 0 150 0 256s86 192 192 192l192 0c106 0 192-86 192-192S490 64 384 64M192 352a96 96 0 1 1 0-192 96 96 0 1 1 0 192z"}></path>
                          </svg>
                          {formData.status === "active" ? "Activo" : "En Espera"}
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              ),
            }
          : undefined
      }
    >
      {/* Projects Grid */}
      {loading ? (
        <LoadingSpinner message="Cargando proyectos..." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6 mt-4mt-2">
          {/* Tarjetas de proyecto (filtradas localmente por fecha si corresponde) */}
          {visibleProjects.map((project) => (
            <Card
              key={project._id}
              onClick={() => navigate(`/projects/${project._id}`)}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200"
              header={{
                title: `Proyecto | ${project.name}`,
                subtitle: project.description,
                avatar: {
                  src: client?.logo, // assuming client object has logo, otherwise fallback
                  fallback: (client?.name || "C").charAt(0).toUpperCase(),
                  alt: client?.name,
                },
                badges: [
                  {
                    text: project.status === "active" ? "Activo" : project.status === "on_hold" ? "En Espera" : project.status === "completed" ? "Completado" : "Archivado",
                    variant: project.status === "active" ? "green" : project.status === "on_hold" ? "warning" : project.status === "completed" ? "info" : "default",
                  },
                  {
                    text: client?.name || "Cliente",
                    variant: "cyan",
                  },
                ],
                badgesPosition: "top",
              }}
              footer={{
                leftContent: (
                  <div className="space-y-1">
                    <div className="text-xs text-gray-500 dark:text-gray-500">{new Date(project.createdAt).toLocaleDateString()}</div>
                  </div>
                ),
                actions: [
                  {
                    icon: faEdit,
                    onClick: (e: any) => {
                      e.stopPropagation();
                      handleOpenEdit(project);
                    },
                    title: "Editar proyecto",
                    variant: "default",
                  },
                  {
                    icon: faTrash,
                    onClick: (e: any) => {
                      e.stopPropagation();
                      handleDeleteProject(project._id);
                    },
                    title: "Eliminar proyecto",
                    variant: "default",
                  },
                ],
              }}
            >
              {/* Sede dentro del cuerpo de la card */}
              {project.metadataResolutions?.sede && (
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex gap-1 items-center">
                    <FontAwesomeIcon icon={faBuilding} className="h-3 w-3 text-gray-400" />
                    Sede
                  </label>
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 w-fit">{project.metadataResolutions.sede.name || project.metadataResolutions.sede.data?.nombre || "Sede"}</span>
                </div>
              )}
            </Card>
          ))}
          {/* Nueva tarjeta de creación */}
          <Card
            variant="create"
            onClick={handleOpenCreate}
            header={{
              title: "Nuevo Proyecto",
              subtitle: "Crear un nuevo proyecto para este cliente",
              icon: faBriefcase,
            }}
          />
        </div>
      )}

      {/* Paginación (del backend). Nota: con filtro local, pagina sobre el resultado actual de esta página */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 mt-8">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50">
            Anterior
          </button>
          <span className="px-4 py-2 text-gray-600 dark:text-gray-400">
            Página {page} de {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-2 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50">
            Siguiente
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && visibleProjects.length === 0 && (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faBriefcase} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No hay proyectos</h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{startDate || endDate ? `No se encontraron proyectos ${startDate && endDate ? `desde ${new Date(startDate).toLocaleDateString()} hasta ${new Date(endDate).toLocaleDateString()}` : startDate ? `desde ${new Date(startDate).toLocaleDateString()}` : `hasta ${new Date(endDate).toLocaleDateString()}`}` : "Crea el primer proyecto para este cliente"}</p>
          <button onClick={handleOpenCreate} className="btn-primary">
            <FontAwesomeIcon icon={faPlus} className="h-5 w-5 mr-2" />
            Nuevo Proyecto
          </button>
        </div>
      )}
    </PageLayout>
  );
};
