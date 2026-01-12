import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { projectsAPI, Project, Client } from "../api/projects";

import { useAuthStore } from "../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";

import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faUsers, faInfoCircle, faBriefcase, faFileLines, faClock } from "@fortawesome/free-solid-svg-icons";
import { getHelp, hasHelp } from "../data/help/helpContent";

const HELP_KEY = "clientProjects" as const;

/* -------------------------------- Types / Helpers -------------------------------- */

// helper para resolver el clientId aunque venga populado
const getClientIdFromProject = (p: any): string | undefined => {
  if (typeof p?.clientId === "string") return p.clientId;
  if (typeof p?.clientId === "object" && p?.clientId?._id) return p.clientId._id;
  if (typeof p?.client === "string") return p.client;
  if (typeof p?.client === "object" && p?.client?._id) return p.client._id;
  return undefined;
};

type ModalMode = "editProject" | "assignUser" | "manageTeam" | "viewProjectInfo" | "viewProjectTeam" | null;

/* -------------------------------- Component -------------------------------- */

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { token } = useAuthStore();

  // data
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);

  // info modal (ⓘ)
  const [openInfo, setOpenInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  // action modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>(null);

  // form states
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

  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    status: "active" as Project["status"],
    startDate: "",
    endDate: "",
    objectives: [""],
    targetAudience: "",
    workSchedule: defaultWorkSchedule,
  });

  /* ------------------------------ Fetchers ------------------------------- */

  const fetchClientById = async (id: string) => {
    try {
      const data = await projectsAPI.getClient(id);
      setClient(data);
    } catch (error) {
      console.error("Error fetching client:", error);
      setClient(null);
    }
  };

  const fetchProject = async () => {
    try {
      const data = await projectsAPI.getProject(projectId!);
      setProject(data);
      setProjectForm({
        name: data.name,
        description: data.description || "",
        status: data.status || "active",
        startDate: data.startDate ? data.startDate.split("T")[0] : "",
        endDate: data.endDate ? data.endDate.split("T")[0] : "",
        objectives: data.objectives?.length ? data.objectives : [""],
        targetAudience: data.targetAudience || "",
        workSchedule: {
          ...defaultWorkSchedule,
          ...data.workSchedule,
          weekdays: { ...defaultWorkSchedule.weekdays, ...data.workSchedule?.weekdays },
          weekend: { ...defaultWorkSchedule.weekend, ...data.workSchedule?.weekend },
          days: { ...defaultWorkSchedule.days, ...data.workSchedule?.days },
        },
      });

      // si viene populado, evitamos otra request
      if (data && typeof (data as any).client === "object") {
        setClient((data as any).client);
      } else if (data && typeof (data as any).clientId === "object") {
        setClient((data as any).clientId);
      }

      // resolvemos el id string para llamadas adicionales
      const clientIdStr = getClientIdFromProject(data);
      if (clientIdStr) {
        if (!client) await fetchClientById(clientIdStr);
      }
    } catch (error) {
      console.error("Error fetching project:", error);
    }
  };

  /* ------------------------------- Effects ------------------------------- */

  useEffect(() => {
    if (!projectId || !token) return;
    (async () => {
      try {
        await Promise.all([fetchProject()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId, token]);

  /* ------------------------------- Actions -------------------------------- */

  const openEditProject = () => {
    if (!project) return;
    setModalMode("editProject");
    setShowModal(true);
  };

  const openManageTeam = () => {
    if (project) {
      navigate(`/projects/${project._id}/team`);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMode(null);
  };

  /* ------------------------------- Submitters ----------------------------- */

  const submitEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;

    try {
      const payload = {
        ...projectForm,
        objectives: projectForm.objectives.filter((o) => o.trim()),
      };

      await projectsAPI.updateProject(project._id, payload);
      sweetAlert.success("Proyecto actualizado", "Los cambios se han guardado correctamente");
      closeModal();
      await fetchProject();
    } catch (error) {
      console.error("Error updating project:", error);
      sweetAlert.error("Error", "No se pudo actualizar el proyecto");
    }
  };

  /* --------------------------------- UI ---------------------------------- */

  if (!projectId) {
    return (
      <EmptyState
        icon={faBriefcase}
        title="Proyecto no válido"
        description="Parece que el enlace no es correcto."
        action={{
          label: "Volver a Proyectos",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  if (loading) return <LoadingSpinner message="Cargando proyecto..." />;

  if (!project) {
    return (
      <EmptyState
        icon={faBriefcase}
        title="Proyecto no encontrado"
        description="No pudimos encontrar el proyecto solicitado."
        action={{
          label: "Volver a Proyectos",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  const getModalTitle = () => {
    switch (modalMode) {
      case "editProject":
        return "Editar Proyecto";
      case "viewProjectInfo":
        return `Detalles del Proyecto | ${project.name}`;
      case "viewProjectTeam":
        return `Equipo del Proyecto | ${project.name}`;
      default:
        return "Información";
    }
  };

  const getModalSubtitle = () => {
    switch (modalMode) {
      case "editProject":
        return "Actualiza los datos del proyecto";
      case "viewProjectInfo":
        return "Información completa y opciones";
      case "viewProjectTeam":
        return "Miembros asignados actualmente";
      default:
        return "";
    }
  };

  const handleModalPrimary = () => {
    if (modalMode === "editProject") {
      const form = document.querySelector<HTMLFormElement>("#pd-modal-form");
      form?.requestSubmit();
    } else {
      closeModal();
    }
  };

  const assignedUsers = (project as any).assignedUsers || [];
  const assignedCount = assignedUsers.length;
  const assignedSubtitle = assignedCount === 1 ? "1 persona asignada" : `${assignedCount} personas asignadas`;

  const getModalActions = () => {
    if (modalMode === "editProject") {
      return [
        { label: "Actualizar", onClick: handleModalPrimary, variant: "primary" as const },
        { label: "Cancelar", onClick: closeModal, variant: "ghost" as const },
      ];
    }
    if (modalMode === "viewProjectInfo") {
      return [
        { label: "Editar", onClick: () => setModalMode("editProject"), variant: "primary" as const },
        { label: "Equipo del Proyecto", onClick: () => setModalMode("viewProjectTeam"), variant: "secondary" as const },
        { label: "Cerrar", onClick: closeModal, variant: "ghost" as const },
      ];
    }
    if (modalMode === "viewProjectTeam") {
      return [
        { label: "Gestionar Equipo", onClick: openManageTeam, variant: "primary" as const },
        { label: "Volver", onClick: () => setModalMode("viewProjectInfo"), variant: "ghost" as const },
      ];
    }
    return [{ label: "Listo", onClick: closeModal, variant: "primary" as const }];
  };

  return (
    <PageLayout
      title={`Proyecto | ${project.name}`}
      badge={{ text: "Proyecto", variant: "default" }}
      faIcon={{ icon: faBriefcase }}
      clientMiniAvatar={{
        src: undefined,
        alt: client?.name ? `${client.name} logo` : undefined,
        fallback: client?.name?.charAt(0)?.toUpperCase?.() || "?",
        label: client?.name,
      }}
      subtitle={project.description || "Detalle del proyecto"}
      onBack={() => navigate(-1)}
      showInfoIcon
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setModalMode("viewProjectInfo");
              setShowModal(true);
            }}
            className="btn-primary flex items-center justify-center text-sm p-2 gap-2"
            title="Ver información del proyecto"
          >
            <FontAwesomeIcon icon={faFileLines} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
          <button onClick={openEditProject} className="btn-primary flex items-center justify-center text-sm p-2 gap-2" title="Editar proyecto">
            <FontAwesomeIcon icon={faEdit} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
        </div>
      }
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: getModalTitle(),
        subtitle: getModalSubtitle(),
        size: "lg",
        actions: getModalActions(),
        content: (
          <div className="space-y-6">
            {modalMode === "editProject" && (
              <form id="pd-modal-form" onSubmit={submitEditProject} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nombre *</label>
                  <input type="text" required value={projectForm.name} onChange={(e) => setProjectForm((p) => ({ ...p, name: e.target.value }))} className="input-field" placeholder="Nombre del proyecto" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Descripción</label>
                  <textarea value={projectForm.description} onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))} rows={3} className="input-field resize-none" placeholder="Descripción del proyecto..." />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Inicio</label>
                    <input type="date" className="input-field" value={projectForm.startDate} onChange={(e) => setProjectForm((p) => ({ ...p, startDate: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha Fin</label>
                    <input type="date" className="input-field" value={projectForm.endDate} onChange={(e) => setProjectForm((p) => ({ ...p, endDate: e.target.value }))} />
                  </div>
                </div>

                {/* Horario de Trabajo */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">Horario de Trabajo</label>

                  <div className="flex gap-2 mb-4">
                    <button type="button" onClick={() => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, mode: "weekdays" as any } }))} className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-all ${(projectForm.workSchedule.mode as string) === "weekdays" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                      L a V
                    </button>
                    <button type="button" onClick={() => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, mode: "all_week" as any } }))} className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-all ${(projectForm.workSchedule.mode as string) === "all_week" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                      L a D
                    </button>
                    <button type="button" onClick={() => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, mode: "per_day" } }))} className={`flex-1 py-2 px-2 rounded text-xs font-medium transition-all ${projectForm.workSchedule.mode === "per_day" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                      Por Día
                    </button>
                  </div>

                  {(projectForm.workSchedule.mode as string) === "weekdays" && (
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                      <div className="text-xs font-medium mb-2 text-center">Lunes a Viernes</div>
                      <div className="flex gap-2 items-center">
                        <input type="time" className="input-field text-sm flex-1" value={projectForm.workSchedule.weekdays.startTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, weekdays: { ...p.workSchedule.weekdays, startTime: e.target.value } } }))} />
                        <span className="text-gray-400">a</span>
                        <input type="time" className="input-field text-sm flex-1" value={projectForm.workSchedule.weekdays.endTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, weekdays: { ...p.workSchedule.weekdays, endTime: e.target.value } } }))} />
                      </div>
                      <p className="text-xs text-gray-500 mt-2 text-center">Sábado y Domingo: No laboral</p>
                    </div>
                  )}

                  {(projectForm.workSchedule.mode as string) === "all_week" && (
                    <div className="space-y-3">
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                        <div className="text-xs font-medium mb-2 text-gray-600 dark:text-gray-400">Lunes a Viernes</div>
                        <div className="flex gap-2 items-center">
                          <input type="time" className="input-field text-sm flex-1" value={projectForm.workSchedule.weekdays.startTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, weekdays: { ...p.workSchedule.weekdays, startTime: e.target.value } } }))} />
                          <span className="text-gray-400">a</span>
                          <input type="time" className="input-field text-sm flex-1" value={projectForm.workSchedule.weekdays.endTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, weekdays: { ...p.workSchedule.weekdays, endTime: e.target.value } } }))} />
                        </div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Sábado</span>
                          <button
                            type="button"
                            onClick={() =>
                              setProjectForm((p) => {
                                const newIsWorkDay = !p.workSchedule.days.saturday.isWorkDay;
                                const newData = { ...p.workSchedule.days.saturday, isWorkDay: newIsWorkDay };
                                if (newIsWorkDay && (!newData.startTime || newData.startTime === "")) {
                                  newData.startTime = "09:00";
                                  newData.endTime = "18:00";
                                }
                                return { ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, saturday: newData } } };
                              })
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${projectForm.workSchedule.days.saturday.isWorkDay ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}
                          >
                            {projectForm.workSchedule.days.saturday.isWorkDay ? "Laboral" : "No Laboral"}
                          </button>
                        </div>
                        {projectForm.workSchedule.days.saturday.isWorkDay && (
                          <div className="flex gap-2 items-center">
                            <input type="time" className="input-field text-sm flex-1" value={projectForm.workSchedule.days.saturday.startTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, saturday: { ...p.workSchedule.days.saturday, startTime: e.target.value } } } }))} />
                            <span className="text-gray-400">a</span>
                            <input type="time" className="input-field text-sm flex-1" value={projectForm.workSchedule.days.saturday.endTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, saturday: { ...p.workSchedule.days.saturday, endTime: e.target.value } } } }))} />
                          </div>
                        )}
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Domingo</span>
                          <button
                            type="button"
                            onClick={() =>
                              setProjectForm((p) => {
                                const newIsWorkDay = !p.workSchedule.days.sunday.isWorkDay;
                                const newData = { ...p.workSchedule.days.sunday, isWorkDay: newIsWorkDay };
                                if (newIsWorkDay && (!newData.startTime || newData.startTime === "")) {
                                  newData.startTime = "09:00";
                                  newData.endTime = "18:00";
                                }
                                return { ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, sunday: newData } } };
                              })
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-medium ${projectForm.workSchedule.days.sunday.isWorkDay ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}
                          >
                            {projectForm.workSchedule.days.sunday.isWorkDay ? "Laboral" : "No Laboral"}
                          </button>
                        </div>
                        {projectForm.workSchedule.days.sunday.isWorkDay && (
                          <div className="flex gap-2 items-center">
                            <input type="time" className="input-field text-sm flex-1" value={projectForm.workSchedule.days.sunday.startTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, sunday: { ...p.workSchedule.days.sunday, startTime: e.target.value } } } }))} />
                            <span className="text-gray-400">a</span>
                            <input type="time" className="input-field text-sm flex-1" value={projectForm.workSchedule.days.sunday.endTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, sunday: { ...p.workSchedule.days.sunday, endTime: e.target.value } } } }))} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {projectForm.workSchedule.mode === "per_day" && (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day) => {
                        const dayLabels: Record<string, string> = { monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles", thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo" };
                        const dayData = projectForm.workSchedule.days[day];
                        return (
                          <div key={day} className="bg-gray-50 dark:bg-gray-800 p-2 rounded flex items-center gap-2">
                            <span className="text-xs font-medium w-20">{dayLabels[day]}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setProjectForm((p) => {
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
                                <input type="time" className="input-field text-xs flex-1 py-1" value={dayData.startTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, [day]: { ...p.workSchedule.days[day], startTime: e.target.value } } } }))} />
                                <span className="text-gray-400 text-xs">-</span>
                                <input type="time" className="input-field text-xs flex-1 py-1" value={dayData.endTime} onChange={(e) => setProjectForm((p) => ({ ...p, workSchedule: { ...p.workSchedule, days: { ...p.workSchedule.days, [day]: { ...p.workSchedule.days[day], endTime: e.target.value } } } }))} />
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
                        setProjectForm((p) => ({
                          ...p,
                          status: p.status === "active" ? "on_hold" : "active",
                        }))
                      }
                      className={`px-3 py-1 rounded text-sm font-medium inline-flex items-center transition-colors ${projectForm.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400"}`}
                    >
                      <FontAwesomeIcon icon={projectForm.status === "active" ? faBriefcase : faBriefcase} className="mr-2 h-4 w-4" />
                      {projectForm.status === "active" ? "Activo" : "En Espera"}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {modalMode === "viewProjectInfo" && (
              <div className="space-y-4">
                {/* Descripción */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-4">
                  <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Descripción</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{project.description || "Sin descripción proporcionada."}</p>
                </div>

                {/* Horario de Trabajo */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FontAwesomeIcon icon={faClock} className="text-blue-500 h-4 w-4" />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Horario de Trabajo</h4>
                  </div>
                  {project.workSchedule ? (
                    <div className="space-y-2 text-sm">
                      {(project.workSchedule.mode === "weekdays" || !project.workSchedule.mode) && (
                        <>
                          <div className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-gray-600 dark:text-gray-400">Lunes a Viernes</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {project.workSchedule.weekdays?.startTime || "09:00"} - {project.workSchedule.weekdays?.endTime || "18:00"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-gray-600 dark:text-gray-400">Sábado y Domingo</span>
                            <span className="text-gray-500">No laboral</span>
                          </div>
                        </>
                      )}
                      {project.workSchedule.mode === "all_week" && (
                        <>
                          <div className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-gray-600 dark:text-gray-400">Lunes a Viernes</span>
                            <span className="font-medium text-gray-900 dark:text-white">
                              {project.workSchedule.weekdays?.startTime || "09:00"} - {project.workSchedule.weekdays?.endTime || "18:00"}
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-1 border-b border-gray-200 dark:border-gray-700">
                            <span className="text-gray-600 dark:text-gray-400">Sábado</span>
                            {project.workSchedule.days?.saturday?.isWorkDay ? (
                              <span className="font-medium text-gray-900 dark:text-white">
                                {project.workSchedule.days.saturday.startTime} - {project.workSchedule.days.saturday.endTime}
                              </span>
                            ) : (
                              <span className="text-gray-500">No laboral</span>
                            )}
                          </div>
                          <div className="flex justify-between items-center py-1">
                            <span className="text-gray-600 dark:text-gray-400">Domingo</span>
                            {project.workSchedule.days?.sunday?.isWorkDay ? (
                              <span className="font-medium text-gray-900 dark:text-white">
                                {project.workSchedule.days.sunday.startTime} - {project.workSchedule.days.sunday.endTime}
                              </span>
                            ) : (
                              <span className="text-gray-500">No laboral</span>
                            )}
                          </div>
                        </>
                      )}
                      {project.workSchedule.mode === "per_day" && (
                        <>
                          {(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const).map((day, idx, arr) => {
                            const dayLabels: Record<string, string> = { monday: "Lunes", tuesday: "Martes", wednesday: "Miércoles", thursday: "Jueves", friday: "Viernes", saturday: "Sábado", sunday: "Domingo" };
                            const dayData = project.workSchedule?.days?.[day];
                            return (
                              <div key={day} className={`flex justify-between items-center py-1 ${idx < arr.length - 1 ? "border-b border-gray-200 dark:border-gray-700" : ""}`}>
                                <span className="text-gray-600 dark:text-gray-400">{dayLabels[day]}</span>
                                {dayData?.isWorkDay ? (
                                  <span className="font-medium text-gray-900 dark:text-white">
                                    {dayData.startTime} - {dayData.endTime}
                                  </span>
                                ) : (
                                  <span className="text-gray-500">No laboral</span>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Horario no configurado</p>
                  )}
                </div>

                {/* Estadísticas / Fechas */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="border-r border-gray-200 dark:border-gray-700">
                      <div className="text-xl font-bold text-gray-900 dark:text-white">{assignedUsers.length}</div>
                      <div className="text-xs text-gray-500">Personas</div>
                    </div>
                    <div className="border-r border-gray-200 dark:border-gray-700">
                      <div className="text-sm font-bold text-gray-900 dark:text-white pt-1">{project.startDate ? new Date(project.startDate.split("T")[0] + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                      <div className="text-xs text-gray-500 mt-1">Inicio</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white pt-1">{project.endDate ? new Date(project.endDate.split("T")[0] + "T00:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "—"}</div>
                      <div className="text-xs text-gray-500 mt-1">Fin</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {modalMode === "viewProjectTeam" && (
              <div className="space-y-4">
                {assignedUsers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <p>No hay miembros asignados.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {assignedUsers.map((u: any, idx: number) => {
                      const name = typeof u === "object" ? (u.firstName ? `${u.firstName} ${u.lastName || ""}` : u.email) : "Usuario"; // Fallback if just ID
                      const email = typeof u === "object" ? u.email : u; // Fallback if just ID
                      const initial = name.charAt(0).toUpperCase();

                      return (
                        <div key={idx} className="flex items-center gap-3 py-3">
                          <div className="w-8 h-8 rounded bg-primary-100 text-primary-600 flex items-center justify-center font-bold text-xs">{initial}</div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</p>
                            <p className="text-xs text-gray-500">{email}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ),
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        {/* Card 1: Información del Proyecto */}
        <Card
          onClick={() => {
            setModalMode("viewProjectInfo");
            setShowModal(true);
          }}
          className="cursor-pointer hover:border-primary-300 transition-colors"
          header={{
            title: "Información del Proyecto",
            subtitle: "Objetivos y detalles estratégicos",
            icon: faInfoCircle,
          }}
          footer={{
            leftContent: (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"} - {project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"}
              </span>
            ),
          }}
        >
          <div className="space-y-6">
            <div>
              <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Descripción</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-3">{project.description || "Sin descripción proporcionada."}</p>
            </div>
            {/* Reduced content for preview */}
          </div>
        </Card>
        {/* Card 2: Personas Asignadas */}
        <Card
          onClick={openManageTeam}
          header={{
            title: "Equipo del Proyecto",
            subtitle: "Gestiona los usuarios del proyecto",
            icon: faUsers,
          }}
          footer={{
            leftContent: <span className="text-sm text-gray-500 dark:text-gray-400">{assignedSubtitle}</span>,
            actions: [
              {
                icon: faEdit,
                onClick: openManageTeam,
                title: "Gestionar Equipo",
              },
            ],
          }}
        />
      </div>
    </PageLayout>
  );
};
