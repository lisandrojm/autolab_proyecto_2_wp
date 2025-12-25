import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { projectsAPI, Project, Client } from "../api/projects";
import { usersAPI, User } from "../api/users";
import { useAuthStore } from "../stores/authStore";
import { sweetAlert } from "../utils/sweetAlert";

import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { EmptyState } from "../components/ui/EmptyState";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLayerGroup, faBullseye, faEdit, faUsers, faInfoCircle, faTrash, faUserPlus } from "@fortawesome/free-solid-svg-icons";
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

type ModalMode = "editProject" | "assignUser" | null;

/* -------------------------------- Component -------------------------------- */

export const ProjectDetailPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { token } = useAuthStore();

  // data
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

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

  const [selectedUserId, setSelectedUserId] = useState("");

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

  const fetchUsers = async () => {
    try {
      const { users } = await usersAPI.list({ limit: 1000 });
      setAllUsers(users);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  /* ------------------------------- Effects ------------------------------- */

  useEffect(() => {
    if (!projectId || !token) return;
    (async () => {
      try {
        await Promise.all([fetchProject(), fetchUsers()]);
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

  const openAssignUser = () => {
    setModalMode("assignUser");
    setSelectedUserId("");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalMode(null);
  };

  const handleUnassignUser = async (userId: string) => {
    if (!project) return;
    const result = await sweetAlert.confirm("¿Retirar del proyecto?", "¿Estás seguro de que quieres quitar a esta persona del proyecto?");
    if (!result.isConfirmed) return;

    try {
      const newAssigned = (project as any).assignedUsers.map((u: any) => u._id).filter((id: string) => id !== userId);

      await projectsAPI.updateProject(project._id, { assignedUsers: newAssigned });
      sweetAlert.success("Persona retirada", "El equipo ha sido actualizado");
      fetchProject();
    } catch (error) {
      console.error("Error unassigning user:", error);
      sweetAlert.error("Error", "No se pudo retirar a la persona");
    }
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

  const submitAssignUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !selectedUserId) return;

    try {
      const currentIds = (project as any).assignedUsers.map((u: any) => u._id);
      if (currentIds.includes(selectedUserId)) {
        sweetAlert.warning("Ya asignado", "Esta persona ya forma parte del proyecto");
        return;
      }

      await projectsAPI.updateProject(project._id, {
        assignedUsers: [...currentIds, selectedUserId],
      });

      sweetAlert.success("Persona asignada", "El perfil se ha añadido al proyecto");
      closeModal();
      fetchProject();
    } catch (error) {
      console.error("Error assigning user:", error);
      sweetAlert.error("Error", "No se pudo asignar a la persona");
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

  const modalTitle = modalMode === "editProject" ? "Editar Proyecto" : "Asignar Persona";
  const modalPrimary = modalMode === "editProject" ? "Actualizar" : "Asignar";
  const modalSubtitle = modalMode === "editProject" ? "Actualiza los datos del proyecto" : "Selecciona una persona para sumar al proyecto";

  const handleModalPrimary = () => {
    const form = document.querySelector<HTMLFormElement>("#pd-modal-form");
    form?.requestSubmit();
  };

  const assignedUsers = (project as any).assignedUsers || [];

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
            <span className="hidden sm:inline">Editar</span>
          </button>
        </div>
      }
      modal={{
        isOpen: showModal,
        onClose: closeModal,
        title: modalTitle,
        subtitle: modalSubtitle,
        size: "lg",
        actions: [
          { label: modalPrimary, onClick: handleModalPrimary, variant: "primary" as const },
          { label: "Cancelar", onClick: closeModal, variant: "ghost" as const },
        ],
        content: (
          <form id="pd-modal-form" onSubmit={modalMode === "editProject" ? submitEditProject : submitAssignUser}>
            {modalMode === "editProject" && (
              <div className="space-y-6">
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
              </div>
            )}

            {modalMode === "assignUser" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Seleccionar Persona</label>
                  <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} className="input-field" required>
                    <option value="">Selecciona un usuario...</option>
                    {allUsers
                      .filter((u) => !assignedUsers.some((au: any) => au._id === u._id))
                      .map((u) => (
                        <option key={u._id} value={u._id}>
                          {u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}` : u.email}
                        </option>
                      ))}
                  </select>
                  <p className="mt-2 text-xs text-gray-500">Solo aparecen personas que aún no están en el proyecto.</p>
                </div>
              </div>
            )}
          </form>
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

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-700">
              <div>
                <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Fecha Inicio</h4>
                <p className="text-sm text-gray-900 dark:text-white">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "—"}</p>
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Fecha Fin</h4>
                <p className="text-sm text-gray-900 dark:text-white">{project.endDate ? new Date(project.endDate).toLocaleDateString() : "—"}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 2: Personas Asignadas */}
        <Card
          header={{
            title: "Equipo del Proyecto",
            subtitle: `${assignedUsers.length} personas asignadas`,
            icon: faUsers,
            actions: [
              {
                icon: faUserPlus,
                onClick: openAssignUser,
                title: "Asignar Persona",
                variant: "blue",
              },
            ],
          }}
        >
          {assignedUsers.length > 0 ? (
            <div className="space-y-4">
              {assignedUsers.map((u: any) => (
                <div key={u._id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">{u.firstName?.charAt(0) || u.email?.charAt(0).toUpperCase()}</div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{u.firstName || u.lastName ? `${u.firstName || ""} ${u.lastName || ""}` : u.email}</h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{u.email}</p>
                    </div>
                  </div>
                  <button onClick={() => handleUnassignUser(u._id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title="Quitar del proyecto">
                    <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <FontAwesomeIcon icon={faUsers} className="text-gray-400 h-8 w-8" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">No hay personas asignadas a este proyecto.</p>
              <button onClick={openAssignUser} className="mt-4 text-sm text-primary-600 dark:text-primary-400 font-semibold hover:underline">
                + Asignar la primera persona
              </button>
            </div>
          )}
        </Card>
      </div>
    </PageLayout>
  );
};
