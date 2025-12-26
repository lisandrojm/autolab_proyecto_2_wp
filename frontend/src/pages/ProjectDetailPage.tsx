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
import { faLayerGroup, faBullseye, faEdit, faUsers, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
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

type ModalMode = "editProject" | "assignUser" | "manageTeam" | null;

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
  const [projectForm, setProjectForm] = useState({
    name: "",
    description: "",
    status: "active" as Project["status"],
    startDate: "",
    endDate: "",
    objectives: [""],
    targetAudience: "",
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
        icon={faLayerGroup}
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
        icon={faLayerGroup}
        title="Proyecto no encontrado"
        description="No pudimos encontrar el proyecto solicitado."
        action={{
          label: "Volver a Proyectos",
          onClick: () => navigate("/clients"),
        }}
      />
    );
  }

  const modalTitle = modalMode === "editProject" ? "Editar Proyecto" : "Gestionar Equipo";
  const modalPrimary = modalMode === "editProject" ? "Actualizar" : "Cerrar"; // In manage mode, primary is just close or we hide it
  const modalSubtitle = modalMode === "editProject" ? "Actualiza los datos del proyecto" : "Agrega o quita miembros del equipo";

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

  return (
    <PageLayout
      title={`Proyecto | ${project.name}`}
      badge={{ text: "Proyecto", variant: "default" }}
      faIcon={{ icon: faLayerGroup }}
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
          <button onClick={openEditProject} className="btn-primary flex items-center justify-center text-sm p-2 gap-2">
            <FontAwesomeIcon icon={faEdit} className="h-3 w-3 lg:h-4 lg:w-4" />
          </button>
        </div>
      }
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: modalTitle,
        subtitle: modalSubtitle,
        size: "lg",
        actions:
          modalMode === "editProject"
            ? [
                { label: modalPrimary, onClick: handleModalPrimary, variant: "primary" as const },
                { label: "Cancelar", onClick: closeModal, variant: "ghost" as const },
              ]
            : [{ label: "Listo", onClick: closeModal, variant: "primary" as const }],
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Objetivos</label>
                  <div className="space-y-2">
                    {projectForm.objectives.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={o}
                          onChange={(e) =>
                            setProjectForm((p) => ({
                              ...p,
                              objectives: p.objectives.map((x, idx) => (idx === i ? e.target.value : x)),
                            }))
                          }
                          className="input-field flex-1"
                          placeholder="Ej: Aumentar awareness de marca"
                        />
                        {projectForm.objectives.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setProjectForm((p) => ({
                                ...p,
                                objectives: p.objectives.filter((_, idx) => idx !== i),
                              }))
                            }
                            className="px-2 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button type="button" onClick={() => setProjectForm((p) => ({ ...p, objectives: [...p.objectives, ""] }))} className="text-primary-600 dark:text-primary-400 text-sm hover:text-primary-700 dark:hover:text-primary-300">
                      + Agregar objetivo
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Audiencia objetivo</label>
                  <textarea value={projectForm.targetAudience} onChange={(e) => setProjectForm((p) => ({ ...p, targetAudience: e.target.value }))} rows={2} className="input-field resize-none" placeholder="Describe el público objetivo..." />
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

                <div className="grid grid-cols-1 gap-4">
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
                      <FontAwesomeIcon icon={projectForm.status === "active" ? faLayerGroup : faLayerGroup} className="mr-2 h-4 w-4" />
                      {projectForm.status === "active" ? "Activo" : "En Espera"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        ),
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-6">
        {/* Card 1: Información del Proyecto */}
        <Card
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
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{project.description || "Sin descripción proporcionada."}</p>
            </div>

            {project.objectives && project.objectives.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Objetivos</h4>
                <ul className="space-y-2">
                  {project.objectives.map((obj, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <FontAwesomeIcon icon={faBullseye} className="text-primary-500 mt-1 h-3 w-3" />
                      {obj}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {project.targetAudience && (
              <div>
                <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Público Objetivo</h4>
                <p className="text-sm text-gray-700 dark:text-gray-300">{project.targetAudience}</p>
              </div>
            )}
          </div>
        </Card>
        {/* Card 2: Personas Asignadas */}
        <Card
          onClick={openManageTeam}
          header={{
            title: "Equipo del Proyecto",
            subtitle: "Gestiona el acceso de usuarios",
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
