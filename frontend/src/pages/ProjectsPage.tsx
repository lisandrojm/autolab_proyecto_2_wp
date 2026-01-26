import React, { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { projectsAPI, Project } from "../api/projects";
import { clientsAPI, Client } from "../api/clients";
import { useClientContextStore } from "../stores/clientContextStore";
import { PageLayout } from "../components/ui/PageLayout";
import { Card } from "../components/ui/Card";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { faBriefcase, faBuilding, faTable, faGrip, faEye } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { getHelp, hasHelp } from "../data/help/helpContent";

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { setSelectedClient } = useClientContextStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [openInfo, setOpenInfo] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");

  const HELP_KEY = "projects";
  const helpEntry = getHelp(HELP_KEY);

  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);

  useEffect(() => {
    const handleResize = () => {
      const isNowXXL = window.innerWidth >= 1200;
      setIsXXL(isNowXXL);
      if (!isNowXXL) setViewMode("cards");
    };

    const saved = localStorage.getItem("projectsViewMode");
    if (saved === "table" || saved === "cards") {
      if (window.innerWidth >= 1200) setViewMode(saved as "table" | "cards");
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isXXL) {
      localStorage.setItem("projectsViewMode", viewMode);
    }
  }, [viewMode, isXXL]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [projectsData, clientsData] = await Promise.all([projectsAPI.listAll({ limit: 500 }), clientsAPI.listAll()]);
        setProjects(projectsData);
        setClients(clientsData);
      } catch (error) {
        console.error("Error fetching projects data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const clientMap = useMemo(() => {
    const map = new Map<string, Client>();
    clients.forEach((c) => map.set(c._id, c));
    return map;
  }, [clients]);

  const filteredProjects = useMemo(() => {
    if (!searchTerm) return projects;
    const lowerSearch = searchTerm.toLowerCase();
    return projects.filter((p) => p.name.toLowerCase().includes(lowerSearch) || (typeof p.clientId === "object" ? p.clientId.name : clientMap.get(p.clientId)?.name)?.toLowerCase().includes(lowerSearch));
  }, [projects, searchTerm, clientMap]);

  const handleProjectClick = (project: Project) => {
    const cId = typeof project.clientId === "object" ? project.clientId._id : project.clientId;
    const client = clientMap.get(cId);

    if (client) {
      setSelectedClient(client);
    }

    navigate(`/projects/${project._id}`);
  };

  return (
    <PageLayout
      title="Proyectos"
      subtitle="Todos los proyectos del sistema"
      itemCount={filteredProjects.length}
      faIcon={{ icon: faBriefcase }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Ayuda",
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o cliente..." />
          </div>
          {isXXL && (
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
    >
      {loading ? (
        <LoadingSpinner message="Cargando proyectos..." />
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faBriefcase} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron proyectos</h3>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredProjects.map((project) => (
            <Card
              key={project._id}
              onClick={() => handleProjectClick(project)}
              className="hover:scale-105 hover:shadow-lg transition-all duration-200 cursor-pointer"
              header={{
                title: project.name,
                subtitle: project.description,
                avatar: {
                  src: typeof project.clientId === "object" ? (project.clientId as any).logo : undefined,
                  fallback: ((typeof project.clientId === "object" ? project.clientId.name : clientMap.get(project.clientId as string)?.name) || "?").charAt(0).toUpperCase(),
                  alt: typeof project.clientId === "object" ? project.clientId.name : undefined,
                },
                badges: [
                  {
                    text: project.status === "active" ? "Activo" : project.status === "on_hold" ? "En Espera" : project.status === "completed" ? "Completado" : "Archivado",
                    variant: project.status === "active" ? "green" : project.status === "on_hold" ? "warning" : project.status === "completed" ? "info" : "default",
                  },
                  {
                    text: (typeof project.clientId === "object" ? project.clientId.name : clientMap.get(project.clientId as string)?.name) || "Cliente Desconocido",
                    variant: "cyan",
                  },
                ],
                badgesPosition: "top",
              }}
              footer={{
                leftContent: <div className="text-xs text-gray-500 dark:text-gray-500">Creado: {new Date(project.createdAt).toLocaleDateString()}</div>,
              }}
            >
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
        </div>
      ) : (
        <div className="mt-6 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Proyecto</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cliente</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sede</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Creado</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {filteredProjects.map((project) => {
                  const clientName = (typeof project.clientId === "object" ? project.clientId.name : clientMap.get(project.clientId as string)?.name) || "Cliente Desconocido";
                  const sedeName = project.metadataResolutions?.sede?.name || project.metadataResolutions?.sede?.data?.nombre || "-";

                  const statusColors: any = {
                    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                    on_hold: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    completed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                    archived: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
                  };
                  const statusLabel: any = {
                    active: "Activo",
                    on_hold: "En Espera",
                    completed: "Completado",
                    archived: "Archivado",
                  };

                  return (
                    <tr key={project._id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group cursor-pointer" onClick={() => handleProjectClick(project)}>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{project.name}</span>
                          <span className="text-xs text-gray-500 truncate max-w-[200px]">{project.description || "Sin descripción"}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300">{clientName}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${statusColors[project.status] || statusColors.archived}`}>{statusLabel[project.status] || project.status}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600 dark:text-gray-400">{sedeName}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-500">{new Date(project.createdAt).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-right">
                        <button className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors" title="Ver detalles">
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageLayout>
  );
};
