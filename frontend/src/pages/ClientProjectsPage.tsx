import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// Si necesitás i18n, usá: import { useTranslation } from "react-i18next";
import { useAuthStore } from "../stores/authStore";
import { projectsAPI, Project } from "../api/projects";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { sweetAlert } from "../utils/sweetAlert";
import { emitProjectsChanged } from "../utils/navbarEvents";
import { faPlus, faEdit, faLayerGroup, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Card } from "../components/ui/Card";
import { PageLayout } from "../components/ui/PageLayout";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
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
    budget: { total: 0 },
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

  const handleOpenCreate = () => {
    setModalMode("create");
    setEditingProject(null);
    setFormData({
      name: "",
      description: "",
      status: "active",
      startDate: "",
      endDate: "",
      budget: { total: 0 },
    });
    setShowModal(true);
  };

  const handleOpenEdit = (project: Project) => {
    setModalMode("edit");
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || "",
      status: project.status || "active",
      startDate: project.startDate ? project.startDate.split("T")[0] : "",
      endDate: project.endDate ? project.endDate.split("T")[0] : "",
      budget: { total: project.budget?.total || 0 },
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        budget: formData.budget.total > 0 ? formData.budget : undefined,
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
      faIcon={{ icon: faLayerGroup }}
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
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Estado</label>
                        <select className="input-field" value={formData.status} onChange={(e) => setFormData((p) => ({ ...p, status: e.target.value as any }))}>
                          <option value="active">Activo</option>
                          <option value="on_hold">En Espera</option>
                          <option value="completed">Completado</option>
                          <option value="archived">Archivado</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Presupuesto (USD)</label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={formData.budget.total}
                          onChange={(e) =>
                            setFormData((p) => ({
                              ...p,
                              budget: { total: Number(e.target.value) },
                            }))
                          }
                          className="input-field"
                          placeholder="0"
                        />
                      </div>
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
                  </div>
                </form>
              ),
            }
          : undefined
      }
    >
      {/* Projects Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando proyectos...</p>
        </div>
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
                icon: faLayerGroup,
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
              <div className="space-y-2">
                {/* <div className="text-xs text-gray-500 dark:text-gray-500">
         INFO VISIBLE
      </div> */}
              </div>
            </Card>
          ))}
          {/* Nueva tarjeta de creación */}
          <Card
            variant="create"
            onClick={handleOpenCreate}
            header={{
              title: "Nuevo Proyecto",
              subtitle: "Crear un nuevo proyecto para este cliente",
              icon: faLayerGroup,
            }}
          />
        </div>
      )}

      {/* Paginación (del backend). Nota: con filtro local, pagina sobre el resultado actual de esta página */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 mt-8">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50">
            Anterior
          </button>
          <span className="px-4 py-2 text-gray-600 dark:text-gray-400">
            Página {page} de {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-50">
            Siguiente
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && visibleProjects.length === 0 && (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faLayerGroup} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
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
